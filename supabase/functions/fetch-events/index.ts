import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_MINUTES = 180;

const requestSchema = z.object({
  city: z.string().min(1).max(100),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Rate limit: 10 requests per minute
    const allowed = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: 'fetch-events',
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (allowed.data === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados de entrada inválidos.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { city } = parsed.data;

    // Check cache
    const { data: cached } = await supabase
      .from('events_cache')
      .select('events, citations, created_at')
      .eq('city_name', city)
      .single();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();
      if (cacheAge < CACHE_TTL_MINUTES * 60 * 1000) {
        return new Response(
          JSON.stringify({ success: true, events: cached.events, citations: cached.citations, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 5);

    const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Você é um guia de eventos especializado em cidades brasileiras. Retorne SOMENTE um JSON array com até 10 eventos que acontecerão em ${city}, Ceará, Brasil, entre ${formatDate(today)} e ${formatDate(endDate)}. Inclua festas, shows, jogos de futebol, eventos culturais, feiras, eventos religiosos, etc. Cada item deve ter: nome (string), descricao (string ~25 palavras), data (string formato "DD/MM/YYYY"), horario (string ex: "20:00"), local (string, nome do local/endereço), tipo (string: "festa", "show", "jogo", "cultural", "feira", "religioso", "esporte", "outro"), gratuito (boolean). Se não houver eventos confirmados, retorne eventos recorrentes ou prováveis da cidade. Sem markdown, apenas o JSON array.`
          },
          {
            role: 'user',
            content: `Quais eventos, festas, jogos e shows acontecem em ${city}, Ceará, nos próximos 5 dias (${formatDate(today)} a ${formatDate(endDate)})? Responda apenas com o JSON array.`
          }
        ],
        temperature: 0.3,
        max_tokens: 2500,
        search_recency_filter: 'week',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Perplexity API error:', errorData);
      throw new Error(`Perplexity request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    const citations = data.citations || [];

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let events;
    try {
      events = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse events response:', content);
      events = [];
    }

    if (events.length > 0) {
      await supabase
        .from('events_cache')
        .upsert(
          { city_name: city, events, citations, created_at: new Date().toISOString() },
          { onConflict: 'city_name' }
        );
    }

    return new Response(
      JSON.stringify({ success: true, events, citations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('fetch-events error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao buscar eventos.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

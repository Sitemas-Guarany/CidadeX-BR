import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_MINUTES = 60;

const requestSchema = z.object({
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100).optional(),
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

    // Service role client for DB operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Rate limit: 10 requests per minute
    const allowed = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: 'fetch-news',
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

    const { city, state } = parsed.data;
    const estadoLabel = state || 'Ceará';

    // Check cache first
    const { data: cached } = await supabase
      .from('news_cache')
      .select('news, created_at')
      .eq('city_name', city)
      .eq('state_name', estadoLabel)
      .single();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();
      if (cacheAge < CACHE_TTL_MINUTES * 60 * 1000) {
        return new Response(JSON.stringify({ success: true, news: cached.news, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Generate fresh news
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `Gere 10 notícias locais realistas sobre ${city}, ${estadoLabel}. Responda SOMENTE JSON array. Campos: titulo, resumo (~25 palavras), fonte (portal real: G1, Diário do Nordeste, O Povo, etc), categoria (Cidade|Cultura|Educação|Saúde|Economia|Esportes|Segurança), tempo (ex: "2h atrás").`
          },
          {
            role: 'user',
            content: `Notícias de ${city}, ${estadoLabel}. JSON array apenas.`
          }
        ],
        temperature: 0.8,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI Gateway error:', errorData);
      throw new Error(`AI Gateway request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let news;
    try {
      news = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', content);
      news = [];
    }

    if (news.length > 0) {
      await supabase
        .from('news_cache')
        .upsert(
          { city_name: city, state_name: estadoLabel, news, created_at: new Date().toISOString() },
          { onConflict: 'city_name,state_name' }
        );
    }

    return new Response(JSON.stringify({ success: true, news }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-news error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao buscar notícias.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

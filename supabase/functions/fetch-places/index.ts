import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_MINUTES = 120;

const requestSchema = z.object({
  city: z.string().min(1).max(100),
  category: z.enum(["turisticos", "restaurantes", "hoteis"]),
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
      p_endpoint: 'fetch-places',
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

    const { city, category } = parsed.data;

    // Check cache first
    const { data: cached } = await supabase
      .from('places_cache')
      .select('places, citations, created_at')
      .eq('city_name', city)
      .eq('category', category)
      .single();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();
      if (cacheAge < CACHE_TTL_MINUTES * 60 * 1000) {
        return new Response(JSON.stringify({ success: true, places: cached.places, citations: cached.citations, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    const categoryMap: Record<string, string> = {
      turisticos: 'pontos turísticos e atrações',
      restaurantes: 'restaurantes e lugares para comer',
      hoteis: 'hotéis e pousadas para hospedagem',
    };

    const categoryLabel = categoryMap[category] || 'pontos turísticos';

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
            content: `Você é um guia turístico especializado em cidades brasileiras. Retorne SOMENTE um JSON array com exatamente 8 itens sobre ${categoryLabel} em ${city}, Ceará, Brasil. Cada item deve ter: nome (string), descricao (string ~20 palavras), endereco (string, endereço aproximado), avaliacao (number 1-5, nota média), preco (string: "$", "$$", "$$$" ou "$$$$"). Sem markdown, apenas o JSON array.`
          },
          {
            role: 'user',
            content: `Liste os melhores ${categoryLabel} de ${city}, Ceará, com informações atualizadas. Responda apenas com o JSON array.`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
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

    let places;
    try {
      places = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Perplexity response:', content);
      places = [];
    }

    if (places.length > 0) {
      await supabase
        .from('places_cache')
        .upsert(
          { city_name: city, category, places, citations, created_at: new Date().toISOString() },
          { onConflict: 'city_name,category' }
        );
    }

    return new Response(JSON.stringify({ success: true, places, citations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-places error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao buscar lugares.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

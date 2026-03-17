import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Rate limit
    const allowed = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: 'fetch-bus-schedules',
      p_max_requests: 5,
      p_window_seconds: 60,
    });
    if (allowed.data === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { city } = await req.json();
    if (!city || typeof city !== 'string') {
      return new Response(JSON.stringify({ error: 'City is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

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
            content: `Você é um especialista em transporte público de cidades do Ceará, Brasil. Retorne SOMENTE um JSON array com informações sobre ônibus, topiques, vans e transporte alternativo em ${city}, Ceará. Cada item deve ter: tipo (string: "ônibus", "topique", "van" etc), linha (string: nome/número da linha), rota (string: descrição do trajeto/rota principal), horarios (string: horários disponíveis ou frequência), local_saida (string: ponto de partida), local_chegada (string: destino final), valor (string: preço da passagem ou "Não informado"), observacao (string: informações extras). Inclua pelo menos 5 itens se disponível. Sem markdown, apenas JSON array.`
          },
          {
            role: 'user',
            content: `Quais são os ônibus, topiques, vans e transportes alternativos disponíveis em ${city}, Ceará? Inclua rotas, horários, pontos de partida e valores atualizados. Responda apenas com JSON array.`
          }
        ],
        temperature: 0.3,
        max_tokens: 3000,
        search_recency_filter: 'month',
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
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let schedules;
    try {
      schedules = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse bus schedules:', content);
      schedules = [];
    }

    return new Response(JSON.stringify({ success: true, schedules, citations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-bus-schedules error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao buscar horários.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

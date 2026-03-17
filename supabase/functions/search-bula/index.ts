import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nome } = await req.json();
    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Nome do medicamento é obrigatório (mín. 2 caracteres)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const query = encodeURIComponent(nome.trim());

    // Try the ANVISA bulário API directly
    const anvisaUrl = `https://bula.vercel.app/pesquisar?nome=${query}&pagina=1`;
    const res = await fetch(anvisaUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`ANVISA API returned ${res.status}`);
    }

    const data = await res.json();

    // The API returns { content: [...] } with medication entries
    const results = (data.content || []).slice(0, 10).map((item: any) => ({
      nome: item.nomeProduto || item.nome || '',
      empresa: item.razaoSocial || item.empresa || '',
      expediente: item.numeroRegistroFormatado || item.expediente || '',
      processo: item.idProduto || item.numProcesso || '',
      bulaPaciente: item.idBulaPacienteProtegida || null,
      bulaProfissional: item.idBulaProfissionalProtegida || null,
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Bula search error:', error);
    return new Response(JSON.stringify({ error: 'Erro ao buscar bula. Tente novamente.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

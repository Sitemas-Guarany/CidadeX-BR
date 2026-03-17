import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cep } = await req.json();
    const digits = (cep || "").replace(/\D/g, "");

    if (digits.length !== 8) {
      return new Response(JSON.stringify({ erro: true, message: "CEP inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try BrasilAPI first, fallback to ViaCEP
    const apis = [
      `https://brasilapi.com.br/api/cep/v1/${digits}`,
      `https://viacep.com.br/ws/${digits}/json/`,
    ];

    for (const url of apis) {
      try {
        console.log("Trying:", url);
        const res = await fetch(url, {
          headers: { "Accept": "application/json", "User-Agent": "LovableApp/1.0" },
        });

        const text = await res.text();
        console.log("Status:", res.status, "Preview:", text.substring(0, 100));

        if (text.trim().startsWith("<")) continue; // HTML response, try next

        const data = JSON.parse(text);

        // Normalize response format
        const normalized = {
          cep: data.cep || digits,
          logradouro: data.street || data.logradouro || "",
          bairro: data.neighborhood || data.bairro || "",
          localidade: data.city || data.localidade || "",
          uf: data.state || data.uf || "",
          erro: false,
        };

        return new Response(JSON.stringify(normalized), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("API failed:", url, e);
        continue;
      }
    }

    return new Response(JSON.stringify({ erro: true, message: "CEP não encontrado" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("lookup-cep error:", error);
    return new Response(JSON.stringify({ erro: true, message: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { word } = await req.json();
    if (!word || typeof word !== "string" || word.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Palavra inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanWord = word.trim().toLowerCase();

    // Try DicionarioAberto API first
    try {
      const res = await fetch(`https://api.dicionario-aberto.net/word/${encodeURIComponent(cleanWord)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data) && data.length > 0) {
          const entry = data[0];
          const xmlContent = entry.xml || "";
          
          // Extract definitions from XML content
          const defMatches = [...xmlContent.matchAll(/<def>([\s\S]*?)<\/def>/g)].map(m => m[1].trim());
          
          if (defMatches.length > 0) {
            return new Response(JSON.stringify({
              word: cleanWord,
              source: "dicionario-aberto",
              definitions: defMatches.slice(0, 5),
              grammar_class: entry.word_class || null,
              synonyms: [],
              examples: [],
              etymology: entry.etymology || null,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    } catch {
      console.log("DicionarioAberto failed, falling back to AI");
    }

    // Fallback: use Lovable AI (Gemini) for rich definition
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Serviço de IA não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um dicionário de português brasileiro. Responda APENAS com JSON válido, sem markdown.
Formato exato:
{
  "word": "palavra",
  "grammar_class": "classe gramatical (substantivo, verbo, etc.)",
  "definitions": ["definição 1", "definição 2"],
  "synonyms": ["sinônimo 1", "sinônimo 2"],
  "examples": ["exemplo de uso 1"],
  "etymology": "origem da palavra ou null"
}
Forneça até 5 definições, 5 sinônimos e 3 exemplos de uso. Se a palavra não existir, retorne {"error": "Palavra não encontrada"}.`,
          },
          {
            role: "user",
            content: `Defina a palavra: "${cleanWord}"`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas consultas. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let parsed;
    try {
      // Remove potential markdown code blocks
      const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(JSON.stringify({
        word: cleanWord,
        source: "ai",
        definitions: [content],
        grammar_class: null,
        synonyms: [],
        examples: [],
        etymology: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      word: parsed.word || cleanWord,
      source: "ai",
      grammar_class: parsed.grammar_class || null,
      definitions: parsed.definitions || [],
      synonyms: parsed.synonyms || [],
      examples: parsed.examples || [],
      etymology: parsed.etymology || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lookup-word error:", e);
    return new Response(JSON.stringify({ error: "Erro ao buscar definição" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const cleanQuery = query.trim();

    // Use AbortController with 12s timeout to prevent hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          max_tokens: 1200,
          messages: [
            {
              role: "system",
              content: `Você é um farmacêutico brasileiro especialista. Regras OBRIGATÓRIAS:
1. SEMPRE retorne o medicamento com o NOME EXATO que o usuário digitou como PRIMEIRO resultado. Se o usuário digitar "Duomo 2mg", o primeiro resultado DEVE ter name="Duomo".
2. O campo "generic_name" DEVE conter o princípio ativo CORRETO do medicamento buscado. Exemplos: Duomo → generic_name="dapagliflozina", Glifage → generic_name="metformina", Nebitah → generic_name="nebivolol", Losartana → generic_name="losartana potássica". NUNCA invente princípios ativos. Se não souber com certeza, deixe generic_name vazio.
3. Se a busca contém dosagem (ex: "2mg", "500mg"), destaque essa dosagem primeiro na lista de concentrations.
4. O campo "name" é SEMPRE o nome comercial/marca. NUNCA coloque princípio ativo no campo "name".
5. Depois do primeiro resultado, inclua o genérico (com name=princípio ativo) e outras marcas equivalentes com o MESMO princípio ativo.
6. Retorne até 5 resultados. Use a tool "suggest_medications".
7. Se não conhecer o medicamento exato, retorne os medicamentos brasileiros mais próximos ao nome digitado.
8. VERIFIQUE que o princípio ativo está correto antes de retornar. Não confunda medicamentos diferentes.`,
            },
            {
              role: "user",
              content: `Buscar medicamento brasileiro: "${cleanQuery}"`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_medications",
                description: "Retorna sugestões de medicamentos brasileiros",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Nome do medicamento" },
                          generic_name: { type: "string", description: "Princípio ativo" },
                          concentrations: {
                            type: "array",
                            items: { type: "string" },
                            description: "Concentrações disponíveis (ex: 500mg)",
                          },
                          forms: {
                            type: "array",
                            items: { type: "string" },
                            description: "Formas farmacêuticas (ex: Comprimido, Gotas)",
                          },
                          therapeutic_class: { type: "string", description: "Classe terapêutica" },
                          instructions: { type: "string", description: "Instruções de uso resumidas" },
                        },
                        required: ["name", "concentrations", "therapeutic_class", "instructions"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "suggest_medications" } },
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.error("AI gateway request timed out after 12s");
        return new Response(JSON.stringify({ suggestions: [], error: "Tempo limite excedido. Tente novamente." }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      console.error("Empty response body from AI gateway");
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", responseText.substring(0, 300));
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for truncated response
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      console.warn("AI response was truncated (finish_reason=length)");
    }

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    if (args && typeof args === "string" && args.trim().length > 2) {
      try {
        const parsed = JSON.parse(args);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        // Try to recover truncated JSON
        try {
          const lastBrace = args.lastIndexOf("}");
          if (lastBrace > 0) {
            const repaired = args.substring(0, lastBrace + 1) + "]}";
            const recovered = JSON.parse(repaired);
            console.warn("Recovered truncated medication response");
            return new Response(JSON.stringify(recovered), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch { /* ignore recovery failure */ }
        console.error("Failed to parse tool_call arguments:", args.substring(0, 300));
      }
    }

    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-medication error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

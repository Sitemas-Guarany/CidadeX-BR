import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(10000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  cityName: z.string().min(1).max(100).optional(),
  stateName: z.string().min(1).max(100).optional(),
  imageUrl: z.string().url().max(2000).optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Dados de entrada inválidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, cityName, stateName, imageUrl } = parsed.data;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const city = cityName || "sua cidade";
    const state = stateName || "seu estado";

    const systemPrompt = `Você é o Assistente CidadeX, um guia inteligente especializado em cidades brasileiras. Você está atualmente ajudando o usuário com informações sobre ${city}, ${state}.

Suas capacidades:
- Responder perguntas sobre a cidade: história, cultura, pontos turísticos, serviços públicos, transporte, etc.
- Fazer recomendações personalizadas de lugares, restaurantes, eventos e atividades.
- Resumir notícias e informações relevantes sobre a cidade.
- Analisar imagens enviadas pelo usuário (identificar locais, dar informações sobre o que aparece na foto).
- Responder perguntas gerais dos moradores e visitantes.

Regras:
- Responda sempre em português brasileiro.
- Seja amigável, conciso e útil.
- Use emojis moderadamente para tornar a conversa agradável.
- Se não souber algo específico, diga honestamente e sugira como o usuário pode encontrar a informação.
- Formate respostas com markdown quando apropriado (listas, negrito, etc).`;

    // Build the user message content (text + optional image)
    const lastUserMessage = messages[messages.length - 1];
    const apiMessages = [...messages];
    if (imageUrl && lastUserMessage?.role === "user") {
      apiMessages[apiMessages.length - 1] = {
        ...lastUserMessage,
        content: [
          { type: "text", text: lastUserMessage.content },
          { type: "image_url", image_url: { url: imageUrl } },
        ] as any,
      };
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...apiMessages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Erro no serviço de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("city-assistant error:", e);
    return new Response(
      JSON.stringify({ error: "Erro ao processar sua solicitação." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

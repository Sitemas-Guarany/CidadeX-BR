import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, targetLang } = await req.json();

    if (!text || !targetLang) {
      return new Response(JSON.stringify({ error: "text and targetLang are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check cache
    const sourceHash = await hashText(text.trim());
    const { data: cached } = await supabase
      .from("translation_cache")
      .select("translated_text")
      .eq("source_hash", sourceHash)
      .eq("target_lang", targetLang)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({ translated: cached.translated_text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langNames: Record<string, string> = {
      "pt-BR": "Português Brasileiro",
      "en": "English",
      "es": "Español",
      "fr": "Français",
      "de": "Deutsch",
      "it": "Italiano",
      "ja": "日本語",
      "zh": "中文",
      "ko": "한국어",
      "ar": "العربية",
    };

    const targetName = langNames[targetLang] || targetLang;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the user's text to ${targetName}. Return ONLY the translated text, nothing else. No explanations, no quotes, no prefixes. Preserve the original formatting (line breaks, emojis, etc).`,
          },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim() || "";

    // Save to cache (fire-and-forget)
    supabase.from("translation_cache").upsert({
      source_hash: sourceHash,
      target_lang: targetLang,
      source_text: text.trim().substring(0, 5000),
      translated_text: translated,
    }, { onConflict: "source_hash,target_lang" }).then(() => {});

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

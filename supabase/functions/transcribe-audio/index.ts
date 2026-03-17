import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const audio_url: string | undefined = rawBody?.audio_url;

    // Validate audio_url: required, max length, https only, Supabase storage only
    if (!audio_url || typeof audio_url !== "string") {
      return new Response(JSON.stringify({ error: "audio_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audio_url.length > 2000) {
      return new Response(JSON.stringify({ error: "audio_url too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(audio_url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
      return new Response(JSON.stringify({ error: "Only Supabase storage URLs are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    // Download audio file
    const audioResponse = await fetch(audio_url);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBlob = await audioResponse.blob();

    // Determine file extension from URL
    const ext = audio_url.split(".").pop()?.split("?")[0] || "webm";
    const mimeType = ext === "mp4" ? "audio/mp4" : "audio/webm";

    // Send to ElevenLabs STT
    const formData = new FormData();
    formData.append("file", new File([audioBlob], `audio.${ext}`, { type: mimeType }));
    formData.append("model_id", "scribe_v2");
    formData.append("language_code", "por");

    const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!sttResponse.ok) {
      const errText = await sttResponse.text();
      console.error("ElevenLabs STT error:", sttResponse.status, errText);
      throw new Error(`STT failed: ${sttResponse.status}`);
    }

    const result = await sttResponse.json();

    return new Response(JSON.stringify({ text: result.text || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

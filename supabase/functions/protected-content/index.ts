import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  action: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  resource_type: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  resource_id: z.string().max(100).optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Rate limiting via database function
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: allowed } = await serviceClient.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: "protected-content",
      p_max_requests: 100,
      p_window_seconds: 60,
    });

    if (!allowed) {
      // Log rate limit hit
      await serviceClient.rpc("log_access", {
        p_user_id: userId,
        p_action: "rate_limited",
        p_resource_type: "api",
        p_ip_address: req.headers.get("x-forwarded-for") || "unknown",
        p_user_agent: req.headers.get("user-agent") || "unknown",
      });

      return new Response(
        JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em breve." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Dados de entrada inválidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, resource_type, resource_id } = parsed.data;

    // Log access
    await serviceClient.rpc("log_access", {
      p_user_id: userId,
      p_action: action || "access",
      p_resource_type: resource_type || "content",
      p_resource_id: resource_id || null,
      p_ip_address: req.headers.get("x-forwarded-for") || "unknown",
      p_user_agent: req.headers.get("user-agent") || "unknown",
      p_metadata: JSON.stringify({
        timestamp: new Date().toISOString(),
        endpoint: "protected-content",
      }),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Acesso registrado" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("protected-content error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

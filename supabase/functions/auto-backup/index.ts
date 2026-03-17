import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Authentication: require valid user token + admin role ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admins can trigger batch backups for all users
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Backup logic (unchanged) ---
    const now = new Date();

    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("user_id, backup_frequency, last_backup_at")
      .neq("backup_frequency", "none");

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: "No backups needed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const getIntervalMs = (freq: string): number => {
      switch (freq) {
        case "daily": return 24 * 60 * 60 * 1000;
        case "weekly": return 7 * 24 * 60 * 60 * 1000;
        case "biweekly": return 14 * 24 * 60 * 60 * 1000;
        case "monthly": return 30 * 24 * 60 * 60 * 1000;
        default: return Infinity;
      }
    };

    let backupsCreated = 0;

    for (const u of users) {
      const interval = getIntervalMs(u.backup_frequency);
      const lastBackup = u.last_backup_at ? new Date(u.last_backup_at).getTime() : 0;

      if (now.getTime() - lastBackup < interval) continue;

      const [profile, agenda, aiConvos, posts, likes, reactions, reposts, banners] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", u.user_id).single(),
        supabase.from("agenda_items").select("*").eq("user_id", u.user_id),
        supabase.from("ai_conversations").select("*").eq("user_id", u.user_id),
        supabase.from("posts").select("*").eq("user_id", u.user_id),
        supabase.from("post_likes").select("*").eq("user_id", u.user_id),
        supabase.from("post_reactions").select("*").eq("user_id", u.user_id),
        supabase.from("post_reposts").select("*").eq("user_id", u.user_id),
        supabase.from("banner_legends").select("*").eq("created_by", u.user_id),
      ]);

      const backupData = {
        exported_at: now.toISOString(),
        version: "1.0",
        auto_backup: true,
        frequency: u.backup_frequency,
        profile: profile.data,
        agenda: agenda.data || [],
        ai_conversations: aiConvos.data || [],
        posts: posts.data || [],
        post_likes: likes.data || [],
        post_reactions: reactions.data || [],
        post_reposts: reposts.data || [],
        banner_legends: banners.data || [],
      };

      const fileName = `${u.user_id}/backup-${now.toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });

      const { error: uploadError } = await supabase.storage
        .from("user-backups")
        .upload(fileName, blob, { contentType: "application/json", upsert: true });

      if (uploadError) {
        console.error(`Backup failed for ${u.user_id}:`, uploadError);
        continue;
      }

      // Clean up old backups (keep last 5)
      const { data: files } = await supabase.storage
        .from("user-backups")
        .list(u.user_id, { sortBy: { column: "created_at", order: "desc" } });

      if (files && files.length > 5) {
        const toDelete = files.slice(5).map(f => `${u.user_id}/${f.name}`);
        await supabase.storage.from("user-backups").remove(toDelete);
      }

      await supabase.from("profiles").update({ last_backup_at: now.toISOString() }).eq("user_id", u.user_id);
      backupsCreated++;
    }

    return new Response(JSON.stringify({ message: `${backupsCreated} backups created` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-backup error:", error);
    return new Response(JSON.stringify({ error: "Erro ao processar backup." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * ⚠️ DO NOT CHANGE — Hooks de administração e configurações globais.
 * useAdmin: verifica role via user_roles (server-side, seguro).
 * useGlobalSettings: carrega configurações globais do sistema.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsAdmin(false); setLoading(false); return; }
    supabase
      .from("user_roles" as any)
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("useAdmin error:", error);
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [user]);

  return { isAdmin, loading };
};

// DO NOT CHANGE — Fetch logic consolidated into single reusable function
export const useGlobalSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("global_settings" as any)
      .select("key, value");
    const map: Record<string, any> = {};
    (data as any[] || []).forEach((r: any) => { map[r.key] = r.value; });
    setSettings(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  return { settings, loading, refetch: fetchSettings };
};

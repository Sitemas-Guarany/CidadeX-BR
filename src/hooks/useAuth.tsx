/**
 * ⚠️ DO NOT CHANGE — Hook de autenticação central.
 * Inclui: listener assíncrono, ban check deferido, auto-logout, retry de LockManager.
 * Alterações podem causar loops de auth ou bloqueio de acesso.
 */
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Check if user has an active ban */
async function checkBan(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("user_bans" as any)
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1);
    return (data as any[] || []).some(
      (b: any) => !b.expires_at || new Date(b.expires_at) > new Date()
    );
  } catch {
    return false;
  }
}

/** Should we auto-logout on app start? (user unchecked "Permanecer conectado") */
function shouldAutoLogout(): boolean {
  const rememberMe = localStorage.getItem("cidadex-remember");
  const sessionActive = sessionStorage.getItem("cidadex-session-active") === "true";
  // Only auto-logout if user explicitly opted out AND this is a new browser session
  return rememberMe === "false" && !sessionActive;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setSession(null);
  }, []);

  // Deferred ban check — runs OUTSIDE onAuthStateChange to avoid deadlocks
  const deferredBanCheck = useCallback(async (userId: string) => {
    const isBanned = await checkBan(userId);
    if (isBanned) {
      await supabase.auth.signOut().catch(() => {});
      clearAuth();
      window.location.href = "/auth?banned=true";
    }
  }, [clearAuth]);

  useEffect(() => {
    let mounted = true;

    // 1. Set up auth state listener FIRST — keep it synchronous, no awaits!
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;

        if (!newSession) {
          clearAuth();
          setLoading(false);
          return;
        }

        // Set session immediately — never block this callback
        setSession(newSession);
        setUser(newSession.user ?? null);
        setLoading(false);

        // Deferred ban check for sign-in events (non-blocking)
        if (event === "SIGNED_IN" && newSession.user) {
          setTimeout(() => deferredBanCheck(newSession.user.id), 0);
        }
      }
    );

    // 2. Initialize: check existing session
    const initialize = async () => {
      sessionStorage.setItem("cidadex-session-active", "true");

      if (shouldAutoLogout()) {
        await supabase.auth.signOut().catch(() => {});
        if (mounted) {
          clearAuth();
          setLoading(false);
        }
        return;
      }

      let existingSession: Session | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        existingSession = data.session;
      } catch (err) {
        // LockManager timeout — try to recover gracefully
        console.warn("[Auth] getSession failed (lock timeout?), retrying...", err);
        try {
          // Small delay then retry once
          await new Promise(r => setTimeout(r, 500));
          const { data } = await supabase.auth.getSession();
          existingSession = data.session;
        } catch {
          console.warn("[Auth] Retry also failed, continuing without session");
        }
      }
      if (!mounted) return;

      if (existingSession) {
        setSession(existingSession);
        setUser(existingSession.user);
        setLoading(false);
        // Deferred ban check
        setTimeout(() => deferredBanCheck(existingSession!.user.id), 0);
        return;
      }

      // No session — resolve loading if clearly on auth page with no OAuth callback
      const isAuthPage = window.location.pathname === "/auth";
      const hasCallbackHint = window.location.hash.includes("access_token") ||
                               window.location.search.includes("code=") ||
                               window.location.pathname.includes("~oauth") ||
                               document.referrer.includes("oauth") ||
                               document.referrer.includes("accounts.google.com");
      if (isAuthPage && !hasCallbackHint) {
        clearAuth();
        setLoading(false);
      }
    };

    initialize();

    // 3. Safety timeout — if still loading after 3s, force resolve
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 3000);

    // 4. Refresh session when app returns from background (fixes JWT expired on mobile)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && mounted) {
        supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
          if (!mounted) return;
          if (freshSession) {
            setSession(freshSession);
            setUser(freshSession.user);
          } else {
            // Token couldn't be refreshed — clear state
            clearAuth();
          }
        }).catch(() => {
          // Silent fail — onAuthStateChange will handle if needed
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [clearAuth, deferredBanCheck]);

  const signOut = useCallback(async () => {
    // Clear persistence flags
    localStorage.removeItem("cidadex-remember");
    sessionStorage.removeItem("cidadex-session-active");

    // Clear React state immediately
    clearAuth();

    // Sign out from auth (clear tokens)
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if server call fails, local tokens are cleared
    }

    // Hard redirect to ensure clean state
    window.location.replace("/auth");
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

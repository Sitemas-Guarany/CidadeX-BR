import { useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manages native push notification registration and listeners.
 * On web, this hook is a no-op.
 * 
 * Call this once at the app root level (e.g., in App.tsx or Index.tsx).
 */
export function usePushNotifications(onNotification?: (data: any) => void) {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || registeredRef.current || !user) return;

    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    // Request permission
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") {
      console.log("Push notification permission denied");
      return;
    }

    // Register with APNs / FCM
    await PushNotifications.register();

    // Listen for registration success — save token to profile
    PushNotifications.addListener("registration", async (token) => {
      console.log("Push token:", token.value);
      registeredRef.current = true;

      // Store push token in the user's profile for server-side use
      try {
        await (supabase.from("profiles") as any).update({
          push_token: token.value,
        }).eq("user_id", user.id);
      } catch (err) {
        // Column may not exist yet — that's fine, log and continue
        console.warn("Could not save push token:", err);
      }
    });

    // Listen for registration errors
    PushNotifications.addListener("registrationError", (err) => {
      console.error("Push registration error:", err);
    });

    // Listen for incoming notifications while app is in foreground
    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("Push received:", notification);
        onNotification?.(notification);
      }
    );

    // Listen for notification tap (app opened from notification)
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("Push action:", action);
        onNotification?.(action.notification);
      }
    );
  }, [user, onNotification]);

  useEffect(() => {
    register();
  }, [register]);
}

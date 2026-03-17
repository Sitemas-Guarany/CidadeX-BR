import { useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface AgendaItemForReminder {
  id: string;
  title: string;
  scheduled_date: string;
  reminder_minutes: number | null;
  status: string;
}

/**
 * Schedules/cancels Capacitor Local Notifications for agenda items.
 * On web this is a no-op.
 *
 * Call with the current list of agenda items whenever they change.
 */
export function useLocalReminders(items: AgendaItemForReminder[]) {
  const prevIdsRef = useRef<string>("");

  const sync = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Request permission once
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    // Cancel all previously scheduled agenda reminders (ids 10000–19999 range)
    const pending = await LocalNotifications.getPending();
    const agendaIds = pending.notifications
      .filter((n) => n.id >= 10000 && n.id < 20000)
      .map((n) => ({ id: n.id }));
    if (agendaIds.length > 0) {
      await LocalNotifications.cancel({ notifications: agendaIds });
    }

    // Schedule new notifications for items with reminder_minutes
    const now = Date.now();
    const toSchedule = items
      .filter(
        (item) =>
          item.reminder_minutes != null &&
          item.reminder_minutes > 0 &&
          item.status !== "concluido" &&
          item.status !== "cancelada"
      )
      .map((item, index) => {
        const scheduledMs = new Date(item.scheduled_date).getTime();
        const triggerMs = scheduledMs - item.reminder_minutes! * 60_000;
        if (triggerMs <= now) return null; // already past

        return {
          id: 10000 + index,
          title: "🔔 Lembrete de Compromisso",
          body: `"${item.title}" em ${item.reminder_minutes} minutos`,
          schedule: { at: new Date(triggerMs) },
          sound: undefined as string | undefined,
          extra: { agendaItemId: item.id },
        };
      })
      .filter(Boolean) as any[];

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
  }, [items]);

  // Only re-sync when item ids/dates/reminders actually change
  useEffect(() => {
    const key = items
      .map((i) => `${i.id}:${i.scheduled_date}:${i.reminder_minutes}:${i.status}`)
      .join("|");
    if (key === prevIdsRef.current) return;
    prevIdsRef.current = key;
    sync().catch((err) => console.warn("[LocalReminders]", err));
  }, [items, sync]);
}

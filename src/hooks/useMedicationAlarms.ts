import { useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface MedicationForAlarm {
  id: string;
  name: string;
  schedule_time: string; // comma-separated, e.g. "08:00,14:00,20:00"
  duration_type?: string | null;
  duration_days?: number | null;
  start_date?: string | null;
}

/**
 * Schedules/cancels Capacitor Local Notifications for medication alarms.
 * On web this is a no-op.
 *
 * IDs range: 20000–29999 (agenda uses 10000–19999).
 * Schedules notifications for the next 7 days per medication/time slot.
 *
 * Call with the current list of active medications whenever they change.
 */
export function useMedicationAlarms(medications: MedicationForAlarm[]) {
  const prevKeyRef = useRef<string>("");

  const sync = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Request permission once
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    // Cancel all previously scheduled medication alarms (ids 20000–29999)
    const pending = await LocalNotifications.getPending();
    const medIds = pending.notifications
      .filter((n) => n.id >= 20000 && n.id < 30000)
      .map((n) => ({ id: n.id }));
    if (medIds.length > 0) {
      await LocalNotifications.cancel({ notifications: medIds });
    }

    // Filter out medications whose fixed duration has expired
    const now = new Date();
    const activeMeds = medications.filter((med) => {
      if (med.duration_type === "fixed_days" && med.duration_days && med.start_date) {
        const start = new Date(med.start_date);
        const end = new Date(start);
        end.setDate(end.getDate() + med.duration_days);
        if (end < now) return false; // already finished
      }
      return true;
    });

    // Schedule notifications for the next 7 days
    const toSchedule: any[] = [];
    let idCounter = 20000;

    for (const med of activeMeds) {
      const times = med.schedule_time
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      for (const timeStr of times) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        if (isNaN(hours) || isNaN(minutes)) continue;

        for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
          const triggerDate = new Date();
          triggerDate.setDate(triggerDate.getDate() + dayOffset);
          triggerDate.setHours(hours, minutes, 0, 0);

          // Skip if already past (allow 30s buffer for today's upcoming alarms)
          if (triggerDate.getTime() <= now.getTime() + 30_000) continue;

          // Check if this specific day is still within duration
          if (med.duration_type === "fixed_days" && med.duration_days && med.start_date) {
            const start = new Date(med.start_date);
            const end = new Date(start);
            end.setDate(end.getDate() + med.duration_days);
            if (triggerDate > end) continue;
          }

          toSchedule.push({
            id: idCounter++,
            title: "💊 Hora do medicamento",
            body: `${med.name} — ${timeStr}`,
            schedule: { at: triggerDate },
            sound: undefined as string | undefined,
            extra: { medicationId: med.id, scheduledTime: timeStr },
            actionTypeId: "",
            attachments: [],
          });

          if (idCounter >= 30000) break; // safety cap
        }
        if (idCounter >= 30000) break;
      }
      if (idCounter >= 30000) break;
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
      console.log(`[MedicationAlarms] Agendadas ${toSchedule.length} notificações`);
    } else {
      console.log("[MedicationAlarms] Nenhuma notificação futura para agendar");
    }
  }, [medications]);

  // Only re-sync when medications actually change
  useEffect(() => {
    const key = medications
      .map(
        (m) =>
          `${m.id}:${m.schedule_time}:${m.duration_type ?? ""}:${m.duration_days ?? ""}:${m.start_date ?? ""}`
      )
      .join("|");
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    sync().catch((err) => console.warn("[MedicationAlarms]", err));
  }, [medications, sync]);
}

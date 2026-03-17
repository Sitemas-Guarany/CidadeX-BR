import { supabase } from "@/integrations/supabase/client";

// Batch access logs to reduce edge function calls
const pendingLogs: { action: string; resourceType: string; resourceId?: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogs() {
  if (pendingLogs.length === 0) return;
  const batch = pendingLogs.splice(0, pendingLogs.length);
  // Fire and forget - send the most recent log only to avoid excessive calls
  const last = batch[batch.length - 1];
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return;
    supabase.functions.invoke("protected-content", {
      body: {
        action: last.action,
        resource_type: last.resourceType,
        resource_id: last.resourceId,
      },
    }).catch(() => {});
  });
}

export function logAccess(
  action: string,
  resourceType: string,
  resourceId?: string
) {
  pendingLogs.push({ action, resourceType, resourceId });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushLogs, 3000); // Batch logs every 3 seconds
}

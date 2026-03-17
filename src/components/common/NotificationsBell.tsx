import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, DollarSign, AlertTriangle, Clock, X, Pill } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Notification {
  id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  emoji: string | null;
  read: boolean;
  created_at: string;
  actor_profile?: { display_name: string; avatar_url: string | null } | null;
}

interface FinanceAlert {
  id: string;
  type: "overdue" | "near_due" | "balance";
  title: string;
  description: string;
  created_at: string;
}

interface MedAlert {
  id: string;
  type: "med_overdue" | "med_upcoming";
  title: string;
  description: string;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Returns a map of dismissed alert IDs -> dismiss timestamp.
 * If 2 hours have passed since dismissal, the entry is removed (re-notify).
 */
function loadDismissedWithExpiry(storageKey: string): Map<string, number> {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return new Map();
  try {
    const entries: [string, number][] = JSON.parse(stored);
    const now = Date.now();
    const valid = entries.filter(([, ts]) => now - ts < TWO_HOURS_MS);
    return new Map(valid);
  } catch {
    return new Map();
  }
}

function saveDismissed(storageKey: string, map: Map<string, number>) {
  localStorage.setItem(storageKey, JSON.stringify([...map.entries()]));
}

const NotificationsBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [financeAlerts, setFinanceAlerts] = useState<FinanceAlert[]>([]);
  const [medAlerts, setMedAlerts] = useState<MedAlert[]>([]);
  const [dismissedMap, setDismissedMap] = useState<Map<string, number>>(new Map());
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const dismissedKey = user ? `cidadex-notif-dismissed-${user.id}` : "";

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) return;

    const actorIds = [...new Set(data.map(n => n.actor_id))];
    let profileMap = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles" as any)
        .select("user_id, display_name, avatar_url")
        .in("user_id", actorIds) as { data: { user_id: string; display_name: string; avatar_url: string | null }[] | null };
      profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
    }

    setNotifications(data.map(n => ({
      ...n,
      actor_profile: profileMap.get(n.actor_id) || null,
    })));
  }, [user]);

  const fetchFinanceAlerts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("financial_records")
      .select("id, description, type, amount, due_date, status")
      .eq("user_id", user.id)
      .in("status", ["pendente"]);

    if (!data) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alerts: FinanceAlert[] = [];

    let totalReceitas = 0;
    let totalDespesas = 0;
    const { data: allRecords } = await supabase
      .from("financial_records")
      .select("type, amount")
      .eq("user_id", user.id);
    (allRecords || []).forEach((r: any) => {
      if (r.type === "receita") totalReceitas += Number(r.amount);
      else totalDespesas += Number(r.amount);
    });

    const overdue = (data as any[]).filter(r => r.due_date && new Date(r.due_date) < today);
    if (overdue.length > 0) {
      alerts.push({
        id: "finance-overdue",
        type: "overdue",
        title: `${overdue.length} conta${overdue.length > 1 ? "s" : ""} vencida${overdue.length > 1 ? "s" : ""}`,
        description: overdue.length === 1
          ? `"${overdue[0].description}" venceu`
          : `${overdue.map((o: any) => o.description).slice(0, 3).join(", ")}${overdue.length > 3 ? "..." : ""}`,
        created_at: new Date().toISOString(),
      });
    }

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const nearDue = (data as any[]).filter(r => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      return d >= today && d <= threeDaysFromNow;
    });
    if (nearDue.length > 0) {
      alerts.push({
        id: "finance-near-due",
        type: "near_due",
        title: `${nearDue.length} conta${nearDue.length > 1 ? "s" : ""} próxima${nearDue.length > 1 ? "s" : ""} do vencimento`,
        description: nearDue.length === 1
          ? `"${nearDue[0].description}" vence em breve`
          : `${nearDue.map((o: any) => o.description).slice(0, 3).join(", ")}${nearDue.length > 3 ? "..." : ""}`,
        created_at: new Date().toISOString(),
      });
    }

    const saldo = totalReceitas - totalDespesas;
    alerts.push({
      id: "finance-balance",
      type: "balance",
      title: "Resumo financeiro",
      description: `Saldo: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      created_at: new Date().toISOString(),
    });

    setFinanceAlerts(alerts);
  }, [user]);

  const fetchMedAlerts = useCallback(async () => {
    if (!user) return;
    const { data: meds } = await supabase
      .from("medications")
      .select("id, name, schedule_time, frequency, start_date, suspended, doctor_id, duration_type, duration_days")
      .eq("user_id", user.id)
      .eq("suspended", false);

    if (!meds || meds.length === 0) { setMedAlerts([]); return; }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Get today's logs
    const { data: logs } = await supabase
      .from("medication_logs")
      .select("medication_id, scheduled_time")
      .eq("user_id", user.id)
      .eq("log_date", todayStr);

    const loggedSet = new Set((logs || []).map(l => `${l.medication_id}|${l.scheduled_time || ""}`));

    const alerts: MedAlert[] = [];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Collect overdue (past schedule_time, not logged)
    const overdueMeds: string[] = [];
    const upcomingMeds: string[] = [];

    const today = new Date(); today.setHours(0,0,0,0);
    for (const med of meds as any[]) {
      if (med.duration_type === "fixed_days" && med.duration_days && med.start_date) {
        const end = new Date(med.start_date); end.setDate(end.getDate() + med.duration_days - 1); end.setHours(23,59,59,999);
        if (end < today) continue;
      }
      const times = (med.schedule_time || "08:00").split(",").map((t: string) => t.trim()).filter(Boolean);
      for (const timeStr of times) {
        const [h, m] = timeStr.split(":").map(Number);
        const medMinutes = h * 60 + m;
        const logged = loggedSet.has(`${med.id}|${timeStr}`) || loggedSet.has(`${med.id}|`);

        if (logged) continue;

        if (medMinutes < currentMinutes) {
          overdueMeds.push(med.name);
        } else if (medMinutes - currentMinutes <= 60) {
          upcomingMeds.push(`${med.name} às ${timeStr}`);
        }
      }
    }

    if (overdueMeds.length > 0) {
      alerts.push({
        id: "med-overdue",
        type: "med_overdue",
        title: `${overdueMeds.length} medicamento${overdueMeds.length > 1 ? "s" : ""} atrasado${overdueMeds.length > 1 ? "s" : ""}`,
        description: overdueMeds.slice(0, 3).join(", ") + (overdueMeds.length > 3 ? "..." : ""),
      });
    }

    if (upcomingMeds.length > 0) {
      alerts.push({
        id: "med-upcoming",
        type: "med_upcoming",
        title: `${upcomingMeds.length} medicamento${upcomingMeds.length > 1 ? "s" : ""} em breve`,
        description: upcomingMeds.slice(0, 3).join(", ") + (upcomingMeds.length > 3 ? "..." : ""),
      });
    }

    setMedAlerts(alerts);
  }, [user]);

  // Initial load + reload dismissed with expiry
  useEffect(() => {
    if (!user) return;
    setDismissedMap(loadDismissedWithExpiry(dismissedKey));
    fetchNotifications();
    fetchFinanceAlerts();
    fetchMedAlerts();
  }, [user, dismissedKey, fetchNotifications, fetchFinanceAlerts, fetchMedAlerts]);

  // Re-check every 2 minutes to re-surface expired dismissals and update med alerts
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setDismissedMap(loadDismissedWithExpiry(dismissedKey));
      fetchMedAlerts();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, dismissedKey, fetchMedAlerts]);

  // Realtime for social notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  // Unread count
  useEffect(() => {
    const socialUnread = notifications.filter(n => !n.read).length;
    const financeUnread = financeAlerts.filter(a => !dismissedMap.has(a.id) && a.type !== "balance").length;
    const medUnread = medAlerts.filter(a => !dismissedMap.has(a.id)).length;
    setUnreadCount(socialUnread + financeUnread + medUnread);
  }, [notifications, financeAlerts, medAlerts, dismissedMap]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dismissAlert = (alertId: string) => {
    const updated = new Map(dismissedMap);
    updated.set(alertId, Date.now());
    setDismissedMap(updated);
    saveDismissed(dismissedKey, updated);
  };

  const dismissSocialNotification = async (id: string) => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    const updated = new Map(dismissedMap);
    const now = Date.now();
    financeAlerts.forEach(a => updated.set(a.id, now));
    medAlerts.forEach(a => updated.set(a.id, now));
    setDismissedMap(updated);
    saveDismissed(dismissedKey, updated);
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);

    const updated = new Map(dismissedMap);
    const now = Date.now();
    financeAlerts.forEach(a => updated.set(a.id, now));
    medAlerts.forEach(a => updated.set(a.id, now));
    setDismissedMap(updated);
    saveDismissed(dismissedKey, updated);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const typeLabel = (n: Notification) => {
    switch (n.type) {
      case "reaction": return `reagiu ${n.emoji || "❤️"} ao seu post`;
      case "reply": return "respondeu ao seu post";
      case "repost": return "repostou seu post";
      default: return "interagiu com seu post";
    }
  };

  const financeAlertIcon = (type: FinanceAlert["type"]) => {
    switch (type) {
      case "overdue": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "near_due": return <Clock className="w-4 h-4 text-amber-500" />;
      case "balance": return <DollarSign className="w-4 h-4 text-primary" />;
    }
  };

  const financeAlertBg = (type: FinanceAlert["type"]) => {
    switch (type) {
      case "overdue": return "bg-destructive/10";
      case "near_due": return "bg-amber-500/10";
      case "balance": return "bg-primary/10";
    }
  };

  const medAlertIcon = (type: MedAlert["type"]) => {
    switch (type) {
      case "med_overdue": return <Pill className="w-4 h-4 text-destructive" />;
      case "med_upcoming": return <Pill className="w-4 h-4 text-amber-500" />;
    }
  };

  const medAlertBg = (type: MedAlert["type"]) => {
    switch (type) {
      case "med_overdue": return "bg-destructive/10";
      case "med_upcoming": return "bg-amber-500/10";
    }
  };

  if (!user) return null;

  const hasAnyContent = notifications.length > 0 || financeAlerts.length > 0 || medAlerts.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors relative"
        title="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-50 animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-bold text-sm text-foreground">Notificações</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-primary transition-colors" title="Marcar todas como lidas">
                  Ler tudo
                </button>
              )}
              {hasAnyContent && (
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive transition-colors" title="Limpar todas as notificações">
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Medication alerts */}
          {medAlerts.length > 0 && (
            <div className="border-b border-border">
              <div className="px-4 py-2 bg-muted/30">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">💊 Medicamentos</span>
              </div>
              {medAlerts.map(alert => {
                const isDismissed = dismissedMap.has(alert.id);
                return (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 border-b border-border last:border-b-0 flex items-start gap-3 ${isDismissed ? "opacity-50" : medAlertBg(alert.type)}`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-background/50">
                      {medAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                      {isDismissed && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic">Volta a notificar em breve</p>
                      )}
                    </div>
                    {!isDismissed && (
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0 mt-1"
                        title="Dispensar (volta em 2h se não resolvido)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Finance alerts */}
          {financeAlerts.length > 0 && (
            <div className="border-b border-border">
              <div className="px-4 py-2 bg-muted/30">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">💰 Finanças</span>
              </div>
              {financeAlerts.map(alert => {
                const isDismissed = dismissedMap.has(alert.id);
                return (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 border-b border-border last:border-b-0 flex items-start gap-3 ${isDismissed && alert.type !== "balance" ? "opacity-50" : financeAlertBg(alert.type)}`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-background/50">
                      {financeAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                      {isDismissed && alert.type !== "balance" && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic">Volta a notificar em breve</p>
                      )}
                    </div>
                    {alert.type !== "balance" && !isDismissed && (
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0 mt-1"
                        title="Dispensar (volta em 2h se não resolvido)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Social notifications */}
          {notifications.length > 0 && (
            <>
              <div className="px-4 py-2 bg-muted/30">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🔔 Social</span>
              </div>
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border last:border-b-0 flex items-start gap-3 transition-colors ${
                    !n.read ? "bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    {n.actor_profile?.avatar_url && <AvatarImage src={n.actor_profile.avatar_url} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {(n.actor_profile?.display_name || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{n.actor_profile?.display_name || "Alguém"}</span>{" "}
                      <span className="text-muted-foreground">{typeLabel(n)}</span>
                    </p>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => dismissSocialNotification(n.id)}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-1"
                      title="Marcar como lida"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {!hasAnyContent && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhuma notificação</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;



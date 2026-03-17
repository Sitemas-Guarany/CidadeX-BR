import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarCheck, Clock, AlertTriangle } from "lucide-react";
import { isToday, isTomorrow, isPast, endOfDay, differenceInHours } from "date-fns";

interface AgendaItem {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
  category: string;
  professional_name?: string | null;
}

export function AgendaTickerDisplay({ onNavigateToAgenda }: { onNavigateToAgenda?: () => void } = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(20);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("agenda_items")
        .select("id, title, scheduled_date, status, category, professional_name")
        .eq("user_id", user.id)
        .neq("status", "concluido")
        .neq("status", "cancelada")
        .order("scheduled_date", { ascending: true });

      if (data) setItems(data);
    };
    load();

    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const tickerItems = useMemo(() => {
    return items.map((item) => {
      const raw = item.scheduled_date.split("T")[0];
      const d = new Date(raw + "T00:00:00");
      const overdue = isPast(endOfDay(d));
      const today = isToday(d);
      const tomorrow = isTomorrow(d);
      const hoursUntil = differenceInHours(d, new Date());

      let label = "";
      let urgency: "urgent" | "today" | "soon" = "soon";

      if (overdue) {
        label = "Atrasado!";
        urgency = "urgent";
      } else if (today) {
        label = "Hoje";
        urgency = "today";
      } else if (tomorrow) {
        label = "Amanhã";
        urgency = "today";
      } else {
        label = `Em ${Math.ceil(hoursUntil / 24)} dias`;
        urgency = "soon";
      }

      return { ...item, label, urgency };
    });
  }, [items]);

  useEffect(() => {
    if (tickerRef.current && tickerItems.length > 0) {
      const totalChars = tickerItems.reduce((sum, i) => sum + i.title.length + i.label.length, 0);
      setDuration(Math.max(10, tickerItems.length * 3 + totalChars * 0.05));
    }
  }, [tickerItems]);

  if (!user || tickerItems.length === 0) return null;

  const getIcon = (urgency: string) => {
    if (urgency === "urgent") return <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />;
    if (urgency === "today") return <Clock className="w-3 h-3 text-blue-500 shrink-0" />;
    return <Clock className="w-3 h-3 text-amber-500 shrink-0" />;
  };

  const getLabelClass = (urgency: string) => {
    if (urgency === "urgent") return "text-destructive font-bold";
    if (urgency === "today") return "text-blue-600 dark:text-blue-400 font-semibold";
    return "text-amber-600 dark:text-amber-400 font-semibold";
  };

  const renderItems = () =>
    tickerItems.map((item) => (
      <span key={item.id} className="inline-flex items-center gap-1.5 align-middle">
        {getIcon(item.urgency)}
        <span className={`text-[10px] ${getLabelClass(item.urgency)}`}>{item.label}</span>
        <span className="align-middle">{item.title}</span>
        {item.professional_name && (
          <span className="text-muted-foreground/60">— {item.professional_name}</span>
        )}
        <span className="mx-2 text-muted-foreground/40 align-middle">•</span>
      </span>
    ));

  return (
    <div className="bg-primary/5 border-b border-border overflow-hidden cursor-pointer" onClick={onNavigateToAgenda}>
      <div className="flex items-center gap-2 py-1.5 px-3" title="Clique para ir à Agenda">
        <CalendarCheck className="w-3 h-3 text-primary shrink-0" />
        <div className="overflow-hidden flex-1 relative">
          <div
            ref={tickerRef}
            className="whitespace-nowrap text-[11px] font-medium text-foreground/80"
            style={{ animation: `ticker ${duration}s linear infinite` }}
          >
            {renderItems()}{renderItems()}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Calendar, MapPin, Clock, Loader2, RefreshCw, PartyPopper, Music, Trophy, Palette, ShoppingBag, Church, Dumbbell, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EventItem {
  nome: string;
  descricao: string;
  data: string;
  horario: string;
  local: string;
  tipo: string;
  gratuito: boolean;
}

const typeConfig: Record<string, { icon: typeof Star; color: string; label: string }> = {
  festa: { icon: PartyPopper, color: "text-pink-500", label: "Festa" },
  show: { icon: Music, color: "text-purple-500", label: "Show" },
  jogo: { icon: Trophy, color: "text-green-500", label: "Jogo" },
  cultural: { icon: Palette, color: "text-orange-500", label: "Cultural" },
  feira: { icon: ShoppingBag, color: "text-amber-500", label: "Feira" },
  religioso: { icon: Church, color: "text-blue-500", label: "Religioso" },
  esporte: { icon: Dumbbell, color: "text-emerald-500", label: "Esporte" },
  outro: { icon: Star, color: "text-primary", label: "Evento" },
};

interface EventsSectionProps {
  cityName: string;
}

const EventsSection = ({ cityName }: EventsSectionProps) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [citations, setCitations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("todos");
  const cacheRef = useRef<Record<string, { events: EventItem[]; citations: string[] }>>({});

  const fetchEvents = async (forceRefresh = false) => {
    if (!forceRefresh && cacheRef.current[cityName]) {
      setEvents(cacheRef.current[cityName].events);
      setCitations(cacheRef.current[cityName].citations);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-events", {
        body: { city: cityName },
      });

      if (fnError) throw fnError;
      if (data?.success) {
        const evts = data.events || [];
        const cits = data.citations || [];
        setEvents(evts);
        setCitations(cits);
        cacheRef.current[cityName] = { events: evts, citations: cits };
      } else {
        setError(data?.error || "Erro ao buscar eventos");
      }
    } catch {
      setError("Não foi possível carregar os eventos.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, [cityName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-muted-foreground text-sm">{error}</p>
        <button onClick={() => fetchEvents()} title="Tentar novamente" className="text-primary text-sm font-semibold hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-base text-foreground">
            Eventos em {cityName}
          </h3>
        </div>
        <button
          onClick={() => fetchEvents(true)}
          disabled={loading}
          className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">Próximos 5 dias · Gerado por IA</p>

      {/* Filtros por tipo */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
           <button
            onClick={() => setActiveFilter("todos")}
            title="Mostrar todos os eventos"
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              activeFilter === "todos"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Todos
          </button>
          {Array.from(new Set(events.map((e) => e.tipo))).map((tipo) => {
            const cfg = typeConfig[tipo] || typeConfig.outro;
            const Icon = cfg.icon;
            return (
              <button
                key={tipo}
                onClick={() => setActiveFilter(tipo)}
                title={`Filtrar por ${cfg.label}`}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 ${
                  activeFilter === tipo
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Icon className="w-3 h-3" />
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {(() => {
        const filtered = activeFilter === "todos" ? events : events.filter((e) => e.tipo === activeFilter);
        return filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {events.length === 0
              ? "Nenhum evento encontrado para os próximos dias."
              : "Nenhum evento deste tipo encontrado."}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((ev, i) => {
            const cfg = typeConfig[ev.tipo] || typeConfig.outro;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className="glass-card rounded-xl p-4 flex gap-4 items-start animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Type icon */}
                <div className={`p-2.5 rounded-lg bg-muted/50 shrink-0 ${cfg.color}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-foreground leading-tight">{ev.nome}</h4>
                    {ev.gratuito && (
                      <span className="text-[10px] font-bold bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full shrink-0">
                        GRÁTIS
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.descricao}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {ev.data}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ev.horario}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {ev.local}
                    </span>
                  </div>
                  <span className={`inline-block text-[10px] font-semibold mt-1 ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
            })}
          </div>
        );
      })()}

      {/* Citations */}
      {citations.length > 0 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground/60 mb-1">Fontes:</p>
          <div className="flex flex-wrap gap-1.5">
            {citations.slice(0, 5).map((c, i) => (
              <a
                key={i}
                href={c}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/60 hover:text-primary truncate max-w-[200px]"
              >
                [{i + 1}] {new URL(c).hostname}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsSection;

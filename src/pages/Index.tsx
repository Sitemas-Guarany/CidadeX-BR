import React, { useState, useEffect, useCallback, useRef, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { APP_VERSION, APP_LAST_UPDATE } from "@/config/version";
import PoweredFooter from "@/components/common/PoweredFooter";
import { logAccess } from "@/lib/accessLog";
import { toast } from "@/hooks/use-toast";
import { cities, CityData } from "@/config/cities";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import CitySelector from "@/components/city/CitySelector";
import CityInfo from "@/components/city/CityInfo";
import { AgendaTickerDisplay } from "@/components/common/AgendaTicker";

import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Map, Info, Building2, Route, Newspaper, MessageCircle, LogOut, LogIn, Download, Share2, Navigation, CloudSun, CalendarDays, Phone, MapPin, Bot, CalendarCheck, Megaphone, HelpCircle, UserPlus, Users, Shield, RefreshCw, DollarSign, ChevronDown, MoreVertical, GripVertical, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAdmin, useGlobalSettings } from "@/hooks/useAdmin";
import NotificationsBell from "@/components/common/NotificationsBell";
import BottomNav from "@/components/common/BottomNav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


// Lazy load heavy tab components
const CityMap = lazy(() => import("@/components/city/CityMap"));
import LogoutBackupDialog from "@/components/common/LogoutBackupDialog";
const BairrosSection = lazy(() => import("@/components/city/BairrosSection"));
const RuasSection = lazy(() => import("@/components/city/RuasSection"));
const NewsSection = lazy(() => import("@/components/city/NewsSection"));
const SocialSection = lazy(() => import("@/components/social/SocialSection"));
const AgendaSection = lazy(() => import("@/components/agenda/AgendaSection"));
const AIChat = lazy(() => import("@/components/social/AIChat"));
const NavigationSection = lazy(() => import("@/components/NavigationSection"));
const WeatherSection = lazy(() => import("@/components/city/WeatherSection"));
const EventsSection = lazy(() => import("@/components/city/EventsSection"));
const InviteSection = lazy(() => import("@/components/admin/InviteSection"));
const ContactsSection = lazy(() => import("@/components/social/ContactsSection"));
const FinancesSection = lazy(() => import("@/components/finances/FinancesSection"));

// Error Boundary for lazy-loaded tabs
class TabErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TabErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <p className="text-destructive font-semibold text-sm">Ocorreu um erro ao carregar esta seção.</p>
          <p className="text-muted-foreground text-xs max-w-md text-center">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.(); }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TabFallback = () => (
  <div className="space-y-4 p-4 animate-in fade-in duration-300">
    {/* Header skeleton */}
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    {/* Content blocks */}
    <Skeleton className="h-32 w-full rounded-xl" />
    <div className="grid grid-cols-2 gap-3">
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-20 rounded-lg" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
    <Skeleton className="h-24 w-full rounded-xl" />
  </div>
);

type Tab = "info" | "mapa" | "bairros" | "ruas" | "noticias" | "clima" | "eventos" | "social" | "navegar" | "agenda" | "convidar" | "contatos" | "financas";

const tabs: { key: Tab; label: string; icon: typeof Map }[] = [
  { key: "info", label: "Info", icon: Info },
  { key: "contatos", label: "Contatos", icon: Users },
  { key: "social", label: "Social", icon: MessageCircle },
  { key: "mapa", label: "Mapa", icon: Map },
  { key: "navegar", label: "Navegar", icon: Navigation },
  { key: "agenda", label: "Agenda", icon: CalendarCheck },
  { key: "financas", label: "Finanças", icon: DollarSign },
  { key: "bairros", label: "Bairros", icon: Building2 },
  { key: "ruas", label: "Ruas", icon: Route },
  { key: "clima", label: "Clima", icon: CloudSun },
  { key: "eventos", label: "Eventos", icon: CalendarDays },
  { key: "noticias", label: "Notícias", icon: Newspaper },
  { key: "convidar", label: "Convidar", icon: UserPlus },
];

const tabDescriptions: Record<Tab, string> = {
  info: "Informações gerais da cidade",
  mapa: "Mapa interativo com localização",
  navegar: "Rotas, GPS e alertas de trânsito",
  agenda: "Compromissos e tarefas pessoais",
  financas: "Controle financeiro pessoal",
  bairros: "Lista de bairros urbanos e rurais",
  ruas: "Ruas principais por bairro",
  clima: "Clima atual e previsão do tempo",
  eventos: "Eventos, festas e jogos próximos",
  noticias: "Notícias locais geradas por IA",
  contatos: "Lista de contatos e amigos",
  social: "Bate-papo e grupos da cidade",
  convidar: "Convidar amigos para o app",
};

const SHARE_URL = `https://wa.me/?text=${encodeURIComponent("📱 Baixe o CidadeX — explore cidades do Ceará com mapa, bairros, ruas, notícias e lugares! https://cidadex-br.com/install")}`;

/** Shared update-check logic (desktop & mobile) */
async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) {
    return { status: "no_support" as const };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { status: "up_to_date" as const };
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return { status: "updating" as const };
  }
  await reg.update();
  const hasUpdate = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    reg.addEventListener('updatefound', () => {
      clearTimeout(timeout);
      const newSW = reg.installing;
      if (!newSW) { resolve(true); return; }
      if (newSW.state === 'activated' || newSW.state === 'installed') {
        resolve(true);
        return;
      }
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' || newSW.state === 'activated' || reg.waiting) {
          resolve(true);
        }
      });
    }, { once: true });
    if (reg.installing) {
      clearTimeout(timeout);
      const sw = reg.installing;
      if (sw.state === 'activated' || sw.state === 'installed') {
        resolve(true);
        return;
      }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' || sw.state === 'activated' || reg.waiting) {
          resolve(true);
        }
      });
    }
  });
  if (hasUpdate || reg.waiting) {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return { status: "found_update" as const };
  }
  // Fallback: version.json check
  try {
    const res = await fetch('/version.json?_t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.version && data.version !== APP_VERSION) {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        return { status: "found_update" as const, newVersion: data.version };
      }
    }
  } catch {}
  return { status: "up_to_date" as const };
}

const Index = () => {
  useScrollRestore();
  const [city, setCity] = useState(() => {
    const savedCityId = localStorage.getItem("cidadex-selected-city");
    if (savedCityId) {
      const found = cities.find(c => c.id === savedCityId);
      if (found) return found;
    }
    return cities[0];
  });
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem("cidadex-active-tab");
    if (saved && tabs.some(t => t.key === saved)) return saved as Tab;
    return "info";
  });
  const { user, signOut } = useAuth();
  const { profile: myProfile } = useProfile();
  const { isAdmin } = useAdmin();
  const { settings: globalSettings } = useGlobalSettings();
  const [userCity, setUserCity] = useState<CityData | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [navDestination, setNavDestination] = useState<string>("");
  const [showLogoutBackup, setShowLogoutBackup] = useState(false);
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean> | null>(null);
  const [tabOrder, setTabOrder] = useState<string[] | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setReorderMode(true);
      // Auto-exit after 10s
      reorderTimeoutRef.current = setTimeout(() => setReorderMode(false), 10000);
    }, 800);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const FIXED_TABS = ["contatos", "social", "agenda"];
    const CITY_DROPDOWN_TABS = ["mapa", "bairros", "ruas", "clima", "eventos", "noticias"];
    const allKeys: string[] = tabs.filter(t => !FIXED_TABS.includes(t.key) && !CITY_DROPDOWN_TABS.includes(t.key) && t.key !== "info").map(t => t.key);
    const currentOrder = tabOrder
      ? tabOrder.filter(k => allKeys.includes(k)).concat(allKeys.filter(k => !tabOrder.includes(k)))
      : allKeys;
    const reorderable = [...currentOrder];
    const [moved] = reorderable.splice(result.source.index, 1);
    reorderable.splice(result.destination.index, 0, moved);
    setTabOrder(reorderable);
    if (user) {
      supabase.from("profiles").update({ tab_order: reorderable as any }).eq("user_id", user.id);
    }
    if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    reorderTimeoutRef.current = setTimeout(() => setReorderMode(false), 10000);
  }, [tabOrder, tabs, user]);

  // Load favorite city from profile and sync across devices
  useEffect(() => {
    if (!user) { setUserCity(null); return; }
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("favorite_city, active_tab, sync_enabled, visible_tabs, tab_order")
        .eq("user_id", user.id)
        .single();
      if (data?.visible_tabs && typeof data.visible_tabs === "object" && !Array.isArray(data.visible_tabs)) {
        setVisibleTabs(data.visible_tabs as Record<string, boolean>);
      }
      const to = (data as any)?.tab_order;
      if (Array.isArray(to) && to.length > 0) {
        setTabOrder(to);
      }
      const sync = data?.sync_enabled !== false;
      setSyncEnabled(sync);
      if (data?.favorite_city) {
        const found = cities.find(c => c.id === data.favorite_city || c.nome === data.favorite_city);
        if (found) {
          setCity(found);
          setUserCity(found);
        } else {
          setUserCity(city);
        }
      } else {
        setUserCity(city);
      }
      // Only apply DB tab if no localStorage value exists (cross-device sync only)
      const localTab = localStorage.getItem("cidadex-active-tab");
      if (sync && !localTab && data?.active_tab && tabs.some(t => t.key === data.active_tab)) {
        setTab(data.active_tab as Tab);
      }
    };
    loadProfile();

    // Realtime sync: when profile updates on another device, reflect here
    const channel = supabase
      .channel(`profile-sync-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        // Ignore events that are likely from our own writes (within 3s)
        if (Date.now() - lastLocalUpdateRef.current < 3000) return;
        const p = payload.new as any;
        const pSync = p.sync_enabled !== false;
        setSyncEnabled(pSync);
        if (!pSync) return;
        if (p.favorite_city) {
          const found = cities.find(c => c.id === p.favorite_city || c.nome === p.favorite_city);
          if (found) {
            setCity(found);
            setUserCity(found);
          }
        }
        if (p.active_tab && tabs.some(t => t.key === p.active_tab)) {
          setTab(prev => prev === p.active_tab ? prev : p.active_tab as Tab);
        }
        if (Array.isArray(p.tab_order) && p.tab_order.length > 0) {
          setTabOrder(p.tab_order);
        }
        // Sync visible_tabs
        if (p.visible_tabs && typeof p.visible_tabs === "object" && !Array.isArray(p.visible_tabs)) {
          setVisibleTabs(p.visible_tabs as Record<string, boolean>);
        }
        // Sync theme
        if (p.theme) {
          const root = document.documentElement;
          if (p.theme === "dark") root.classList.add("dark");
          else if (p.theme === "light") root.classList.remove("dark");
          else {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            root.classList.toggle("dark", prefersDark);
          }
        }
        // Sync font size
        if (p.font_size && typeof p.font_size === "number") {
          document.documentElement.style.fontSize = `${p.font_size}px`;
        }
        // Sync agenda sub-tab visibility across devices
        if (p.visible_fields && typeof p.visible_fields === "object" && !Array.isArray(p.visible_fields)) {
          const agTabs = (p.visible_fields as any)._agenda_tabs;
          if (agTabs && typeof agTabs === "object") {
            localStorage.setItem("cidadex-visible-agenda-tabs", JSON.stringify(agTabs));
            // Dispatch storage event for same-page listeners
            window.dispatchEvent(new StorageEvent("storage", { key: "cidadex-visible-agenda-tabs", newValue: JSON.stringify(agTabs) }));
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Detect current city via GPS for navigation tab
  useEffect(() => {
    if (tab !== "navegar" || !user) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=10&accept-language=pt-BR`, { headers: { "Accept": "application/json" } })
          .then(r => r.json())
          .then(data => {
            const cityName = data?.address?.city || data?.address?.town || data?.address?.municipality || data?.address?.county;
            if (cityName) setDetectedCityName(cityName);
          })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );
  }, [tab, user]);

  const lastLocalUpdateRef = useRef(0);
  const syncTimeoutRef = useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (updates: Record<string, string>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (user) {
          lastLocalUpdateRef.current = Date.now();
          supabase.from("profiles").update(updates).eq("user_id", user.id);
        }
      }, 1000);
    };
  }, [user])();

  // Save city choice to profile for cross-device sync
  const handleCityChange = (newCity: CityData) => {
    setCity(newCity);
    setUserCity(newCity);
    localStorage.setItem("cidadex-selected-city", newCity.id);
    if (user && syncEnabled) {
      syncTimeoutRef({ favorite_city: newCity.id });
    }
  };
  // Toggle favorite city
  const handleToggleFavorite = (cityId: string) => {
    if (!user) {
      toast({ title: "Faça login", description: "É necessário estar logado para definir uma cidade favorita.", variant: "destructive" });
      return;
    }
    const newFav = userCity?.id === cityId ? null : cities.find(c => c.id === cityId) || null;
    setUserCity(newFav);
    if (newFav) {
      localStorage.setItem("cidadex-selected-city", newFav.id);
    }
    supabase.from("profiles").update({ favorite_city: newFav?.id ?? null }).eq("user_id", user.id);
    toast({ title: newFav ? `⭐ ${newFav.nome} definida como favorita` : "Cidade favorita removida" });
  };
  // Save tab choice to profile for cross-device sync
  const handleTabChange = (newTab: Tab) => {
    if (tab === "navegar" && newTab !== "navegar") setNavDestination("");
    setTab(newTab);
    localStorage.setItem("cidadex-active-tab", newTab);
    if (user && syncEnabled) {
      syncTimeoutRef({ active_tab: newTab });
    }
  };

  // Log page access (only once)
  useEffect(() => {
    logAccess("page_view", "index");
  }, []);

  return (
    <>
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="gradient-hero z-40 shadow-lg shrink-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="container py-2 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl gradient-gold flex items-center justify-center shadow-md">
              <span className="font-display font-black text-foreground text-xs sm:text-sm leading-none">CidX</span>
            </div>
            <div>
              <h1 className="font-display font-black text-primary-foreground text-lg leading-none">CidadeX-BR</h1>
              <span className="text-primary-foreground/60 text-[10px] font-medium tracking-widest uppercase">Brasil</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Desktop-only buttons */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/install"
                  className="hidden sm:flex p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                  title="Instalar app no celular"
                >
                  <Download className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Instalar app no celular</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={SHARE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex p-2 rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
                  title="Compartilhar via WhatsApp"
                >
                  <Share2 className="w-4 h-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Compartilhar via WhatsApp</TooltipContent>
            </Tooltip>
            {user ? (
              <>
                <NotificationsBell />
                {isAdmin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to="/admin"
                        className="hidden sm:flex relative p-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors ring-1 ring-amber-400/30"
                        title="Painel Admin"
                      >
                        <Shield className="w-4 h-4" />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-primary animate-pulse" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>Painel Admin</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => window.dispatchEvent(new Event("toggle-ai-chat"))}
                      className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Assistente IA"
                    >
                      <Bot className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Assistente IA</TooltipContent>
                </Tooltip>
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Link
                      to="/profile"
                      className="rounded-full hover:ring-2 ring-primary-foreground/30 transition-all"
                      title="Meu perfil"
                    >
                      <Avatar className="w-8 h-8">
                        {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} alt={myProfile.display_name} />}
                        <AvatarFallback className="bg-primary-foreground/10 text-primary-foreground text-xs font-bold">
                          {(myProfile?.display_name || user.email || "U").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" sideOffset={6} className="w-64 p-3 space-y-2 z-[200] shadow-xl border border-border">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} alt={myProfile.display_name} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                          {(myProfile?.display_name || user.email || "U").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{myProfile?.display_name || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    {(myProfile as any)?.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> {(myProfile as any).phone}
                      </div>
                    )}
                    {(myProfile as any)?.address && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" /> {(myProfile as any).address}
                      </div>
                    )}
                  </HoverCardContent>
                </HoverCard>

                {/* Desktop-only: Refresh, Help, Logout */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={async () => {
                        const btn = document.getElementById('update-btn');
                        if (btn) btn.classList.add('animate-spin');
                        try {
                          const result = await checkForUpdates();
                          if (result.status === "no_support") {
                            toast({ title: "ℹ️ Sem suporte", description: "Service Worker não disponível neste navegador." });
                          } else if (result.status === "updating" || result.status === "found_update") {
                            toast({ title: "🔄 Nova versão encontrada!", description: result.newVersion ? `${APP_VERSION} → ${result.newVersion}. Recarregando...` : "Recarregando..." });
                            setTimeout(() => window.location.reload(), 1000);
                          } else {
                            toast({ title: "✅ Tudo atualizado!", description: `Você já está na versão mais recente (${APP_VERSION}).` });
                          }
                        } catch {
                          toast({ title: "⚠️ Erro", description: "Não foi possível verificar atualizações." });
                        } finally {
                          if (btn) btn.classList.remove('animate-spin');
                        }
                      }}
                      className="hidden sm:flex p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Verificar atualização"
                    >
                      <RefreshCw id="update-btn" className="w-4 h-4 transition-transform" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Verificar atualização</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/ajuda"
                      className="hidden sm:flex p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Ajuda e Regras"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Ajuda e Regras</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowLogoutBackup(true)}
                      className="hidden sm:flex p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Sair da conta"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Sair da conta</TooltipContent>
                </Tooltip>

                {/* Mobile-only: ⋮ dropdown with secondary actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="sm:hidden p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Mais opções"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className="bg-popover z-[200] min-w-[180px] shadow-xl border border-border">
                    <DropdownMenuItem asChild>
                      <Link to="/install" className="flex items-center gap-2 cursor-pointer">
                        <Download className="w-4 h-4" /> Instalar App
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={SHARE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 cursor-pointer text-[#25D366]"
                      >
                        <Share2 className="w-4 h-4" /> Compartilhar
                      </a>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                          <Shield className="w-4 h-4" /> Painel Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        const btn = document.getElementById('update-btn-mobile');
                        if (btn) btn.classList.add('animate-spin');
                        try {
                          const result = await checkForUpdates();
                          if (result.status === "no_support") {
                            toast({ title: "ℹ️ Sem suporte", description: "Service Worker não disponível neste navegador." });
                          } else if (result.status === "updating" || result.status === "found_update") {
                            toast({ title: "🔄 Nova versão encontrada!", description: result.newVersion ? `${APP_VERSION} → ${result.newVersion}. Recarregando...` : "Recarregando..." });
                            setTimeout(() => window.location.reload(), 1000);
                          } else {
                            toast({ title: "✅ Tudo atualizado!", description: `Você já está na versão mais recente (${APP_VERSION}).` });
                          }
                        } catch {
                          toast({ title: "⚠️ Erro", description: "Não foi possível verificar atualizações." });
                        } finally {
                          if (btn) btn.classList.remove('animate-spin');
                        }
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw id="update-btn-mobile" className="w-4 h-4" /> Atualizar
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/ajuda" className="flex items-center gap-2 cursor-pointer">
                        <HelpCircle className="w-4 h-4" /> Ajuda e Regras
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground/60 font-medium">Powered by CidX · © 2026 CidadeX-BR</p>
                      <p className="text-[10px] text-muted-foreground/50">v{APP_VERSION} · Sistemas Guarany</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowLogoutBackup(true)}
                      className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                    >
                      <LogOut className="w-4 h-4" /> Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/auth"
                      className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Entrar na conta"
                    >
                      <LogIn className="w-4 h-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Entrar na conta</TooltipContent>
                </Tooltip>
                {/* Mobile dropdown for non-logged users */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="sm:hidden p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
                      title="Mais opções"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className="bg-popover z-[200] min-w-[180px] shadow-xl border border-border">
                    <DropdownMenuItem asChild>
                      <Link to="/install" className="flex items-center gap-2 cursor-pointer">
                        <Download className="w-4 h-4" /> Instalar App
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={SHARE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 cursor-pointer text-[#25D366]"
                      >
                        <Share2 className="w-4 h-4" /> Compartilhar
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </header>

      {/* City Title Bar */}
      <div className="bg-card border-b border-border shrink-0">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <h2 className="font-display font-bold text-foreground text-xl">{city.nome}</h2>
            <span className="text-muted-foreground text-sm">— {city.estado}</span>
          </div>
          <CitySelector selected={city} onSelect={handleCityChange} favoriteId={userCity?.id} onToggleFavorite={handleToggleFavorite} />
        </div>
      </div>

      {/* Agenda Ticker */}
      <div className="shrink-0">
        <AgendaTickerDisplay onNavigateToAgenda={() => handleTabChange("agenda")} />
      </div>

      {/* Global Admin Notice */}
      {(globalSettings?.app_notice as any)?.active && (globalSettings?.app_notice as any)?.text && (
        <div className="bg-primary/10 border-b border-primary/20 shrink-0">
          <div className="container py-2 flex items-center gap-2">
            <Megaphone className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-xs text-foreground font-medium">{(globalSettings.app_notice as any).text}</p>
          </div>
        </div>
      )}


      <div className="bg-card border-b border-border z-30 shrink-0">
        <div className="container flex items-center gap-1 overflow-x-auto py-1.5 sm:py-2 tabs-fade-container tabs-scroll-snap scrollbar-none">
          {(() => {
            const FIXED_TABS = ["contatos", "social", "agenda"];
            const CITY_DROPDOWN_TABS = ["mapa", "bairros", "ruas", "clima", "eventos", "noticias"];
            const MORE_DROPDOWN_TABS: string[] = [];
            const fixedItems = tabs.filter(t => FIXED_TABS.includes(t.key));
            const reorderable = tabOrder
              ? tabOrder.filter(k => !FIXED_TABS.includes(k)).map(key => tabs.find(t => t.key === key)).filter(Boolean).concat(tabs.filter(t => !FIXED_TABS.includes(t.key) && (!tabOrder || !tabOrder.includes(t.key))))
              : tabs.filter(t => !FIXED_TABS.includes(t.key));
            const infoTab = reorderable.find(t => t.key === "info");
            const rest = reorderable.filter(t => t.key !== "info");
            const ordered = [...(infoTab ? [infoTab] : []), ...fixedItems, ...rest];

            const filteredTabs = ordered.filter(t => {
              if (!t) return false;
              const k = t.key;
              const globalTabs = globalSettings?.visible_tabs as Record<string, boolean> | undefined;
              if (!isAdmin && globalTabs && globalTabs[k] === false) return false;
              if (["contatos", "social", "agenda"].includes(k)) return true;
              if (visibleTabs && visibleTabs[k] === false) return false;
              return true;
            });

            const cityTabs = filteredTabs.filter(t => CITY_DROPDOWN_TABS.includes(t.key));
            const moreTabs = filteredTabs.filter(t => MORE_DROPDOWN_TABS.includes(t.key));
            const mainTabs = filteredTabs.filter(t => !CITY_DROPDOWN_TABS.includes(t.key) && !MORE_DROPDOWN_TABS.includes(t.key));
            const isCityTabActive = CITY_DROPDOWN_TABS.includes(tab);
            const isMoreTabActive = MORE_DROPDOWN_TABS.includes(tab);
            const activeCityTab = cityTabs.find(t => t.key === tab);
            const activeMoreTab = moreTabs.find(t => t.key === tab);

            // Define logical groups for visual separators
            // Group 1: Info
            // Group 2: Contatos, Social (communication)
            // Group 3: Cidade dropdown
            // Group 4: Navegar, Agenda, Finanças (personal tools)
            // Group 5: Mais dropdown
            const GROUP_COMM = ["agenda", "contatos", "social"];
            const GROUP_TOOLS = ["navegar", "financas"];

            const renderTab = (t: typeof tabs[0], dragHandleProps?: any) => (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { if (!reorderMode) handleTabChange(t.key); }}
                    onPointerDown={startLongPress}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      tab === t.key
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    } ${reorderMode ? "ring-2 ring-primary/30 animate-pulse" : ""}`}
                    title={reorderMode ? "Arraste para reordenar" : tabDescriptions[t.key]}
                    {...dragHandleProps}
                  >
                    {reorderMode && <GripVertical className="w-3 h-3 text-primary shrink-0" />}
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{reorderMode ? "Arraste para reordenar" : tabDescriptions[t.key]}</TooltipContent>
              </Tooltip>
            );

            // DO NOT CHANGE — Consolidated separator (was duplicated as groupSeparator + thinSeparator)
            const sep = (key: string) => (
              <div key={`sep-${key}`} className="w-px h-5 rounded-full bg-border shrink-0 mx-0.5" />
            );

            const elements: React.ReactNode[] = [];

            // Group 1: Info (fixed)
            const infoItem = mainTabs.find(t => t.key === "info");
            if (infoItem) elements.push(renderTab(infoItem));

            // Group 2: Cidade dropdown (fixed, right after Info)
            if (cityTabs.length > 0) {
              elements.push(sep("info-city"));
              elements.push(
                <DropdownMenu key="city-dropdown">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            isCityTabActive
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                          title="Abas da cidade"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {activeCityTab ? activeCityTab.label : "Cidade"}
                          <ChevronDown className="w-3 h-3 ml-0.5" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">Abas da cidade</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start" className="bg-popover z-50">
                    {cityTabs.map((ct) => (
                      <DropdownMenuItem
                        key={ct.key}
                        onClick={() => handleTabChange(ct.key)}
                        className={`flex items-center gap-2 cursor-pointer ${
                          tab === ct.key ? "bg-accent font-bold" : ""
                        }`}
                      >
                        <ct.icon className="w-4 h-4" />
                        {ct.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            // Group 3: Agenda, Contatos, Social (fixed)
            const commTabs = GROUP_COMM.map(k => mainTabs.find(t => t.key === k)).filter(Boolean) as typeof tabs;
            if (commTabs.length > 0) {
              elements.push(sep("comm"));
              commTabs.forEach((t, i) => {
                if (i > 0) elements.push(sep(`comm-${i}`));
                elements.push(renderTab(t));
              });
            }

            // Group 4: Draggable tool tabs (navegar, agenda, financas, convidar, etc.)
            const allDraggableTabs = mainTabs.filter(t => !["info", ...GROUP_COMM].includes(t.key));

            if (allDraggableTabs.length > 0) {
              if (!reorderMode) elements.push(sep("tools"));

              if (reorderMode) {
                const orderedKeys = tabOrder
                  ? tabOrder.filter(k => allDraggableTabs.some(t => t.key === k)).concat(allDraggableTabs.filter(t => !tabOrder.includes(t.key)).map(t => t.key))
                  : allDraggableTabs.map(t => t.key);
                const orderedDraggable = orderedKeys.map(k => allDraggableTabs.find(t => t.key === k)).filter(Boolean) as typeof tabs;

                elements.push(
                  <DragDropContext key="dnd-ctx" onDragEnd={handleDragEnd}>
                    <Droppable droppableId="tabs" direction="horizontal">
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="flex items-center gap-1"
                        >
                          {orderedDraggable.map((t, i) => (
                            <Draggable key={t.key} draggableId={t.key} index={i}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={snap.isDragging ? "opacity-80 scale-105 z-50" : ""}
                                >
                                  {renderTab(t)}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                );
                elements.push(
                  <button
                    key="done-reorder"
                    onClick={() => setReorderMode(false)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shrink-0"
                    title="Concluir reordenação"
                  >
                    <Check className="w-3 h-3" />
                    OK
                  </button>
                );
              } else {
                // Normal mode: respect tabOrder
                const orderedKeys = tabOrder
                  ? tabOrder.filter(k => allDraggableTabs.some(t => t.key === k)).concat(allDraggableTabs.filter(t => !tabOrder.includes(t.key)).map(t => t.key))
                  : allDraggableTabs.map(t => t.key);

                orderedKeys.forEach((k, i) => {
                  const t = allDraggableTabs.find(tab => tab.key === k);
                  if (t) {
                    if (i > 0) elements.push(sep(`tool-${i}`));
                    elements.push(renderTab(t));
                  }
                });
              }
            }

            // Separator before "Mais" dropdown
            if (moreTabs.length > 0) {
              elements.push(sep("more"));
              elements.push(
                <DropdownMenu key="more-dropdown">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            isMoreTabActive
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                          title="Mais opções"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                          {activeMoreTab ? activeMoreTab.label : "Mais"}
                          <ChevronDown className="w-3 h-3 ml-0.5" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">Mais opções</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="bg-popover z-50">
                    {moreTabs.map((mt) => (
                      <DropdownMenuItem
                        key={mt.key}
                        onClick={() => handleTabChange(mt.key)}
                        className={`flex items-center gap-2 cursor-pointer ${
                          tab === mt.key ? "bg-accent font-bold" : ""
                        }`}
                      >
                        <mt.icon className="w-4 h-4" />
                        {mt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }




            return elements;
          })()}
        </div>
      </div>

      {/* Content — scrollable area */}
      <main className={`flex-1 overflow-y-auto animate-fade-in ${tab === "navegar" ? "px-0 pb-0 overflow-hidden" : "container py-4 pb-24"}`} key={`${city.id}-${tab}`}>
        <TabErrorBoundary key={`eb-${tab}`}>
          <Suspense fallback={<TabFallback />}>
            {tab === "info" && <CityInfo city={city} />}
            {tab === "mapa" && (
              <div className="h-[60vh] rounded-xl overflow-hidden border border-border shadow-lg">
                <CityMap coordenadas={city.coordenadas} zoom={city.zoom} nome={city.nome} estado={city.estado} />
              </div>
            )}
            {tab === "bairros" && <BairrosSection city={city} />}
            {tab === "navegar" && (
              user && userCity ? (
                <div className="px-3 pt-3 pb-8">
                  <div className="flex items-center gap-2 mb-3 bg-primary/5 rounded-lg px-3 py-2">
                    <Navigation className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Navegando em {detectedCityName || userCity.nome}
                    </span>
                    <span className="text-xs text-muted-foreground">— {userCity.estado}</span>
                    {detectedCityName && detectedCityName !== userCity.nome && (
                      <span className="text-[10px] text-muted-foreground/70 ml-1">(base: {userCity.nome})</span>
                    )}
                  </div>
                  <NavigationSection cityId={userCity.id} coordenadas={userCity.coordenadas} zoom={userCity.zoom} cityName={userCity.nome} bairros={userCity.bairros} ruas={userCity.ruasPrincipais} initialDestination={navDestination} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <Navigation className="w-12 h-12 text-muted-foreground/40" />
                  <p className="text-muted-foreground text-sm text-center">Faça login para usar a navegação da sua cidade.</p>
                  <Link to="/auth" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
                    Entrar
                  </Link>
                </div>
              )
            )}
            {tab === "ruas" && <RuasSection city={city} />}
            {tab === "clima" && <WeatherSection coordenadas={city.coordenadas} cityName={city.nome} />}
            {tab === "eventos" && <EventsSection cityName={city.nome} />}
            {tab === "noticias" && <NewsSection cityName={city.nome} stateName={city.estado} />}
            {tab === "contatos" && <ContactsSection />}
            {tab === "social" && <SocialSection cityId={city.id} />}
            {tab === "agenda" && <AgendaSection onNavigateTo={(addr) => { setNavDestination(addr); handleTabChange("navegar"); }} />}
            {tab === "convidar" && <InviteSection />}
            {tab === "financas" && <FinancesSection />}
          </Suspense>
        </TabErrorBoundary>
      </main>

      <div className="pb-16 md:pb-0" /> {/* Bottom nav spacer on mobile */}
      <BottomNav activeTab={tab} onTabChange={(t) => handleTabChange(t as Tab)} />
      <Suspense fallback={null}>
        <AIChat cityName={city.nome} stateName={city.estado} />
      </Suspense>
    </div>
      <LogoutBackupDialog open={showLogoutBackup} onOpenChange={setShowLogoutBackup} />
    </>
  );
};

export default Index;




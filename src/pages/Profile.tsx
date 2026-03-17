import { useState, useEffect, useRef, useCallback } from "react";
import PoweredFooter from "@/components/common/PoweredFooter";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceCall } from "@/components/social/VoiceCallProvider";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate, Navigate } from "react-router-dom";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, ArrowLeft, Save, Trash2, RefreshCw, Sun, Moon, Monitor, Eye, EyeOff, Phone, Smartphone, PhoneCall, MapPin, Type, Star, Sparkles, Crown, Award, LayoutGrid, GripVertical, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import ImageCropModal from "@/components/common/ImageCropModal";
import DataManagement from "@/components/admin/DataManagement";
import ChangePasswordSection from "@/components/auth/ChangePasswordSection";
import PaymentMethodsManager from "@/components/finances/PaymentMethodsManager";
import CategoriesManager from "@/components/finances/CategoriesManager";
import {
  Map, Info, Building2, Route, Newspaper, MessageCircle,
  Navigation, CloudSun, CalendarDays, CalendarCheck, UserPlus
} from "lucide-react";

interface VisibleFields {
  phone: boolean;
  address: boolean;
  email: boolean;
}

const ALL_TABS = [
  { key: "agenda", label: "Agenda", icon: CalendarCheck },
  { key: "bairros", label: "Bairros", icon: Building2 },
  { key: "clima", label: "Clima", icon: CloudSun },
  { key: "convidar", label: "Convidar", icon: UserPlus },
  { key: "eventos", label: "Eventos", icon: CalendarDays },
  { key: "financas", label: "Finanças", icon: DollarSign },
  { key: "info", label: "Info", icon: Info },
  
  { key: "mapa", label: "Mapa", icon: Map },
  { key: "navegar", label: "Navegar", icon: Navigation },
  { key: "noticias", label: "Notícias", icon: Newspaper },
  { key: "ruas", label: "Ruas", icon: Route },
  { key: "social", label: "Social", icon: MessageCircle },
];

const FIXED_TABS = ["social"]; // Tabs that cannot be reordered or hidden

const Profile = () => {
  useScrollRestore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updateProfile } = useProfile();
  const { startCall } = useVoiceCall();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [theme, setTheme] = useState("system");
  const [fontSize, setFontSize] = useState(16);
  const [visibleFields, setVisibleFields] = useState<VisibleFields>({ phone: false, address: false, email: false });
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [inviteCount, setInviteCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({});
  const [tabOrder, setTabOrder] = useState<string[]>(ALL_TABS.map(t => t.key));
  const [visibleAgendaTabs, setVisibleAgendaTabs] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("cidadex-visible-agenda-tabs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return { compromissos: true, compras: true, notas: true, dicionario: true, remedios: true };
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name, avatar_url, sync_enabled, phone, address, theme, font_size, visible_fields, visible_tabs, tab_order").eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name || "");
          setAvatarUrl(data.avatar_url);
          setSyncEnabled(data.sync_enabled !== false);
          setPhone(data.phone || "");
          setAddress(data.address || "");
          setTheme(data.theme || "system");
          setFontSize(data.font_size || 16);
          const vf = data.visible_fields;
          if (vf && typeof vf === "object" && !Array.isArray(vf)) {
            setVisibleFields(vf as unknown as VisibleFields);
            // Load agenda sub-tabs from DB if available
            const agTabs = (vf as any)._agenda_tabs;
            if (agTabs && typeof agTabs === "object") {
              setVisibleAgendaTabs(agTabs);
              localStorage.setItem("cidadex-visible-agenda-tabs", JSON.stringify(agTabs));
            }
          }
          const vt = data.visible_tabs;
          if (vt && typeof vt === "object" && !Array.isArray(vt)) {
            setVisibleTabs(vt as Record<string, boolean>);
          } else {
            // Default: all visible
            const def: Record<string, boolean> = {};
            ALL_TABS.forEach(t => def[t.key] = true);
            setVisibleTabs(def);
          }
          const to = (data as any).tab_order;
          if (Array.isArray(to) && to.length > 0) {
            // Merge: include any new tabs not in saved order
            const saved = to.filter((k: string) => ALL_TABS.some(t => t.key === k));
            const missing = ALL_TABS.map(t => t.key).filter(k => !saved.includes(k));
            setTabOrder([...saved, ...missing]);
          }
        }
        setLoading(false);
      });

    supabase.from("invites").select("*", { count: "exact", head: true }).eq("inviter_id", user.id).eq("status", "accepted")
      .then(({ count }) => setInviteCount(count || 0));
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  const handleSyncToggle = async (checked: boolean) => {
    setSyncEnabled(checked);
    if (user) {
      await supabase.from("profiles").update({ sync_enabled: checked }).eq("user_id", user.id);
      toast({ title: checked ? "Sincronização ativada" : "Sincronização desativada" });
    }
  };

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    if (user) {
      await supabase.from("profiles").update({ theme: newTheme }).eq("user_id", user.id);
    }
  };

  const handleFontSizeChange = async (value: number[]) => {
    const size = value[0];
    setFontSize(size);
    if (user) {
      await supabase.from("profiles").update({ font_size: size }).eq("user_id", user.id);
    }
  };

  const toggleFieldVisibility = async (field: keyof VisibleFields) => {
    const updated = { ...visibleFields, [field]: !visibleFields[field] };
    setVisibleFields(updated);
    if (user) {
      await supabase.from("profiles").update({ visible_fields: updated }).eq("user_id", user.id);
    }
  };

  const handleTabDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(tabOrder);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setTabOrder(items);
    if (user) {
      await supabase.from("profiles").update({ tab_order: items }).eq("user_id", user.id);
    }
  }, [tabOrder, user]);

  const toggleTabVisibility = async (tabKey: string) => {
    const updated = { ...visibleTabs, [tabKey]: !visibleTabs[tabKey] };
    setVisibleTabs(updated);
    if (user) {
      await supabase.from("profiles").update({ visible_tabs: updated }).eq("user_id", user.id);
    }
  };

  const toggleAgendaTabVisibility = (tabKey: string) => {
    const updated = { ...visibleAgendaTabs, [tabKey]: !visibleAgendaTabs[tabKey] };
    // Prevent disabling all tabs
    const anyOn = Object.values(updated).some(v => v);
    if (!anyOn) {
      toast({ title: "Pelo menos uma aba deve estar ativa", variant: "destructive" });
      return;
    }
    setVisibleAgendaTabs(updated);
    localStorage.setItem("cidadex-visible-agenda-tabs", JSON.stringify(updated));
    // Sync to database for cross-device replication
    if (user) {
      supabase.from("profiles").update({
        visible_fields: { ...visibleFields, _agenda_tabs: updated } as any,
      }).eq("user_id", user.id).then(() => {});
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Erro", description: "Imagem muito grande. Máximo 10MB.", variant: "destructive" });
      return;
    }
    pendingFileRef.current = file;
    const reader = new FileReader();
    reader.onload = () => setCropImageSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user) return;
    setCropImageSrc(null);
    setUploading(true);
    const path = `${user.id}/avatar.jpg`;
    await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    setAvatarUrl(url);
    updateProfile({ avatar_url: url });
    setUploading(false);
    toast({ title: "Foto atualizada!" });
  };

  const handleSave = async () => {
    if (!user) return;
    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length > 0 && rawPhone.length !== 11) {
      toast({ title: "Celular inválido", description: "O número deve ter 11 dígitos (DDD + número).", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
    }).eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } else {
      updateProfile({ display_name: displayName.trim() });
      toast({ title: "Perfil salvo!" });
    }
  };

  const handleWhatsAppCall = async () => {
    if (!user) return;
    const rawPhone = phone.replace(/\D/g, "");
    if (!rawPhone || rawPhone.length < 10) {
      toast({ title: "Sem número", description: "Adicione seu celular no perfil primeiro.", variant: "destructive" });
      return;
    }
    window.open(`https://wa.me/55${rawPhone}`, "_blank", "noopener,noreferrer");
  };

  if (!user) return <Navigate to="/auth" replace />;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const initials = (displayName || user.email || "U").slice(0, 2).toUpperCase();

  const themeOptions = [
    { value: "light", icon: Sun, label: "Claro" },
    { value: "dark", icon: Moon, label: "Escuro" },
    { value: "system", icon: Monitor, label: "Sistema" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero sticky top-0 z-40 shadow-lg">
        <div className="container py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="font-display font-black text-primary-foreground text-lg">Meu Perfil</h1>
        </div>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative group">
            <Avatar className="w-20 h-20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => fileRef.current?.click()} className="text-xs text-primary font-medium hover:underline">
              {uploading ? "Enviando..." : avatarUrl ? "Substituir foto" : "Adicionar foto"}
            </button>
            {avatarUrl && !uploading && (
              <button
                onClick={async () => {
                  if (!user) return;
                  setUploading(true);
                  await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
                  setAvatarUrl(null);
                  updateProfile({ avatar_url: null });
                  setUploading(false);
                  toast({ title: "Foto removida!" });
                }}
                className="text-xs text-destructive font-medium hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Remover
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Call buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => startCall(user.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <PhoneCall className="w-4 h-4" />
            Chamada de voz
          </button>
          <button
            onClick={handleWhatsAppCall}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] text-white font-semibold text-sm hover:bg-[#25D366]/90 transition-colors"
          >
            <Phone className="w-4 h-4" />
            WhatsApp
          </button>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Personal info */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
              <input type="email" value={user.email || ""} disabled
                className="w-full px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm outline-none opacity-60" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                {phone.replace(/\D/g, "").length >= 11 ? <Smartphone className="w-3.5 h-3.5 text-primary" /> : <Phone className="w-3.5 h-3.5 text-primary" />}
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{phone.replace(/\D/g, "").length >= 11 ? "Celular" : "Telefone"}</label>
              </div>
              <input type="tel" value={phone} onChange={(e) => {
                let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                else if (v.length > 0) v = `(${v}`;
                setPhone(v);
              }} placeholder="(00) 00000-0000"
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endereço</label>
              </div>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro..."
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
            </div>
            <button onClick={handleSave} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </div>

          {/* Badges */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Conquistas de convites</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { threshold: 5, label: "Iniciante", icon: Star, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
                { threshold: 10, label: "Popular", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
                { threshold: 25, label: "Embaixador", icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
              ].map(badge => {
                const unlocked = inviteCount >= badge.threshold;
                const Icon = badge.icon;
                return (
                  <div
                    key={badge.threshold}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      unlocked ? `${badge.bg} ${badge.border}` : "bg-muted/50 border-border opacity-50 grayscale"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${unlocked ? badge.color : "text-muted-foreground"}`} />
                    <span className={`text-xs font-bold ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>{badge.label}</span>
                    <span className="text-[10px] text-muted-foreground">{badge.threshold} convites</span>
                    {unlocked && <span className="text-[10px] font-semibold text-green-500">✓</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground text-center">{inviteCount} convite{inviteCount !== 1 ? "s" : ""} aceito{inviteCount !== 1 ? "s" : ""}</p>
          </div>

          {/* Visibility */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Campos visíveis no perfil</h3>
            </div>
            <p className="text-xs text-muted-foreground">Escolha quais informações outros usuários podem ver</p>
            {([
              { key: "email" as const, label: "Email" },
              { key: "phone" as const, label: "Celular" },
              { key: "address" as const, label: "Endereço" },
            ]).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <button onClick={() => toggleFieldVisibility(key)} className="flex items-center gap-1.5 text-xs font-medium">
                  {visibleFields[key] ? (
                    <span className="flex items-center gap-1 text-primary"><Eye className="w-3.5 h-3.5" /> Visível</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="w-3.5 h-3.5" /> Oculto</span>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Change password */}
          <ChangePasswordSection />

          <div className="glass-card rounded-xl p-4 space-y-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Abas de navegação</h3>
              </div>
              <button
                onClick={async () => {
                  const defaultOrder = ALL_TABS.map(t => t.key);
                  setTabOrder(defaultOrder);
                  if (user) {
                    await supabase.from("profiles").update({ tab_order: defaultOrder }).eq("user_id", user.id);
                    toast({ title: "Ordem resetada para alfabética" });
                  }
                }}
                className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors font-medium"
              >
                Resetar A-Z
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Arraste para reordenar · Toque para ativar/desativar</p>
            <DragDropContext onDragEnd={handleTabDragEnd}>
              <Droppable droppableId="tabs-order" direction="vertical">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                    {tabOrder.filter(key => !FIXED_TABS.includes(key)).map((key, index) => {
                      const t = ALL_TABS.find(tab => tab.key === key);
                      if (!t) return null;
                      const Icon = t.icon;
                      const isOn = visibleTabs[t.key] !== false;
                      return (
                        <Draggable key={t.key} draggableId={t.key} index={index}>
                          {(prov, snapshot) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${
                                snapshot.isDragging
                                  ? "bg-primary/20 border-primary/40 shadow-lg"
                                  : isOn
                                    ? "bg-primary/10 border-primary/20 text-foreground"
                                    : "bg-muted/50 border-border text-muted-foreground opacity-60"
                              }`}
                            >
                              <div {...prov.dragHandleProps} className="cursor-grab active:cursor-grabbing touch-none">
                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <Icon className="w-3.5 h-3.5" />
                              <span className="flex-1">{t.label}</span>
                              <button
                                onClick={() => toggleTabVisibility(t.key)}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                              >
                                {isOn ? "✓ On" : "✗ Off"}
                              </button>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          {/* Agenda sub-tabs visibility */}
          <div className="glass-card rounded-xl p-4 space-y-3 sm:col-span-2">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Abas da Agenda</h3>
            </div>
            <p className="text-xs text-muted-foreground">Ative ou desative as sub-abas dentro da Agenda</p>
            <div className="space-y-1.5">
              {([
                { key: "compromissos", label: "Compromissos" },
                { key: "compras", label: "Lista de Atividades" },
                { key: "notas", label: "Notas" },
                { key: "dicionario", label: "Dicionário" },
                { key: "remedios", label: "MeuRemédio" },
              ]).map(({ key, label }) => {
                const isOn = visibleAgendaTabs[key] !== false;
                return (
                  <div key={key} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                    isOn ? "bg-primary/10 border-primary/20 text-foreground" : "bg-muted/50 border-border text-muted-foreground opacity-60"
                  }`}>
                    <span className="text-xs font-medium">{label}</span>
                    <Switch checked={isOn} onCheckedChange={() => toggleAgendaTabVisibility(key)} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Methods */}
          <PaymentMethodsManager />

          {/* Finance Categories */}
          <CategoriesManager />

          {/* Theme */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Tema</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => handleThemeChange(value)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    theme === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Type className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Tamanho da fonte</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">A</span>
              <Slider
                value={[fontSize]}
                onValueChange={handleFontSizeChange}
                min={12}
                max={22}
                step={1}
                className="flex-1"
              />
              <span className="text-lg text-muted-foreground font-bold">A</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">{fontSize}px</p>
          </div>

          {/* Sync */}
          <div className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Sincronização</h3>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Sincronizar entre dispositivos</p>
                <p className="text-xs text-muted-foreground">Cidade e aba ativa ficam iguais em celular, tablet e web</p>
              </div>
              <Switch checked={syncEnabled} onCheckedChange={handleSyncToggle} />
            </div>
          </div>

          {/* Data Management - full width */}
          <div className="sm:col-span-2">
            <DataManagement />
          </div>
        </div>
      </main>
      <PoweredFooter />

      {cropImageSrc && (
        <ImageCropModal imageSrc={cropImageSrc} onCancel={() => setCropImageSrc(null)} onConfirm={handleCroppedUpload} />
      )}
    </div>
  );
};

export default Profile;

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useLocalReminders } from "@/hooks/useLocalReminders";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRetry, isLockManagerError } from "@/lib/supabaseRetry";
import { cities } from "@/config/cities";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInHours, isPast, isToday, isTomorrow, isFuture, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarPlus, Trash2, Edit2, Check, X, Loader2, ChevronDown, ChevronUp,
  MapPin, Phone, Smartphone, User, Clock, FileText, Navigation, Plus, Filter,
  Bell, Download, CheckSquare, Square, AlertTriangle, Save, BookMarked, Trash, ArrowUpDown, Search, BarChart3, LayoutGrid, LayoutList, GripVertical, ShoppingCart, CalendarDays, Printer, BookOpen, Pill
} from "lucide-react";

const ShoppingListSection = lazy(() => import("./ShoppingListSection"));
const NotebooksSection = lazy(() => import("./NotebooksSection"));
const DictionarySection = lazy(() => import("./DictionarySection"));
const MedicationsSection = lazy(() => import("./MedicationsSection"));
import AgendaAttachments, { AttachmentIndicator, uploadPendingFiles, clearPendingFiles } from "./AgendaAttachments";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

// --- Types ---
interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  scheduled_date: string;
  completion_date: string | null;
  professional_name: string | null;
  profession: string | null;
  reminder_minutes: number | null;
  referente: string | null;
  
  origin_name: string | null;
  origin_phone: string | null;
  origin_mobile: string | null;
  origin_address: string | null;
  origin_number: string | null;
  origin_neighborhood: string | null;
  origin_city: string | null;
  destination_name: string | null;
  destination_phone: string | null;
  destination_mobile: string | null;
  destination_address: string | null;
  destination_number: string | null;
  destination_neighborhood: string | null;
  destination_city: string | null;
  destination_zipcode: string | null;
  created_at: string;
  position: number;
}

const CATEGORIES = [
  "Geral", "Trabalho", "Pessoal", "Saúde", "Financeiro", "Viagem", "Reunião", "Entrega", "Visita", "Outro",
];

const PROFESSIONS = [
  "Advogado(a)", "Arquiteto(a)", "Contador(a)", "Corretor(a)", "Dentista", "Designer",
  "Eletricista", "Enfermeiro(a)", "Engenheiro(a)", "Farmacêutico(a)", "Fisioterapeuta",
  "Médico(a)", "Nutricionista", "Pedreiro", "Pintor(a)", "Professor(a)", "Programador(a)",
  "Psicólogo(a)", "Técnico(a)", "Veterinário(a)", "Outro"
];

const STATUS_OPTIONS = [
  { value: "em_andamento", label: "Em Andamento", color: "bg-amber-500/15 text-amber-600" },
  { value: "concluido", label: "Concluído", color: "bg-emerald-500/15 text-emerald-600" },
  { value: "cancelada", label: "Cancelada", color: "bg-red-500/15 text-red-600" },
];

const REMINDER_OPTIONS = [
  { value: null, label: "Sem lembrete" },
  { value: 5, label: "5 minutos antes" },
  { value: 10, label: "10 minutos antes" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];

const emptyForm = {
  title: "", professional_name: "", profession: "", description: "", category: "Geral", status: "em_andamento",
  scheduled_date: new Date(), scheduled_time: "", completion_date: null as Date | null,
  reminder_minutes: null as number | null,
  origin_name: "", origin_phone: "", origin_mobile: "",
  origin_address: "", origin_number: "", origin_neighborhood: "", origin_city: "",
  destination_name: "", destination_phone: "", destination_mobile: "",
  destination_address: "", destination_number: "", destination_neighborhood: "", destination_city: "", destination_zipcode: "",
};

// --- Sub-components ---
interface SavedAddress {
  id: string;
  label: string;
  name: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
}

// Ceará municipalities list
const CEARA_MUNICIPALITIES = [
  ...cities.map(c => c.nome),
  "Acaraú", "Acopiara", "Aiuaba", "Alcântaras", "Altaneira", "Alto Santo", "Amontada", "Antonina do Norte",
  "Apuiarés", "Aquiraz", "Aracati", "Aracoiaba", "Ararendá", "Araripe", "Aratuba", "Arneiroz",
  "Assaré", "Aurora", "Baixio", "Banabuiú", "Barbalha", "Barreira", "Barro", "Barroquinha",
  "Baturité", "Beberibe", "Bela Cruz", "Boa Viagem", "Brejo Santo", "Camocim", "Campos Sales",
  "Canindé", "Capistrano", "Caridade", "Cariré", "Caririaçu", "Cariús", "Carnaubal",
  "Cascavel", "Catarina", "Catunda", "Cedro", "Chaval", "Choró", "Chorozinho",
  "Coreaú", "Crateús", "Croatá", "Cruz", "Deputado Irapuan Pinheiro", "Eusébio",
  "Farias Brito", "Forquilha", "Frecheirinha", "General Sampaio", "Graça", "Granja",
  "Granjeiro", "Groaíras", "Guaiúba", "Guaraciaba do Norte", "Guaramiranga",
  "Hidrolândia", "Horizonte", "Ibaretama", "Ibiapina", "Ibicuitinga", "Icapuí", "Icó",
  "Iguatu", "Independência", "Ipaporanga", "Ipaumirim", "Ipu", "Ipueiras",
  "Iracema", "Irauçuba", "Jaguaretama", "Jaguaribara", "Jaguaribe", "Jaguaruana",
  "Jardim", "Jati", "Jijoca de Jericoacoara", "Juazeiro do Norte", "Jucás",
  "Lavras da Mangabeira", "Limoeiro do Norte", "Madalena", "Maracanaú", "Maranguape",
  "Marco", "Martinópole", "Massapê", "Mauriti", "Meruoca", "Milagres", "Milhã",
  "Miraíma", "Missão Velha", "Mombaça", "Monsenhor Tabosa", "Morada Nova",
  "Moraújo", "Morrinhos", "Mucambo", "Mulungu", "Nova Olinda", "Nova Russas",
  "Novo Oriente", "Ocara", "Orós", "Pacajus", "Pacatuba", "Pacoti", "Pacujá",
  "Palhano", "Palmácia", "Paracuru", "Paraipaba", "Parambu", "Paramoti",
  "Pedra Branca", "Penaforte", "Pentecoste", "Pereiro", "Pindoretama", "Piquet Carneiro",
  "Pires Ferreira", "Poranga", "Porteiras", "Potengi", "Potiretama", "Quiterianópolis",
  "Quixadá", "Quixelô", "Quixeramobim", "Quixeré", "Redenção", "Reriutaba",
  "Russas", "Saboeiro", "Salitre", "Santa Quitéria", "Santana do Acaraú",
  "Santana do Cariri", "São Benedito", "São Gonçalo do Amarante", "São João do Jaguaribe",
  "São Luís do Curu", "Senador Pompeu", "Senador Sá", "Solonópole",
  "Tabuleiro do Norte", "Tamboril", "Tarrafas", "Tauá", "Tejuçuoca", "Tianguá",
  "Trairi", "Tururu", "Ubajara", "Umari", "Umirim", "Uruburetama", "Uruoca",
  "Varjota", "Várzea Alegre", "Viçosa do Ceará",
].filter((v, i, a) => a.indexOf(v) === i).sort();

function CityCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return CEARA_MUNICIPALITIES;
    const q = search.toLowerCase();
    return CEARA_MUNICIPALITIES.filter(c => c.toLowerCase().includes(q));
  }, [search]);

  const handleSelect = (city: string) => {
    onChange(city);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className="space-y-0.5 relative">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cidade</label>
      <div className="relative">
        <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={open ? search : value}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setSearch(value); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Selecione ou digite..."
          className="w-full py-1.5 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30 pl-7 pr-6"
        />
        <button type="button" onClick={() => { setOpen(!open); if (!open) { setSearch(value); inputRef.current?.focus(); } }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" title="Abrir lista de cidades">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[9999] left-0 right-0 bottom-full mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
          {filtered.map(city => (
            <button key={city} type="button" onMouseDown={e => { e.preventDefault(); handleSelect(city); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                city === value && "bg-primary/10 font-semibold text-primary")}>
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ViaCepResult {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

function CepLookupInput({ value, onChange, onAddressFound }: {
  value: string;
  onChange: (v: string) => void;
  onAddressFound: (data: ViaCepResult) => void;
}) {
  const [loading, setLoading] = useState(false);

  const fetchCep = async (cep?: string) => {
    const digits = (cep || value).replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-cep", {
        body: { cep: digits },
      });
      if (!error && data && !data.erro) onAddressFound(data as ViaCepResult);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleChange = (raw: string) => {
    const formatted = formatZipcode(raw);
    onChange(formatted);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) fetchCep(raw);
  };

  return (
    <div className="space-y-0.5 relative">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CEP</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder="00000-000"
          className="flex-1 py-1.5 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30 px-2"
        />
        <button
          type="button"
          onClick={() => fetchCep()}
          disabled={loading || (value.replace(/\D/g, "").length !== 8)}
          className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          title="Buscar endereço pelo CEP"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function AddressBlock({ prefix, label, values, onChange, userId }: {
  prefix: "origin" | "destination"; label: string;
  values: Record<string, string>; onChange: (field: string, value: string) => void;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<string | null>(null);
  const hasData = Object.values(values).some(v => v.trim());

  const fetchSaved = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("saved_addresses").select("*").eq("user_id", userId).order("label");
    setSavedAddresses((data as SavedAddress[]) || []);
  }, [userId]);

  useEffect(() => { if (open) fetchSaved(); }, [open, fetchSaved]);

  const handleSaveAddress = async () => {
    if (!userId || !saveLabel.trim()) return;
    setSavingAddr(true);
    if (editingAddrId) {
      await supabase.from("saved_addresses").update({
        label: saveLabel.trim(),
        name: values.name || null, phone: values.phone || null, mobile: values.mobile || null,
        address: values.address || null, number: values.number || null,
        neighborhood: values.neighborhood || null, city: values.city || null,
      }).eq("id", editingAddrId);
      setEditingAddrId(null);
    } else {
      await supabase.from("saved_addresses").insert({
        user_id: userId, label: saveLabel.trim(),
        name: values.name || null, phone: values.phone || null, mobile: values.mobile || null,
        address: values.address || null, number: values.number || null,
        neighborhood: values.neighborhood || null, city: values.city || null,
      });
    }
    setSaveLabel("");
    setShowSaveInput(false);
    setSavingAddr(false);
    fetchSaved();
  };

  const handleLoadAddress = (addr: SavedAddress) => {
    onChange(`${prefix}_name`, addr.name || "");
    onChange(`${prefix}_phone`, addr.phone || "");
    onChange(`${prefix}_mobile`, addr.mobile || "");
    onChange(`${prefix}_address`, addr.address || "");
    onChange(`${prefix}_number`, addr.number || "");
    onChange(`${prefix}_neighborhood`, addr.neighborhood || "");
    onChange(`${prefix}_city`, addr.city || "");
    setShowSaved(false);
  };

  const handleEditAddress = (addr: SavedAddress) => {
    handleLoadAddress(addr);
    setSaveLabel(addr.label);
    setEditingAddrId(addr.id);
    setShowSaveInput(true);
    setShowSaved(false);
  };

  const handleDeleteAddress = async (id: string) => {
    await supabase.from("saved_addresses").delete().eq("id", id);
    if (editingAddrId === id) { setEditingAddrId(null); setSaveLabel(""); setShowSaveInput(false); }
    fetchSaved();
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors">
        {prefix === "origin" ? <MapPin className="w-3.5 h-3.5 text-primary" /> : <Navigation className="w-3.5 h-3.5 text-primary" />}
        {label}{hasData && <span className="w-2 h-2 rounded-full bg-primary ml-1" />}
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="p-3 space-y-2 border-t border-border bg-muted/20 animate-fade-in">
          {/* Load / Save buttons */}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { setShowSaved(!showSaved); setShowSaveInput(false); }}
              className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors",
                showSaved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10")} title="Ver endereços salvos">
              <BookMarked className="w-3 h-3" /> Salvos ({savedAddresses.length})
            </button>
            {hasData && !editingAddrId && (
              <button type="button" onClick={() => { setShowSaveInput(!showSaveInput); setShowSaved(false); setEditingAddrId(null); setSaveLabel(""); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-primary/10 text-[10px] font-semibold transition-colors"
                title="Salvar endereço atual">
                <Save className="w-3 h-3" /> Salvar
              </button>
            )}
          </div>

          {/* Save / Edit input */}
          {showSaveInput && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <input type="text" value={saveLabel} onChange={e => setSaveLabel(e.target.value)}
                placeholder={editingAddrId ? "Renomear endereço" : "Nome do endereço (ex: Casa, Trabalho)"}
                className="flex-1 py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30 border border-border" />
              <button type="button" onClick={handleSaveAddress} disabled={savingAddr || !saveLabel.trim()}
                className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50"
                title="Confirmar salvamento">
                {savingAddr ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              {editingAddrId && (
                <button type="button" onClick={() => { setEditingAddrId(null); setSaveLabel(""); setShowSaveInput(false); }}
                  className="px-2 py-1.5 rounded-md bg-muted text-muted-foreground text-[10px] font-semibold"
                  title="Cancelar edição">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Saved list */}
          {showSaved && (
            <div className="space-y-1 max-h-32 overflow-y-auto animate-fade-in">
              {savedAddresses.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-1">Nenhum endereço salvo.</p>
              ) : savedAddresses.map(addr => (
                <div key={addr.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-background border border-border">
                  <button type="button" onClick={() => handleLoadAddress(addr)} className="flex-1 text-left min-w-0">
                    <p className="text-[10px] font-semibold text-foreground truncate">{addr.label}</p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {[addr.name, addr.address, addr.city].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                  <button type="button" onClick={() => handleEditAddress(addr)}
                    className="text-muted-foreground hover:text-primary shrink-0 transition-colors" title="Editar">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-destructive shrink-0 transition-colors" title="Excluir">
                        <Trash className="w-3 h-3" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir endereço?</AlertDialogTitle>
                        <AlertDialogDescription>O endereço "{addr.label}" será removido permanentemente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteAddress(addr.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Input label="Nome" value={values.name} onChange={v => onChange(`${prefix}_name`, v)} icon={<User className="w-3 h-3" />} />
            <Input label={values.phone.replace(/\D/g, "").length >= 11 ? "Celular" : "Telefone"} value={values.phone} onChange={v => onChange(`${prefix}_phone`, v)} icon={values.phone.replace(/\D/g, "").length >= 11 ? <Smartphone className="w-3 h-3" /> : <Phone className="w-3 h-3" />} mask="phone" />
          </div>
          <Input label={values.mobile.replace(/\D/g, "").length >= 11 ? "Celular" : "Telefone"} value={values.mobile} onChange={v => onChange(`${prefix}_mobile`, v)} icon={values.mobile.replace(/\D/g, "").length >= 11 ? <Smartphone className="w-3 h-3" /> : <Phone className="w-3 h-3" />} mask="phone" />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Input label="Endereço" value={values.address} onChange={v => onChange(`${prefix}_address`, v)} /></div>
            <Input label="N°" value={values.number} onChange={v => onChange(`${prefix}_number`, v)} />
          </div>
          <div className={cn("grid gap-2", prefix === "destination" ? "grid-cols-3" : "grid-cols-2")}>
            <Input label="Bairro" value={values.neighborhood} onChange={v => onChange(`${prefix}_neighborhood`, v)} />
            {prefix === "destination" ? (
              <CityCombobox value={values.city} onChange={v => onChange(`${prefix}_city`, v)} />
            ) : (
              <Input label="Cidade" value={values.city} onChange={v => onChange(`${prefix}_city`, v)} />
            )}
            {prefix === "destination" && (
              <CepLookupInput
                value={values.zipcode || ""}
                onChange={v => onChange(`${prefix}_zipcode`, v)}
                onAddressFound={(data) => {
                  if (data.logradouro) onChange(`${prefix}_address`, data.logradouro);
                  if (data.bairro) onChange(`${prefix}_neighborhood`, data.bairro);
                  if (data.localidade) onChange(`${prefix}_city`, data.uf ? `${data.localidade}/${data.uf}` : data.localidade);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  // 11 digits = celular
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatZipcode(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function Input({ label, value, onChange, icon, type = "text", mask }: {
  label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode; type?: string; mask?: "phone" | "zipcode";
}) {
  const handleChange = (raw: string) => {
    if (mask === "phone") {
      onChange(formatPhone(raw));
    } else if (mask === "zipcode") {
      onChange(formatZipcode(raw));
    } else {
      onChange(raw);
    }
  };
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input
          type={type}
          inputMode={mask === "phone" || mask === "zipcode" ? "numeric" : undefined}
          value={value}
          onChange={e => handleChange(e.target.value)}
          maxLength={mask === "phone" ? 15 : mask === "zipcode" ? 9 : 255}
          placeholder={mask === "phone" ? "(00) 00000-0000" : mask === "zipcode" ? "00000-000" : undefined}
          className={cn("w-full py-1.5 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30 pr-2", icon ? "pl-7" : "pl-2")}
        />
      </div>
    </div>
  );
}

function DatePicker({ label, date, onSelect }: { label: string; date: Date | null; onSelect: (d: Date | undefined) => void; }) {
  const [textValue, setTextValue] = useState(date ? format(date, "dd/MM/yyyy") : "");
  const [open, setOpen] = useState(false);

  // Sync text when date changes externally
  useEffect(() => {
    setTextValue(date ? format(date, "dd/MM/yyyy") : "");
  }, [date]);

  const handleTextChange = (raw: string) => {
    // Auto-format: add slashes as user types digits
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    setTextValue(formatted);

    // Parse complete date
    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10) - 1;
      const year = parseInt(digits.slice(4, 8), 10);
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month) {
        onSelect(parsed);
      }
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    onSelect(d);
    setOpen(false);
  };

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={textValue}
          onChange={e => handleTextChange(e.target.value)}
          maxLength={10}
          className="flex-1 py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Abrir calendário">
              <Clock className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[9999]" align="start">
            <Calendar mode="single" selected={date || undefined} onSelect={handleCalendarSelect} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function FilterDatePicker({ label, date, onSelect }: { label: string; date: Date | null; onSelect: (d: Date | undefined) => void }) {
  const [textValue, setTextValue] = useState(date ? format(date, "dd/MM/yyyy") : "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTextValue(date ? format(date, "dd/MM/yyyy") : "");
  }, [date]);

  const handleTextChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    setTextValue(formatted);

    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10) - 1;
      const year = parseInt(digits.slice(4, 8), 10);
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month) {
        onSelect(parsed);
      }
    }
    if (digits.length === 0) {
      onSelect(undefined);
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    onSelect(d);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <label className="text-[10px] text-muted-foreground font-semibold">{label}:</label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={textValue}
        onChange={e => handleTextChange(e.target.value)}
        maxLength={10}
        className="w-[82px] py-1 px-1.5 rounded-md bg-muted text-foreground text-[10px] font-semibold outline-none focus:ring-1 ring-primary/30"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="p-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Abrir calendário">
            <Clock className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[9999]" align="start">
          <Calendar mode="single" selected={date || undefined} onSelect={handleCalendarSelect} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CustomCombobox({ label, value, onChange, defaults, optionType, userId }: {
  label: string; value: string; onChange: (v: string) => void; defaults: string[]; optionType: string; userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch custom items from DB + migrate localStorage once
  const fetchCustom = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_custom_options")
      .select("value")
      .eq("user_id", userId)
      .eq("option_type", optionType)
      .order("created_at");
    const dbItems = (data || []).map(d => d.value);

    // Migrate localStorage if any
    const lsKey = optionType === "profession" ? "agenda_custom_professions" : "agenda_custom_categories";
    try {
      const lsRaw = localStorage.getItem(lsKey);
      if (lsRaw) {
        const lsItems: string[] = JSON.parse(lsRaw);
        const toMigrate = lsItems.filter(item => !dbItems.includes(item));
        if (toMigrate.length > 0) {
          await supabase.from("user_custom_options").insert(
            toMigrate.map(v => ({ user_id: userId, option_type: optionType, value: v }))
          );
          dbItems.push(...toMigrate);
        }
        localStorage.removeItem(lsKey);
      }
    } catch { /* ignore */ }

    setCustomItems(dbItems);
    setLoaded(true);
  }, [userId, optionType]);

  useEffect(() => { fetchCustom(); }, [fetchCustom]);

  const baseItems = defaults.filter(p => p !== "Outro");
  const allItems = [...baseItems, ...customItems];
  const filtered = search
    ? allItems.filter(p => p.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const isNewValue = search.trim() && !allItems.some(p => p.toLowerCase() === search.trim().toLowerCase());

  const addCustom = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || !userId) return;
    await supabase.from("user_custom_options").insert({ user_id: userId, option_type: optionType, value: trimmed });
    setCustomItems(prev => [...prev, trimmed]);
    onChange(trimmed);
    setSearch("");
    setOpen(false);
  };

  const deleteCustom = async (item: string) => {
    if (!userId) return;
    await supabase.from("user_custom_options").delete().eq("user_id", userId).eq("option_type", optionType).eq("value", item);
    setCustomItems(prev => prev.filter(c => c !== item));
    if (value === item) onChange("");
  };

  const selectItem = (p: string) => {
    onChange(p);
    setSearch("");
    setOpen(false);
  };

  const isCustom = (item: string) => customItems.includes(item);

  return (
    <div className="space-y-0.5 relative">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={open ? search : value}
          onFocus={() => { setOpen(true); setSearch(""); }}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
          placeholder="Escolha ou crie nova..."
          className="w-full py-1.5 pl-2 pr-7 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
        />
        {value && !open ? (
          <button type="button" onClick={() => { onChange(""); setSearch(""); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Limpar seleção">
            <X className="w-3 h-3" />
          </button>
        ) : !open && (
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {search.trim() === "" && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground/70 italic border-b border-border">
              💡 Digite um nome novo para criar
            </p>
          )}
          {filtered.map(p => (
            <div key={p} className={cn("flex items-center group", p === value && "bg-primary/10")}>
              <button type="button" onClick={() => selectItem(p)}
                className={cn("flex-1 text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors",
                  p === value && "text-primary font-semibold")}>
                {p}
              </button>
              {isCustom(p) && (
                <button type="button" onClick={(e) => { e.stopPropagation(); deleteCustom(p); }}
                  className="px-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Excluir">
                  <Trash className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {isNewValue && (
            <button type="button" onClick={() => addCustom(search)}
              className="w-full text-left px-2 py-2 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5 border-t border-border">
              <Plus className="w-3.5 h-3.5" /> Criar "{search.trim()}"
            </button>
          )}
          {filtered.length === 0 && !isNewValue && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado</p>
          )}
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />}
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onCancel}>
      <div className="bg-background rounded-xl p-5 shadow-2xl max-w-sm mx-4 space-y-4 border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="font-display font-bold text-sm text-foreground">Confirmar Exclusão</h3>
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors" title="Confirmar exclusão">
            Sim, excluir
          </button>
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors" title="Cancelar exclusão">
            Não, cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// --- PDF Export ---
async function exportToPdf(items: AgendaItem[]) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(16);
  doc.text("Minha Agenda - CidadeX-BR", pw / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Exportado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, pw / 2, y, { align: "center" });
  y += 10;

  for (const item of items) {
    if (y > 270) { doc.addPage(); y = 20; }

    const statusLabel = STATUS_OPTIONS.find(s => s.value === item.status)?.label || item.status;

    doc.setFontSize(10);
    doc.setTextColor(30);
    const prefix = item.status === "concluido" ? "[V] " : "[ ] ";
    doc.text(`${prefix}${item.title}`, 14, y);
    y += 5;

    // Professional info
    if (item.professional_name || item.profession) {
      doc.setFontSize(8);
      doc.setTextColor(80);
      const profLine = [item.professional_name, item.profession].filter(Boolean).join(" — ");
      doc.text(profLine, 18, y);
      y += 4;
    }

    // Referente
    if (item.referente) {
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(`Referente: ${item.referente}`, 18, y);
      y += 4;
    }

    doc.setFontSize(8);
    doc.setTextColor(100);
    const sd = new Date(item.scheduled_date);
    const hasTime = sd.getHours() !== 0 || sd.getMinutes() !== 0;
    const dateStr = format(sd, "dd/MM/yyyy", { locale: ptBR }) + (hasTime ? ` às ${format(sd, "HH:mm")}` : "");
    const meta = [`Data: ${dateStr}`, `Status: ${statusLabel}`, `Categoria: ${item.category}`];
    
    if (item.completion_date) meta.push(`Concluído: ${format(new Date(item.completion_date), "dd/MM/yyyy", { locale: ptBR })}`);
    
    // Lembrete
    if (item.reminder_minutes && item.reminder_minutes > 0) {
      const reminderLabel = item.reminder_minutes >= 60 ? `${Math.floor(item.reminder_minutes / 60)}h${item.reminder_minutes % 60 > 0 ? item.reminder_minutes % 60 + "min" : ""}` : `${item.reminder_minutes}min`;
      meta.push(`Lembrete: ${reminderLabel} antes`);
    }
    
    doc.text(meta.join("  |  "), 18, y);
    y += 5;

    if (item.description) {
      const lines = doc.splitTextToSize(item.description, pw - 36);
      doc.text(lines, 18, y);
      y += lines.length * 4;
    }

    const printAddr = (label: string, name: string | null, addr: string | null, num: string | null, bairro: string | null, city: string | null, phone: string | null, mobile: string | null) => {
      if (!addr && !name) return;
      if (y > 270) { doc.addPage(); y = 20; }
      let line = `${label}: `;
      if (name) line += name + " — ";
      if (addr) { line += addr; if (num) line += `, ${num}`; if (bairro) line += ` - ${bairro}`; if (city) line += ` - ${city}`; }
      if (phone) line += ` | Tel: ${phone}`;
      if (mobile) line += ` | Cel: ${mobile}`;
      doc.text(line, 18, y);
      y += 4;
    };

    printAddr("Origem", item.origin_name, item.origin_address, item.origin_number, item.origin_neighborhood, item.origin_city, item.origin_phone, item.origin_mobile);
    printAddr("Destino", item.destination_name, item.destination_address, item.destination_number, item.destination_neighborhood, item.destination_city, item.destination_phone, item.destination_mobile);

    // separator
    doc.setDrawColor(220);
    doc.line(14, y + 1, pw - 14, y + 1);
    y += 6;
  }

  const blobUrl = URL.createObjectURL(doc.output("blob"));
  return blobUrl;
}

// --- Reminder helper ---
function getReminder(item: AgendaItem): { text: string; urgency: "urgent" | "today" | "soon" | null } | null {
  if (item.status === "concluido" || item.status === "cancelada") return null;
  const d = new Date(item.scheduled_date);
  const now = new Date();
  const endOfScheduledDay = new Date(d);
  endOfScheduledDay.setHours(23, 59, 59, 999);
  const hoursUntil = differenceInHours(d, now);
  if (isPast(endOfScheduledDay)) return { text: "Atrasado!", urgency: "urgent" };
  if (isToday(d)) return { text: "Hoje", urgency: "today" };
  if (isTomorrow(d)) return { text: "Amanhã", urgency: "today" };
  if (hoursUntil <= 72) return { text: `Em ${Math.ceil(hoursUntil / 24)} dias`, urgency: "soon" };
  return null;
}

// --- Highlight helper ---
const HighlightText = React.forwardRef<HTMLSpanElement, { text: string; query: string }>(
  function HighlightText({ text, query, ...props }, ref) {
    if (!query.trim() || !text) return <span ref={ref} {...props}>{text}</span>;
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <span ref={ref} {...props}>
        {parts.map((part, i) =>
          part.toLowerCase() === query.trim().toLowerCase()
            ? <mark key={i} className="bg-primary/30 text-foreground rounded-sm px-0.5">{part}</mark>
            : part
        )}
      </span>
    );
  }
);

function ExpandedDetails({ item, searchText, onEdit, onDelete, onPrintPdf, onNavigateTo }: {
  item: AgendaItem; searchText: string;
  onEdit: (item: AgendaItem) => void; onDelete: (id: string, title: string) => void;
  onPrintPdf: (item: AgendaItem) => void;
  onNavigateTo?: (address: string) => void;
}) {
  const hasOrigin = item.origin_address || item.origin_name;
  const hasDestination = item.destination_address || item.destination_name;
  return (
    <div className="space-y-2 animate-fade-in">
      {item.description && <p className="text-xs text-muted-foreground"><HighlightText text={item.description} query={searchText} /></p>}
      {(item.professional_name || item.profession) && (
        <p className="text-[10px] text-muted-foreground">
          <User className="w-2.5 h-2.5 inline mr-1" />
          <HighlightText text={item.professional_name || ""} query={searchText} />
          {item.professional_name && item.profession ? " — " : ""}
          <HighlightText text={item.profession || ""} query={searchText} />
        </p>
      )}
      {item.completion_date && (
        <p className="text-[10px] text-muted-foreground"><Clock className="w-2.5 h-2.5 inline mr-1" />Concluído em: {format(new Date(item.completion_date), "dd/MM/yyyy", { locale: ptBR })}</p>
      )}
      {hasOrigin && (
        <div className="bg-muted/40 rounded-lg p-2 space-y-0.5">
          <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-primary" /> Origem</p>
          {item.origin_name && <p className="text-[10px] text-foreground">{item.origin_name}</p>}
          {item.origin_address && <p className="text-[10px] text-muted-foreground">{item.origin_address}{item.origin_number ? `, ${item.origin_number}` : ""}{item.origin_neighborhood ? ` - ${item.origin_neighborhood}` : ""}{item.origin_city ? ` - ${item.origin_city}` : ""}</p>}
          {(item.origin_phone || item.origin_mobile) && <p className="text-[10px] text-muted-foreground">{item.origin_phone && `Tel: ${item.origin_phone}`}{item.origin_phone && item.origin_mobile ? " | " : ""}{item.origin_mobile && `Cel: ${item.origin_mobile}`}</p>}
        </div>
      )}
      {hasDestination && (
        <div className="bg-muted/40 rounded-lg p-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1"><Navigation className="w-2.5 h-2.5 text-primary" /> Destino</p>
            {item.destination_address && onNavigateTo && (
              <button onClick={() => {
                const parts = [item.destination_address, item.destination_number, item.destination_neighborhood, item.destination_city].filter(Boolean);
                onNavigateTo(parts.join(", "));
              }} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-colors">
                <Navigation className="w-3 h-3" /> IR
              </button>
            )}
          </div>
          {item.destination_name && <p className="text-[10px] text-foreground">{item.destination_name}</p>}
          {item.destination_address && <p className="text-[10px] text-muted-foreground">{item.destination_address}{item.destination_number ? `, ${item.destination_number}` : ""}{item.destination_neighborhood ? ` - ${item.destination_neighborhood}` : ""}{item.destination_city ? ` - ${item.destination_city}` : ""}{item.destination_zipcode ? ` — CEP: ${item.destination_zipcode}` : ""}</p>}
          {(item.destination_phone || item.destination_mobile) && <p className="text-[10px] text-muted-foreground">{item.destination_phone && `Tel: ${item.destination_phone}`}{item.destination_phone && item.destination_mobile ? " | " : ""}{item.destination_mobile && `Cel: ${item.destination_mobile}`}</p>}
        </div>
      )}
      <AgendaAttachments agendaItemId={item.id} mode="view" />
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onEdit(item)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-muted/80 transition-colors" title="Editar compromisso">
          <Edit2 className="w-3 h-3" /> Editar
        </button>
        <button onClick={() => onPrintPdf(item)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-muted/80 transition-colors" title="Imprimir/Salvar PDF">
          <Printer className="w-3 h-3" /> PDF
        </button>
        <button onClick={() => onDelete(item.id, item.title)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors ml-auto" title="Excluir compromisso">
          <Trash2 className="w-3 h-3" /> Excluir
        </button>
      </div>
    </div>
  );
}

// --- Main Component ---
export default function AgendaSection({ onNavigateTo }: { onNavigateTo?: (address: string) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [visibleAgendaTabs, setVisibleAgendaTabs] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("cidadex-visible-agenda-tabs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return { compromissos: true, compras: true, notas: true, dicionario: true, remedios: true };
  });

  // React to localStorage changes from other tabs/devices
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "cidadex-visible-agenda-tabs" && e.newValue) {
        try { setVisibleAgendaTabs(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", handler);

    // Also re-read on focus (covers mobile returning to app)
    const focusHandler = () => {
      try {
        const stored = localStorage.getItem("cidadex-visible-agenda-tabs");
        if (stored) setVisibleAgendaTabs(JSON.parse(stored));
      } catch {}
    };
    window.addEventListener("focus", focusHandler);

    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("focus", focusHandler);
    };
  }, []);
  const firstVisibleTab = (["compromissos", "compras", "notas", "dicionario", "remedios"] as const).find(k => visibleAgendaTabs[k] !== false) || "compromissos";
  const [agendaTab, setAgendaTab] = useState<"compromissos" | "compras" | "notas" | "dicionario" | "remedios">(firstVisibleTab);
  // If current tab becomes hidden, switch to first visible
  useEffect(() => {
    if (visibleAgendaTabs[agendaTab] === false) {
      setAgendaTab(firstVisibleTab);
    }
  }, [visibleAgendaTabs, agendaTab, firstVisibleTab]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  useLocalReminders(items);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string>("em_andamento");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<Date | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title" | "category" | "manual" | "professional" | "status">("date");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [viewMode, setViewModeState] = useState<"table" | "cards">("table");

  // Load saved view mode preference
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("agenda_view_mode").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.agenda_view_mode === "cards" || data?.agenda_view_mode === "table") {
        setViewModeState(data.agenda_view_mode);
      }
    });
  }, [user]);

  const setViewMode = useCallback((updater: "table" | "cards" | ((prev: "table" | "cards") => "table" | "cards")) => {
    setViewModeState(prev => {
      const newVal = typeof updater === "function" ? updater(prev) : updater;
      if (user) {
        supabase.from("profiles").update({ agenda_view_mode: newVal } as any).eq("user_id", user.id).then();
      }
      return newVal;
    });
  }, [user]);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; message: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  
  const fileInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.value = ""; }, []);
  const fetchItems = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await supabaseRetry(
        async () => supabase.from("agenda_items").select("*").eq("user_id", user.id).order("scheduled_date", { ascending: true }),
        2, 1500, "agenda_items"
      );
      const { data, error } = result as any;
      if (error) {
        console.error("[Agenda] fetch error:", error);
        toast({ title: "Erro ao carregar agenda", description: isLockManagerError(error) ? "Sessão instável. Tente recarregar a página." : error.message, variant: "destructive" });
      }
      setItems((data as AgendaItem[]) || []);
    } catch (err: any) {
      console.error("[Agenda] unexpected error:", err);
      if (isLockManagerError(err)) {
        toast({ title: "Erro ao carregar agenda", description: "Sessão instável. Tente recarregar a página.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Reminders notification on load
  useEffect(() => {
    if (items.length === 0) return;
    const upcoming = items.filter(i => {
      const r = getReminder(i);
      return r && (r.urgency === "urgent" || r.urgency === "today");
    });
    if (upcoming.length > 0) {
      toast({
        title: `🔔 ${upcoming.length} compromisso${upcoming.length > 1 ? "s" : ""} urgente${upcoming.length > 1 ? "s" : ""}`,
        description: upcoming.slice(0, 3).map(i => i.title).join(", ") + (upcoming.length > 3 ? "..." : ""),
      });
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser push notifications for reminders
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (items.length === 0) return;
    // Request permission on first load
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const check = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const now = Date.now();
      items.forEach(item => {
        if (item.status === "concluido" || item.status === "cancelada" || !item.reminder_minutes || notifiedIdsRef.current.has(item.id)) return;
        const scheduled = new Date(item.scheduled_date).getTime();
        const reminderTime = scheduled - item.reminder_minutes * 60 * 1000;
        // Notify if we're within 60s of the reminder time and it hasn't passed the event yet
        if (now >= reminderTime && now < scheduled && now - reminderTime < 120_000) {
          notifiedIdsRef.current.add(item.id);
          const opt = REMINDER_OPTIONS.find(o => o.value === item.reminder_minutes);
          new Notification("🔔 Lembrete - CidadeX", {
            body: `${item.title} — ${opt?.label || `em ${item.reminder_minutes} min`}`,
            icon: "/pwa-icon.png",
            tag: `agenda-${item.id}`,
          });
        }
      });
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [items]);

  const setField = (field: string, value: string | Date | number | null) => setForm(prev => ({ ...prev, [field]: value }));
  const resetForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); clearPendingFiles(); };

  const handleEdit = (item: AgendaItem) => {
    setForm({
      title: item.title, professional_name: (item as any).professional_name || "", profession: (item as any).profession || "",
      description: item.description || "", category: item.category, status: item.status,
      scheduled_date: new Date(item.scheduled_date),
      scheduled_time: format(new Date(item.scheduled_date), "HH:mm"),
      completion_date: item.completion_date ? new Date(item.completion_date) : null,
      reminder_minutes: item.reminder_minutes,
      
      origin_name: item.origin_name || "", origin_phone: item.origin_phone || "", origin_mobile: item.origin_mobile || "",
      origin_address: item.origin_address || "", origin_number: item.origin_number || "", origin_neighborhood: item.origin_neighborhood || "", origin_city: item.origin_city || "",
      destination_name: item.destination_name || "", destination_phone: item.destination_phone || "", destination_mobile: item.destination_mobile || "",
      destination_address: item.destination_address || "", destination_number: item.destination_number || "", destination_neighborhood: item.destination_neighborhood || "", destination_city: item.destination_city || "", destination_zipcode: item.destination_zipcode || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !form.title.trim()) { toast({ title: "Erro", description: "Título é obrigatório.", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      user_id: user.id, title: form.title.trim(), professional_name: form.professional_name.trim() || null,
      profession: form.profession.trim() || null, description: form.description.trim() || null,
      category: form.category, status: form.status,
      reminder_minutes: form.reminder_minutes,
      scheduled_date: (() => {
        const d = new Date(form.scheduled_date);
        if (form.scheduled_time) {
          const [h, m] = form.scheduled_time.split(":").map(Number);
          d.setHours(h, m, 0, 0);
        } else {
          d.setHours(0, 0, 0, 0);
        }
        return d.toISOString();
      })(),
      completion_date: form.completion_date?.toISOString() || null,
      origin_name: form.origin_name.trim() || null, origin_phone: form.origin_phone.trim() || null, origin_mobile: form.origin_mobile.trim() || null,
      origin_address: form.origin_address.trim() || null, origin_number: form.origin_number.trim() || null, origin_neighborhood: form.origin_neighborhood.trim() || null, origin_city: form.origin_city.trim() || null,
      destination_name: form.destination_name.trim() || null, destination_phone: form.destination_phone.trim() || null, destination_mobile: form.destination_mobile.trim() || null,
      destination_address: form.destination_address.trim() || null, destination_number: form.destination_number.trim() || null, destination_neighborhood: form.destination_neighborhood.trim() || null, destination_city: form.destination_city.trim() || null, destination_zipcode: form.destination_zipcode.trim() || null,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from("agenda_items").update(payload).eq("id", editingId);
        if (error) throw error;
        await uploadPendingFiles(editingId, user.id);
        toast({ title: "Atualizado!" });
      } else {
        const { data: inserted, error } = await supabase.from("agenda_items").insert(payload).select("id").single();
        if (error) throw error;
        if (inserted) await uploadPendingFiles(inserted.id, user.id);
        toast({ title: "Compromisso adicionado!" });
      }
      clearPendingFiles();
      resetForm(); fetchItems();
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const executeDelete = async (ids: string[]) => {
    for (const id of ids) { await supabase.from("agenda_items").delete().eq("id", id); }
    toast({ title: `${ids.length} item${ids.length > 1 ? "s" : ""} removido${ids.length > 1 ? "s" : ""}!` });
    setSelectedIds(new Set());
    
    setConfirmDelete(null);
    fetchItems();
  };

  const handleDeleteSingle = (id: string, title: string) => {
    setConfirmDelete({ ids: [id], message: `Deseja excluir "${title}"?` });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ ids: Array.from(selectedIds), message: `Deseja excluir ${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""} selecionado${selectedIds.size > 1 ? "s" : ""}?` });
  };

  const handleToggleStatus = async (item: AgendaItem) => {
    const newStatus = item.status === "em_andamento" ? "concluido" : "em_andamento";
    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === "concluido") updates.completion_date = new Date().toISOString();
    else updates.completion_date = null;
    await supabase.from("agenda_items").update(updates).eq("id", item.id);
    fetchItems();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  };

  const handleExportPdf = async () => {
    const toExport = selectedIds.size > 0 ? items.filter(i => selectedIds.has(i.id)) : filtered;
    if (toExport.length === 0) { toast({ title: "Nada para exportar", variant: "destructive" }); return; }
    setExporting(true);
    try {
      const blobUrl = await exportToPdf(toExport);
      navigate("/visualizador", {
        state: {
          items: [{ url: blobUrl, name: `agenda-${format(new Date(), "yyyy-MM-dd")}.pdf`, type: "application/pdf" }],
          startIndex: 0,
        },
      });
    }
    catch { toast({ title: "Erro ao exportar", variant: "destructive" }); }
    finally { setExporting(false); }
  };

  const handlePrintSinglePdf = async (item: AgendaItem) => {
    try {
      const blobUrl = await exportToPdf([item]);
      navigate("/visualizador", {
        state: {
          items: [{ url: blobUrl, name: `agenda-${item.title.replace(/\s+/g, "-").toLowerCase()}.pdf`, type: "application/pdf" }],
          startIndex: 0,
        },
      });
    } catch { toast({ title: "Erro ao gerar PDF", variant: "destructive" }); }
  };


  // Dates that have items (for calendar highlighting)
  const datesWithItems = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    items.forEach(i => {
      const key = format(new Date(i.scheduled_date), "yyyy-MM-dd");
      const prev = map.get(key) || { total: 0, done: 0 };
      prev.total++;
      if (i.status === "concluido") prev.done++;
      map.set(key, prev);
    });
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (filterStatus !== "all") result = result.filter(i => i.status === filterStatus);
    if (filterCategory !== "all") result = result.filter(i => i.category === filterCategory);
    if (calendarSelectedDate) {
      const dayStr = format(calendarSelectedDate, "yyyy-MM-dd");
      result = result.filter(i => format(new Date(i.scheduled_date), "yyyy-MM-dd") === dayStr);
    }
    if (filterDateFrom) result = result.filter(i => new Date(i.scheduled_date) >= filterDateFrom);
    if (filterDateTo) {
      const endOfDay = new Date(filterDateTo);
      endOfDay.setHours(23, 59, 59, 999);
      result = result.filter(i => new Date(i.scheduled_date) <= endOfDay);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        i.category.toLowerCase().includes(q) ||
        (i.professional_name && i.professional_name.toLowerCase().includes(q)) ||
        (i.profession && i.profession.toLowerCase().includes(q)) ||
        (i.origin_city && i.origin_city.toLowerCase().includes(q)) ||
        (i.destination_city && i.destination_city.toLowerCase().includes(q)) ||
        (i.origin_name && i.origin_name.toLowerCase().includes(q)) ||
        (i.destination_name && i.destination_name.toLowerCase().includes(q))
      );
    }
    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "manual") cmp = (a.position || 0) - (b.position || 0);
      else if (sortBy === "date") cmp = new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
      else if (sortBy === "title") cmp = a.title.localeCompare(b.title, "pt-BR");
      else if (sortBy === "category") cmp = a.category.localeCompare(b.category, "pt-BR");
      else if (sortBy === "professional") cmp = (a.professional_name || "").localeCompare(b.professional_name || "", "pt-BR");
      else if (sortBy === "status") cmp = a.status.localeCompare(b.status, "pt-BR");
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [items, filterStatus, filterCategory, filterDateFrom, filterDateTo, searchText, sortBy, sortAsc, calendarSelectedDate]);

  const allCategories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return Array.from(cats).sort();
  }, [items]);

  const hasActiveFilters = filterCategory !== "all" || filterDateFrom !== null || filterDateTo !== null || searchText.trim() !== "" || calendarSelectedDate !== null;
  const clearFilters = () => { setFilterCategory("all"); setFilterDateFrom(null); setFilterDateTo(null); setSearchText(""); setCalendarSelectedDate(null); };

  const reminderSummary = useMemo(() => {
    let overdue = 0, today = 0, tomorrow = 0;
    for (const i of items) {
      const r = getReminder(i);
      if (!r) continue;
      if (r.urgency === "urgent") overdue++;
      else if (r.urgency === "today") {
        if (r.text === "Hoje") today++;
        else tomorrow++;
      }
    }
    const parts: string[] = [];
    if (overdue > 0) parts.push(`${overdue} atrasado${overdue > 1 ? "s" : ""}`);
    if (today > 0) parts.push(`${today} para hoje`);
    if (tomorrow > 0) parts.push(`${tomorrow} para amanhã`);
    const singleCategory = parts.length === 1;
    const message = singleCategory ? parts[0].replace(/^\d+\s/, "") : parts.join(", ");
    return { total: overdue + today + tomorrow, hasOverdue: overdue > 0, message };
  }, [items]);
  const urgentCount = reminderSummary.total;
  const [showStats, setShowStats] = useState(false);

  const stats = useMemo(() => {
    const total = items.length;
    const concluidos = items.filter(i => i.status === "concluido").length;
    const canceladas = items.filter(i => i.status === "cancelada").length;
    const pendentes = total - concluidos - canceladas;
    const byCategory: Record<string, { total: number; done: number }> = {};
    items.forEach(i => {
      if (!byCategory[i.category]) byCategory[i.category] = { total: 0, done: 0 };
      byCategory[i.category].total++;
      if (i.status === "concluido") byCategory[i.category].done++;
    });
    return { total, concluidos, pendentes, canceladas, byCategory };
  }, [items]);

  const originValues = (prefix: "origin" | "destination") => ({
    name: form[`${prefix}_name`], phone: form[`${prefix}_phone`], mobile: form[`${prefix}_mobile`],
    address: form[`${prefix}_address`], number: form[`${prefix}_number`], neighborhood: form[`${prefix}_neighborhood`], city: form[`${prefix}_city`],
    ...(prefix === "destination" ? { zipcode: form.destination_zipcode } : {}),
  });

  const isDragEnabled = sortBy === "manual";

  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = [...filtered];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Update positions optimistically
    const updates = reordered.map((item, idx) => ({ ...item, position: idx }));
    setItems(prev => {
      const updatedMap = new Map(updates.map(u => [u.id, u.position]));
      return prev.map(i => updatedMap.has(i.id) ? { ...i, position: updatedMap.get(i.id)! } : i);
    });

    // Persist to DB
    for (const item of updates) {
      await supabase.from("agenda_items").update({ position: item.position } as any).eq("id", item.id);
    }
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted overflow-x-auto">
        {([
          { key: "compromissos" as const, label: "Compromissos", icon: CalendarPlus },
          { key: "compras" as const, label: "Lista de Atividades", icon: ShoppingCart },
          { key: "notas" as const, label: "Notas", icon: BookMarked },
          { key: "dicionario" as const, label: "Dicionário", icon: BookOpen },
          { key: "remedios" as const, label: "MeuRemédio", icon: Pill, title: "Controle de Medicamentos" },
        ]).filter(t => visibleAgendaTabs[t.key] !== false).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setAgendaTab(t.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap",
                agendaTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title={(t as any).title}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {agendaTab === "compras" ? (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <ShoppingListSection />
        </Suspense>
      ) : agendaTab === "notas" ? (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <NotebooksSection />
        </Suspense>
      ) : agendaTab === "dicionario" ? (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <DictionarySection />
        </Suspense>
      ) : agendaTab === "remedios" ? (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <MedicationsSection />
        </Suspense>
      ) : (
      <div className="space-y-4">
      {/* Confirm Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.message}
          onConfirm={() => executeDelete(confirmDelete.ids)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Reminder Banner */}
      {urgentCount > 0 && !showForm && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border animate-fade-in ${
          reminderSummary.hasOverdue ? "bg-destructive/10 border-destructive/20" : "bg-blue-500/10 border-blue-500/20"
        }`}>
          <Bell className={`w-4 h-4 shrink-0 ${reminderSummary.hasOverdue ? "text-destructive" : "text-blue-600"}`} />
          <p className={`text-[11px] font-semibold flex-1 ${reminderSummary.hasOverdue ? "text-destructive" : "text-blue-600"}`}>
            {urgentCount} compromisso{urgentCount > 1 ? "s" : ""} — {reminderSummary.message}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-primary" />
            <h2 className="font-display font-bold text-base text-foreground">Minha Agenda</h2>
            <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowStats(p => !p)}
              className={cn("p-1.5 rounded-lg text-xs transition-colors", showStats ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10")}
              title="Estatísticas">
              <BarChart3 className="w-4 h-4" />
            </button>
            <button onClick={() => setShowCalendar(p => !p)}
              className={cn("p-1.5 rounded-lg text-xs transition-colors", showCalendar ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10")}
              title="Calendário">
              <CalendarDays className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode(v => v === "table" ? "cards" : "table")}
              className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 text-xs transition-colors"
              title={viewMode === "table" ? "Ver como cards" : "Ver como tabela"}>
              {viewMode === "table" ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
            </button>
            <button onClick={handleExportPdf} disabled={exporting || filtered.length === 0}
              className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 text-xs disabled:opacity-40 transition-colors" title="Exportar PDF">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            </button>
            <button onClick={() => { resetForm(); setShowForm(!showForm); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Novo
            </button>
          </div>
        </div>
        {/* Stats Panel */}
        {showStats && items.length > 0 && (
          <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Resumo</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-background p-2 text-center">
                <p className="text-lg font-bold text-foreground">{stats.total}</p>
                <p className="text-[9px] text-muted-foreground font-semibold">Total</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
                <p className="text-lg font-bold text-emerald-600">{stats.concluidos}</p>
                <p className="text-[9px] text-muted-foreground font-semibold">Concluídos</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2 text-center">
                <p className="text-lg font-bold text-amber-600">{stats.pendentes}</p>
                <p className="text-[9px] text-muted-foreground font-semibold">Pendentes</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-2 text-center">
                <p className="text-lg font-bold text-red-600">{stats.canceladas}</p>
                <p className="text-[9px] text-muted-foreground font-semibold">Canceladas</p>
              </div>
            </div>
            {stats.total > 0 && (
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(stats.concluidos / stats.total) * 100}%` }} />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.byCategory).sort((a, b) => b[1].total - a[1].total).map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border">
                  <span className="text-[9px] font-semibold text-foreground">{cat}</span>
                  <span className="text-[9px] text-muted-foreground">{val.done}/{val.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Calendar Panel */}
        {showCalendar && (
          <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Calendário</span>
              </div>
              {calendarSelectedDate && (
                <button onClick={() => setCalendarSelectedDate(null)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors">
                  <X className="w-3 h-3" /> {format(calendarSelectedDate, "dd/MM/yyyy")}
                </button>
              )}
            </div>
            <Calendar
              mode="single"
              selected={calendarSelectedDate || undefined}
              onSelect={d => setCalendarSelectedDate(d && calendarSelectedDate && format(d, "yyyy-MM-dd") === format(calendarSelectedDate, "yyyy-MM-dd") ? null : d || null)}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto mx-auto")}
              modifiers={{
                hasItems: (date) => datesWithItems.has(format(date, "yyyy-MM-dd")),
                allDone: (date) => {
                  const info = datesWithItems.get(format(date, "yyyy-MM-dd"));
                  return !!info && info.done === info.total;
                },
              }}
              modifiersClassNames={{
                hasItems: "font-bold ring-2 ring-amber-500/50 ring-inset",
                allDone: "font-bold ring-2 ring-emerald-500/50 ring-inset",
              }}
            />
            <div className="flex items-center gap-3 justify-center">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm ring-2 ring-amber-500/50 ring-inset" />
                <span className="text-[9px] text-muted-foreground">Com compromissos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm ring-2 ring-emerald-500/40 ring-inset" />
                <span className="text-[9px] text-muted-foreground">Todos concluídos</span>
              </div>
            </div>
          </div>
        )}
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar compromissos..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full py-1.5 pl-8 pr-7 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30 placeholder:text-muted-foreground"
          />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Filters in header */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {[{ value: "all", label: "Todos" }, ...STATUS_OPTIONS].map(s => (
            <button key={s.value} onClick={() => setFilterStatus(s.value)}
              className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors",
                filterStatus === s.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10")}>
              {s.label}
            </button>
          ))}
          {/* Category filter */}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-2 py-1 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border-none outline-none focus:ring-1 ring-primary/30 cursor-pointer">
            <option value="all">Categoria</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Date range filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <FilterDatePicker label="De" date={filterDateFrom} onSelect={d => setFilterDateFrom(d || null)} />
          <FilterDatePicker label="Até" date={filterDateTo} onSelect={d => setFilterDateTo(d || null)} />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-2 py-1 rounded-full text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors">
              <X className="w-3 h-3 inline" /> Limpar
            </button>
          )}
          {/* Sort */}
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as "date" | "title" | "category" | "manual" | "professional" | "status")}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground border-none outline-none cursor-pointer">
              <option value="date">Data</option>
              <option value="title">Título</option>
              <option value="professional">Profissional</option>
              <option value="category">Categoria</option>
              <option value="status">Status</option>
              <option value="manual">Manual</option>
            </select>
            <button onClick={() => setSortAsc(p => !p)}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground hover:bg-primary/10 transition-colors"
              title={sortAsc ? "Crescente" : "Decrescente"}>
              {sortAsc ? "↑" : "↓"}
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Select Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted animate-fade-in">
          <button onClick={toggleSelectAll} className="text-[10px] font-semibold text-primary hover:underline">
            {selectedIds.size === filtered.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <span className="text-[10px] text-muted-foreground flex-1">{selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}</span>
          <button onClick={handleExportPdf} disabled={exporting}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold">
            <Download className="w-3 h-3" /> PDF
          </button>
          <button onClick={handleDeleteSelected}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold">
            <Trash2 className="w-3 h-3" /> Excluir
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="glass-card rounded-xl p-4 space-y-3 animate-fade-in">
          <h3 className="font-display font-bold text-sm text-foreground">{editingId ? "Editar Compromisso" : "Novo Compromisso"}</h3>
          <Input label="Título *" value={form.title} onChange={v => setField("title", v)} icon={<FileText className="w-3 h-3" />} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Nome Profissional" value={form.professional_name} onChange={v => setField("professional_name", v)} icon={<User className="w-3 h-3" />} />
            <CustomCombobox label="Profissão" value={form.profession} onChange={v => setField("profession", v)} defaults={PROFESSIONS} optionType="profession" userId={user?.id} />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</label>
            <textarea value={form.description} onChange={e => setField("description", e.target.value)} maxLength={1000} rows={2}
              className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CustomCombobox label="Categoria" value={form.category} onChange={v => setField("category", v)} defaults={CATEGORIES} optionType="category" userId={user?.id} />
            <div className="space-y-0.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Andamento</label>
              <select value={form.status} onChange={e => setField("status", e.target.value)}
                className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <DatePicker label="Data do Compromisso *" date={form.scheduled_date} onSelect={d => setField("scheduled_date", d || new Date())} />
            <div className="space-y-0.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hora</label>
              <input
                type="time"
                value={form.scheduled_time}
                onChange={e => setField("scheduled_time", e.target.value)}
                className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
              />
            </div>
            <DatePicker label="Data Conclusão" date={form.completion_date} onSelect={d => setField("completion_date", d || null)} />
          </div>
          {/* Reminder */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Bell className="w-3 h-3 text-primary" />
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lembrete</label>
            </div>
            <select
              value={form.reminder_minutes === null ? "" : String(form.reminder_minutes)}
              onChange={e => setField("reminder_minutes", e.target.value === "" ? null : Number(e.target.value))}
              className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt.value ?? "none"} value={opt.value === null ? "" : String(opt.value)}>{opt.label}</option>
              ))}
            </select>
          </div>
          <AgendaAttachments agendaItemId={editingId} mode="form" />
          <AddressBlock prefix="origin" label="Origem (endereço / contato)" values={originValues("origin")} onChange={(f, v) => setField(f, v)} userId={user?.id} />
          <AddressBlock prefix="destination" label="Destino (endereço / contato)" values={originValues("destination")} onChange={(f, v) => setField(f, v)} userId={user?.id} />
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editingId ? "Salvar" : "Adicionar"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">{items.length === 0 ? "Nenhum compromisso na agenda." : "Nenhum item com esse filtro."}</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          {viewMode === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {isDragEnabled && <th className="py-2 px-1 w-5"></th>}
                    <th className="py-2 px-1 w-6">
                      <span className="text-[8px] font-semibold text-muted-foreground/70 uppercase leading-tight block text-center">Concluir</span>
                    </th>
                    {[
                      { key: "title", label: "Título", hidden: false },
                      { key: "professional", label: "Profissional", hidden: true },
                      { key: "date", label: "Data", hidden: false },
                      { key: "category", label: "Categoria", hidden: true },
                      { key: "status", label: "Status", hidden: false },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => {
                          if (sortBy === col.key) setSortAsc(p => !p);
                          else { setSortBy(col.key as typeof sortBy); setSortAsc(true); }
                        }}
                        className={cn(
                          "py-2 px-2 font-semibold text-[10px] uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors",
                          col.hidden && "hidden sm:table-cell",
                          sortBy === col.key ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {col.label}
                          {sortBy === col.key && (
                            <span className="text-[9px]">{sortAsc ? "↑" : "↓"}</span>
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <Droppable droppableId="agenda-table" isDropDisabled={!isDragEnabled}>
                  {(provided) => (
                    <tbody ref={provided.innerRef} {...provided.droppableProps}>
                      {filtered.map((item, index) => {
                        const statusInfo = STATUS_OPTIONS.find(s => s.value === item.status) || STATUS_OPTIONS[0];
                        const isExpanded = expandedId === item.id;
                        const hasOrigin = item.origin_address || item.origin_name;
                        const hasDestination = item.destination_address || item.destination_name;
                        const reminder = getReminder(item);
                        const isSelected = selectedIds.has(item.id);
                        const sd = new Date(item.scheduled_date);
                        const hasTime = sd.getHours() !== 0 || sd.getMinutes() !== 0;

                        return (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!isDragEnabled}>
                            {(dragProvided, snapshot) => (
                              <tr
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className={cn(
                                  "border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors",
                                  isSelected && "bg-primary/5",
                                  item.status === "concluido" && "opacity-60",
                                  snapshot.isDragging && "bg-muted shadow-lg"
                                )}
                              >
                                {isDragEnabled && (
                                  <td className="py-2 px-1" {...dragProvided.dragHandleProps}>
                                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                                  </td>
                                )}
                                <td className="py-2 px-1">
                                  <div className="flex items-center gap-1">
                                    <button onClick={e => { e.stopPropagation(); toggleSelect(item.id); }} className="shrink-0" title="Selecionar item">
                                      {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleToggleStatus(item); }}
                                      title={item.status === "concluido" ? "Reabrir compromisso" : "Marcar como concluído"}
                                      className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                                        item.status === "concluido" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground hover:border-primary")}>
                                      {item.status === "concluido" && <Check className="w-2 h-2 text-white" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={cn("font-semibold text-foreground truncate max-w-[150px] sm:max-w-[200px]", item.status === "concluido" && "line-through")}>
                                      <HighlightText text={item.title} query={searchText} />
                                    </span>
                                    {(hasOrigin || hasDestination) && <MapPin className="w-2.5 h-2.5 text-primary shrink-0" />}
                                    {item.reminder_minutes != null && item.reminder_minutes > 0 && item.status !== "concluido" && item.status !== "cancelada" && (() => {
                                      const alertTime = new Date(new Date(item.scheduled_date).getTime() - item.reminder_minutes! * 60_000);
                                      const alertStr = format(alertTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                                      const now = Date.now();
                                      const hoursLeft = (alertTime.getTime() - now) / 3_600_000;
                                      const bellColor = hoursLeft <= 0 ? "text-muted-foreground" : hoursLeft <= 1 ? "text-red-500" : isToday(alertTime) ? "text-amber-500" : "text-emerald-500";
                                      return (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="shrink-0 cursor-help"><Bell className={cn("w-2.5 h-2.5", bellColor)} /></span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" sideOffset={8} collisionPadding={8} sticky="always" className="z-[9999] text-xs">
                                            🔔 Alerta: {alertStr} ({item.reminder_minutes} min antes)
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    })()}
                                    <AttachmentIndicator agendaItemId={item.id} />
                                    {reminder && (
                                      <span className={cn("text-[8px] font-bold px-1 py-0.5 rounded-full shrink-0 whitespace-nowrap",
                                        reminder.urgency === "urgent" ? "bg-destructive/15 text-destructive" :
                                        reminder.urgency === "today" ? "bg-blue-500/15 text-blue-600" : "bg-amber-500/15 text-amber-600")}>
                                        {reminder.text}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2 hidden sm:table-cell">
                                  <span className="text-muted-foreground break-words">
                                    <HighlightText text={[item.professional_name, item.profession].filter(Boolean).join(" — ") || "—"} query={searchText} />
                                  </span>
                                </td>
                                <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">
                                  {format(sd, "dd/MM/yy", { locale: ptBR })}
                                  {hasTime && <span className="text-[9px] ml-0.5">{format(sd, "HH:mm")}</span>}
                                </td>
                                <td className="py-2 px-2 hidden sm:table-cell">
                                  <span className="text-[9px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full">
                                    <HighlightText text={item.category} query={searchText} />
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap", statusInfo.color)}>{statusInfo.label}</span>
                                </td>
                                <td className="py-2 px-1">
                                  <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                                </td>
                              </tr>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </tbody>
                  )}
                </Droppable>
              </table>
              {/* Expanded details rendered outside table for DnD compatibility */}
              {filtered.map(item => {
                if (expandedId !== item.id) return null;
                return (
                  <div key={`expanded-${item.id}`} className="px-3 pb-3 pt-2 border-b border-border">
                    <ExpandedDetails item={item} searchText={searchText} onEdit={handleEdit} onDelete={handleDeleteSingle} onPrintPdf={handlePrintSinglePdf} onNavigateTo={onNavigateTo} />
                  </div>
                );
              })}
            </div>
          ) : (
            <Droppable droppableId="agenda-cards" isDropDisabled={!isDragEnabled}>
              {(provided) => (
                <div className="space-y-2" ref={provided.innerRef} {...provided.droppableProps}>
                  {filtered.map((item, index) => {
                    const statusInfo = STATUS_OPTIONS.find(s => s.value === item.status) || STATUS_OPTIONS[0];
                    const isExpanded = expandedId === item.id;
                    const hasOrigin = item.origin_address || item.origin_name;
                    const hasDestination = item.destination_address || item.destination_name;
                    const reminder = getReminder(item);
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!isDragEnabled}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn("glass-card rounded-xl overflow-hidden transition-colors", isSelected && "ring-2 ring-primary", snapshot.isDragging && "shadow-lg ring-2 ring-primary/30")}
                          >
                            <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full p-3 text-left">
                              <div className="flex items-start gap-2">
                                {isDragEnabled && (
                                  <div {...dragProvided.dragHandleProps} className="mt-0.5 shrink-0 cursor-grab">
                                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex items-center gap-1 mt-0.5 shrink-0">
                                  <button onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}>
                                    {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); handleToggleStatus(item); }}
                                    className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                                      item.status === "concluido" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground hover:border-primary")}>
                                    {item.status === "concluido" && <Check className="w-2.5 h-2.5 text-white" />}
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-xs font-semibold text-foreground truncate", item.status === "concluido" && "line-through opacity-60")}>
                                    <HighlightText text={item.title} query={searchText} />
                                  </p>
                                  {(item.professional_name || item.profession) && (
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      <HighlightText text={item.professional_name || ""} query={searchText} />
                                      {item.professional_name && item.profession ? " · " : ""}
                                      <HighlightText text={item.profession || ""} query={searchText} />
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(item.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                                      {new Date(item.scheduled_date).getHours() !== 0 || new Date(item.scheduled_date).getMinutes() !== 0
                                        ? ` às ${format(new Date(item.scheduled_date), "HH:mm")}`
                                        : ""}
                                    </span>
                                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", statusInfo.color)}>{statusInfo.label}</span>
                                    <span className="text-[9px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full"><HighlightText text={item.category} query={searchText} /></span>
                                    {(hasOrigin || hasDestination) && <MapPin className="w-2.5 h-2.5 text-primary" />}
                                    {item.reminder_minutes != null && item.reminder_minutes > 0 && item.status !== "concluido" && item.status !== "cancelada" && (() => {
                                      const alertTime = new Date(new Date(item.scheduled_date).getTime() - item.reminder_minutes! * 60_000);
                                      const alertStr = format(alertTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                                      const now = Date.now();
                                      const hoursLeft = (alertTime.getTime() - now) / 3_600_000;
                                      const bellColor = hoursLeft <= 0 ? "text-muted-foreground" : hoursLeft <= 1 ? "text-red-500" : isToday(alertTime) ? "text-amber-500" : "text-emerald-500";
                                      return (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="cursor-help"><Bell className={cn("w-2.5 h-2.5", bellColor)} /></span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" sideOffset={8} collisionPadding={8} sticky="always" className="z-[9999] text-xs">
                                            🔔 Alerta: {alertStr} ({item.reminder_minutes} min antes)
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    })()}
                                    <AttachmentIndicator agendaItemId={item.id} />
                                    {reminder && (
                                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                                        reminder.urgency === "urgent" ? "bg-destructive/15 text-destructive" :
                                        reminder.urgency === "today" ? "bg-blue-500/15 text-blue-600" : "bg-amber-500/15 text-amber-600")}>
                                        <Bell className="w-2.5 h-2.5" /> {reminder.text}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 border-t border-border pt-2">
                                <ExpandedDetails item={item} searchText={searchText} onEdit={handleEdit} onDelete={handleDeleteSingle} onPrintPdf={handlePrintSinglePdf} onNavigateTo={onNavigateTo} />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </DragDropContext>
      )}
    </div>
      )}
    </div>
  );
}

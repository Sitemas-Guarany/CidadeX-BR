import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays, isPast, isToday, isBefore, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Pill, Plus, Edit2, Trash2, Loader2, Search, Clock, Calendar as CalendarIcon,
  PauseCircle, PlayCircle, Stethoscope, ChevronDown, X, Check, Phone, Smartphone, MapPin, CheckCircle2,
  Filter, XCircle, ChevronLeft, ChevronRight, FileText, ExternalLink
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import DateInput from "@/components/common/DateInput";
import { cn } from "@/lib/utils";
import { supabaseRetry } from "@/lib/supabaseRetry";
import { useMedicationAlarms } from "@/hooks/useMedicationAlarms";

// --- Skip reasons ---
const SKIP_REASONS = [
  { code: "unavailable", label: "Indisponível", icon: "🚫" },
  { code: "ran_out", label: "Acabou", icon: "📦" },
  { code: "not_needed", label: "Não preciso dessa dose", icon: "⏭️" },
  { code: "suspend", label: "Suspender medicamento", icon: "⏸️" },
] as const;

type SkipReasonCode = typeof SKIP_REASONS[number]["code"];

// Sentinel dates for skip reasons (year 1900 = skipped)
const SKIP_SENTINEL: Record<string, string> = {
  unavailable: "1900-01-01T00:00:00.000Z",
  ran_out: "1900-01-02T00:00:00.000Z",
  not_needed: "1900-01-03T00:00:00.000Z",
};

const isSkippedLog = (log: MedicationLog) => new Date(log.taken_at).getFullYear() === 1900;

const getSkipLabel = (log: MedicationLog) => {
  const day = new Date(log.taken_at).getDate();
  return day === 1 ? "Indisponível" : day === 2 ? "Acabou" : "Não preciso";
};

// --- Types ---
interface Medication {
  id: string;
  name: string;
  generic_name: string | null;
  concentration: string | null;
  pharmaceutical_form: string | null;
  frequency: string;
  schedule_time: string;
  icon: string | null;
  instructions: string | null;
  start_date: string;
  duration_type: string;
  duration_days: number | null;
  weekdays: number[] | null;
  doctor_id: string | null;
  suspended: boolean;
  suspended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MedicationLog {
  id: string;
  medication_id: string;
  taken_at: string;
  scheduled_time: string | null;
  log_date: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
}

interface AISuggestion {
  name: string;
  generic_name?: string;
  concentrations: string[];
  forms?: string[];
  therapeutic_class: string;
  instructions: string;
}

// AI search cache
const aiSearchCache = new Map<string, AISuggestion[]>();

// --- Constants ---
const FREQUENCY_OPTIONS = [
  "Uma vez ao dia",
  "Duas vezes ao dia",
  "3 vezes ao dia",
  "A cada 12 horas",
  "A cada 8 horas",
  "A cada 6 horas",
  "A cada 4 horas",
  "A cada 3 horas",
  "A cada 2 horas",
  "A cada hora",
];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MED_ICONS: { emoji: string; label: string }[] = [
  { emoji: "💊", label: "Comprimido" },
  { emoji: "🟡", label: "Cápsula" },
  { emoji: "🫗", label: "Líquido" },
  { emoji: "💧", label: "Gotas" },
  { emoji: "💉", label: "Injeção" },
  { emoji: "🧴", label: "Pomada" },
  { emoji: "🩹", label: "Adesivo" },
  { emoji: "🫁", label: "Inalador" },
  { emoji: "👁️", label: "Colírio" },
  { emoji: "👃", label: "Nasal" },
  { emoji: "🧪", label: "Xarope" },
  { emoji: "🧬", label: "Sublingual" },
  { emoji: "🩺", label: "Tratamento" },
  { emoji: "🫀", label: "Cardíaco" },
  { emoji: "🩻", label: "Exame" },
  { emoji: "🌿", label: "Fitoterápico" },
];

const PHARMA_FORMS = [
  "Adesivo", "Cápsula", "Colírio", "Comprimido", "Creme", "Drágea",
  "Gel", "Gotas", "Injetável", "Pastilha", "Pomada", "Pó para solução",
  "Solução oral", "Spray nasal", "Supositório", "Suspensão", "Xarope", "Outro"
];

function getDefaultTimeSlots(frequency: string): string[] {
  switch (frequency) {
    case "Duas vezes ao dia":
    case "A cada 12 horas":
      return ["08:00", "20:00"];
    case "3 vezes ao dia":
    case "A cada 8 horas":
      return ["08:00", "14:00", "20:00"];
    case "A cada 6 horas":
      return ["06:00", "12:00", "18:00", "00:00"];
    case "A cada 4 horas":
      return ["06:00", "10:00", "14:00", "18:00", "22:00", "02:00"];
    case "A cada 3 horas":
      return ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "00:00", "03:00"];
    case "A cada 2 horas":
      return ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00", "02:00", "04:00"];
    case "A cada hora":
      return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    default:
      return ["08:00"];
  }
}

function getMaxTimeSlots(frequency: string): number {
  switch (frequency) {
    case "Uma vez ao dia": return 1;
    case "Duas vezes ao dia":
    case "A cada 12 horas": return 2;
    case "3 vezes ao dia":
    case "A cada 8 horas": return 3;
    case "A cada 6 horas": return 4;
    case "A cada 4 horas": return 6;
    case "A cada 3 horas": return 8;
    case "A cada 2 horas": return 12;
    case "A cada hora": return 24;
    default: return 1;
  }
}

const emptyForm = {
  name: "",
  generic_name: "",
  concentration: "",
  pharmaceutical_form: "",
  frequency: "Uma vez ao dia",
  schedule_times: ["08:00"] as string[],
  icon: "💊",
  instructions: "",
  notes: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  duration_type: "ongoing" as "ongoing" | "fixed_days",
  duration_days: 30,
  weekdays_mode: "all" as "all" | "specific",
  weekdays: [0, 1, 2, 3, 4, 5, 6] as number[],
  doctor_id: null as string | null,
};

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeMedicationSearchQuery(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract concentration (e.g. "2mg", "500 mg", "10ml") from a query string */
function extractConcentrationFromQuery(raw: string): { name: string; concentration: string } {
  const match = raw.match(/\b(\d+(?:[.,]\d+)?\s?(?:mg|mcg|g|kg|ml|l|ui|%))\b/i);
  if (match) {
    const concentration = match[1].replace(/\s+/g, "");
    const name = raw.replace(match[0], "").replace(/\s+/g, " ").trim();
    return { name, concentration };
  }
  return { name: raw.trim(), concentration: "" };
}

// --- Component ---
export default function MedicationsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [todayLogs, setTodayLogs] = useState<MedicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pharmaOpen, setPharmaOpen] = useState(false);
  const [markingTaken, setMarkingTaken] = useState<string | null>(null);
  const [skipMenuOpen, setSkipMenuOpen] = useState<string | null>(null); // "medId-time"
  const [skipMenuPos, setSkipMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Filters
  const [filterName, setFilterName] = useState("");
  const [filterDoctor, setFilterDoctor] = useState<string>("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState<"active" | "suspended" | "all">("active");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"time" | "name" | "doctor">("time");
  const [viewMode, setViewMode] = useState<"card" | "timeline">("timeline");

  // AI search
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiSearching, setAiSearching] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [showConcentrationPicker, setShowConcentrationPicker] = useState(false);
  const [pendingConcentrations, setPendingConcentrations] = useState<string[]>([]);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Bula search
  const [bulaOpen, setBulaOpen] = useState(false);
  const [bulaResults, setBulaResults] = useState<any[]>([]);
  const [bulaLoading, setBulaLoading] = useState(false);
  const [bulaMedName, setBulaMedName] = useState("");

  // Doctor inline form
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [doctorForm, setDoctorForm] = useState({ name: "", specialty: "", phone: "", mobile: "", address: "" });
  const [savingDoctor, setSavingDoctor] = useState(false);

  // --- Fetch data ---
  const fetchMedications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("medications")
      .select("*")
      .eq("user_id", user.id)
      .order("suspended", { ascending: true })
      .order("name");
    setMedications((data as any[] || []).map(m => ({ ...m, weekdays: m.weekdays as number[] | null })));
  }, [user]);

  const fetchDoctors = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("doctors").select("*").eq("user_id", user.id).order("name");
    setDoctors((data as Doctor[]) || []);
  }, [user]);

  const fetchDayLogs = useCallback(async (date?: Date) => {
    if (!user) return;
    const d = date || selectedDate;
    const dateStr = format(d, "yyyy-MM-dd");
    const { data } = await supabase
      .from("medication_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", dateStr);
    setTodayLogs((data as MedicationLog[]) || []);
  }, [user, selectedDate]);

  useEffect(() => {
    Promise.all([fetchMedications(), fetchDoctors(), fetchDayLogs()]).then(() => setLoading(false));
  }, [fetchMedications, fetchDoctors, fetchDayLogs]);

  // Refetch logs when selectedDate changes
  useEffect(() => {
    if (!loading) fetchDayLogs();
  }, [selectedDate, fetchDayLogs]);

  // Close skip menu on outside click
  useEffect(() => {
    if (!skipMenuOpen) return;
    const handleClick = () => setSkipMenuOpen(null);
    const timer = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", handleClick); };
  }, [skipMenuOpen]);

  // --- AI Search ---
  const lastSearchRef = useRef("");

  const searchMedication = useCallback(async (query: string) => {
    const normalizedKey = normalizeMedicationSearchQuery(query);
    const originalQuery = query.trim();
    if (normalizedKey.length < 2 || originalQuery.length < 2) {
      setAiSuggestions([]);
      setShowAiSuggestions(false);
      setAiSearching(false);
      return;
    }

    // Use normalized key for cache/dedup, but send original to AI
    lastSearchRef.current = normalizedKey;

    // Check cache first
    if (aiSearchCache.has(normalizedKey)) {
      if (lastSearchRef.current === normalizedKey) {
        setAiSuggestions(aiSearchCache.get(normalizedKey)!);
        setShowAiSuggestions(true);
        setAiSearching(false);
      }
      return;
    }

    setAiSearching(true);
    try {
      const { data, error } = await supabaseRetry(
        () => supabase.functions.invoke("search-medication", { body: { query: originalQuery } }),
        1,
        700,
        "search-medication",
      );

      if (lastSearchRef.current !== normalizedKey) return;

      if (!error && data?.suggestions && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        setShowAiSuggestions(true);
        aiSearchCache.set(normalizedKey, data.suggestions);
      } else if (data?.error) {
        console.warn("Medication search:", data.error);
      }
    } catch {
      if (lastSearchRef.current !== normalizedKey) return;
    }

    if (lastSearchRef.current === normalizedKey) setAiSearching(false);
  }, []);

  const handleNameChange = (val: string) => {
    setForm(f => ({ ...f, name: val }));

    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

    const normalized = normalizeMedicationSearchQuery(val);
    if (normalized.length >= 2) {
      aiTimeoutRef.current = setTimeout(() => {
        searchMedication(val);
      }, 400);
    } else {
      setAiSuggestions([]);
      setShowAiSuggestions(false);
      setAiSearching(false);
    }
  };

  const selectAiSuggestion = (s: AISuggestion) => {
    const pharmaForm = s.forms?.[0] || "";
    if (s.concentrations.length > 1) {
      setPendingConcentrations(s.concentrations);
      setShowConcentrationPicker(true);
    }
    // Extract concentration from what user typed (e.g. "duomo 2mg" → "2mg")
    const { name: cleanTypedName, concentration: typedConc } = extractConcentrationFromQuery(form.name);

    const suggestionMatchesInput = s.name.toLowerCase() === cleanTypedName.toLowerCase()
      || s.name.toLowerCase().includes(cleanTypedName.toLowerCase())
      || cleanTypedName.toLowerCase().includes(s.name.toLowerCase());

    // Determine best concentration: user-typed > matching from suggestions > first available
    let bestConc = typedConc || s.concentrations[0] || "";
    if (typedConc && s.concentrations.length > 0) {
      // Try to find exact match in suggestions (e.g. "2mg" matches "2mg")
      const normalizedTyped = typedConc.toLowerCase().replace(/\s/g, "");
      const exactMatch = s.concentrations.find(c => c.toLowerCase().replace(/\s/g, "") === normalizedTyped);
      if (exactMatch) bestConc = exactMatch;
    }

    setForm(f => ({
      ...f,
      name: suggestionMatchesInput ? s.name : cleanTypedName || s.name,
      generic_name: s.generic_name || s.name || "",
      concentration: bestConc,
      pharmaceutical_form: pharmaForm || f.pharmaceutical_form,
      instructions: s.instructions || f.instructions,
    }));
    setShowAiSuggestions(false);
  };

  // --- CRUD ---
  const handleSave = async () => {
    if (!user || !form.name.trim() || form.schedule_times.length === 0) return;
    setSaving(true);
    const scheduleTimeStr = form.schedule_times.filter(t => t).join(",");
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      generic_name: form.generic_name.trim() || null,
      concentration: form.concentration.trim() || null,
      pharmaceutical_form: form.pharmaceutical_form.trim() || null,
      frequency: form.frequency,
      schedule_time: scheduleTimeStr,
      icon: form.icon || "💊",
      instructions: form.instructions.trim() || null,
      notes: form.notes.trim() || null,
      start_date: form.start_date,
      duration_type: form.duration_type,
      duration_days: form.duration_type === "fixed_days" ? form.duration_days : null,
      weekdays: form.weekdays_mode === "all" ? null : form.weekdays,
      doctor_id: form.doctor_id || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("medications").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("medications").insert(payload));
    }

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Medicamento atualizado" : "Medicamento cadastrado" });
      resetForm();
      fetchMedications();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("medications").delete().eq("id", id);
    toast({ title: "Medicamento excluído" });
    fetchMedications();
  };

  const handleToggleSuspend = async (med: Medication) => {
    const suspended = !med.suspended;
    await supabase.from("medications").update({
      suspended,
      suspended_at: suspended ? new Date().toISOString() : null,
    }).eq("id", med.id);
    toast({ title: suspended ? "Medicamento suspenso" : "Medicamento retomado" });
    fetchMedications();
  };

  // --- Mark as taken ---
  const handleMarkTaken = async (med: Medication, scheduledTime: string, useScheduledTime: boolean) => {
    if (!user) return;
    setMarkingTaken(`${med.id}-${scheduledTime}`);
    const now = new Date();
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const takenAt = useScheduledTime
      ? new Date(`${dateStr}T${scheduledTime}:00`).toISOString()
      : now.toISOString();

    const { error } = await (supabase.from("medication_logs") as any).upsert({
      medication_id: med.id,
      user_id: user.id,
      taken_at: takenAt,
      scheduled_time: scheduledTime,
      log_date: dateStr,
    }, { onConflict: "medication_id,log_date,scheduled_time" });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Medicamento marcado como tomado", description: useScheduledTime ? `Registrado no horário agendado (${scheduledTime})` : `Registrado agora (${format(now, "HH:mm")})` });
      fetchDayLogs();
    }
    setMarkingTaken(null);
  };

  const handleMarkMultipleTaken = async (items: { med: Medication; time: string }[], useScheduledTime: boolean) => {
    if (!user || items.length === 0) return;
    setMarkingTaken("batch");
    const now = new Date();
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const rows = items.map(({ med, time }) => ({
      medication_id: med.id,
      user_id: user.id,
      taken_at: useScheduledTime
        ? new Date(`${dateStr}T${time}:00`).toISOString()
        : now.toISOString(),
      scheduled_time: time,
      log_date: dateStr,
    }));

    const { error } = await (supabase.from("medication_logs") as any).upsert(rows, { onConflict: "medication_id,log_date,scheduled_time" });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `✅ ${items.length} medicamentos marcados como tomados` });
      fetchDayLogs();
    }
    setMarkingTaken(null);
  };

  const handleUndoTaken = async (logId: string) => {
    await (supabase.from("medication_logs") as any).delete().eq("id", logId);
    toast({ title: "Registro de medicamento desfeito" });
    fetchDayLogs();
  };

  const handleSkipDose = async (med: Medication, scheduledTime: string, reason: SkipReasonCode) => {
    if (!user) return;
    setSkipMenuOpen(null);

    // Suspend = toggle suspend + skip this dose
    if (reason === "suspend") {
      await (supabase.from("medications") as any).update({
        suspended: true,
        suspended_at: new Date().toISOString(),
      }).eq("id", med.id);
      toast({ title: `⏸️ "${med.name}" suspenso`, description: "O medicamento foi movido para a lista de suspensos." });
      fetchMedications();
      // Also log the skip
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      await (supabase.from("medication_logs") as any).upsert({
        medication_id: med.id,
        user_id: user.id,
        taken_at: SKIP_SENTINEL["unavailable"],
        scheduled_time: scheduledTime,
        log_date: dateStr,
      }, { onConflict: "medication_id,log_date,scheduled_time" });
      fetchDayLogs();
      return;
    }

    setMarkingTaken(`${med.id}-${scheduledTime}`);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const { error } = await (supabase.from("medication_logs") as any).upsert({
      medication_id: med.id,
      user_id: user.id,
      taken_at: SKIP_SENTINEL[reason],
      scheduled_time: scheduledTime,
      log_date: dateStr,
    }, { onConflict: "medication_id,log_date,scheduled_time" });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const label = SKIP_REASONS.find(r => r.code === reason)?.label || reason;
      toast({ title: `Dose não tomada`, description: label });
      fetchDayLogs();
    }
    setMarkingTaken(null);
  };

  const getTodayLog = (medId: string, scheduledTime?: string) => 
    scheduledTime 
      ? todayLogs.find(l => l.medication_id === medId && l.scheduled_time === scheduledTime)
      : todayLogs.find(l => l.medication_id === medId);

  // --- Status helpers (must be before groupedByTime) ---
  const getMedStatus = (med: Medication) => {
    if (med.suspended) return "suspended";
    if (med.duration_type === "fixed_days" && med.duration_days) {
      const endDate = addDays(new Date(med.start_date), med.duration_days);
      if (isPast(endDate)) return "finished";
    }
    return "active";
  };

  // Check if a medication is scheduled for a specific date
  const isMedScheduledForDate = (med: Medication, date: Date): boolean => {
    // Suspended meds only shown when filterStatus allows
    if (med.suspended && filterStatus === "active") return false;
    if (!med.suspended && filterStatus === "suspended") return false;
    if (med.suspended) return true; // show suspended without date filtering
    const startDate = parseISO(med.start_date);
    if (isBefore(date, startDate)) return false;
    if (med.duration_type === "fixed_days" && med.duration_days) {
      const endDate = addDays(startDate, med.duration_days - 1);
      if (isAfter(date, endDate)) return false;
    }
    if (med.weekdays && Array.isArray(med.weekdays)) {
      const dayOfWeek = date.getDay();
      if (!(med.weekdays as number[]).includes(dayOfWeek)) return false;
    }
    return true;
  };

  // Medications scheduled for selectedDate
  const medsForSelectedDate = useMemo(() => {
    return medications.filter(m => isMedScheduledForDate(m, selectedDate));
  }, [medications, selectedDate, filterStatus]);

  // Filtered medications (additional filters on top of date-based)
  const filteredMedications = useMemo(() => {
    let result = medsForSelectedDate;
    const nameQ = filterName.trim().toLowerCase();
    if (nameQ) {
      result = result.filter(m => m.name.toLowerCase().includes(nameQ));
    }
    if (filterDoctor) {
      result = result.filter(m => m.doctor_id === filterDoctor);
    }
    if (filterDate) {
      result = result.filter(m => m.start_date === filterDate);
    }
    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === "time") {
        const aFirst = a.schedule_time.split(",")[0] || "";
        const bFirst = b.schedule_time.split(",")[0] || "";
        return aFirst.localeCompare(bFirst);
      }
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      if (sortBy === "doctor") {
        const da = doctorLabel(a.doctor_id) || "zzz";
        const db = doctorLabel(b.doctor_id) || "zzz";
        return da.localeCompare(db, "pt-BR", { sensitivity: "base" });
      }
      return 0;
    });
    return result;
  }, [medsForSelectedDate, filterName, filterDoctor, filterDate, sortBy]);

  // Group medications by each schedule_time (used by both timeline and card views)
  const groupedByTime = useMemo(() => {
    const groups: Record<string, { med: Medication; time: string }[]> = {};
    filteredMedications.forEach(med => {
      const times = med.schedule_time.split(",").map(t => t.trim()).filter(Boolean);
      times.forEach(time => {
        if (!groups[time]) groups[time] = [];
        groups[time].push({ med, time });
      });
    });
    return groups;
  }, [filteredMedications]);


  const hasActiveFilters = !!(filterName || filterDoctor || filterDate || filterStatus !== "active");
  const clearFilters = () => { setFilterName(""); setFilterDoctor(""); setFilterDate(""); setFilterStatus("active"); };

  // --- PDF Export ---
  const exportMedsPdf = async () => {
    if (filteredMedications.length === 0) {
      toast({ title: "Nenhum medicamento para exportar" });
      return;
    }
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 14;
    const maxW = pw - margin * 2;
    const colW = maxW / 2;
    let y = 18;

    const addFooter = (pageNum: number, totalPages: number) => {
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text("CidadeX-BR - MeuRemedio", margin, ph - 8);
      doc.text(`Pagina ${pageNum} de ${totalPages}`, pw - margin, ph - 8, { align: "right" });
      doc.setTextColor(0);
    };

    const checkPage = (need: number) => {
      if (y + need > ph - 18) { doc.addPage(); y = 15; }
    };

    // === Header ===
    doc.setFillColor(37, 99, 235); // primary blue
    doc.rect(0, 0, pw, 28, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255);
    doc.text("Meus Medicamentos", pw / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Exportado em ${format(new Date(), "dd/MM/yyyy 'as' HH:mm")}  |  ${filteredMedications.length} medicamento(s)`, pw / 2, 20, { align: "center" });
    doc.setTextColor(0);
    y = 36;

    // === Summary table ===
    const activeCount = filteredMedications.filter(m => !m.suspended).length;
    const suspendedCount = filteredMedications.filter(m => m.suspended).length;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, maxW, 12, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text(`Ativos: ${activeCount}`, margin + 8, y + 7);
    doc.text(`Suspensos: ${suspendedCount}`, margin + 50, y + 7);
    doc.text(`Total: ${filteredMedications.length}`, margin + 100, y + 7);
    doc.setTextColor(0);
    y += 18;

    // === Medication cards ===
    filteredMedications.forEach((med, idx) => {
      checkPage(50);
      const doctorObj = doctors.find(d => d.id === med.doctor_id);

      // Card background
      const cardStartY = y;
      doc.setFillColor(med.suspended ? 255 : 248, med.suspended ? 245 : 250, med.suspended ? 245 : 255);
      doc.roundedRect(margin, y, maxW, 4, 2, 2, "F"); // placeholder, will resize

      // Status indicator bar
      doc.setFillColor(med.suspended ? 245 : 34, med.suspended ? 158 : 197, med.suspended ? 11 : 94);
      doc.rect(margin, y, 2, 4, "F"); // placeholder height

      // Name + icon
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(`${med.icon || ""} ${med.name}`, margin + 5, y);

      // Status badge
      const statusText = med.suspended ? "SUSPENSO" : "ATIVO";
      const statusW = doc.getTextWidth(statusText) + 6;
      doc.setFontSize(6);
      doc.setFillColor(med.suspended ? 254 : 220, med.suspended ? 226 : 252, med.suspended ? 226 : 231);
      doc.setTextColor(med.suspended ? 185 : 22, med.suspended ? 28 : 163, med.suspended ? 28 : 74);
      doc.roundedRect(pw - margin - statusW - 2, y - 3.5, statusW + 2, 5, 1, 1, "F");
      doc.text(statusText, pw - margin - statusW + 1, y, {});
      doc.setTextColor(0);
      y += 3;

      // Subtitle line (generic_name + concentration + form)
      const subtitleParts = [];
      if (med.generic_name && med.generic_name.toLowerCase() !== med.name.toLowerCase()) subtitleParts.push(`(${med.generic_name})`);
      if (med.concentration) subtitleParts.push(med.concentration);
      if (med.pharmaceutical_form) subtitleParts.push(med.pharmaceutical_form);
      const subtitle = subtitleParts.join(" - ");
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(100);
        doc.text(subtitle, margin + 5, y);
        y += 4;
      }

      // Divider
      doc.setDrawColor(220);
      doc.line(margin + 5, y, pw - margin - 3, y);
      y += 3;

      // Info grid (2 columns)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60);

      const fieldPairs: [string, string][] = [];
      fieldPairs.push(["Horario", med.schedule_time.split(",").join(", ")]);
      fieldPairs.push(["Frequencia", med.frequency]);
      try {
        fieldPairs.push(["Inicio", format(new Date(med.start_date + "T12:00:00"), "dd/MM/yyyy")]);
      } catch { fieldPairs.push(["Inicio", med.start_date]); }
      fieldPairs.push(["Duracao", med.duration_type === "ongoing" ? "Uso continuo" : `${med.duration_days} dias`]);
      if (med.weekdays) {
        const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
        fieldPairs.push(["Dias", med.weekdays.map(d => DAYS[d]).join(", ")]);
      }
      if (doctorObj) {
        fieldPairs.push(["Medico", `${doctorObj.name}${doctorObj.specialty ? ` (${doctorObj.specialty})` : ""}`]);
      }

      // Render 2-column grid
      for (let i = 0; i < fieldPairs.length; i += 2) {
        checkPage(6);
        const [label1, val1] = fieldPairs[i];
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120);
        doc.text(`${label1}:`, margin + 5, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40);
        doc.text(val1, margin + 5 + doc.getTextWidth(`${label1}: `), y);

        if (i + 1 < fieldPairs.length) {
          const [label2, val2] = fieldPairs[i + 1];
          doc.setFont("helvetica", "bold");
          doc.setTextColor(120);
          doc.text(`${label2}:`, margin + colW + 5, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(40);
          const val2Lines = doc.splitTextToSize(val2, colW - 25);
          doc.text(val2Lines, margin + colW + 5 + doc.getTextWidth(`${label2}: `), y);
        }
        y += 4.5;
      }

      // Instructions (full width)
      if (med.instructions) {
        checkPage(8);
        y += 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(120);
        doc.text("Instrucoes:", margin + 5, y);
        y += 3.5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        const instrLines = doc.splitTextToSize(med.instructions, maxW - 10);
        instrLines.forEach((line: string) => {
          checkPage(4);
          doc.text(line, margin + 5, y);
          y += 3.5;
        });
      }

      // Notes (full width)
      if (med.notes) {
        checkPage(8);
        y += 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(120);
        doc.text("Observacoes:", margin + 5, y);
        y += 3.5;
        doc.setFont("helvetica", "italic");
        doc.setTextColor(80);
        const noteLines = doc.splitTextToSize(med.notes, maxW - 10);
        noteLines.forEach((line: string) => {
          checkPage(4);
          doc.text(line, margin + 5, y);
          y += 3.5;
        });
      }

      y += 2;

      // Draw card border
      const cardH = y - cardStartY;
      doc.setDrawColor(210);
      doc.setFillColor(med.suspended ? 255 : 248, med.suspended ? 245 : 250, med.suspended ? 245 : 255);
      doc.roundedRect(margin, cardStartY, maxW, cardH, 2, 2, "S");

      // Redraw status bar with correct height
      doc.setFillColor(med.suspended ? 245 : 34, med.suspended ? 158 : 197, med.suspended ? 11 : 94);
      doc.rect(margin, cardStartY, 2, cardH, "F");

      y += 6;
    });

    // Add footers to all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }

    const blobUrl = URL.createObjectURL(doc.output("blob"));
    navigate("/visualizador", {
      state: {
        items: [{ url: blobUrl, name: `medicamentos-${format(new Date(), "yyyy-MM-dd")}.pdf`, type: "application/pdf" }],
        startIndex: 0,
      },
    });
  };

  const handleEdit = (med: Medication) => {
    setEditingId(med.id);
    const times = med.schedule_time.split(",").map(t => t.trim()).filter(Boolean);
    setForm({
      name: med.name,
      generic_name: med.generic_name || "",
      concentration: med.concentration || "",
      pharmaceutical_form: med.pharmaceutical_form || "",
      frequency: med.frequency,
      schedule_times: times.length > 0 ? times : ["08:00"],
      icon: med.icon || "💊",
      instructions: med.instructions || "",
      notes: med.notes || "",
      start_date: med.start_date,
      duration_type: med.duration_type as "ongoing" | "fixed_days",
      duration_days: med.duration_days || 30,
      weekdays_mode: med.weekdays ? "specific" : "all",
      weekdays: med.weekdays || [0, 1, 2, 3, 4, 5, 6],
      doctor_id: med.doctor_id,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setAiSuggestions([]);
    setShowAiSuggestions(false);
  };

  // --- Doctor ---
  const handleSaveDoctor = async () => {
    if (!user || !doctorForm.name.trim()) return;
    setSavingDoctor(true);
    const payload = {
      user_id: user.id,
      name: doctorForm.name.trim(),
      specialty: doctorForm.specialty.trim() || null,
      phone: doctorForm.phone || null,
      mobile: doctorForm.mobile || null,
      address: doctorForm.address || null,
    };

    let error;
    if (editingDoctorId) {
      ({ error } = await (supabase.from("doctors") as any).update(payload).eq("id", editingDoctorId));
    } else {
      const res = await (supabase.from("doctors") as any).insert(payload).select("id").single();
      error = res.error;
      if (!error) setForm(f => ({ ...f, doctor_id: res.data.id }));
    }

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingDoctorId ? "Médico atualizado" : "Médico cadastrado" });
      resetDoctorForm();
      fetchDoctors();
    }
    setSavingDoctor(false);
  };

  const resetDoctorForm = () => {
    setDoctorForm({ name: "", specialty: "", phone: "", mobile: "", address: "" });
    setEditingDoctorId(null);
    setShowDoctorForm(false);
  };

  const handleEditDoctor = (doc: Doctor) => {
    setEditingDoctorId(doc.id);
    setDoctorForm({
      name: doc.name,
      specialty: doc.specialty || "",
      phone: doc.phone || "",
      mobile: doc.mobile || "",
      address: doc.address || "",
    });
    setShowDoctorForm(true);
  };

  // --- Bula search ---
  const handleSearchBula = async (medName: string) => {
    setBulaMedName(medName);
    setBulaOpen(true);
    setBulaLoading(true);
    setBulaResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-bula", {
        body: { nome: medName },
      });
      if (error) throw error;
      setBulaResults(data?.results || []);
    } catch (e) {
      console.error("Bula search error:", e);
      toast({ title: "Erro ao buscar bula", variant: "destructive" });
    } finally {
      setBulaLoading(false);
    }
  };


  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active": return "Ativo";
      case "suspended": return "Suspenso";
      case "finished": return "Finalizado";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/15 text-emerald-600";
      case "suspended": return "bg-amber-500/15 text-amber-600";
      case "finished": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const doctorLabel = (id: string | null) => {
    if (!id) return null;
    const doc = doctors.find(d => d.id === id);
    if (!doc) return null;
    return doc.specialty ? `${doc.name} — ${doc.specialty}` : doc.name;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Pill className="w-4 h-4 text-primary" /> MeuRemédio
          <span className="text-xs font-normal text-muted-foreground">
            ({hasActiveFilters ? `${filteredMedications.length}/${medsForSelectedDate.length}` : medsForSelectedDate.length})
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode(v => v === "card" ? "timeline" : "card")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              viewMode === "timeline"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
            title={viewMode === "timeline" ? "Ver como cards" : "Ver por horário"}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              showFilters || hasActiveFilters
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
            title="Filtrar medicamentos"
          >
            <Filter className="w-3.5 h-3.5" />
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
          <button
            onClick={exportMedsPdf}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-accent text-xs font-semibold transition-colors"
            title="Exportar medicamentos para PDF"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            title="Cadastrar novo medicamento"
          >
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setSelectedDate(d => subDays(d, 1))}
          className="p-1.5 rounded-lg bg-muted hover:bg-accent transition-colors"
          title="Dia anterior"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => setSelectedDate(new Date())}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-w-[140px] text-center",
            isToday(selectedDate)
              ? "bg-primary/10 text-primary"
              : "bg-muted text-foreground hover:bg-accent"
          )}
          title="Ir para hoje"
        >
          {isToday(selectedDate)
            ? "Hoje"
            : format(selectedDate, "EEEE, dd/MM", { locale: ptBR })}
        </button>
        <button
          onClick={() => setSelectedDate(d => addDays(d, 1))}
          className="p-1.5 rounded-lg bg-muted hover:bg-accent transition-colors"
          title="Próximo dia"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Filtros</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-[10px] text-primary hover:underline flex items-center gap-0.5" title="Limpar filtros">
                <XCircle className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Nome do remédio</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  value={filterName}
                  onChange={e => setFilterName(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-input bg-background text-xs outline-none focus:ring-1 ring-primary/30"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Médico</label>
              <select
                value={filterDoctor}
                onChange={e => setFilterDoctor(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="">Todos</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Data de início</label>
              <select
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="">Todas</option>
                {(() => {
                  const dates = [...new Set(medications.filter(m => !m.suspended).map(m => m.start_date))].sort();
                  return dates.map(d => {
                    try {
                      const dt = new Date(d + "T12:00:00");
                      return <option key={d} value={d}>{format(dt, "dd/MM/yyyy")}</option>;
                    } catch { return null; }
                  });
                })()}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as "active" | "suspended" | "all")}
                className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="active">Ativos</option>
                <option value="suspended">Suspensos</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Classificar por</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as "time" | "name" | "doctor")}
                className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="time">Horário</option>
                <option value="name">Nome</option>
                <option value="doctor">Médico</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {medications.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum medicamento cadastrado</p>
          <p className="text-xs mt-1">Toque em "Novo" para adicionar seu primeiro medicamento.</p>
        </div>
      )}

      {medications.length > 0 && medsForSelectedDate.length === 0 && !hasActiveFilters && (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum medicamento agendado para este dia</p>
          <p className="text-xs mt-1">Use as setas para navegar entre os dias.</p>
        </div>
      )}

      {medsForSelectedDate.length > 0 && filteredMedications.length === 0 && hasActiveFilters && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum medicamento encontrado</p>
          <p className="text-xs mt-1">Tente ajustar os filtros.</p>
          <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">Limpar filtros</button>
        </div>
      )}

      {/* Timeline view - grouped by time */}
      {viewMode === "timeline" && filteredMedications.length > 0 && (() => {
        const sortedTimes = Object.entries(groupedByTime).sort(([aTime, aItems], [bTime, bItems]) => {
          const aAllTaken = aItems.every(({ med, time: t }) => !!getTodayLog(med.id, t));
          const bAllTaken = bItems.every(({ med, time: t }) => !!getTodayLog(med.id, t));
          if (aAllTaken !== bAllTaken) return aAllTaken ? 1 : -1;
          return aTime.localeCompare(bTime);
        });

        return (
          <div className="space-y-3">
            {sortedTimes.map(([time, items]) => {
              const untaken = items.filter(({ med, time: t }) => !getTodayLog(med.id, t));
              const allTakenInGroup = untaken.length === 0;
              return (
                <div key={`tl-${time}`} className={cn(
                  "rounded-xl border overflow-hidden transition-all duration-500",
                  allTakenInGroup ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"
                )}>
                  {/* Time header */}
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 border-b transition-colors duration-500",
                    allTakenInGroup ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted/50 border-border"
                  )}>
                    <Clock className={cn("w-4 h-4 transition-colors duration-500", allTakenInGroup ? "text-emerald-600" : "text-primary")} />
                    <span className={cn("text-sm font-bold transition-colors duration-500", allTakenInGroup ? "text-emerald-600" : "text-foreground")}>{time}</span>
                    {allTakenInGroup && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    <span className="text-[10px] text-muted-foreground">— {items.length} medicamento{items.length > 1 ? "s" : ""}</span>
                    {untaken.length >= 2 && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => handleMarkMultipleTaken(untaken, true)}
                          disabled={markingTaken === "batch"}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Todos às {time}
                        </button>
                        <button
                          onClick={() => handleMarkMultipleTaken(untaken, false)}
                          disabled={markingTaken === "batch"}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Agora
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Meds in this time slot — taken go to end */}
                  <div className="divide-y divide-border">
                    {[...items].sort((a, b) => {
                      const aTaken = !!getTodayLog(a.med.id, a.time);
                      const bTaken = !!getTodayLog(b.med.id, b.time);
                      if (aTaken !== bTaken) return aTaken ? 1 : -1;
                      return 0;
                    }).map(({ med, time: t }) => {
                      const status = getMedStatus(med);
                      const isActive = status === "active";
                      const timeLog = getTodayLog(med.id, t);
                      const isTaken = !!timeLog;
                      const doc = doctorLabel(med.doctor_id);
                      return (
                        <div
                          key={`${med.id}-${t}`}
                          className={cn(
                            "px-3 py-2.5 flex items-center gap-3 transition-all duration-500 ease-in-out",
                            isTaken ? "bg-emerald-500/5 opacity-75" : med.suspended ? "bg-muted/30 opacity-70" : ""
                          )}
                        >
                          <span className="text-xl shrink-0">{med.icon || "💊"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("font-semibold text-sm transition-colors duration-500", isTaken ? "text-muted-foreground line-through" : "text-foreground")}>{med.name}</span>
                              {med.concentration && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{med.concentration}</span>
                              )}
                              {med.pharmaceutical_form && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{med.pharmaceutical_form}</span>
                              )}
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", getStatusColor(status))}>
                                {getStatusLabel(status)}
                              </span>
                            </div>
                            {doc && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" /> {doc}
                              </p>
                            )}
                            {med.instructions && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{med.instructions}</p>
                            )}
                          </div>
                          {/* Taken status + actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActive && (
                              isTaken ? (
                                isSkippedLog(timeLog) ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-semibold flex items-center gap-0.5">
                                      <XCircle className="w-3 h-3" /> {getSkipLabel(timeLog)}
                                    </span>
                                    <button
                                      onClick={() => handleUndoTaken(timeLog.id)}
                                      className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                                      title="Desfazer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-semibold flex items-center gap-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> {format(new Date(timeLog.taken_at), "HH:mm")}
                                    </span>
                                    <button
                                      onClick={() => handleUndoTaken(timeLog.id)}
                                      className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                                      title="Desfazer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center gap-1 relative">
                                  <button
                                    onClick={() => handleMarkTaken(med, t, true)}
                                    disabled={markingTaken === `${med.id}-${t}`}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <Clock className="w-3 h-3" /> {t}
                                  </button>
                                  <button
                                    onClick={() => handleMarkTaken(med, t, false)}
                                    disabled={markingTaken === `${med.id}-${t}`}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Agora
                                  </button>
                                  <button
                                    onClick={(e) => { const rect = (e.target as HTMLElement).getBoundingClientRect(); setSkipMenuPos({ x: rect.left, y: rect.bottom + 4 }); setSkipMenuOpen(skipMenuOpen === `${med.id}-${t}` ? null : `${med.id}-${t}`); }}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
                                    title="Não tomei"
                                  >
                                    <XCircle className="w-3 h-3" />
                                  </button>
                                  {skipMenuOpen === `${med.id}-${t}` && (
                                    <div className="fixed z-[999] bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[210px]" style={{ left: Math.min(skipMenuPos.x, window.innerWidth - 220), top: skipMenuPos.y + 160 > window.innerHeight ? skipMenuPos.y - 170 : skipMenuPos.y }}>
                                      <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Motivo</p>
                                      {SKIP_REASONS.map(r => (
                                        <button
                                          key={r.code}
                                          onClick={() => handleSkipDose(med, t, r.code)}
                                          className={cn(
                                            "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2",
                                            r.code === "suspend" && "text-amber-600 border-t border-border mt-1 pt-2"
                                          )}
                                        >
                                          <span>{r.icon}</span> {r.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            )}
                            <button onClick={() => handleEdit(med)} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground" title="Editar">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="p-1 rounded-md hover:bg-muted transition-colors" title={med.suspended ? "Retomar medicamento" : "Suspender medicamento"}>
                                  {med.suspended ? <PlayCircle className="w-3 h-3 text-emerald-500" /> : <PauseCircle className="w-3 h-3 text-amber-500" />}
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{med.suspended ? "Retomar" : "Suspender"} medicamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {med.suspended
                                      ? `Deseja retomar o uso de "${med.name}"?`
                                      : `Deseja suspender temporariamente o uso de "${med.name}"?`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleToggleSuspend(med)}>
                                    {med.suspended ? "Retomar" : "Suspender"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Card view - original layout */}
      {viewMode === "card" && (
        <>
          {/* Batch mark buttons per time group */}
          {Object.entries(groupedByTime).sort(([a], [b]) => a.localeCompare(b)).map(([time, items]) => {
            const untaken = items.filter(({ med, time: t }) => !getTodayLog(med.id, t));
            if (untaken.length < 2) return null;
            return (
              <div key={`batch-${time}`} className="flex items-center gap-2 px-1">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">{time}</span>
                <span className="text-[10px] text-muted-foreground">— {untaken.length} medicamentos pendentes</span>
                <button
                  onClick={() => handleMarkMultipleTaken(untaken, true)}
                  disabled={markingTaken === "batch"}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  title={`Marcar todos às ${time} como tomados`}
                >
                  <CheckCircle2 className="w-3 h-3" /> Marcar todos às {time}
                </button>
                <button
                  onClick={() => handleMarkMultipleTaken(untaken, false)}
                  disabled={markingTaken === "batch"}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                  title="Marcar todos como tomados agora"
                >
                  <CheckCircle2 className="w-3 h-3" /> Todos agora
                </button>
              </div>
            );
          })}

          {/* Medication cards — taken go to end */}
          <div className="space-y-2">
            {[...filteredMedications].sort((a, b) => {
              const aT = a.schedule_time.split(",").map(t => t.trim()).filter(Boolean);
              const bT = b.schedule_time.split(",").map(t => t.trim()).filter(Boolean);
              const aTakenCount = aT.filter(t => !!getTodayLog(a.id, t)).length;
              const bTakenCount = bT.filter(t => !!getTodayLog(b.id, t)).length;
              const aAllTaken = aTakenCount === aT.length;
              const bAllTaken = bTakenCount === bT.length;
              const aPartial = aTakenCount > 0 && !aAllTaken;
              const bPartial = bTakenCount > 0 && !bAllTaken;
              // Order: untaken (0) → partial (1) → all taken (2)
              const aScore = aAllTaken ? 2 : aPartial ? 1 : 0;
              const bScore = bAllTaken ? 2 : bPartial ? 1 : 0;
              if (aScore !== bScore) return aScore - bScore;
              return 0;
            }).map(med => {
              const status = getMedStatus(med);
              const doc = doctorLabel(med.doctor_id);
              const medTimes = med.schedule_time.split(",").map(t => t.trim()).filter(Boolean);
              const allTimeLogs = medTimes.map(t => ({ time: t, log: getTodayLog(med.id, t) }));
              const allTaken = allTimeLogs.every(tl => !!tl.log);
              const isActive = status === "active";
              return (
                <div
                  key={med.id}
                  className={cn(
                    "rounded-xl border p-3 transition-all duration-500 ease-in-out",
                    allTaken ? "border-emerald-500/30 bg-emerald-500/5 opacity-75" :
                    med.suspended ? "border-border bg-muted/30 opacity-70" : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{med.icon || "💊"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{med.name}</span>
                        {med.generic_name && med.generic_name.toLowerCase() !== med.name.toLowerCase() && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium italic">({med.generic_name})</span>
                        )}
                        {med.concentration && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{med.concentration}</span>
                        )}
                        {med.pharmaceutical_form && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{med.pharmaceutical_form}</span>
                        )}
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", getStatusColor(status))}>
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{medTimes.join(", ")}</span>
                        <span>{med.frequency}</span>
                        {med.duration_type === "fixed_days" && med.duration_days && (
                          <span>{med.duration_days} dias</span>
                        )}
                        {med.duration_type === "ongoing" && <span>Contínuo</span>}
                      </div>
                      {med.weekdays && (
                        <div className="flex gap-1 mt-1">
                          {WEEKDAY_LABELS.map((l, i) => (
                            <span
                              key={i}
                              className={cn(
                                "text-[9px] w-5 h-5 flex items-center justify-center rounded-full font-semibold",
                                (med.weekdays as number[]).includes(i)
                                  ? "bg-primary/15 text-primary"
                                  : "text-muted-foreground/40"
                              )}
                            >
                              {l[0]}
                            </span>
                          ))}
                        </div>
                      )}
                      {doc && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" /> {doc}
                        </p>
                      )}
                      {med.instructions && (
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{med.instructions}</p>
                      )}
                      {med.notes && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2 italic">📝 {med.notes}</p>
                      )}
                      {/* Per-time mark as taken / undo */}
                      {isActive && (
                        <div className="space-y-1.5 mt-2">
                          {allTimeLogs.map(({ time, log: timeLog }) => {
                            const isTaken = !!timeLog;
                            return (
                              <div key={time} className="flex items-center gap-1.5 flex-wrap relative">
                                {isTaken ? (
                                  isSkippedLog(timeLog) ? (
                                    <>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-semibold flex items-center gap-0.5">
                                        <XCircle className="w-3 h-3" /> {time} — {getSkipLabel(timeLog)}
                                      </span>
                                      <button
                                        onClick={() => handleUndoTaken(timeLog.id)}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-medium hover:bg-accent transition-colors"
                                        title="Desfazer"
                                      >
                                        <X className="w-2.5 h-2.5" /> Desfazer
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-semibold flex items-center gap-0.5">
                                        <CheckCircle2 className="w-3 h-3" /> {time} — Tomado {format(new Date(timeLog.taken_at), "HH:mm")}
                                      </span>
                                      <button
                                        onClick={() => handleUndoTaken(timeLog.id)}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-medium hover:bg-accent transition-colors"
                                        title={`Desfazer registro das ${time}`}
                                      >
                                        <X className="w-2.5 h-2.5" /> Desfazer
                                      </button>
                                    </>
                                  )
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleMarkTaken(med, time, true)}
                                      disabled={markingTaken === `${med.id}-${time}`}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                      title={`Marcar como tomado às ${time}`}
                                    >
                                      <Clock className="w-3 h-3" /> Tomei às {time}
                                    </button>
                                    <button
                                      onClick={() => handleMarkTaken(med, time, false)}
                                      disabled={markingTaken === `${med.id}-${time}`}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                                      title="Marcar como tomado agora"
                                    >
                                      <CheckCircle2 className="w-3 h-3" /> Agora
                                    </button>
                                    <button
                                      onClick={(e) => { const rect = (e.target as HTMLElement).getBoundingClientRect(); setSkipMenuPos({ x: rect.left, y: rect.bottom + 4 }); setSkipMenuOpen(skipMenuOpen === `${med.id}-${time}` ? null : `${med.id}-${time}`); }}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
                                      title="Não tomei"
                                    >
                                      <XCircle className="w-3 h-3" /> Não tomei
                                    </button>
                                    {skipMenuOpen === `${med.id}-${time}` && (
                                      <div className="fixed z-[999] bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[210px]" style={{ left: Math.min(skipMenuPos.x, window.innerWidth - 220), top: skipMenuPos.y + 160 > window.innerHeight ? skipMenuPos.y - 170 : skipMenuPos.y }}>
                                        <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Motivo</p>
                                        {SKIP_REASONS.map(r => (
                                          <button
                                            key={r.code}
                                            onClick={() => handleSkipDose(med, time, r.code)}
                                            className={cn(
                                              "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2",
                                              r.code === "suspend" && "text-amber-600 border-t border-border mt-1 pt-2"
                                            )}
                                          >
                                            <span>{r.icon}</span> {r.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => handleSearchBula(med.name)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-primary"
                        title="Buscar bula do medicamento (ANVISA)"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleEdit(med)} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground" title="Editar medicamento">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground" title={med.suspended ? "Retomar medicamento" : "Suspender medicamento"}>
                            {med.suspended ? <PlayCircle className="w-3.5 h-3.5 text-emerald-500" /> : <PauseCircle className="w-3.5 h-3.5 text-amber-500" />}
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{med.suspended ? "Retomar" : "Suspender"} medicamento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {med.suspended
                                ? `Deseja retomar o uso de "${med.name}"?`
                                : `Deseja suspender temporariamente o uso de "${med.name}"?`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleToggleSuspend(med)}>
                              {med.suspended ? "Retomar" : "Suspender"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-destructive/70" title="Excluir medicamento">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir medicamento?</AlertDialogTitle>
                            <AlertDialogDescription>"{med.name}" será removido permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(med.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-4xl w-[98vw] md:w-[96vw] lg:w-[92vw] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-primary" />
              {editingId ? "Editar Medicamento" : "Novo Medicamento"}
            </DialogTitle>
            <DialogDescription>Preencha os dados do medicamento.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Nome com busca IA */}
            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-muted-foreground">Nome do Medicamento *</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  onFocus={() => { if (aiSuggestions.length > 0) setShowAiSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowAiSuggestions(false), 200)}
                  placeholder="Digite o nome do medicamento..."
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
                />
                {aiSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </div>
              {showAiSuggestions && aiSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-xl overflow-hidden max-h-[280px] overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-border bg-muted/50">
                    <span className="text-[10px] font-semibold text-muted-foreground">💊 {aiSuggestions.length} medicamentos encontrados</span>
                  </div>
                  {aiSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => selectAiSuggestion(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{s.name}</span>
                        {s.concentrations.length > 1 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                            {s.concentrations.length} doses
                          </span>
                        )}
                      </div>
                      {s.generic_name && s.generic_name !== s.name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Princípio ativo: {s.generic_name}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{s.therapeutic_class}</span>
                        {s.concentrations.slice(0, 4).map((c, ci) => (
                          <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{c}</span>
                        ))}
                        {s.concentrations.length > 4 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">+{s.concentrations.length - 4}</span>
                        )}
                      </div>
                      {s.forms && s.forms.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-1">{s.forms.join(" · ")}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Princípio Ativo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Princípio Ativo</label>
              <input
                type="text"
                value={form.generic_name}
                onChange={e => setForm(f => ({ ...f, generic_name: e.target.value }))}
                placeholder="Ex: Paracetamol, Dipirona"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>

            {/* Concentração */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Concentração</label>
              <input
                type="text"
                value={form.concentration}
                onChange={e => setForm(f => ({ ...f, concentration: e.target.value }))}
                placeholder="Ex: 500mg, 10ml"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
              />
              {showConcentrationPicker && pendingConcentrations.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-[10px] text-muted-foreground w-full">Selecione a concentração:</span>
                  {pendingConcentrations.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, concentration: c }));
                        setShowConcentrationPicker(false);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border",
                        form.concentration === c
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-foreground border-border hover:bg-accent"
                      )}
                      title={`Selecionar ${c}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Forma farmacêutica — busca rápida A-Z */}
            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-muted-foreground">Forma Farmacêutica</label>
              <input
                type="text"
                value={form.pharmaceutical_form}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, pharmaceutical_form: val }));
                }}
                onFocus={() => setPharmaOpen(true)}
                onBlur={() => setTimeout(() => setPharmaOpen(false), 150)}
                placeholder="Digitar ou selecionar..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
                autoComplete="off"
                title="Digite para buscar forma farmacêutica"
              />
              {pharmaOpen && (() => {
                const filtered = PHARMA_FORMS.filter(pf =>
                  pf.toLowerCase().includes((form.pharmaceutical_form || "").toLowerCase())
                );
                return filtered.length > 0 ? (
                  <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {filtered.map(pf => (
                      <li
                        key={pf}
                        onMouseDown={() => {
                          setForm(f => ({ ...f, pharmaceutical_form: pf }));
                          setPharmaOpen(false);
                        }}
                        className={cn(
                          "px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors",
                          pf === form.pharmaceutical_form && "bg-primary/10 text-primary font-semibold"
                        )}
                      >
                        {pf}
                      </li>
                    ))}
                  </ul>
                ) : null;
              })()}
            </div>

            {/* Frequência */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Frequência *</label>
              <select
                value={form.frequency}
                onChange={e => {
                  const newFreq = e.target.value;
                  const defaults = getDefaultTimeSlots(newFreq);
                  const maxSlots = getMaxTimeSlots(newFreq);
                  setForm(f => ({
                    ...f,
                    frequency: newFreq,
                    schedule_times: maxSlots === 1
                      ? [f.schedule_times[0] || "08:00"]
                      : f.schedule_times.length === 1 && defaults.length > 1
                        ? defaults
                        : f.schedule_times.slice(0, maxSlots),
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
              >
                {FREQUENCY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Horários */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Horário{form.schedule_times.length > 1 ? "s" : ""} * ({form.schedule_times.length}/{getMaxTimeSlots(form.frequency)})
              </label>
              <div className="space-y-2">
                {form.schedule_times.map((time, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold w-5 text-center">{idx + 1}.</span>
                    <input
                      type="time"
                      value={time}
                      onChange={e => {
                        const newTimes = [...form.schedule_times];
                        newTimes[idx] = e.target.value;
                        setForm(f => ({ ...f, schedule_times: newTimes }));
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                    {form.schedule_times.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          schedule_times: f.schedule_times.filter((_, i) => i !== idx),
                        }))}
                        className="p-1.5 rounded-lg text-destructive/70 hover:bg-destructive/10 transition-colors"
                        title="Remover horário"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {form.schedule_times.length < getMaxTimeSlots(form.frequency) && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      schedule_times: [...f.schedule_times, "12:00"],
                    }))}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-accent transition-colors"
                    title="Adicionar horário"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar horário
                  </button>
                )}
              </div>
            </div>

            {/* Data de início */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Data de Início *</label>
              <DateInput
                value={form.start_date}
                onChange={v => setForm(f => ({ ...f, start_date: v || format(new Date(), "yyyy-MM-dd") }))}
                required
              />
            </div>

            {/* Duração */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Duração</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.duration_type === "ongoing"}
                    onChange={() => setForm(f => ({ ...f, duration_type: "ongoing" }))}
                    className="accent-primary"
                  />
                  Tratamento em andamento (contínuo)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.duration_type === "fixed_days"}
                    onChange={() => setForm(f => ({ ...f, duration_type: "fixed_days" }))}
                    className="accent-primary"
                  />
                  Número de dias
                </label>
                {form.duration_type === "fixed_days" && (
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.duration_days}
                    onChange={e => setForm(f => ({ ...f, duration_days: parseInt(e.target.value) || 1 }))}
                    className="w-24 px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30 ml-6"
                  />
                )}
              </div>
            </div>

            {/* Dias da semana */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Dias</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.weekdays_mode === "all"}
                    onChange={() => setForm(f => ({ ...f, weekdays_mode: "all", weekdays: [0, 1, 2, 3, 4, 5, 6] }))}
                    className="accent-primary"
                  />
                  Todos os dias
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.weekdays_mode === "specific"}
                    onChange={() => setForm(f => ({ ...f, weekdays_mode: "specific" }))}
                    className="accent-primary"
                  />
                  Dias específicos
                </label>
                {form.weekdays_mode === "specific" && (
                  <div className="flex gap-1.5 ml-6 flex-wrap">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setForm(f => ({
                            ...f,
                            weekdays: f.weekdays.includes(i)
                              ? f.weekdays.filter(d => d !== i)
                              : [...f.weekdays, i].sort(),
                          }));
                        }}
                        className={cn(
                          "w-9 h-9 rounded-full text-xs font-semibold transition-colors",
                          form.weekdays.includes(i)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        )}
                        title={`Selecionar ${label}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ícone */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Tipo / Ícone</label>
              <div className="grid grid-cols-4 gap-1.5">
                {MED_ICONS.map(({ emoji, label }) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, icon: emoji }))}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors border",
                      form.icon === emoji
                        ? "bg-primary/15 border-primary text-foreground ring-1 ring-primary"
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    title={`Selecionar: ${label}`}
                  >
                    <span className="text-base leading-none">{emoji}</span>
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Instruções */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Instruções</label>
              <textarea
                value={form.instructions}
                onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                placeholder="Ex: Tomar após as refeições, com água..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
              />
            </div>

            {/* Observações pessoais */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Observações pessoais</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Anotações pessoais sobre este medicamento..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right">{form.notes.length}/500</p>
            </div>


            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Médico Responsável</label>
              <div className="flex gap-2">
                <select
                  value={form.doctor_id || ""}
                  onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value || null }))}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value="">Nenhum</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.specialty ? `${d.name} — ${d.specialty}` : d.name}</option>
                  ))}
                </select>
                {form.doctor_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const doc = doctors.find(d => d.id === form.doctor_id);
                      if (doc) handleEditDoctor(doc);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-muted-foreground"
                    title="Editar médico selecionado"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { resetDoctorForm(); setShowDoctorForm(true); }}
                  className="px-2.5 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-muted-foreground"
                  title="Cadastrar novo médico"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Inline doctor form */}
              {showDoctorForm && (
                <div className="mt-2 p-3 rounded-lg border border-border bg-muted/30 space-y-2 animate-fade-in">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-primary" /> {editingDoctorId ? "Editar Médico" : "Novo Médico"}
                  </p>
                  <input
                    type="text"
                    value={doctorForm.name}
                    onChange={e => setDoctorForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do médico *"
                    className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 ring-primary/30"
                  />
                  <input
                    type="text"
                    value={doctorForm.specialty}
                    onChange={e => setDoctorForm(f => ({ ...f, specialty: e.target.value }))}
                    placeholder="Especialidade (ex: Cardiologista)"
                    className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 ring-primary/30"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={doctorForm.phone}
                      onChange={e => setDoctorForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                      placeholder="Telefone"
                      inputMode="numeric"
                      maxLength={15}
                      className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 ring-primary/30"
                    />
                    <input
                      type="text"
                      value={doctorForm.mobile}
                      onChange={e => setDoctorForm(f => ({ ...f, mobile: formatPhone(e.target.value) }))}
                      placeholder="Celular"
                      inputMode="numeric"
                      maxLength={15}
                      className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 ring-primary/30"
                    />
                  </div>
                  <input
                    type="text"
                    value={doctorForm.address}
                    onChange={e => setDoctorForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Endereço"
                    className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 ring-primary/30"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={resetDoctorForm}
                      className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                      title="Cancelar"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDoctor}
                      disabled={savingDoctor || !doctorForm.name.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                      title={editingDoctorId ? "Atualizar médico" : "Salvar médico"}
                    >
                      {savingDoctor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingDoctorId ? "Atualizar" : "Salvar Médico"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                title="Cancelar"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.schedule_times.filter(t => t).length === 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                title={editingId ? "Salvar alterações" : "Cadastrar medicamento"}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editingId ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bula ANVISA Modal */}
      <Dialog open={bulaOpen} onOpenChange={setBulaOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Bula — {bulaMedName}
            </DialogTitle>
            <DialogDescription>Resultados do bulário da ANVISA</DialogDescription>
          </DialogHeader>
          {bulaLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Consultando ANVISA...</span>
            </div>
          ) : bulaResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>Nenhuma bula encontrada para "{bulaMedName}".</p>
              <a
                href={`https://www.google.com/search?q=bula+${encodeURIComponent(bulaMedName)}+medicamento+anvisa`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-primary hover:underline text-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Buscar no Google
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {bulaResults.map((r: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
                  <p className="font-semibold text-sm text-foreground">{r.nome}</p>
                  {r.empresa && <p className="text-xs text-muted-foreground">{r.empresa}</p>}
                  {r.expediente && <p className="text-xs text-muted-foreground">Reg: {r.expediente}</p>}
                  <div className="flex gap-2 mt-2">
                    {r.bulaPaciente && (
                      <a
                        href={`https://consultas.anvisa.gov.br/api/consulta/medicamentos/arquivo/bula/parecer/${r.bulaPaciente}/?tipoDocumento=BULA_PACIENTE`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Bula Paciente
                      </a>
                    )}
                    {r.bulaProfissional && (
                      <a
                        href={`https://consultas.anvisa.gov.br/api/consulta/medicamentos/arquivo/bula/parecer/${r.bulaProfissional}/?tipoDocumento=BULA_PROFISSIONAL`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-medium hover:bg-accent transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Bula Profissional
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

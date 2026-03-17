import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, DollarSign, CalendarDays, User, Tag, FileText, Save, Plus, Trash2, Phone, Smartphone, Paperclip, Percent, Layers, Upload, Repeat, CreditCard, Eye, Share2, Edit } from "lucide-react";
import { format } from "date-fns";
import DateInput from "@/components/common/DateInput";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface FinanceAttachment {
  id?: string;
  record_id?: string;
  file_url: string;
  file_name: string;
  display_name: string | null;
  file_type: string;
  file_size: number;
  position: number;
  isNew?: boolean; // local only - not yet saved
}

export interface FinanceRecord {
  id?: string;
  type: "receita" | "despesa";
  description: string;
  amount: number;
  entry_date: string;
  due_date: string | null;
  payment_date: string | null;
  payee: string;
  category: string;
  referente: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  notes: string;
  installment_total?: number | null;
  installment_number?: number | null;
  installment_group_id?: string | null;
  interest_amount?: number;
  discount_amount?: number;
  attachment_url?: string | null;
  attachment_name?: string | null;
  account_id?: string | null;
  payment_method?: string | null;
  is_recurring?: boolean;
  recurring_active?: boolean;
}

const DEFAULT_PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito",
  "Transferência", "Boleto", "Cheque", "Débito Automático"
];

const CATEGORIES = [
  "Geral", "Alimentação", "Transporte", "Moradia", "Saúde", "Educação",
  "Lazer", "Vestuário", "Serviços", "Impostos", "Salário", "Freelance",
  "Investimentos", "Vendas", "Aluguel", "Outros"
];

interface AccountOption {
  id: string;
  name: string;
  color: string;
  account_type: string;
}

interface ManualContact {
  id: string;
  name: string;
  phone: string | null;
}

interface FinanceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (record: FinanceRecord, installments?: number, isRecurring?: boolean, installmentMode?: "dividir" | "repetir", attachments?: FinanceAttachment[]) => void;
  editRecord?: FinanceRecord | null;
  saving?: boolean;
  existingPayees?: string[];
  existingPhones?: string[];
  onAddPayee?: (name: string, phone?: string) => void;
  onRemovePayee?: (name: string) => void;
  userId?: string;
  accounts?: AccountOption[];
  defaultAccountId?: string | null;
  readOnly?: boolean;
  onEdit?: (record: FinanceRecord) => void;
  manualContacts?: ManualContact[];
  existingAttachments?: FinanceAttachment[];
}

const formatCurrency = (value: number) => {
  if (!value) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrency = (raw: string): number => {
  // Remove tudo exceto dígitos e vírgula
  const cleaned = raw.replace(/[^\d,]/g, "");
  if (!cleaned) return 0;
  // Converte vírgula para ponto
  return parseFloat(cleaned.replace(",", ".")) || 0;
};

const handleCurrencyInput = (raw: string): string => {
  // Remove tudo exceto dígitos
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const FinanceFormModal = ({ open, onClose, onSave, editRecord, saving, existingPayees = [], existingPhones = [], onAddPayee, onRemovePayee, userId, accounts = [], defaultAccountId, readOnly = false, onEdit, manualContacts = [], existingAttachments = [] }: FinanceFormModalProps) => {
  const [form, setForm] = useState<FinanceRecord>({
    type: "despesa",
    description: "",
    amount: 0,
    entry_date: format(new Date(), "yyyy-MM-dd"),
    due_date: null,
    payment_date: null,
    payee: "",
    category: "Geral",
    referente: "",
    status: "pendente",
    notes: "",
    interest_amount: 0,
    discount_amount: 0,
    attachment_url: null,
    attachment_name: null,
    account_id: null,
    payment_method: null,
  });

  const [attachments, setAttachments] = useState<FinanceAttachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [installments, setInstallments] = useState(1);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);
  const [installmentMode, setInstallmentMode] = useState<"dividir" | "repetir">("repetir");
  const [showPayeeSuggestions, setShowPayeeSuggestions] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [interestDisplay, setInterestDisplay] = useState("");
  const [discountDisplay, setDiscountDisplay] = useState("");
  const [customPaymentMethods, setCustomPaymentMethods] = useState<string[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [inactivePMs, setInactivePMs] = useState<Set<string>>(new Set());
  const [inactiveCats, setInactiveCats] = useState<Set<string>>(new Set());
  const [pmRenames, setPmRenames] = useState<Record<string, string>>({});
  const [catRenames, setCatRenames] = useState<Record<string, string>>({});

  // Fetch custom payment methods + inactive + renames
  const fetchCustomPaymentMethods = useCallback(async () => {
    if (!userId) return;
    const [customRes, inactiveRes, renameRes] = await Promise.all([
      supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "payment_method").order("value"),
      supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "pm_inactive"),
      supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "pm_rename"),
    ]);
    setCustomPaymentMethods((customRes.data || []).map(d => d.value));
    setInactivePMs(new Set((inactiveRes.data || []).map(d => d.value)));
    const rMap: Record<string, string> = {};
    (renameRes.data || []).forEach(d => {
      try { const p = JSON.parse(d.value); if (p.from && p.to) rMap[p.from] = p.to; } catch {}
    });
    setPmRenames(rMap);
  }, [userId]);

  useEffect(() => {
    if (open) {
      fetchCustomPaymentMethods();
      // Fetch custom categories + inactive + renames
      if (userId) {
        Promise.all([
          supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "finance_category").order("value"),
          supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "cat_inactive"),
          supabase.from("user_custom_options").select("value").eq("user_id", userId).eq("option_type", "cat_rename"),
        ]).then(([customRes, inactiveRes, renameRes]) => {
          setCustomCategories((customRes.data || []).map(d => d.value));
          setInactiveCats(new Set((inactiveRes.data || []).map(d => d.value)));
          const rMap: Record<string, string> = {};
          (renameRes.data || []).forEach(d => {
            try { const p = JSON.parse(d.value); if (p.from && p.to) rMap[p.from] = p.to; } catch {}
          });
          setCatRenames(rMap);
        });
      }
    }
  }, [open, fetchCustomPaymentMethods, userId]);

  const allPaymentMethods = useMemo(() => {
    const defaults = DEFAULT_PAYMENT_METHODS.filter(m => !inactivePMs.has(m)).map(m => pmRenames[m] || m);
    const custom = customPaymentMethods.filter(c => !DEFAULT_PAYMENT_METHODS.includes(c) && !inactivePMs.has(c));
    return [...defaults, ...custom].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [customPaymentMethods, inactivePMs, pmRenames]);

  const allCategories = useMemo(() => {
    const defaults = CATEGORIES.filter(c => !inactiveCats.has(c)).map(c => catRenames[c] || c);
    const custom = customCategories.filter(c => !CATEGORIES.includes(c) && !inactiveCats.has(c));
    return [...defaults, ...custom].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [customCategories, inactiveCats, catRenames]);

  const handleAddPaymentMethod = async () => {
    if (!userId || !newPaymentMethod.trim()) return;
    const value = newPaymentMethod.trim();
    if (allPaymentMethods.some(m => m.toLowerCase() === value.toLowerCase())) {
      toast.error("Essa forma de pagamento já existe.");
      return;
    }
    const { error } = await supabase.from("user_custom_options").insert({
      user_id: userId,
      option_type: "payment_method",
      value,
    });
    if (error) {
      toast.error("Erro ao adicionar forma de pagamento.");
    } else {
      toast.success(`"${value}" adicionado!`);
      setCustomPaymentMethods(prev => [...prev, value]);
      setForm(prev => ({ ...prev, payment_method: value }));
      setNewPaymentMethod("");
      setShowAddPaymentMethod(false);
    }
  };

  const handleRemovePaymentMethod = async (method: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("user_custom_options")
      .delete()
      .eq("user_id", userId)
      .eq("option_type", "payment_method")
      .eq("value", method);
    if (error) {
      toast.error("Erro ao remover.");
    } else {
      toast.success(`"${method}" removido.`);
      setCustomPaymentMethods(prev => prev.filter(m => m !== method));
      if (form.payment_method === method) setForm(prev => ({ ...prev, payment_method: null }));
    }
  };
  const handleAddCategory = async () => {
    if (!userId || !newCategory.trim()) return;
    const value = newCategory.trim();
    if (allCategories.some(m => m.toLowerCase() === value.toLowerCase())) {
      toast.error("Essa categoria já existe.");
      return;
    }
    const { error } = await supabase.from("user_custom_options").insert({
      user_id: userId,
      option_type: "finance_category",
      value,
    });
    if (error) {
      toast.error("Erro ao adicionar categoria.");
    } else {
      toast.success(`"${value}" adicionada!`);
      setCustomCategories(prev => [...prev, value]);
      setField("category", value);
      setNewCategory("");
      setShowAddCategory(false);
    }
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("user_custom_options")
      .delete()
      .eq("user_id", userId)
      .eq("option_type", "finance_category")
      .eq("value", cat);
    if (error) {
      toast.error("Erro ao remover.");
    } else {
      toast.success(`"${cat}" removida.`);
      setCustomCategories(prev => prev.filter(m => m !== cat));
      if (form.category === cat) setForm(prev => ({ ...prev, category: "Geral" }));
    }
  };


  const filteredPayees = useMemo(() => {
    if (!form.payee.trim()) return existingPayees.slice(0, 8);
    const q = form.payee.toLowerCase();
    return existingPayees.filter(p => p.toLowerCase().includes(q)).slice(0, 8);
  }, [form.payee, existingPayees]);

  const finalAmount = useMemo(() => {
    return form.amount + (form.interest_amount || 0) - (form.discount_amount || 0);
  }, [form.amount, form.interest_amount, form.discount_amount]);

  useEffect(() => {
    if (editRecord) {
      setForm(editRecord);
      setAttachments(existingAttachments);
      setRemovedAttachmentIds([]);
      setInstallments(1);
      setIsRecurring(!!editRecord.is_recurring);
      setRecurringMonths(12);
      setInstallmentMode("repetir");
      setAmountDisplay(editRecord.amount ? formatCurrency(editRecord.amount) : "");
      setInterestDisplay(editRecord.interest_amount ? formatCurrency(editRecord.interest_amount) : "");
      setDiscountDisplay(editRecord.discount_amount ? formatCurrency(editRecord.discount_amount) : "");
    } else {
      setForm({
        type: "despesa",
        description: "",
        amount: 0,
        entry_date: format(new Date(), "yyyy-MM-dd"),
        due_date: null,
        payment_date: null,
        payee: "",
        category: "Geral",
        referente: "",
        status: "pendente",
        notes: "",
        interest_amount: 0,
        discount_amount: 0,
        attachment_url: null,
        attachment_name: null,
        account_id: defaultAccountId || null,
        payment_method: null,
      });
      setAttachments([]);
      setRemovedAttachmentIds([]);
      setInstallments(1);
      setIsRecurring(false);
      setRecurringMonths(12);
      setInstallmentMode("repetir");
      setAmountDisplay("");
      setInterestDisplay("");
      setDiscountDisplay("");
    }
  }, [editRecord, open, existingAttachments]);

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (e.target) e.target.value = "";

    if (attachments.length >= 10) {
      toast.error("Máximo de 10 anexos por registro.");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG, WEBP ou PDF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("financial-attachments")
      .upload(path, file, { upsert: false });

    if (error) {
      toast.error("Erro ao enviar arquivo.");
      setUploading(false);
      return;
    }

    const originalName = file.name.replace(/\.[^.]+$/, "");
    const newAtt: FinanceAttachment = {
      file_url: path,
      file_name: file.name,
      display_name: originalName,
      file_type: file.type,
      file_size: file.size,
      position: attachments.length,
      isNew: true,
    };
    setAttachments(prev => [...prev, newAtt]);
    toast.success("Arquivo anexado!");
    setUploading(false);
  };

  const removeAttachmentAt = async (index: number) => {
    const att = attachments[index];
    // Remove from storage if it's a new (unsaved) attachment
    if (att.isNew) {
      await supabase.storage.from("financial-attachments").remove([att.file_url]);
    } else if (att.id) {
      // Mark for deletion on save
      setRemovedAttachmentIds(prev => [...prev, att.id!]);
    }
    setAttachments(prev => prev.filter((_, i) => i !== index));
    toast.success("Anexo removido.");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return;
    if (form.amount <= 0) return;
    const isEditMode = !!editRecord?.id;
    const count = isRecurring ? undefined : (installments > 1 ? installments : undefined);
    onSave(form, isEditMode ? undefined : count, isRecurring, installmentMode, attachments);
  };

  const setField = <K extends keyof FinanceRecord>(key: K, value: FinanceRecord[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const isEditing = !!editRecord?.id;
  const isViewOnly = readOnly;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={e => {
        // Fecha apenas se o clique iniciou diretamente no backdrop (não em filhos/portals)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display font-bold text-foreground flex items-center gap-2">
            {isViewOnly && <Eye className="w-4 h-4 text-primary" />}
            {isViewOnly ? "Detalhes do Registro" : isEditing ? "Editar Registro" : "Novo Registro"}
          </h3>
          <button onClick={onClose} title="Fechar" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <fieldset disabled={isViewOnly} className="space-y-4 disabled:opacity-75">
          {/* Tipo */}
          <div className="flex gap-2">
            {(["receita", "despesa"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField("type", t)}
                  title={t === "receita" ? "Definir como receita" : "Definir como despesa"}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    form.type === t
                      ? t === "receita"
                        ? "bg-green-500 text-white shadow-md"
                        : "bg-destructive text-destructive-foreground shadow-md"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
              >
                {t === "receita" ? "📈 Receita" : "📉 Despesa"}
              </button>
            ))}
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> Descrição *
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => setField("description", e.target.value)}
              placeholder="Ex: Conta de luz"
              maxLength={200}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Valor (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={e => {
                  const display = handleCurrencyInput(e.target.value);
                  setAmountDisplay(display);
                  setField("amount", parseCurrency(display));
                }}
                placeholder="0,00"
                required
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
          </div>

          {/* Juros e Desconto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3 h-3 text-destructive" /> Juros (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={interestDisplay}
                onChange={e => {
                  const display = handleCurrencyInput(e.target.value);
                  setInterestDisplay(display);
                  setField("interest_amount", parseCurrency(display));
                }}
                placeholder="0,00"
                className="w-full px-2 py-2.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3 h-3 text-green-500" /> Desconto (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={discountDisplay}
                onChange={e => {
                  const display = handleCurrencyInput(e.target.value);
                  setDiscountDisplay(display);
                  setField("discount_amount", parseCurrency(display));
                }}
                placeholder="0,00"
                className="w-full px-2 py-2.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
          </div>

          {/* Valor final calculado */}
          {(form.interest_amount || 0) > 0 || (form.discount_amount || 0) > 0 ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-xs font-semibold text-muted-foreground">Valor Final:</span>
              <span className={`text-sm font-bold ${form.type === "receita" ? "text-green-500" : "text-destructive"}`}>
                {finalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          ) : null}

          {/* Recorrente toggle (edição) */}
          {isEditing && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Repeat className="w-3 h-3" /> Recorrência
              </label>
              <button
                type="button"
                onClick={() => setIsRecurring(!isRecurring)}
                title="Alternar lançamento recorrente mensal"
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isRecurring ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Repeat className="w-3.5 h-3.5" />
                Recorrente (mensal)
              </button>
              {isRecurring && (
                <p className="text-[10px] text-muted-foreground">
                  🔄 O próximo lançamento será gerado automaticamente no início de cada mês.
                </p>
              )}
            </div>
          )}

          {/* Parcelamento (só ao criar) */}
          {!isEditing && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3" /> Parcelas / Recorrência
              </label>

              {/* Toggle recorrente */}
              <button
                type="button"
                onClick={() => { setIsRecurring(!isRecurring); if (!isRecurring) setInstallments(1); }}
                title="Alternar lançamento recorrente mensal"
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isRecurring ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Repeat className="w-3.5 h-3.5" />
                Recorrente (mensal)
              </button>

              {isRecurring ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    🔄 Será criado 1 lançamento. O próximo será gerado automaticamente no início de cada mês, sem prazo para encerrar.
                  </p>
                  {!form.due_date && (
                    <p className="text-[10px] text-amber-500 font-medium">
                      ⚠️ Defina a data de vencimento do 1º lançamento abaixo
                    </p>
                  )}
                </div>
              ) : (
              <>
                {/* Modo: repetir ou dividir */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setInstallmentMode("repetir")}
                    title="Repetir o valor em cada parcela"
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${installmentMode === "repetir" ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-border"}`}
                  >
                    🔁 Repetir valor
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstallmentMode("dividir")}
                    title="Dividir o valor total entre as parcelas"
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${installmentMode === "dividir" ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-border"}`}
                  >
                    ➗ Dividir valor
                  </button>
                </div>

                <select
                  value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value={1}>À vista (1x)</option>
                  {Array.from({ length: 23 }, (_, i) => i + 2).map(n => {
                    const displayVal = installmentMode === "dividir"
                      ? (finalAmount / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : finalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    return (
                      <option key={n} value={n}>
                        {n}x de {displayVal}
                      </option>
                    );
                  })}
                </select>
                {installments > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    {installmentMode === "dividir"
                      ? `💡 Total ${finalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} dividido em ${installments} parcelas`
                      : `🔁 ${installments} parcelas de ${finalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} = Total ${(finalAmount * installments).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                    }
                    {form.due_date ? ` a partir de ${form.due_date}` : ""}
                  </p>
                )}
                {installments > 1 && !form.due_date && (
                  <p className="text-[10px] text-amber-500 font-medium">
                    ⚠️ Defina a data de vencimento da 1ª parcela abaixo
                  </p>
                )}
              </>
              )}
            </div>
          )}

          {/* Parcela info ao editar */}
          {isEditing && editRecord?.installment_total && editRecord.installment_total > 1 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                Parcela {editRecord.installment_number}/{editRecord.installment_total}
              </span>
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 h-4">
                <CalendarDays className="w-3 h-3 shrink-0" /> Entrada
              </label>
              <DateInput
                value={form.entry_date}
                onChange={v => setField("entry_date", v || format(new Date(), "yyyy-MM-dd"))}
                required
                size="sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 h-4">
                <CalendarDays className="w-3 h-3 shrink-0" /> Vencimento
              </label>
              <DateInput
                value={form.due_date}
                onChange={v => setField("due_date", v)}
                size="sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 h-4">
                <CalendarDays className="w-3 h-3 shrink-0" /> Pagamento
              </label>
              <DateInput
                value={form.payment_date}
                onChange={v => {
                  setField("payment_date", v);
                  if (v) setField("status", "pago");
                }}
                size="sm"
              />
            </div>
          </div>

          {/* Favorecido + Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Favorecido
              </label>
              <input
                type="text"
                value={form.payee}
                onChange={e => {
                  setField("payee", e.target.value);
                  setShowPayeeSuggestions(true);
                }}
                onFocus={() => setShowPayeeSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPayeeSuggestions(false), 200)}
                placeholder="Nome do favorecido"
                maxLength={100}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              />
              {showPayeeSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                  {filteredPayees.map(p => (
                    <div key={p} className="flex items-center hover:bg-muted transition-colors group">
                      <button
                        type="button"
                        onMouseDown={() => {
                          setField("payee", p);
                          setShowPayeeSuggestions(false);
                        }}
                        className="flex-1 text-left px-3 py-1.5 text-sm text-foreground"
                      >
                        {p}
                      </button>
                      {onRemovePayee && (
                        <button
                          type="button"
                          onMouseDown={() => {
                            onRemovePayee(p);
                            toast.success(`"${p}" removido dos favorecidos`);
                          }}
                          className="px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      )}
                    </div>
                  ))}
                  {form.payee.trim() && !existingPayees.some(p => p.toLowerCase() === form.payee.trim().toLowerCase()) && onAddPayee && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setNewContactName(form.payee.trim());
                        setNewContactPhone("");
                        setShowNewContactForm(true);
                        setShowPayeeSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-primary font-semibold hover:bg-muted transition-colors flex items-center gap-1.5 border-t border-border"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar "{form.payee.trim()}"
                    </button>
                  )}
                </div>
              )}

              {/* Mini formulário de novo contato */}
              {showNewContactForm && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">Novo Contato</span>
                    <button type="button" onClick={() => setShowNewContactForm(false)} className="p-0.5 rounded hover:bg-muted">
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    placeholder="Nome"
                    maxLength={100}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      {newContactPhone.replace(/\D/g, "").length >= 11 ? <Smartphone className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                      {newContactPhone.replace(/\D/g, "").length >= 11 ? "Celular" : "Telefone"} *
                    </label>
                    <input
                      type="tel"
                      value={newContactPhone}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                        let masked = digits;
                        if (digits.length <= 2 && digits.length > 0) {
                          masked = `(${digits}`;
                        } else if (digits.length <= 6) {
                          masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                        } else if (digits.length <= 10) {
                          masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
                        } else {
                          masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                        }
                        setNewContactPhone(masked);
                      }}
                      placeholder="(00) 0000-0000 ou (00) 00000-0000"
                      maxLength={16}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                    {newContactPhone.length > 0 && ![10, 11].includes(newContactPhone.replace(/\D/g, "").length) && (
                      <p className="text-[10px] text-destructive font-medium">Mínimo 10 dígitos (fixo) ou 11 (celular)</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!newContactName.trim() || ![10, 11].includes(newContactPhone.replace(/\D/g, "").length)}
                    onClick={() => {
                      const nameExists = existingPayees.some(p => p.toLowerCase() === newContactName.trim().toLowerCase());
                      const phoneDigits = newContactPhone.replace(/\D/g, "");
                      const phoneExists = existingPhones.some(p => p.replace(/\D/g, "") === phoneDigits);
                      if (nameExists) {
                        toast.error(`Já existe um contato com o nome "${newContactName.trim()}"`);
                        return;
                      }
                      if (phoneExists) {
                        toast.error("Já existe um contato com este telefone");
                        return;
                      }
                      onAddPayee!(newContactName.trim(), newContactPhone.trim());
                      setField("payee", newContactName.trim());
                      setShowNewContactForm(false);
                      toast.success(`"${newContactName.trim()}" adicionado aos contatos`);
                    }}
                    className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Salvar Contato
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3" /> Categoria
              </label>
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={e => setField("category", e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddCategory(!showAddCategory)}
                  className="px-2.5 py-2 rounded-lg bg-muted text-foreground hover:bg-accent transition-colors"
                  title="Adicionar categoria personalizada"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {showAddCategory && (
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
                    placeholder="Nova categoria..."
                    maxLength={50}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={!newCategory.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    title="Salvar categoria"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {customCategories.length > 0 && showAddCategory && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Personalizadas:</p>
                  {customCategories.map(c => (
                    <div key={c} className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 text-xs">
                      <span className="text-foreground">{c}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(c)}
                        className="text-destructive hover:text-destructive/80 transition-colors"
                        title={`Remover "${c}"`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Conta */}
          {accounts.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                💳 Conta
              </label>
              <select
                value={form.account_id || ""}
                onChange={e => setField("account_id", e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="">Sem conta</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_type === "banco" ? "🏦" : "🪙"} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Forma de Pagamento */}
          <div className="space-y-1 relative">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3 h-3" /> Forma de Pagamento
            </label>
            <div className="flex gap-2">
              <select
                value={form.payment_method || ""}
                onChange={e => setField("payment_method", e.target.value || null)}
                className="flex-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="">Não informada</option>
                {allPaymentMethods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddPaymentMethod(!showAddPaymentMethod)}
                className="px-2.5 py-2 rounded-lg bg-muted text-foreground hover:bg-accent transition-colors"
                title="Adicionar forma de pagamento personalizada"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {showAddPaymentMethod && (
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={newPaymentMethod}
                  onChange={e => setNewPaymentMethod(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddPaymentMethod(); } }}
                  placeholder="Nova forma..."
                  maxLength={50}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                />
                <button
                  type="button"
                  onClick={handleAddPaymentMethod}
                  disabled={!newPaymentMethod.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  title="Salvar forma de pagamento"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Custom methods with delete option */}
            {customPaymentMethods.length > 0 && showAddPaymentMethod && (
              <div className="mt-1 space-y-0.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Personalizadas:</p>
                {customPaymentMethods.map(m => (
                  <div key={m} className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 text-xs">
                    <span className="text-foreground">{m}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePaymentMethod(m)}
                      className="text-destructive hover:text-destructive/80 transition-colors"
                      title={`Remover "${m}"`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Referente */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Referente</label>
            <input
              type="text"
              value={form.referente}
              onChange={e => setField("referente", e.target.value)}
              placeholder="Referência (mês, contrato, etc.)"
              maxLength={100}
              className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(["pendente", "pago", "vencido", "cancelado"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setField("status", s)}
                  title={`Definir status como ${s}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 min-w-[70px] ${
                    form.status === s
                      ? s === "pago" ? "bg-green-500 text-white"
                        : s === "vencido" ? "bg-destructive text-destructive-foreground"
                        : s === "cancelado" ? "bg-muted-foreground text-background"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Anexos */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Paperclip className="w-3 h-3" /> Anexos (JPG, PNG, PDF) — {attachments.length}/10
            </label>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, idx) => (
                  <div key={att.id || att.file_url} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                    <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                    <input
                      type="text"
                      value={att.display_name || att.file_name.replace(/\.[^.]+$/, "")}
                      onChange={e => {
                        setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, display_name: e.target.value } : a));
                      }}
                      placeholder="Nome do anexo"
                      className="text-xs text-foreground bg-transparent border-none outline-none flex-1 min-w-0"
                      disabled={isViewOnly}
                    />
                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={() => removeAttachmentAt(idx)}
                        title="Remover anexo"
                        className="text-destructive hover:text-destructive/80 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {attachments.length < 10 && !isViewOnly && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !userId}
                title="Anexar documento (JPG, PNG, PDF)"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50 border border-dashed border-border"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "Enviando..." : attachments.length > 0 ? "Adicionar anexo" : "Anexar documento"}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setField("notes", e.target.value)}
              placeholder="Anotações adicionais..."
              maxLength={500}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
            />
          </div>

          </fieldset>

          {/* View mode actions */}
          {isViewOnly && (
            <div className="flex items-stretch gap-0 rounded-lg border border-border overflow-hidden">
              {/* SISTEMA */}
              {onEdit && editRecord && (
                <>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[9px] font-bold text-app-comm text-center uppercase tracking-wide pt-1.5">Sistema</span>
                    <button
                      type="button"
                      onClick={() => onEdit(editRecord)}
                      title="Editar este registro"
                      className="flex-1 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-app-comm font-semibold text-sm hover:bg-app-comm/10 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Editar
                    </button>
                  </div>
                  <div className="w-px bg-border" />
                </>
              )}
              {/* WHATSAPP */}
              <div className="flex-1 flex flex-col items-center">
                <span className="text-[9px] font-bold text-whatsapp text-center uppercase tracking-wide pt-1.5">WhatsApp</span>
                <button
                  type="button"
                  onClick={() => {
                    const statusLabel = form.status.charAt(0).toUpperCase() + form.status.slice(1);
                    const typeLabel = form.type === "receita" ? "Receita" : "Despesa";
                    const effective = form.amount + (form.interest_amount || 0) - (form.discount_amount || 0);
                    const fmtVal = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : null;

                    let text = `📊 *${typeLabel}* — ${form.description}\n`;
                    text += `💰 Valor: ${fmtVal(form.amount)}\n`;
                    if ((form.interest_amount || 0) > 0) text += `➕ Juros: ${fmtVal(form.interest_amount || 0)}\n`;
                    if ((form.discount_amount || 0) > 0) text += `➖ Desconto: ${fmtVal(form.discount_amount || 0)}\n`;
                    if ((form.interest_amount || 0) > 0 || (form.discount_amount || 0) > 0) text += `🏷️ Valor Final: ${fmtVal(effective)}\n`;
                    text += `📌 Status: ${statusLabel}\n`;
                    if (form.payee) text += `👤 Favorecido: ${form.payee}\n`;
                    if (form.category && form.category !== "Geral") text += `🏷️ Categoria: ${form.category}\n`;
                    if (form.due_date) text += `📅 Vencimento: ${fmtDate(form.due_date)}\n`;
                    if (form.payment_date) text += `✅ Pagamento: ${fmtDate(form.payment_date)}\n`;
                    if (form.payment_method) text += `💳 Forma: ${form.payment_method}\n`;
                    if (form.referente) text += `📝 Referente: ${form.referente}\n`;
                    if (form.installment_total && form.installment_total > 1) text += `📦 Parcela: ${form.installment_number}/${form.installment_total}\n`;
                    if (form.notes) text += `\n📋 Obs: ${form.notes}\n`;
                    text += `\n_Enviado via CidadeX-BR_`;

                    // Buscar telefone do favorecido nos contatos manuais
                    let phoneParam = "";
                    if (form.payee) {
                      const contact = manualContacts.find(c => c.name === form.payee);
                      const phone = contact?.phone?.replace(/\D/g, "");
                      if (phone) {
                        phoneParam = phone.length <= 11 ? `55${phone}` : phone;
                      }
                    }
                    const url = phoneParam
                      ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
                      : `https://wa.me/?text=${encodeURIComponent(text)}`;
                    const w = window.open(url, "_blank");
                    if (!w) window.location.href = url;
                  }}
                  title="Compartilhar detalhes do registro via WhatsApp"
                  className="flex-1 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-whatsapp font-semibold text-sm hover:bg-whatsapp/10 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar
                </button>
              </div>
            </div>
          )}

          {/* Submit */}
          {!isViewOnly && (
            <button
              type="submit"
              disabled={saving || uploading || !form.description.trim() || form.amount <= 0}
              title={isEditing ? "Salvar alterações" : "Salvar registro"}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : isRecurring ? "Criar Recorrente" : installments > 1 ? `Criar ${installments} Parcelas` : "Adicionar"}
            </button>
          )}
        </form>
      </div>
    </div>,
    document.body
  );
};

export default FinanceFormModal;

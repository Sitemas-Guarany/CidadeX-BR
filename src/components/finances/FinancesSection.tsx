import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRetry, isLockManagerError } from "@/lib/supabaseRetry";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, TrendingUp, TrendingDown, BarChart3,
  Edit, Trash2, Copy, Loader2, DollarSign, Calendar, User, FileText,
  ChevronDown, ChevronUp, AlertTriangle, Layers, Paperclip, ExternalLink, Send, Repeat, CircleDollarSign, X, Check, Undo2, Wallet, Tag, Upload
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import DateInput from "@/components/common/DateInput";
import { cn } from "@/lib/utils";
import { format, addMonths, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

import FinanceFormModal, { type FinanceRecord, type FinanceAttachment } from "./FinanceFormModal";
import FinanceReports from "./FinanceReports";
import AccountsManager, { type FinancialAccount } from "./AccountsManager";

type DBRecord = FinanceRecord & { id: string; user_id: string; created_at: string; updated_at: string };

const statusConfig: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-primary/10 text-primary" },
  pago: { label: "Pago", cls: "bg-green-500/10 text-green-600" },
  vencido: { label: "Vencido", cls: "bg-destructive/10 text-destructive" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};
const parseCurrencyLocal = (raw: string): number => {
  const cleaned = raw.replace(/[^\d,]/g, "");
  if (!cleaned) return 0;
  return parseFloat(cleaned.replace(",", ".")) || 0;
};

const handleCurrencyInputLocal = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const FinancesSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<DBRecord[]>([]);
  const [allAttachments, setAllAttachments] = useState<Record<string, FinanceAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FinanceRecord | null>(null);
  const [viewRecord, setViewRecord] = useState<FinanceRecord | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"todos" | "receita" | "despesa">("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [sortField, setSortField] = useState<"entry_date" | "due_date" | "payment_date" | "amount" | "installment" | "description" | "status">("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [periodFilter, setPeriodFilter] = useState<"mes" | "todos" | "periodo">("mes");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [manualContacts, setManualContacts] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<DBRecord | null>(null);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentDateStr, setPaymentDateStr] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentDateOpen, setPaymentDateOpen] = useState(false);
  const [partialAmountDisplay, setPartialAmountDisplay] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [paymentCustomMethods, setPaymentCustomMethods] = useState<string[]>([]);
  const [paymentCategory, setPaymentCategory] = useState<string | null>(null);
  const [paymentAttachmentUrl, setPaymentAttachmentUrl] = useState<string | null>(null);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const paymentFileRef = useRef<HTMLInputElement>(null);
  const [paymentCategories, setPaymentCategories] = useState<string[]>([]);
  const [paymentCustomCategories, setPaymentCustomCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [showAccounts, setShowAccounts] = useState(false);
  const [filterAccount, setFilterAccount] = useState<string>("todos");
  const [groupEditConfirm, setGroupEditConfirm] = useState<{
    recordId: string;
    groupId: string;
    payload: any;
    editRecord: FinanceRecord;
    newRecord: FinanceRecord;
  } | null>(null);
  const fetchManualContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("manual_contacts")
      .select("id, name, phone")
      .eq("user_id", user.id)
      .order("name");
    setManualContacts((data || []) as any);
  }, [user]);

  const fetchAccounts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("financial_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("name");
    setAccounts((data || []) as unknown as FinancialAccount[]);
  }, [user]);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let allData: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const result = await supabaseRetry(
          async () => supabase
            .from("financial_records")
            .select("*")
            .eq("user_id", user.id)
            .order("entry_date", { ascending: false })
            .range(offset, offset + batchSize - 1),
          2, 1500, "financial_records"
        );
        const { data, error: batchError } = result as any;
        if (batchError) throw batchError;
        if (data && data.length > 0) {
          allData = allData.concat(data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      setRecords(allData as unknown as DBRecord[]);
    } catch (err) {
      console.error("Error fetching financial records:", err);
    }
    setLoading(false);
  }, [user]);

  const fetchAttachments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("financial_record_attachments")
      .select("*")
      .eq("user_id", user.id)
      .order("position");
    const grouped: Record<string, FinanceAttachment[]> = {};
    (data || []).forEach((att: any) => {
      if (!grouped[att.record_id]) grouped[att.record_id] = [];
      grouped[att.record_id].push(att);
    });
    setAllAttachments(grouped);
  }, [user]);

  const fetchPaymentMethods = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_custom_options")
      .select("value")
      .eq("user_id", user.id)
      .eq("option_type", "payment_method")
      .order("value");
    setPaymentCustomMethods((data || []).map(d => d.value));
  }, [user]);

  const fetchPaymentCategories = useCallback(async () => {
    if (!user) return;
    const [customRes, inactiveRes, renameRes] = await Promise.all([
      supabase.from("user_custom_options").select("value").eq("user_id", user.id).eq("option_type", "finance_category").order("value"),
      supabase.from("user_custom_options").select("value").eq("user_id", user.id).eq("option_type", "cat_inactive"),
      supabase.from("user_custom_options").select("value").eq("user_id", user.id).eq("option_type", "cat_rename"),
    ]);
    setPaymentCustomCategories((customRes.data || []).map(d => d.value));
    const inactive = new Set((inactiveRes.data || []).map(d => d.value));
    const rMap: Record<string, string> = {};
    (renameRes.data || []).forEach(d => {
      try { const p = JSON.parse(d.value); if (p.from && p.to) rMap[p.from] = p.to; } catch {}
    });
    const DEFAULT_CATS = ["Geral","Alimentação","Transporte","Moradia","Saúde","Educação","Lazer","Vestuário","Serviços","Impostos","Salário","Freelance","Investimentos","Vendas","Aluguel","Outros"];
    const defaults = DEFAULT_CATS.filter(c => !inactive.has(c)).map(c => rMap[c] || c);
    const custom = (customRes.data || []).map(d => d.value).filter(c => !DEFAULT_CATS.includes(c) && !inactive.has(c));
    setPaymentCategories([...defaults, ...custom].sort((a, b) => a.localeCompare(b, "pt-BR")));
  }, [user]);

  // Auto-generate recurring records on load (once per session)
  const recurringGenerated = useRef(false);
  useEffect(() => {
    const run = async () => {
      if (!user || recurringGenerated.current) {
        fetchRecords();
        return;
      }
      recurringGenerated.current = true;
      try {
        await supabase.functions.invoke("generate-recurring");
      } catch (e) {
        console.warn("generate-recurring call failed:", e);
      }
      fetchRecords();
      fetchAttachments();
    };
    run();
    fetchManualContacts();
    fetchAccounts();
    fetchPaymentMethods();
    fetchPaymentCategories();
  }, [fetchRecords, fetchAttachments, fetchManualContacts, fetchAccounts, fetchPaymentMethods, fetchPaymentCategories, user]);

  const handleSave = async (record: FinanceRecord, installments?: number, isRecurring?: boolean, installmentMode?: "dividir" | "repetir", modalAttachments?: FinanceAttachment[]) => {
    if (!user) return;
    setSaving(true);
    const accountId = record.account_id || null;

    if (isRecurring && (!installments || installments <= 1) && !editRecord?.id) {
      // Recorrente: cria registros retroativos até o mês atual
      const groupId = crypto.randomUUID();
      const baseDate = record.due_date ? new Date(record.due_date + "T12:00:00") : new Date();
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Calcular quantas parcelas gerar (do mês base até 6 meses no futuro)
      const parcelas = [];
      let installmentNum = 1;
      let nextDate = new Date(baseDate);
      const futureLimit = addMonths(now, 6);

      while (
        nextDate <= futureLimit
      ) {
        const dueStr = format(nextDate, "yyyy-MM-dd");
        const isPast = nextDate.getFullYear() < currentYear ||
          (nextDate.getFullYear() === currentYear && nextDate.getMonth() < currentMonth) ||
          (nextDate.getFullYear() === currentYear && nextDate.getMonth() === currentMonth && nextDate.getDate() < now.getDate());

        parcelas.push({
          user_id: user.id,
          type: record.type,
          description: record.description.trim(),
          amount: record.amount,
          entry_date: dueStr,
          due_date: dueStr,
          payment_date: installmentNum === 1 ? (record.payment_date || null) : null,
          payee: record.payee.trim() || null,
          category: record.category,
          referente: record.referente.trim() || null,
          status: installmentNum === 1 ? record.status : (isPast ? "vencido" : "pendente"),
          notes: installmentNum === 1 ? (record.notes.trim() || null) : "Gerado automaticamente (recorrência mensal)",
          installment_total: null,
          installment_number: installmentNum,
          installment_group_id: groupId,
          interest_amount: installmentNum === 1 ? (record.interest_amount || 0) : 0,
          discount_amount: installmentNum === 1 ? (record.discount_amount || 0) : 0,
          attachment_url: installmentNum === 1 ? (record.attachment_url || null) : null,
          is_recurring: true,
          recurring_active: true,
          account_id: accountId,
          payment_method: record.payment_method || null,
        });

        installmentNum++;
        nextDate = addMonths(baseDate, installmentNum - 1);
      }

      const { error } = await supabase.from("financial_records").insert(parcelas);
      if (error) {
        toast({ title: "Erro", description: "Não foi possível criar recorrência.", variant: "destructive" });
      } else {
        const msg = parcelas.length > 1
          ? `${parcelas.length} parcelas criadas (retroativas + atual + próximos 6 meses).`
          : "O próximo lançamento será gerado automaticamente no início do mês.";
        toast({ title: "🔄 Recorrência criada!", description: msg });
      }
    } else if (installments && installments > 1) {
      // Gerar parcelas — usar valor base (sem juros/desconto) para dividir
      const groupId = crypto.randomUUID();
      const mode = installmentMode || "dividir";
      const baseAmount = record.amount;
      const installmentAmount = mode === "dividir"
        ? Math.round((baseAmount / installments) * 100) / 100
        : baseAmount;
      const baseDate = record.due_date ? new Date(record.due_date + "T12:00:00") : new Date();

      const parcelas = Array.from({ length: installments }, (_, i) => {
        const dueDate = addMonths(baseDate, i);
        return {
          user_id: user.id,
          type: record.type,
          description: `${record.description.trim()} (${i + 1}/${installments})`,
          amount: installmentAmount,
          entry_date: record.entry_date,
          due_date: format(dueDate, "yyyy-MM-dd"),
          payment_date: null,
          payee: record.payee.trim() || null,
          category: record.category,
          referente: record.referente.trim() || null,
          status: "pendente" as const,
          notes: record.notes.trim() || null,
          installment_total: installments,
          installment_number: i + 1,
          installment_group_id: groupId,
           interest_amount: i === 0 ? (record.interest_amount || 0) : 0,
           discount_amount: i === 0 ? (record.discount_amount || 0) : 0,
           attachment_url: i === 0 ? (record.attachment_url || null) : null,
           is_recurring: false,
           account_id: accountId,
           payment_method: record.payment_method || null,
        };
      });

      const { error } = await supabase.from("financial_records").insert(parcelas);
      if (error) {
        toast({ title: "Erro", description: "Não foi possível criar parcelas.", variant: "destructive" });
      } else {
        toast({ title: `✅ ${installments} parcelas criadas!` });
      }
    } else if (editRecord?.id) {
      // When enabling recurring on a record that has no group, assign one
      const needsGroupId = isRecurring && !editRecord.installment_group_id;
      const groupIdForPayload = needsGroupId ? editRecord.id : undefined;

      const payload: any = {
        user_id: user.id,
        type: record.type,
        description: record.description.trim(),
        amount: record.amount,
        entry_date: record.entry_date,
        due_date: record.due_date || null,
        payment_date: record.payment_date || null,
        payee: record.payee.trim() || null,
        category: record.category,
        referente: record.referente.trim() || null,
        status: record.status,
        notes: record.notes.trim() || null,
        interest_amount: record.interest_amount || 0,
        discount_amount: record.discount_amount || 0,
        attachment_url: record.attachment_url || null,
        attachment_name: (record as any).attachment_name || null,
        account_id: accountId,
        payment_method: record.payment_method || null,
        is_recurring: isRecurring || false,
        recurring_active: isRecurring ? true : false,
      };
      if (needsGroupId) {
        payload.installment_group_id = groupIdForPayload;
      }

      const groupId = editRecord.installment_group_id;

      // If record belongs to an installment group with other members, ask "this or all"
      if (groupId) {
        const othersInGroup = records.filter(r => r.installment_group_id === groupId && r.id !== editRecord.id);
        if (othersInGroup.length > 0) {
          setGroupEditConfirm({ recordId: editRecord.id!, groupId, payload, editRecord, newRecord: record });
          setSaving(false);
          setModalOpen(false);
          setEditRecord(null);
          return;
        }
      }

      const { error } = await supabase
        .from("financial_records")
        .update(payload)
        .eq("id", editRecord.id)
        .eq("user_id", user.id);
      if (error) {
        toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
      } else {
        toast({ title: "✅ Registro atualizado!" });
      }
    } else {
      const payload = {
        user_id: user.id,
        type: record.type,
        description: record.description.trim(),
        amount: record.amount,
        entry_date: record.entry_date,
        due_date: record.due_date || null,
        payment_date: record.payment_date || null,
        payee: record.payee.trim() || null,
        category: record.category,
        referente: record.referente.trim() || null,
        status: record.status,
        notes: record.notes.trim() || null,
        interest_amount: record.interest_amount || 0,
        discount_amount: record.discount_amount || 0,
        attachment_url: record.attachment_url || null,
        attachment_name: (record as any).attachment_name || null,
        account_id: accountId,
        payment_method: record.payment_method || null,
      };

      const { error } = await supabase.from("financial_records").insert(payload);
      if (error) {
        toast({ title: "Erro", description: "Não foi possível adicionar.", variant: "destructive" });
      } else {
        toast({ title: "✅ Registro adicionado!" });
      }
    }

    // Save attachments for the record
    if (modalAttachments && editRecord?.id) {
      await saveAttachmentsForRecord(editRecord.id, modalAttachments);
    } else if (modalAttachments && modalAttachments.length > 0 && !editRecord?.id) {
      // For new single records, we need the ID. Fetch the most recently created record.
      const { data: latest } = await supabase
        .from("financial_records")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latest?.id) {
        await saveAttachmentsForRecord(latest.id, modalAttachments);
      }
    }

    setSaving(false);
    setModalOpen(false);
    setEditRecord(null);
    fetchRecords();
    fetchAttachments();
  };

  const saveAttachmentsForRecord = async (recordId: string, atts: FinanceAttachment[]) => {
    if (!user) return;
    // Delete removed attachments
    const existingIds = atts.filter(a => a.id && !a.isNew).map(a => a.id!);
    const currentAtts = allAttachments[recordId] || [];
    const toDelete = currentAtts.filter(a => a.id && !existingIds.includes(a.id));
    for (const att of toDelete) {
      await supabase.storage.from("financial-attachments").remove([att.file_url]);
      await supabase.from("financial_record_attachments").delete().eq("id", att.id!);
    }
    // Insert new attachments
    const newAtts = atts.filter(a => a.isNew);
    if (newAtts.length > 0) {
      await supabase.from("financial_record_attachments").insert(
        newAtts.map((a, i) => ({
          record_id: recordId,
          user_id: user.id,
          file_url: a.file_url,
          file_name: a.file_name,
          display_name: a.display_name || null,
          file_type: a.file_type,
          file_size: a.file_size,
          position: existingIds.length + i,
        }))
      );
    }
    // Update display_name for existing attachments
    const existingAtts = atts.filter(a => a.id && !a.isNew);
    for (const att of existingAtts) {
      await supabase.from("financial_record_attachments")
        .update({ display_name: att.display_name || null, position: atts.indexOf(att) })
        .eq("id", att.id!);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("financial_records").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível excluir.", variant: "destructive" });
    } else {
      toast({ title: "🗑️ Registro excluído!" });
      setRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleStopRecurring = async (groupId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("financial_records")
      .update({ recurring_active: false })
      .eq("installment_group_id", groupId)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível encerrar a recorrência.", variant: "destructive" });
    } else {
      toast({ title: "⏹️ Recorrência encerrada!", description: "Novos lançamentos não serão mais gerados automaticamente." });
      fetchRecords();
    }
  };

  const handleReactivateRecurring = async (groupId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("financial_records")
      .update({ recurring_active: true })
      .eq("installment_group_id", groupId)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível reativar a recorrência.", variant: "destructive" });
    } else {
      toast({ title: "🔄 Recorrência reativada!", description: "Novos lançamentos serão gerados automaticamente." });
      fetchRecords();
    }
  };

  const handleGroupEditConfirm = async (updateAll: boolean) => {
    if (!groupEditConfirm || !user) return;
    const { recordId, groupId, payload, editRecord: origRecord, newRecord } = groupEditConfirm;
    setSaving(true);

    // Always update the current record
    const { error } = await supabase
      .from("financial_records")
      .update(payload)
      .eq("id", recordId)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } else {
      if (updateAll) {
        // Apply common fields to all other records in the group
        const othersInGroup = records.filter(r => r.installment_group_id === groupId && r.id !== recordId);
        let groupError = false;

        // Extract new base description
        const newBase = newRecord.description.trim().replace(/\s*\(\d+\/\d+(?:\.\d+)?\)\s*$/, "").trim();
        const origBase = (origRecord.description || "").replace(/\s*\(\d+\/\d+(?:\.\d+)?\)\s*$/, "").trim();
        const descChanged = origBase !== newBase;

        for (const r of othersInGroup) {
          const updatePayload: any = {
            type: newRecord.type,
            category: newRecord.category,
            payee: newRecord.payee?.trim() || null,
            referente: newRecord.referente?.trim() || null,
            account_id: newRecord.account_id || null,
            payment_method: newRecord.payment_method || null,
            is_recurring: payload.is_recurring,
            recurring_active: payload.recurring_active,
          };

          // Update description preserving installment suffix
          if (descChanged) {
            const suffixMatch = (r.description || "").match(/\s*(\(\d+\/\d+(?:\.\d+)?\))\s*$/);
            const suffix = suffixMatch ? ` ${suffixMatch[1]}` : "";
            updatePayload.description = `${newBase}${suffix}`;
          }

          const { error: e } = await supabase
            .from("financial_records")
            .update(updatePayload)
            .eq("id", r.id)
            .eq("user_id", user.id);
          if (e) groupError = true;
        }

        if (groupError) {
          toast({ title: "Erro", description: "Registro salvo, mas não foi possível atualizar todas as parcelas.", variant: "destructive" });
        } else {
          toast({ title: "✅ Registro e todas as parcelas atualizados!" });
        }
      } else {
        toast({ title: "✅ Registro atualizado!" });
      }
    }

    setGroupEditConfirm(null);
    setSaving(false);
    fetchRecords();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("financial_records")
      .delete()
      .eq("installment_group_id", groupId)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível excluir as parcelas.", variant: "destructive" });
    } else {
      toast({ title: "🗑️ Todas as parcelas excluídas!" });
      setRecords(prev => prev.filter(r => r.installment_group_id !== groupId));
    }
  };

  const handleRegisterPayment = async () => {
    if (!user || !paymentTarget) return;
    const dateStr = paymentDateStr;
    const totalAmount = paymentTarget.amount + (paymentTarget.interest_amount || 0) - (paymentTarget.discount_amount || 0);
    const paidAmount = parseCurrencyLocal(partialAmountDisplay) || totalAmount;
    const remainder = Math.round((totalAmount - paidAmount) * 100) / 100;

    if (paidAmount <= 0) {
      toast({ title: "⚠️ Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }

    if (paidAmount > totalAmount + 0.01) {
      toast({ title: "⚠️ Valor excede o total", description: "O valor pago não pode ser maior que o total.", variant: "destructive" });
      return;
    }

    // Paga o registro atual (ajustando valor se parcial)
    const updatePayload: any = { payment_date: dateStr, status: "pago", account_id: paymentAccountId || paymentTarget.account_id || null, payment_method: paymentMethod || (paymentTarget as any).payment_method || null, category: paymentCategory || paymentTarget.category, attachment_url: paymentAttachmentUrl || paymentTarget.attachment_url || null };
    if (remainder > 0.009) {
      // Pagamento parcial: ajustar o valor do registro atual para o que foi pago
      updatePayload.amount = paidAmount;
      updatePayload.interest_amount = 0;
      updatePayload.discount_amount = 0;
    }

    const { error } = await supabase
      .from("financial_records")
      .update(updatePayload)
      .eq("id", paymentTarget.id)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível registrar o pagamento.", variant: "destructive" });
      setPaymentTarget(null);
      return;
    }

    // Se pagamento parcial, criar registro da diferença referenciando a parcela original
    if (remainder > 0.009) {
      // Gerar sufixo referenciando a parcela original: ex (1/7.1)
      const origNum = paymentTarget.installment_number;
      const origTotal = paymentTarget.installment_total;
      // Encontrar quantos .X já existem para este grupo + parcela
      let subIndex = 1;
      if (paymentTarget.installment_group_id) {
        const existingSubs = records.filter(r =>
          r.installment_group_id === paymentTarget.installment_group_id &&
          r.id !== paymentTarget.id &&
          r.description.includes(`.`) &&
          r.installment_number === origNum
        );
        subIndex = existingSubs.length + 1;
      }

      const baseDesc = paymentTarget.description.replace(/\s*\([\d./]+\)\s*$/, "").trim();
      const suffix = origNum && origTotal
        ? ` (${origNum}/${origTotal}.${subIndex})`
        : ` (saldo.${subIndex})`;

      const newRecord = {
        user_id: user.id,
        type: paymentTarget.type,
        description: `${baseDesc}${suffix}`,
        amount: remainder,
        entry_date: dateStr,
        due_date: paymentTarget.due_date,
        payment_date: null,
        payee: paymentTarget.payee || null,
        category: paymentTarget.category,
        referente: paymentTarget.referente || null,
        status: "pendente" as const,
        notes: `Saldo restante de pagamento parcial em ${format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy")}`,
        installment_total: origTotal || null,
        installment_number: origNum || null,
        installment_group_id: paymentTarget.installment_group_id || null,
        interest_amount: 0,
        discount_amount: 0,
        attachment_url: null,
        is_recurring: (paymentTarget as any).is_recurring || false,
        account_id: paymentAccountId || paymentTarget.account_id || null,
        payment_method: paymentMethod || (paymentTarget as any).payment_method || null,
      };

      const { error: insertError } = await supabase.from("financial_records").insert(newRecord);
      if (insertError) {
        toast({ title: "⚠️ Pagamento registrado", description: "Porém não foi possível criar o registro do saldo restante.", variant: "destructive" });
      } else {
        toast({ title: "✅ Pagamento parcial registrado!", description: `Saldo de ${fmt(remainder)} gerado como novo registro.` });
      }
    } else {
      toast({ title: "✅ Pagamento registrado!" });
    }

    setPaymentTarget(null);
    setPaymentDate(new Date());
    setPartialAmountDisplay("");
    setPaymentAccountId(null);
    setPaymentMethod(null);
    setPaymentCategory(null);
    setPaymentAttachmentUrl(null);
    fetchRecords();
  };

  // Compute installment group summaries
  const installmentSummaries = useMemo(() => {
    const map: Record<string, { totalAmount: number; paidAmount: number; paidCount: number; totalCount: number }> = {};
    records.forEach(r => {
      if (!r.installment_group_id || !r.installment_total || r.installment_total <= 1) return;
      if (!map[r.installment_group_id]) {
        map[r.installment_group_id] = { totalAmount: 0, paidAmount: 0, paidCount: 0, totalCount: r.installment_total };
      }
      const effective = r.amount + (r.interest_amount || 0) - (r.discount_amount || 0);
      map[r.installment_group_id].totalAmount += effective;
      if (r.status === "pago") {
        map[r.installment_group_id].paidAmount += effective;
        map[r.installment_group_id].paidCount += 1;
      }
    });
    return map;
  }, [records]);

  const handleClone = (record: DBRecord) => {
    setEditRecord({
      type: record.type,
      description: record.description + " (cópia)",
      amount: record.amount,
      entry_date: format(new Date(), "yyyy-MM-dd"),
      due_date: record.due_date,
      payment_date: null,
      payee: record.payee || "",
      category: record.category,
      referente: record.referente || "",
      status: "pendente",
      notes: record.notes || "",
      interest_amount: record.interest_amount || 0,
      discount_amount: record.discount_amount || 0,
      attachment_url: null,
      account_id: record.account_id || null,
      payment_method: (record as any).payment_method || null,
    });
    setModalOpen(true);
  };

  const handleEdit = (record: DBRecord) => {
    setEditRecord({
      id: record.id,
      type: record.type as "receita" | "despesa",
      description: record.description,
      amount: record.amount,
      entry_date: record.entry_date,
      due_date: record.due_date,
      payment_date: record.payment_date,
      payee: record.payee || "",
      category: record.category,
      referente: record.referente || "",
      status: record.status as any,
      notes: record.notes || "",
      installment_total: record.installment_total,
      installment_number: record.installment_number,
      installment_group_id: record.installment_group_id,
      interest_amount: record.interest_amount || 0,
      discount_amount: record.discount_amount || 0,
      attachment_url: record.attachment_url || null,
      account_id: record.account_id || null,
      payment_method: (record as any).payment_method || null,
      is_recurring: record.is_recurring || false,
      recurring_active: record.recurring_active || false,
    });
    setModalOpen(true);
  };

  const openRecordAttachments = async (recordId: string) => {
    const atts = allAttachments[recordId] || [];
    if (atts.length === 0) return;
    const items: { url: string; name: string; type: string }[] = [];
    for (const att of atts) {
      const { data } = await supabase.storage
        .from("financial-attachments")
        .createSignedUrl(att.file_url, 300);
      if (data?.signedUrl) {
        const rawName = att.file_url.split("/").pop() || "anexo";
        const ext = rawName.includes(".") ? "." + rawName.split(".").pop() : "";
        const displayName = att.display_name ? att.display_name + ext : rawName;
        const isPdf = displayName.toLowerCase().endsWith(".pdf");
        const isImage = /\.(jpe?g|png|webp|gif)$/i.test(displayName);
        const fileType = isPdf ? "application/pdf" : isImage ? "image/jpeg" : "application/octet-stream";
        items.push({ url: data.signedUrl, name: displayName, type: fileType });
      }
    }
    if (items.length > 0) {
      navigate("/visualizador", { state: { items, startIndex: 0 } });
    } else {
      toast({ title: "Erro", description: "Não foi possível abrir os anexos.", variant: "destructive" });
    }
  };

  // Legacy single attachment viewer (for old records)
  const openAttachment = async (path: string, customName?: string | null) => {
    const { data } = await supabase.storage
      .from("financial-attachments")
      .createSignedUrl(path, 300);
    if (data?.signedUrl) {
      const rawName = path.split("/").pop() || "anexo";
      const ext = rawName.includes(".") ? "." + rawName.split(".").pop() : "";
      const displayName = customName ? customName + ext : rawName;
      const isPdf = displayName.toLowerCase().endsWith(".pdf");
      const isImage = /\.(jpe?g|png|webp|gif)$/i.test(displayName);
      const fileType = isPdf ? "application/pdf" : isImage ? "image/jpeg" : "application/octet-stream";
      navigate("/visualizador", {
        state: { items: [{ url: data.signedUrl, name: displayName, type: fileType }], startIndex: 0 },
      });
    } else {
      toast({ title: "Erro", description: "Não foi possível abrir o anexo.", variant: "destructive" });
    }
  };

  const handleSendReceipt = (record: DBRecord) => {
    const payeeContact = manualContacts.find(c => c.name === record.payee);
    const phone = payeeContact?.phone?.replace(/\D/g, "");
    if (!phone) {
      toast({ title: "⚠️ Sem telefone", description: "O favorecido não possui telefone cadastrado.", variant: "destructive" });
      return;
    }

    const effectiveAmount = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);
    const paymentDate = record.payment_date
      ? format(new Date(record.payment_date + "T12:00:00"), "dd/MM/yyyy")
      : format(new Date(), "dd/MM/yyyy");

    const installmentInfo = record.installment_total && record.installment_total > 1
      ? `\n📦 Parcela: ${record.installment_number}/${record.installment_total}`
      : "";

    const interestInfo = (record.interest_amount || 0) > 0
      ? `\n📈 Juros: ${fmt(record.interest_amount || 0)}`
      : "";
    const discountInfo = (record.discount_amount || 0) > 0
      ? `\n📉 Desconto: ${fmt(record.discount_amount || 0)}`
      : "";

    const message = [
      `✅ *RECIBO DE PAGAMENTO*`,
      ``,
      `📝 ${record.description}`,
      `💰 Valor: ${fmt(record.amount)}`,
      interestInfo,
      discountInfo,
      (record.interest_amount || 0) > 0 || (record.discount_amount || 0) > 0
        ? `💵 Total: ${fmt(effectiveAmount)}`
        : "",
      installmentInfo,
      `📅 Data do Pagamento: ${paymentDate}`,
      record.referente ? `📋 Referente: ${record.referente}` : "",
      record.category !== "geral" ? `🏷️ Categoria: ${record.category}` : "",
      `👤 Favorecido: ${record.payee}`,
      ``,
      `_Recibo gerado automaticamente_`,
    ].filter(Boolean).join("\n");

    const fullPhone = phone.length <= 11 ? `55${phone}` : phone;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleSendCobranca = (record: DBRecord) => {
    const payeeContact = manualContacts.find(c => c.name === record.payee);
    const phone = payeeContact?.phone?.replace(/\D/g, "");
    if (!phone) {
      toast({ title: "⚠️ Sem telefone", description: "O favorecido não possui telefone cadastrado.", variant: "destructive" });
      return;
    }

    const effectiveAmount = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);
    const dueDate = record.due_date
      ? format(new Date(record.due_date + "T12:00:00"), "dd/MM/yyyy")
      : null;
    const isOverdue = record.due_date && new Date(record.due_date + "T12:00:00") < new Date();

    const lines: string[] = [
      isOverdue ? "*AVISO DE COBRANCA - VENCIDO*" : "*AVISO DE COBRANCA*",
      "",
      record.description,
      `Valor: ${fmt(record.amount)}`,
    ];

    if ((record.interest_amount || 0) > 0) {
      lines.push(`Juros: ${fmt(record.interest_amount || 0)}`);
    }
    if ((record.discount_amount || 0) > 0) {
      lines.push(`Desconto: ${fmt(record.discount_amount || 0)}`);
    }
    if ((record.interest_amount || 0) > 0 || (record.discount_amount || 0) > 0) {
      lines.push(`Total: ${fmt(effectiveAmount)}`);
    }
    if (record.installment_total && record.installment_total > 1) {
      lines.push(`Parcela: ${record.installment_number}/${record.installment_total}`);
    }
    if (dueDate) {
      lines.push(`Vencimento: ${dueDate}`);
    }
    if (record.referente) {
      lines.push(`Referente: ${record.referente}`);
    }
    if (record.category && record.category !== "geral") {
      lines.push(`Categoria: ${record.category}`);
    }

    lines.push("");
    lines.push(
      isOverdue
        ? "Este valor encontra-se *vencido*. Solicitamos a gentileza do pagamento o mais breve possivel."
        : "Solicitamos a gentileza do pagamento ate a data de vencimento."
    );
    lines.push("");
    lines.push("Mensagem gerada automaticamente");

    const message = lines.join("\n");

    const fullPhone = phone.length <= 11 ? `55${phone}` : phone;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // Filter & sort
  const filtered = records
    .filter(r => {
      // Period filter based on due_date (fallback to entry_date)
      const refDate = r.due_date || r.entry_date;
      if (periodFilter === "mes") {
        const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
        const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
        if (refDate < start || refDate > end) return false;
      } else if (periodFilter === "periodo") {
        if (periodStart && refDate < periodStart) return false;
        if (periodEnd && refDate > periodEnd) return false;
      }
      // Existing filters
      if (filterType !== "todos" && r.type !== filterType) return false;
      if (filterStatus !== "todos" && r.status !== filterStatus) return false;
      if (filterAccount !== "todos") {
        if (filterAccount === "sem_conta") {
          if (r.account_id) return false;
        } else {
          if (r.account_id !== filterAccount) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          r.description.toLowerCase().includes(q) ||
          (r.payee || "").toLowerCase().includes(q) ||
          (r.referente || "").toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let va: any, vb: any;
      if (sortField === "amount") {
        va = a.amount; vb = b.amount;
      } else if (sortField === "installment") {
        va = (a.installment_group_id || "") + String(a.installment_number || 0).padStart(4, "0");
        vb = (b.installment_group_id || "") + String(b.installment_number || 0).padStart(4, "0");
      } else if (sortField === "description") {
        va = (a.description || "").toLowerCase(); vb = (b.description || "").toLowerCase();
      } else if (sortField === "status") {
        const statusOrder: Record<string, number> = { pendente: 0, vencido: 1, pago: 2, cancelado: 3 };
        va = statusOrder[a.status] ?? 99;
        vb = statusOrder[b.status] ?? 99;
      } else {
        va = a[sortField] || ""; vb = b[sortField] || "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      // Secondary sort: installment number (ascending) for same primary value
      const na = a.installment_number || 0;
      const nb = b.installment_number || 0;
      if (na !== nb) return na - nb;
      return 0;
    });

  const totalReceitas = filtered.filter(r => r.type === "receita" && r.status === "pago").reduce((s, r) => s + r.amount + (r.interest_amount || 0) - (r.discount_amount || 0), 0);
  const totalDespesas = filtered.filter(r => r.type === "despesa" && r.status === "pago").reduce((s, r) => s + r.amount + (r.interest_amount || 0) - (r.discount_amount || 0), 0);
  const saldo = totalReceitas - totalDespesas;
  const pendReceitas = filtered.filter(r => r.type === "receita" && (r.status === "pendente" || r.status === "vencido")).reduce((s, r) => s + r.amount + (r.interest_amount || 0) - (r.discount_amount || 0), 0);
  const pendDespesas = filtered.filter(r => r.type === "despesa" && (r.status === "pendente" || r.status === "vencido")).reduce((s, r) => s + r.amount + (r.interest_amount || 0) - (r.discount_amount || 0), 0);
  const pendSaldo = pendReceitas - pendDespesas;
  const vencReceitas = filtered.filter(r => r.type === "receita" && r.status === "vencido").length;
  const vencDespesas = filtered.filter(r => r.type === "despesa" && r.status === "vencido").length;
  const vencTotal = vencReceitas + vencDespesas;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };


  // Calculated balances per account (receitas - despesas only for "pago" records)
  const calculatedBalances = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach(r => {
      if (!r.account_id || r.status !== "pago") return;
      const effective = r.amount + (r.interest_amount || 0) - (r.discount_amount || 0);
      if (!map[r.account_id]) map[r.account_id] = 0;
      if (r.type === "receita") {
        map[r.account_id] += effective;
      } else {
        map[r.account_id] -= effective;
      }
    });
    return map;
  }, [records]);

  const defaultAccount = accounts.find(a => a.is_default);

  if (showReports) {
    return <FinanceReports records={records} onClose={() => setShowReports(false)} />;
  }

  if (showAccounts) {
    return (
      <AccountsManager
        onClose={() => setShowAccounts(false)}
        accounts={accounts}
        onRefresh={fetchAccounts}
        calculatedBalances={calculatedBalances}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-base text-foreground">Finanças</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAccounts(true)}
            title="Gerenciar contas financeiras"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-accent transition-colors"
          >
            <Wallet className="w-3.5 h-3.5" /> Contas
          </button>
          <button
            onClick={() => setShowReports(true)}
            title="Ver relatórios financeiros"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-accent transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Relatórios
          </button>
          <button
            onClick={() => { setEditRecord(null); setModalOpen(true); }}
            title="Criar novo registro financeiro"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card rounded-lg p-2.5 text-center relative">
          {vencReceitas > 0 && (
            <div className="absolute top-1.5 right-1.5" title={`${vencReceitas} receita${vencReceitas > 1 ? "s" : ""} vencida${vencReceitas > 1 ? "s" : ""}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
            </div>
          )}
          <TrendingUp className="w-4 h-4 text-green-500 mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Receitas</p>
          <p className="text-xs font-bold text-green-500">{fmt(totalReceitas)}</p>
          {pendReceitas > 0 && (
            <div className="mt-1 pt-1 border-t border-green-500/20">
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">A receber: {fmt(pendReceitas)}</p>
            </div>
          )}
        </div>
        <div className="glass-card rounded-lg p-2.5 text-center relative">
          {vencDespesas > 0 && (
            <div className="absolute top-1.5 right-1.5" title={`${vencDespesas} despesa${vencDespesas > 1 ? "s" : ""} vencida${vencDespesas > 1 ? "s" : ""}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
            </div>
          )}
          <TrendingDown className="w-4 h-4 text-destructive mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Despesas</p>
          <p className="text-xs font-bold text-destructive">{fmt(totalDespesas)}</p>
          {pendDespesas > 0 && (
            <div className="mt-1 pt-1 border-t border-destructive/20">
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">A pagar: {fmt(pendDespesas)}</p>
            </div>
          )}
        </div>
        <div className="glass-card rounded-lg p-2.5 text-center relative">
          {vencTotal > 0 && (
            <div className="absolute top-1.5 right-1.5" title={`${vencTotal} registro${vencTotal > 1 ? "s" : ""} vencido${vencTotal > 1 ? "s" : ""}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
            </div>
          )}
          <DollarSign className={`w-4 h-4 mx-auto ${saldo >= 0 ? "text-green-500" : "text-destructive"}`} />
          <p className="text-[10px] text-muted-foreground mt-1">Saldo</p>
          <p className={`text-xs font-bold ${saldo >= 0 ? "text-green-500" : "text-destructive"}`}>{fmt(saldo)}</p>
          {(pendReceitas > 0 || pendDespesas > 0) && (
            <div className="mt-1 pt-1 border-t border-border">
              <p className={`text-[10px] font-semibold ${pendSaldo >= 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>Pendente: {fmt(pendSaldo)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-xs outline-none focus:ring-2 ring-primary/30"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          title="Filtrar por tipo: receita ou despesa"
          className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none"
        >
          <option value="todos">Todos</option>
          <option value="receita">Receitas</option>
          <option value="despesa">Despesas</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          title="Filtrar por status do registro"
          className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none"
        >
          <option value="todos">Status: Todos</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Recebida / Paga</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {accounts.length > 0 && (
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            title="Filtrar por conta"
            className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none"
          >
            <option value="todos">Conta: Todas</option>
            <option value="sem_conta">Sem conta</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.account_type === "banco" ? "🏦" : "🪙"} {a.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Period navigation + Sort */}
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none">
        {/* Month navigation */}
        <div className="shrink-0 flex items-center gap-0.5 bg-primary/5 rounded-lg px-1 py-0.5">
          <button
            onClick={() => { setPeriodFilter("mes"); setCurrentMonth((m) => subMonths(m, 1)); }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition-colors text-xs font-bold"
            title="Mês anterior"
          >
            &lt;
          </button>
          <button
            onClick={() => { setPeriodFilter("mes"); setCurrentMonth(new Date()); }}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
              periodFilter === "mes" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
            title="Clique para voltar ao mês atual"
          >
            {format(currentMonth, "MMM/yyyy", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase())}
          </button>
          <button
            onClick={() => { setPeriodFilter("mes"); setCurrentMonth((m) => addMonths(m, 1)); }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition-colors text-xs font-bold"
            title="Próximo mês"
          >
            &gt;
          </button>
        </div>
        {/* Todos + Por Período */}
        {([["todos", "Todos", "Exibir todos os registros"], ["periodo", "Período", "Definir intervalo de datas"]] as const).map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => {
              setPeriodFilter(key);
              if (key !== "periodo") { setPeriodStart(null); setPeriodEnd(null); }
            }}
            title={hint}
            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              periodFilter === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="shrink-0 text-muted-foreground/40 text-[10px]">│</span>
        {([["entry_date", "Entrada", "Ordenar pela data de lançamento"], ["due_date", "Vencimento", "Ordenar pela data de vencimento"], ["payment_date", "Pagamento", "Ordenar pela data de pagamento"], ["installment", "Parcela", "Agrupar e ordenar por parcelas"], ["amount", "Valor", "Ordenar pelo valor do registro"], ["description", "Descrição", "Ordenar alfabeticamente pela descrição"], ["status", "Status", "Ordenar por status: Pendente → Vencido → Pago → Cancelado"]] as const).map(([f, l, hint]) => (
          <button
            key={f}
            onClick={() => toggleSort(f)}
            title={hint}
            className={`shrink-0 flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              sortField === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {l} <SortIcon field={f} />
          </button>
        ))}
      </div>
      {periodFilter === "periodo" && (
        <div className="flex items-center gap-2">
          <DateInput value={periodStart} onChange={setPeriodStart} placeholder="Data inicial" size="sm" wrapperClassName="flex-1" />
          <span className="text-[10px] text-muted-foreground">até</span>
          <DateInput value={periodEnd} onChange={setPeriodEnd} placeholder="Data final" size="sm" wrapperClassName="flex-1" />
        </div>
      )}

      {/* Dica recorrente */}
      <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
        <Repeat className="w-3 h-3" /> Recorrente — gera parcela no 1° dia útil de cada mês
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Records list */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum registro financeiro encontrado.</p>
          <button
            onClick={() => { setEditRecord(null); setModalOpen(true); }}
            title="Adicionar primeiro registro financeiro"
            className="text-sm text-primary font-semibold hover:underline"
          >
            Adicionar primeiro registro
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(record => {
            const st = statusConfig[record.status] || statusConfig.pendente;
            const isOverdue = record.status === "pendente" && record.due_date && new Date(record.due_date) < new Date();
            const hasInterestOrDiscount = (record.interest_amount || 0) > 0 || (record.discount_amount || 0) > 0;
            const effectiveAmount = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);

            return (
              <div
                key={record.id}
                className={`glass-card rounded-xl p-3 space-y-2 transition-all cursor-pointer hover:ring-1 hover:ring-primary/30 ${isOverdue ? "ring-1 ring-destructive/30" : ""}`}
                onClick={() => setViewRecord(record)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Account color indicator */}
                    {record.account_id && (() => {
                      const acc = accounts.find(a => a.id === record.account_id);
                      return acc ? (
                        <div
                          className="w-1.5 h-8 rounded-full shrink-0"
                          style={{ backgroundColor: acc.color || "#3b82f6" }}
                          title={`Conta: ${acc.name}`}
                        />
                      ) : null;
                    })()}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      record.type === "receita" ? "bg-green-500/10" : "bg-destructive/10"
                    }`}>
                      {record.type === "receita" 
                        ? <TrendingUp className="w-4 h-4 text-green-500" />
                        : <TrendingDown className="w-4 h-4 text-destructive" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{record.description}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                        {isOverdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Vencido
                          </span>
                        )}
                        {(record as any).is_recurring && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${(record as any).recurring_active !== false ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground line-through"}`}>
                            <Repeat className="w-2.5 h-2.5" /> Recorrente{(record as any).recurring_active === false ? " (encerrada)" : ""}
                          </span>
                        )}
                        {record.installment_total && record.installment_total > 1 && !(record as any).is_recurring && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-0.5">
                            <Layers className="w-2.5 h-2.5" /> {record.installment_number}/{record.installment_total}
                          </span>
                        )}
                        {(() => {
                          const recAtts = allAttachments[record.id] || [];
                          const hasLegacy = record.attachment_url && recAtts.length === 0;
                          const totalAtts = recAtts.length + (hasLegacy ? 1 : 0);
                          if (totalAtts === 0) return null;
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (recAtts.length > 0) {
                                  openRecordAttachments(record.id);
                                } else if (hasLegacy) {
                                  openAttachment(record.attachment_url!, (record as any).attachment_name);
                                }
                              }}
                              title="Abrir anexo(s)"
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent text-accent-foreground flex items-center gap-0.5 hover:bg-accent/80 transition-colors"
                            >
                              <Paperclip className="w-2.5 h-2.5" /> {totalAtts > 1 ? `Anexos (${totalAtts})` : "Anexo"}
                            </button>
                          );
                        })()}
                        <span className="text-[10px] text-muted-foreground">{record.category}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${record.type === "receita" ? "text-green-500" : "text-destructive"}`}>
                      {record.type === "receita" ? "+" : "-"}{fmt(record.amount)}
                    </p>
                    {hasInterestOrDiscount && (
                      <div className="space-y-0">
                        {(record.interest_amount || 0) > 0 && (
                          <p className="text-[9px] text-destructive">+juros {fmt(record.interest_amount || 0)}</p>
                        )}
                        {(record.discount_amount || 0) > 0 && (
                          <p className="text-[9px] text-green-500">-desc {fmt(record.discount_amount || 0)}</p>
                        )}
                        <p className={`text-[10px] font-bold ${record.type === "receita" ? "text-green-600" : "text-red-600"}`}>
                          = {fmt(effectiveAmount)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" />
                    Entrada: {format(new Date(record.entry_date + "T12:00:00"), "dd/MM/yy")}
                  </span>
                  {record.due_date && (
                    <span className={cn(
                      "flex items-center gap-1 font-bold text-[11px] px-1.5 py-0.5 rounded-md",
                      isOverdue
                        ? "bg-destructive/10 text-destructive"
                        : record.status === "pago"
                          ? "text-green-600"
                          : "bg-primary/10 text-primary"
                    )}>
                      <Calendar className="w-3 h-3" />
                      Venc: {format(new Date(record.due_date + "T12:00:00"), "dd/MM/yy")}
                    </span>
                  )}
                  {record.payment_date && (
                    <span className="flex items-center gap-1 font-bold text-[11px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-600">
                      <Calendar className="w-3 h-3" />
                      Pago: {format(new Date(record.payment_date + "T12:00:00"), "dd/MM/yy")}
                    </span>
                  )}
                  {record.payee && (
                    <span className="flex items-center gap-1 font-bold text-foreground">
                      <User className="w-2.5 h-2.5" /> {record.payee}
                    </span>
                  )}
                  {record.referente && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-2.5 h-2.5" /> {record.referente}
                    </span>
                  )}
                  {(record as any).payment_method && (
                    <span className="flex items-center gap-1 text-primary/80">
                      💳 {(record as any).payment_method}
                    </span>
                  )}
                </div>

                {/* Installment summary: valor da parcela - pago - saldo */}
                {record.installment_group_id && record.installment_total && record.installment_total > 1 && (() => {
                   const actionLabel = record.type === "receita" ? "Recebido" : "Pago";
                   // Check if this record generated a sub-installment (e.g. 1/7.1)
                   const subRecords = records.filter(r =>
                     r.installment_group_id === record.installment_group_id &&
                     r.installment_number === record.installment_number &&
                     r.id !== record.id && r.description.includes(".")
                   );
                   const subSuffix = subRecords.map(r => {
                     const match = r.description.match(/\((\d+\/\d+\.\d+)\)/);
                     return match ? match[1] : null;
                   }).filter(Boolean);
                   // Extract display label
                   const descMatch = record.description.match(/\((\d+\/\d+(?:\.\d+)?)\)/);
                   const parcelaLabel = descMatch ? descMatch[1] : `${record.installment_number}/${record.installment_total}`;
                   const isSubParcela = /\.\d+\)/.test(record.description);

                   // For partially paid records (that generated a sub-installment):
                   // show original full value = this record + sub-records
                   // For sub-installments or normal: show own value
                   let valorParcela: number;
                   let pago: number;
                   if (!isSubParcela && subRecords.length > 0 && record.status === "pago") {
                     // Partially paid: original value = paid amount + remaining (sub-records)
                     const thisVal = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);
                     const subVal = subRecords.reduce((s, r) => s + r.amount + (r.interest_amount || 0) - (r.discount_amount || 0), 0);
                     valorParcela = thisVal + subVal;
                     pago = thisVal;
                   } else {
                     valorParcela = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);
                     pago = record.status === "pago" ? valorParcela : 0;
                   }
                   const devido = valorParcela - pago;

                   return (
                     <div className="flex items-center gap-1.5 text-[10px] bg-muted/50 rounded-lg px-2.5 py-1.5 flex-wrap">
                       <span className="text-muted-foreground font-medium">Parcela {parcelaLabel}:</span>
                       <span className="text-primary font-bold">{fmt(valorParcela)}</span>
                       <span className="text-muted-foreground">−</span>
                       <span className="text-green-600 font-bold">{fmt(pago)}</span>
                       <span className="text-muted-foreground text-[9px]">{actionLabel}</span>
                       <span className="text-muted-foreground">=</span>
                       <span className="text-muted-foreground text-[9px]">Devido</span>
                       <span className={`font-bold ${devido > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(devido)}</span>
                       {record.status === "pago" && subSuffix.length > 0 && (
                         <span className="text-muted-foreground text-[9px] italic">
                           • Gerada parcela {subSuffix.join(", ")}
                         </span>
                       )}
                     </div>
                   );
                 })()}

                {/* Actions */}
                <div className="flex items-center gap-1 pt-1 border-t border-border/30" onClick={e => e.stopPropagation()}>
                  {(record.status === "pendente" || record.status === "vencido") && (
                    <button
                      onClick={() => {
                        setPaymentTarget(record);
                        setPaymentDate(new Date());
                        setPaymentDateStr(format(new Date(), "yyyy-MM-dd"));
                        const total = record.amount + (record.interest_amount || 0) - (record.discount_amount || 0);
                        setPartialAmountDisplay(total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                        setPaymentAccountId(record.account_id || null);
                        setPaymentMethod((record as any).payment_method || null);
                        setPaymentCategory(record.category || null);
                        setPaymentAttachmentUrl(record.attachment_url || null);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-green-600 hover:bg-green-500/10 transition-colors"
                      title={record.type === "receita" ? "Registrar recebimento" : "Registrar pagamento"}
                    >
                      <CircleDollarSign className="w-3 h-3" /> {record.type === "receita" ? "Receber" : "Pagar"}
                    </button>
                  )}
                  {record.type === "receita" && (record.status === "pendente" || record.status === "vencido") && record.payee && (
                    <button
                      onClick={() => handleSendCobranca(record)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-whatsapp hover:bg-whatsapp/10 transition-colors"
                      title="Enviar aviso de cobrança via WhatsApp"
                    >
                      <Send className="w-3 h-3" /> Cobrar
                    </button>
                  )}
                  {record.status === "pago" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-amber-600 hover:bg-amber-500/10 transition-colors"
                          title="Reverter pagamento/recebimento"
                        >
                          <Undo2 className="w-3 h-3" /> Reverter
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="z-[9999]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>↩️ Reverter pagamento?</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                              <p><strong>{record.description}</strong></p>
                              <div className="rounded-lg bg-muted p-3 space-y-1 text-xs">
                                <p>💰 Valor: <strong>{fmt(record.amount + (record.interest_amount || 0) - (record.discount_amount || 0))}</strong></p>
                                {record.payment_date && (
                                  <p>📅 Data pagamento: <strong>{format(new Date(record.payment_date + "T12:00:00"), "dd/MM/yyyy")}</strong> → <span className="text-destructive font-semibold">será removida</span></p>
                                )}
                                <p>📌 Status: <strong className="text-green-600">Pago</strong> → <strong className={record.due_date && new Date(record.due_date + "T12:00:00") < new Date() ? "text-destructive" : "text-primary"}>
                                  {record.due_date && new Date(record.due_date + "T12:00:00") < new Date() ? "Vencido" : "Pendente"}
                                </strong></p>
                              </div>
                              <p className="text-muted-foreground">O registro voltará a aparecer como não pago. Os totais serão recalculados.</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-amber-500 text-white hover:bg-amber-600"
                            onClick={async () => {
                              if (!user) return;
                              const newStatus = record.due_date && new Date(record.due_date + "T12:00:00") < new Date()
                                ? "vencido" : "pendente";
                              const { error } = await supabase
                                .from("financial_records")
                                .update({ payment_date: null as any, status: newStatus })
                                .eq("id", record.id)
                                .eq("user_id", user.id);
                              if (error) {
                                console.error("Revert error:", error);
                                toast({ title: "Erro", description: `Não foi possível reverter: ${error.message}`, variant: "destructive" });
                              } else {
                                const statusLabel = newStatus === "vencido" ? "Vencido" : "Pendente";
                                toast({
                                  title: "↩️ Pagamento revertido!",
                                  description: `"${record.description}" → ${statusLabel}. Data de pagamento removida.`,
                                });
                                fetchRecords();
                              }
                            }}
                          >
                            Reverter Pagamento
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <button
                    onClick={() => handleEdit(record)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                    title="Editar registro"
                  >
                    <Edit className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => handleClone(record)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-foreground hover:bg-muted transition-colors"
                    title="Clonar registro como novo"
                  >
                    <Copy className="w-3 h-3" /> Clonar
                  </button>
                  {record.status === "pago" && record.payee && (
                    <button
                      onClick={() => handleSendReceipt(record)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-whatsapp hover:bg-whatsapp/10 transition-colors"
                      title="Enviar recibo via WhatsApp"
                    >
                      <Send className="w-3 h-3" /> Recibo
                    </button>
                  )}
                  {(record as any).is_recurring && (record as any).recurring_active !== false && record.installment_group_id && (
                    <button
                      onClick={() => handleStopRecurring(record.installment_group_id!)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-amber-600 hover:bg-amber-500/10 transition-colors"
                      title="Encerrar recorrência — novos lançamentos não serão mais gerados"
                    >
                      <X className="w-3 h-3" /> Encerrar
                    </button>
                  )}
                  {(record as any).is_recurring && (record as any).recurring_active === false && record.installment_group_id && (
                    <button
                      onClick={() => handleReactivateRecurring(record.installment_group_id!)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-green-600 hover:bg-green-500/10 transition-colors"
                      title="Reativar recorrência — novos lançamentos serão gerados automaticamente"
                    >
                      <Repeat className="w-3 h-3" /> Reativar
                    </button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-destructive hover:bg-destructive/10 transition-colors ml-auto"
                        title="Excluir registro"
                      >
                        <Trash2 className="w-3 h-3" /> Excluir
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {record.installment_group_id && records.filter(r => r.installment_group_id === record.installment_group_id).length > 1
                            ? record.is_recurring
                              ? `Este registro faz parte de uma recorrência. Deseja excluir apenas este ou todos os registros recorrentes do grupo?`
                              : `Esta parcela faz parte de um parcelamento. Deseja excluir apenas esta parcela ou todas as parcelas do grupo?`
                            : `Esta ação é irreversível. O registro "${record.description}" será excluído permanentemente.`
                          }
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        {record.installment_group_id && records.filter(r => r.installment_group_id === record.installment_group_id).length > 1 && (
                          <AlertDialogAction
                            onClick={() => handleDeleteGroup(record.installment_group_id!)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            title="Excluir todos os registros do grupo"
                          >
                            <Layers className="w-3.5 h-3.5 mr-1" /> Excluir todas
                          </AlertDialogAction>
                        )}
                        <AlertDialogAction
                          onClick={() => handleDelete(record.id)}
                          className={record.installment_group_id && records.filter(r => r.installment_group_id === record.installment_group_id).length > 1 ? "bg-muted text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                          title="Excluir apenas este registro"
                        >
                          {record.installment_group_id && records.filter(r => r.installment_group_id === record.installment_group_id).length > 1 ? "Só esta" : "Excluir"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record count */}
      {!loading && records.length > 0 && (
        <p className="text-center text-[10px] text-muted-foreground">
          {filtered.length} de {records.length} registros
        </p>
      )}

      {/* Modal */}
      <FinanceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditRecord(null); }}
        onSave={handleSave}
        editRecord={editRecord}
        saving={saving}
        userId={user?.id}
        existingPayees={[...new Set([
          ...manualContacts.map(c => c.name),
          ...(records.map(r => r.payee).filter(Boolean) as string[])
        ])]}
        existingPhones={manualContacts.map(c => c.phone).filter(Boolean) as string[]}
        onAddPayee={async (name: string, phone?: string) => {
          if (!user || !phone) return;
          await supabase.from("manual_contacts").insert({
            user_id: user.id,
            name: name.trim(),
            phone: phone.replace(/\D/g, ""),
          });
          fetchManualContacts();
        }}
        onRemovePayee={async (name: string) => {
          if (!user) return;
          const contact = manualContacts.find(c => c.name === name);
          if (contact) {
            await supabase.from("manual_contacts")
              .delete()
              .eq("id", contact.id)
              .eq("user_id", user.id);
            fetchManualContacts();
          }
        }}
        accounts={accounts.map(a => ({ id: a.id, name: a.name, color: a.color, account_type: a.account_type }))}
        defaultAccountId={defaultAccount?.id || null}
        existingAttachments={editRecord?.id ? (allAttachments[editRecord.id] || []) : []}
      />

      {/* View-only modal */}
      <FinanceFormModal
        open={!!viewRecord}
        onClose={() => setViewRecord(null)}
        onSave={() => {}}
        editRecord={viewRecord}
        readOnly
        userId={user?.id}
        accounts={accounts.map(a => ({ id: a.id, name: a.name, color: a.color, account_type: a.account_type }))}
        manualContacts={manualContacts}
        existingAttachments={viewRecord?.id ? (allAttachments[(viewRecord as any).id] || []) : []}
        onEdit={(record) => {
          setViewRecord(null);
          handleEdit(record as DBRecord);
          setModalOpen(true);
        }}
      />

      {/* Payment date modal */}
      {paymentTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setPaymentTarget(null)}>
          <div className="bg-background rounded-xl shadow-xl p-4 w-[320px] space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 text-green-600" /> {paymentTarget.type === "receita" ? "Registrar Recebimento" : "Registrar Pagamento"}
              </h4>
              <button onClick={() => setPaymentTarget(null)} title="Fechar" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground truncate">{paymentTarget.description}</p>
              <p className="text-sm font-bold text-foreground">Total: {fmt(paymentTarget.amount + (paymentTarget.interest_amount || 0) - (paymentTarget.discount_amount || 0))}</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Valor a pagar (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={partialAmountDisplay}
                  onChange={e => setPartialAmountDisplay(handleCurrencyInputLocal(e.target.value))}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  placeholder="0,00"
                />
              </div>
              {(() => {
                const total = paymentTarget.amount + (paymentTarget.interest_amount || 0) - (paymentTarget.discount_amount || 0);
                const paid = parseCurrencyLocal(partialAmountDisplay) || 0;
                const diff = Math.round((total - paid) * 100) / 100;
                if (diff > 0.009 && paid > 0) {
                  return (
                    <p className="text-[10px] text-amber-600 font-medium">
                      ⚠️ Pagamento parcial — será gerado saldo de {fmt(diff)}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">{paymentTarget.type === "receita" ? "Data do Recebimento" : "Data do Pagamento"}</label>
              <DateInput
                value={paymentDateStr}
                onChange={v => {
                  if (v) {
                    setPaymentDateStr(v);
                    setPaymentDate(new Date(v + "T12:00:00"));
                  }
                }}
              />
            </div>
            {/* Conta */}
            {accounts.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Conta</label>
                <select
                  value={paymentAccountId || ""}
                  onChange={e => setPaymentAccountId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value="">Nenhuma</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_type === "banco" ? "🏦" : "🪙"} {a.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Forma de pagamento */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Forma de {paymentTarget.type === "receita" ? "Recebimento" : "Pagamento"}</label>
              <select
                value={paymentMethod || ""}
                onChange={e => setPaymentMethod(e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="">Não informada</option>
                {["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Transferência", "Boleto", "Cheque", "Débito Automático",
                  ...paymentCustomMethods.filter(c => !["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Transferência", "Boleto", "Cheque", "Débito Automático"].includes(c))
                ].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {/* Categoria */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> Categoria
              </label>
              <select
                value={paymentCategory || ""}
                onChange={e => setPaymentCategory(e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="">Manter atual</option>
                {paymentCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {/* Anexo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Anexo
              </label>
              {paymentAttachmentUrl ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600 font-medium truncate flex-1">📎 {paymentAttachmentUrl.split("/").pop()}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.storage.from("financial-attachments").remove([paymentAttachmentUrl]);
                      setPaymentAttachmentUrl(null);
                      toast({ title: "Anexo removido." });
                    }}
                    title="Remover anexo"
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => paymentFileRef.current?.click()}
                  disabled={paymentUploading}
                  title="Anexar documento"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {paymentUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {paymentUploading ? "Enviando..." : "Anexar documento"}
                </button>
              )}
              <input
                ref={paymentFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user) return;
                  const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
                  if (!validTypes.includes(file.type)) {
                    toast({ title: "Formato não suportado", description: "Use JPG, PNG, WEBP ou PDF.", variant: "destructive" });
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
                    return;
                  }
                  setPaymentUploading(true);
                  const ext = file.name.split(".").pop();
                  const path = `${user.id}/${Date.now()}.${ext}`;
                  const { error } = await supabase.storage.from("financial-attachments").upload(path, file, { upsert: false });
                  if (error) {
                    toast({ title: "Erro ao enviar arquivo.", variant: "destructive" });
                  } else {
                    setPaymentAttachmentUrl(path);
                    toast({ title: "📎 Arquivo anexado!" });
                  }
                  setPaymentUploading(false);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentTarget(null)}
                className="flex-1 px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegisterPayment}
                title="Confirmar pagamento/recebimento"
                className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Group edit confirmation for installment groups */}
      <AlertDialog open={!!groupEditConfirm} onOpenChange={(open) => { if (!open) setGroupEditConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar alterações no grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro pertence a um parcelamento. Deseja aplicar as alterações apenas nesta parcela ou em todas as parcelas do grupo?
              <br /><br />
              <span className="text-xs text-muted-foreground">
                "Todas" atualiza: tipo, categoria, favorecido, referente, conta, forma de pagamento e descrição.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setGroupEditConfirm(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleGroupEditConfirm(false)}
              className="bg-muted text-foreground hover:bg-accent"
            >
              Só esta parcela
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleGroupEditConfirm(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Todas as parcelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FinancesSection;

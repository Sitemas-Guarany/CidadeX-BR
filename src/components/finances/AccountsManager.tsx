import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, X, Save, Trash2, Edit, Wallet, Landmark, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, Check, ArrowLeft
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

export interface FinancialAccount {
  id: string;
  user_id: string;
  account_type: "carteira" | "banco";
  name: string;
  bank_name: string | null;
  bank_code: string | null;
  agency_code: string | null;
  account_number: string | null;
  account_digit: string | null;
  initial_balance: number;
  informed_balance: number | null;
  informed_balance_date: string | null;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface AccountsManagerProps {
  onClose: () => void;
  accounts: FinancialAccount[];
  onRefresh: () => void;
  /** Calculated balance per account from financial_records */
  calculatedBalances: Record<string, number>;
}

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

const BANKS = [
  { code: "001", name: "Banco do Brasil" },
  { code: "033", name: "Santander" },
  { code: "104", name: "Caixa Econômica" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú Unibanco" },
  { code: "077", name: "Inter" },
  { code: "260", name: "Nubank" },
  { code: "336", name: "C6 Bank" },
  { code: "212", name: "Original" },
  { code: "756", name: "Sicoob" },
  { code: "748", name: "Sicredi" },
  { code: "070", name: "BRB" },
  { code: "422", name: "Safra" },
  { code: "745", name: "Citibank" },
  { code: "399", name: "HSBC" },
  { code: "208", name: "BTG Pactual" },
  { code: "246", name: "ABC Brasil" },
  { code: "389", name: "Mercantil" },
  { code: "655", name: "Neon" },
  { code: "290", name: "PagSeguro" },
  { code: "380", name: "PicPay" },
];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const handleCurrencyInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrency = (raw: string): number => {
  const cleaned = raw.replace(/[^\d,]/g, "");
  if (!cleaned) return 0;
  return parseFloat(cleaned.replace(",", ".")) || 0;
};

const AccountsManager = ({ onClose, accounts, onRefresh, calculatedBalances }: AccountsManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [accountType, setAccountType] = useState<"carteira" | "banco">("carteira");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankInputRef = useRef<HTMLInputElement>(null);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const [agencyCode, setAgencyCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountDigit, setAccountDigit] = useState("");
  const [initialBalanceDisplay, setInitialBalanceDisplay] = useState("");
  const [informedBalanceDisplay, setInformedBalanceDisplay] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [isDefault, setIsDefault] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setAccountType("carteira");
    setName("");
    setBankName("");
    setBankCode("");
    setBankSearch("");
    setBankDropdownOpen(false);
    setAgencyCode("");
    setAccountNumber("");
    setAccountDigit("");
    setInitialBalanceDisplay("");
    setInformedBalanceDisplay("");
    setColor(COLORS[0]);
    setIsDefault(false);
    setEditingAccount(null);
  };

  const openEdit = (acc: FinancialAccount) => {
    setEditingAccount(acc);
    setAccountType(acc.account_type);
    setName(acc.name);
    setBankName(acc.bank_name || "");
    setBankCode(acc.bank_code || "");
    setBankSearch(acc.bank_name ? `${acc.bank_code || ""} - ${acc.bank_name}`.replace(/^ - /, "") : "");
    setBankDropdownOpen(false);
    setAgencyCode((acc as any).agency_code || "");
    setAccountNumber(acc.account_number || "");
    setAccountDigit(acc.account_digit || "");
    setInitialBalanceDisplay(acc.initial_balance ? acc.initial_balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
    setInformedBalanceDisplay(acc.informed_balance !== null ? acc.informed_balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
    setColor(acc.color || COLORS[0]);
    setIsDefault(acc.is_default);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      account_type: accountType,
      name: name.trim(),
      bank_name: accountType === "banco" ? bankName.trim() || null : null,
      bank_code: accountType === "banco" ? bankCode.trim() || null : null,
      agency_code: accountType === "banco" ? agencyCode.trim() || null : null,
      account_number: accountType === "banco" ? accountNumber.trim() || null : null,
      account_digit: accountType === "banco" ? accountDigit.trim() || null : null,
      initial_balance: parseCurrency(initialBalanceDisplay),
      informed_balance: informedBalanceDisplay ? parseCurrency(informedBalanceDisplay) : null,
      informed_balance_date: informedBalanceDisplay ? new Date().toISOString().split("T")[0] : null,
      color,
      is_default: isDefault,
    };

    if (editingAccount) {
      const { error } = await supabase
        .from("financial_accounts")
        .update(payload)
        .eq("id", editingAccount.id)
        .eq("user_id", user.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ Conta atualizada!" });
        // If setting as default, unset others
        if (isDefault && !editingAccount.is_default) {
          await supabase
            .from("financial_accounts")
            .update({ is_default: false })
            .eq("user_id", user.id)
            .neq("id", editingAccount.id);
        }
      }
    } else {
      // If setting as default, unset others first
      if (isDefault) {
        await supabase
          .from("financial_accounts")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }
      const { error } = await supabase.from("financial_accounts").insert(payload);
      if (error) {
        const msg = error.message.includes("10 contas") ? "Limite máximo de 10 contas atingido." : error.message;
        toast({ title: "Erro", description: msg, variant: "destructive" });
      } else {
        toast({ title: "✅ Conta criada!" });
      }
    }

    setSaving(false);
    setFormOpen(false);
    resetForm();
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("financial_accounts").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Conta excluída!" });
      onRefresh();
    }
  };

  const handleSelectBank = (code: string) => {
    const bank = BANKS.find(b => b.code === code);
    if (bank) {
      setBankCode(bank.code);
      setBankName(bank.name);
      setBankSearch(`${bank.code} - ${bank.name}`);
      setBankDropdownOpen(false);
    }
  };

  const handleSelectCustomBank = (customName: string) => {
    setBankCode("");
    setBankName(customName.trim());
    setBankSearch(customName.trim());
    setBankDropdownOpen(false);
  };

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) return BANKS;
    const q = bankSearch.toLowerCase();
    return BANKS.filter(b => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }, [bankSearch]);

  // Close bank dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node) &&
          bankInputRef.current && !bankInputRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onClose} title="Voltar" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-base text-foreground">Contas</h3>
          <span className="text-xs text-muted-foreground">({accounts.length}/10)</span>
        </div>
        <button
          onClick={() => { resetForm(); setFormOpen(true); }}
          disabled={accounts.length >= 10}
          title="Criar nova conta financeira"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Conta
        </button>
      </div>

      {/* Accounts list */}
      {accounts.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Wallet className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
          <button
            onClick={() => { resetForm(); setFormOpen(true); }}
            title="Criar primeira conta financeira"
            className="text-sm text-primary font-semibold hover:underline"
          >
            Criar primeira conta
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => {
            const calculated = (calculatedBalances[acc.id] || 0) + acc.initial_balance;
            const hasDiff = acc.informed_balance !== null && Math.abs(calculated - acc.informed_balance) > 0.01;
            const diff = acc.informed_balance !== null ? calculated - acc.informed_balance : 0;
            const expanded = expandedId === acc.id;

            return (
              <div key={acc.id} className="glass-card rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : acc.id)}
                  className="w-full p-3 flex items-center gap-3 text-left"
                >
                  <div
                    className="w-3 h-10 rounded-full shrink-0"
                    style={{ backgroundColor: acc.color || "#3b82f6" }}
                  />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {acc.account_type === "banco" ? (
                      <Landmark className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {acc.name}
                        {acc.is_default && (
                          <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            Padrão
                          </span>
                        )}
                      </p>
                      {acc.account_type === "banco" && acc.bank_name && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {acc.bank_name} {acc.bank_code ? `(${acc.bank_code})` : ""}
                          {(acc as any).agency_code ? ` Ag: ${(acc as any).agency_code}` : ""}
                          {acc.account_number ? ` Cc: ${acc.account_number}` : ""}{acc.account_digit ? `-${acc.account_digit}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${calculated >= 0 ? "text-green-500" : "text-destructive"}`}>
                      {formatCurrency(calculated)}
                    </p>
                    {hasDiff && (
                      <p className="text-[9px] text-amber-500 font-semibold flex items-center gap-0.5 justify-end">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                      </p>
                    )}
                  </div>
                  {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </button>

                {expanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Saldo Inicial</p>
                        <p className="font-bold text-foreground">{formatCurrency(acc.initial_balance)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Saldo Calculado</p>
                        <p className={`font-bold ${calculated >= 0 ? "text-green-500" : "text-destructive"}`}>
                          {formatCurrency(calculated)}
                        </p>
                      </div>
                      {acc.informed_balance !== null && (
                        <>
                          <div className="bg-muted/50 rounded-lg p-2">
                            <p className="text-muted-foreground">Saldo Informado</p>
                            <p className="font-bold text-foreground">{formatCurrency(acc.informed_balance)}</p>
                          </div>
                          <div className={`rounded-lg p-2 ${hasDiff ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                            <p className="text-muted-foreground">Diferença</p>
                            <p className={`font-bold ${hasDiff ? "text-amber-500" : "text-green-500"}`}>
                              {hasDiff ? `${diff > 0 ? "+" : ""}${formatCurrency(diff)}` : "✓ Sincronizado"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {acc.informed_balance_date && (
                      <p className="text-[9px] text-muted-foreground text-center">
                        Último saldo informado em {new Date(acc.informed_balance_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        onClick={() => openEdit(acc)}
                        title="Editar conta"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Edit className="w-3 h-3" /> Editar
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button title="Excluir conta" className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-destructive hover:bg-destructive/10 transition-colors ml-auto">
                            <Trash2 className="w-3 h-3" /> Excluir
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir conta "{acc.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os registros financeiros vinculados a esta conta ficarão sem conta associada. Esta ação é irreversível.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(acc.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {formOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) { setFormOpen(false); resetForm(); } }}
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display font-bold text-foreground">
                {editingAccount ? "Editar Conta" : "Nova Conta"}
              </h3>
              <button onClick={() => { setFormOpen(false); resetForm(); }} title="Fechar" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tipo */}
              <div className="flex gap-2">
                {([["carteira", "🪙 Carteira", Wallet], ["banco", "🏦 Banco", Landmark]] as const).map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAccountType(t)}
                    title={t === "carteira" ? "Tipo: Carteira" : "Tipo: Banco"}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                      accountType === t
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Nome */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome da Conta *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={accountType === "banco" ? "Ex: Conta Corrente Itaú" : "Ex: Carteira Pessoal"}
                  maxLength={100}
                  className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </div>

              {/* Dados bancários */}
              {accountType === "banco" && (
                <>
                  <div className="space-y-1 relative">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Banco</label>
                    <input
                      ref={bankInputRef}
                      type="text"
                      value={bankSearch}
                      onChange={e => {
                        setBankSearch(e.target.value);
                        setBankDropdownOpen(true);
                        // Clear selection if user is typing something new
                        if (bankName && e.target.value !== `${bankCode} - ${bankName}`.replace(/^ - /, "")) {
                          setBankCode("");
                          setBankName("");
                        }
                      }}
                      onFocus={() => setBankDropdownOpen(true)}
                      placeholder="Digite para buscar ou adicionar banco..."
                      className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
                      title="Digite o nome ou código do banco"
                    />
                    {bankDropdownOpen && (
                      <div
                        ref={bankDropdownRef}
                        className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                      >
                        {filteredBanks.map(b => (
                          <button
                            key={b.code}
                            type="button"
                            onClick={() => handleSelectBank(b.code)}
                            className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                            title={`${b.code} - ${b.name}`}
                          >
                            <span className="font-mono text-muted-foreground mr-1.5">{b.code}</span>
                            {b.name}
                          </button>
                        ))}
                        {bankSearch.trim() && filteredBanks.length === 0 && (
                          <button
                            type="button"
                            onClick={() => handleSelectCustomBank(bankSearch)}
                            className="w-full text-left px-3 py-2 text-sm text-primary font-semibold hover:bg-accent transition-colors flex items-center gap-1.5"
                            title={`Adicionar "${bankSearch.trim()}" como banco`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Adicionar "{bankSearch.trim()}"
                          </button>
                        )}
                        {bankSearch.trim() && filteredBanks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleSelectCustomBank(bankSearch)}
                            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors flex items-center gap-1.5 border-t border-border"
                            title={`Usar "${bankSearch.trim()}" como nome do banco`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Usar "{bankSearch.trim()}"
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agência</label>
                    <input
                      type="text"
                      value={agencyCode}
                      onChange={e => setAgencyCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Número da agência"
                      className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conta</label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                        placeholder="Número"
                        className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dígito</label>
                      <input
                        type="text"
                        value={accountDigit}
                        onChange={e => setAccountDigit(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        placeholder="0"
                        maxLength={2}
                        className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Saldo Inicial */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saldo Inicial (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={initialBalanceDisplay}
                    onChange={e => setInitialBalanceDisplay(handleCurrencyInput(e.target.value))}
                    placeholder="0,00"
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
              </div>

              {/* Saldo Informado (para sincronização) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Saldo Atual Informado (R$)
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Informe o saldo real da conta para verificar sincronização com os lançamentos.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={informedBalanceDisplay}
                    onChange={e => setInformedBalanceDisplay(handleCurrencyInput(e.target.value))}
                    placeholder="0,00 (opcional)"
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
              </div>

              {/* Cor */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Padrão */}
              <button
                type="button"
                onClick={() => setIsDefault(!isDefault)}
                title="Definir como conta padrão"
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  isDefault ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                Conta padrão
              </button>

              {/* Salvar */}
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                title={editingAccount ? "Salvar alterações da conta" : "Criar nova conta"}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : editingAccount ? "Salvar Alterações" : "Criar Conta"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AccountsManager;

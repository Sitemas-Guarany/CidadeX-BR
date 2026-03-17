import { useState, useEffect, useCallback } from "react";
import { CreditCard, Plus, X, Pencil, Check, Eye, EyeOff, ArrowDownAZ, ArrowUpZA } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DEFAULT_PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito",
  "Transferência", "Boleto", "Cheque", "Débito Automático"
];

const PaymentMethodsManager = () => {
  const { user } = useAuth();
  const [customMethods, setCustomMethods] = useState<string[]>([]);
  const [newMethod, setNewMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [inactiveItems, setInactiveItems] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<"default" | "az" | "za">("default");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [customRes, renameRes, inactiveRes] = await Promise.all([
      supabase.from("user_custom_options").select("value").eq("user_id", user.id).eq("option_type", "payment_method").order("value"),
      supabase.from("user_custom_options").select("id, value").eq("user_id", user.id).eq("option_type", "pm_rename"),
      supabase.from("user_custom_options").select("value").eq("user_id", user.id).eq("option_type", "pm_inactive"),
    ]);
    setCustomMethods((customRes.data || []).map(d => d.value));
    const renameMap: Record<string, string> = {};
    (renameRes.data || []).forEach(d => {
      try { const p = JSON.parse(d.value); if (p.from && p.to) renameMap[p.from] = p.to; } catch {}
    });
    setRenames(renameMap);
    setInactiveItems(new Set((inactiveRes.data || []).map(d => d.value)));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleActive = async (itemKey: string) => {
    if (!user) return;
    const isCurrentlyInactive = inactiveItems.has(itemKey);
    if (isCurrentlyInactive) {
      await supabase.from("user_custom_options").delete().eq("user_id", user.id).eq("option_type", "pm_inactive").eq("value", itemKey);
      setInactiveItems(prev => { const s = new Set(prev); s.delete(itemKey); return s; });
      toast.success("Ativado!");
    } else {
      await supabase.from("user_custom_options").insert({ user_id: user.id, option_type: "pm_inactive", value: itemKey });
      setInactiveItems(prev => new Set(prev).add(itemKey));
      toast.success("Desativado!");
    }
  };

  const handleAdd = async () => {
    if (!user || !newMethod.trim()) return;
    const value = newMethod.trim();
    const allNames = [...DEFAULT_PAYMENT_METHODS.map(m => renames[m] || m), ...customMethods];
    if (allNames.some(m => m.toLowerCase() === value.toLowerCase())) { toast.error("Essa forma de pagamento já existe."); return; }
    const { error } = await supabase.from("user_custom_options").insert({ user_id: user.id, option_type: "payment_method", value });
    if (error) { toast.error("Erro ao adicionar."); }
    else { toast.success(`"${value}" adicionado!`); setCustomMethods(prev => [...prev, value].sort()); setNewMethod(""); }
  };

  const handleRenameDefault = async (original: string) => {
    if (!user || !editValue.trim()) { setEditingItem(null); return; }
    const newName = editValue.trim();
    if (newName === (renames[original] || original)) { setEditingItem(null); return; }
    const allNames = [...DEFAULT_PAYMENT_METHODS.map(m => m === original ? null : (renames[m] || m)).filter(Boolean), ...customMethods];
    if (allNames.some(m => m!.toLowerCase() === newName.toLowerCase())) { toast.error("Esse nome já existe."); return; }
    const { data: existing } = await supabase.from("user_custom_options").select("id").eq("user_id", user.id).eq("option_type", "pm_rename").like("value", `%"from":"${original}"%`).maybeSingle();
    const jsonValue = JSON.stringify({ from: original, to: newName });
    if (existing) {
      const { error } = await supabase.from("user_custom_options").update({ value: jsonValue }).eq("id", existing.id);
      if (error) { toast.error("Erro ao renomear."); return; }
    } else {
      const { error } = await supabase.from("user_custom_options").insert({ user_id: user.id, option_type: "pm_rename", value: jsonValue });
      if (error) { toast.error("Erro ao renomear."); return; }
    }
    toast.success(`Renomeado para "${newName}".`);
    setRenames(prev => ({ ...prev, [original]: newName }));
    setEditingItem(null);
  };

  const handleEditCustom = async (oldValue: string) => {
    if (!user || !editValue.trim() || editValue.trim() === oldValue) { setEditingItem(null); return; }
    const value = editValue.trim();
    const allNames = [...DEFAULT_PAYMENT_METHODS.map(m => renames[m] || m), ...customMethods.filter(m => m !== oldValue)];
    if (allNames.some(m => m.toLowerCase() === value.toLowerCase())) { toast.error("Esse nome já existe."); return; }
    const { error } = await supabase.from("user_custom_options").update({ value }).eq("user_id", user.id).eq("option_type", "payment_method").eq("value", oldValue);
    if (error) { toast.error("Erro ao renomear."); }
    else { toast.success(`Renomeado para "${value}".`); setCustomMethods(prev => prev.map(m => m === oldValue ? value : m).sort()); setEditingItem(null); }
  };

  const handleRemove = async (method: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_custom_options").delete().eq("user_id", user.id).eq("option_type", "payment_method").eq("value", method);
    if (error) { toast.error("Erro ao remover."); }
    else { toast.success(`"${method}" removido.`); setCustomMethods(prev => prev.filter(m => m !== method)); }
  };

  const startEdit = (item: string, displayName: string) => { setEditingItem(item); setEditValue(displayName); };
  const handleEditConfirm = (item: string, isDefault: boolean) => { if (isDefault) handleRenameDefault(item); else handleEditCustom(item); };

  const sortItems = (items: { key: string; display: string; isDefault: boolean }[]) => {
    if (sortOrder === "az") return [...items].sort((a, b) => a.display.localeCompare(b.display, "pt-BR"));
    if (sortOrder === "za") return [...items].sort((a, b) => b.display.localeCompare(a.display, "pt-BR"));
    return items;
  };

  const cycleSortOrder = () => setSortOrder(prev => prev === "default" ? "az" : prev === "az" ? "za" : "default");

  if (!user) return null;

  const renderItem = ({ key, display, isDefault }: { key: string; display: string; isDefault: boolean }) => {
    const isInactive = inactiveItems.has(key);
    if (editingItem === key) {
      return (
        <div key={key} className="flex items-center gap-1">
          <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleEditConfirm(key, isDefault); } if (e.key === "Escape") setEditingItem(null); }}
            autoFocus maxLength={50} className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-2 ring-primary/30 w-32" />
          <button onClick={() => handleEditConfirm(key, isDefault)} title="Confirmar" className="p-0.5 rounded hover:bg-primary/20 transition-colors"><Check className="w-3 h-3 text-primary" /></button>
          <button onClick={() => setEditingItem(null)} title="Cancelar" className="p-0.5 rounded hover:bg-muted transition-colors"><X className="w-3 h-3 text-muted-foreground" /></button>
        </div>
      );
    }
    return (
      <span key={key} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
        isInactive ? "bg-muted/50 text-muted-foreground/50 line-through" : "bg-primary/10 border border-primary/20 text-foreground"
      }`}>
        {display}
        <button onClick={() => toggleActive(key)} title={isInactive ? `Ativar "${display}"` : `Desativar "${display}"`} className="p-0.5 rounded hover:bg-primary/20 transition-colors">
          {isInactive ? <EyeOff className="w-3 h-3 text-muted-foreground/50" /> : <Eye className="w-3 h-3 text-primary/60" />}
        </button>
        <button onClick={() => startEdit(key, display)} title={`Renomear "${display}"`} className="p-0.5 rounded hover:bg-primary/20 transition-colors">
          <Pencil className="w-3 h-3 text-primary" />
        </button>
        {!isDefault && (
          <button onClick={() => handleRemove(key)} title={`Remover "${display}"`} className="p-0.5 rounded hover:bg-destructive/20 transition-colors">
            <X className="w-3 h-3 text-destructive" />
          </button>
        )}
      </span>
    );
  };

  const allItems = sortItems([
    ...DEFAULT_PAYMENT_METHODS.map(m => ({ key: m, display: renames[m] || m, isDefault: true })),
    ...customMethods.map(m => ({ key: m, display: m, isDefault: false })),
  ]);

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Formas de pagamento</h3>
        </div>
        <button onClick={cycleSortOrder} title="Classificar itens"
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          {sortOrder === "za" ? <ArrowUpZA className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Gerencie suas formas de pagamento. Use 👁 para ativar/desativar.
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allItems.map(item => renderItem(item))}
        </div>
      )}

      <div className="flex gap-2">
        <input type="text" value={newMethod} onChange={e => setNewMethod(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          placeholder="Nova forma de pagamento..." maxLength={50}
          className="flex-1 px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
        <button onClick={handleAdd} disabled={!newMethod.trim()} title="Adicionar forma de pagamento"
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {inactiveItems.size > 0 && (
        <p className="text-[10px] text-muted-foreground">
          ⚠️ {inactiveItems.size} item(ns) desativado(s) — não aparecerão no formulário de lançamento.
        </p>
      )}
    </div>
  );
};

export default PaymentMethodsManager;

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRetry } from "@/lib/supabaseRetry";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Trash2, Edit2, Check, X, Loader2, ClipboardList, ChevronDown, ChevronUp,
  Search, Package, Tag, Printer, Send, Copy, GripVertical, CheckCheck, Square, Filter, XCircle, ArrowUpDown, Settings2, FileText
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { jsPDF } from "jspdf";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import DateInput from "@/components/common/DateInput";
import { cn } from "@/lib/utils";

interface ShoppingList {
  id: string;
  name: string;
  list_date: string;
  created_at: string;
  updated_at: string;
}

interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  estimated_value: number | null;
  purchased: boolean;
  position: number;
  category: string | null;
}

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const DEFAULT_CATEGORIES = [
  "Frutas", "Verduras", "Carnes", "Laticínios", "Padaria",
  "Bebidas", "Limpeza", "Higiene", "Frios", "Mercearia", "Outros"
];
const CATEGORY_OPTION_TYPE = "shopping_category";

export default function ShoppingListSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<Record<string, ShoppingItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState<string | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "progress">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  
  // Custom categories
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<"new" | "edit" | "filter" | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ old: string; new: string } | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [managerNewCatInput, setManagerNewCatInput] = useState("");

  // New list form
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDate, setNewListDate] = useState<string | null>(format(new Date(), "yyyy-MM-dd"));
  const [savingList, setSavingList] = useState(false);

  // Edit list
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState("");
  const [editListDate, setEditListDate] = useState<string | null>(null);

  // Expanded lists
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());

  // New item form per list
  const [newItemListId, setNewItemListId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemValue, setNewItemValue] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  

  // Edit item state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemQty, setEditItemQty] = useState("");
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemValue, setEditItemValue] = useState("");
  const [editItemCategory, setEditItemCategory] = useState("");
  const fetchLists = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await supabaseRetry(
        async () => supabase
          .from("shopping_lists")
          .select("*")
          .eq("user_id", user.id)
          .order("list_date", { ascending: false }),
        2, 1500, "shopping_lists"
      );
      const { data, error } = result as any;
      if (!error && data) setLists(data as ShoppingList[]);
    } catch (err) {
      console.error("[ShoppingList] fetch error:", err);
    }
    setLoading(false);
  }, [user]);

  const fetchItems = useCallback(async (listId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("list_id", listId)
      .eq("user_id", user.id)
      .order("position")
      .order("created_at");
    if (data) setItems(prev => ({ ...prev, [listId]: data as ShoppingItem[] }));
  }, [user]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  // Fetch custom categories
  const fetchCustomCategories = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_custom_options")
      .select("value")
      .eq("user_id", user.id)
      .eq("option_type", CATEGORY_OPTION_TYPE)
      .order("value");
    if (data) setCustomCategories(data.map(d => d.value));
  }, [user]);

  useEffect(() => { fetchCustomCategories(); }, [fetchCustomCategories]);

  const allCategories = useMemo(() => {
    const merged = new Set([...DEFAULT_CATEGORIES, ...customCategories]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [customCategories]);

  const handleAddCategory = async (name: string, context: "new" | "edit" | "filter") => {
    const trimmed = name.trim();
    if (!trimmed || !user) return;
    if (allCategories.includes(trimmed)) {
      toast({ title: "Categoria já existe", variant: "destructive" });
      return;
    }
    await supabase.from("user_custom_options").insert({
      user_id: user.id,
      option_type: CATEGORY_OPTION_TYPE,
      value: trimmed,
    });
    setCustomCategories(prev => [...prev, trimmed]);
    setNewCategoryInput("");
    setShowNewCategoryInput(null);
    // Auto-select the new category in the right context
    if (context === "new") setNewItemCategory(trimmed);
    else if (context === "edit") setEditItemCategory(trimmed);
    else if (context === "filter") setFilterCategory(trimmed);
    toast({ title: `Categoria "${trimmed}" criada!` });
  };

  const handleEditCategory = async (oldValue: string, newValue: string) => {
    const trimmed = newValue.trim();
    if (!trimmed || !user || trimmed === oldValue) { setEditingCategory(null); return; }
    // If it's a default category, can't rename, only custom ones
    if (DEFAULT_CATEGORIES.includes(oldValue)) {
      toast({ title: "Não é possível renomear categorias padrão", variant: "destructive" });
      setEditingCategory(null);
      return;
    }
    await supabase.from("user_custom_options").update({ value: trimmed })
      .eq("user_id", user.id)
      .eq("option_type", CATEGORY_OPTION_TYPE)
      .eq("value", oldValue);
    // Also update items that use this category
    await supabase.from("shopping_items").update({ category: trimmed })
      .eq("user_id", user.id)
      .eq("category", oldValue);
    setCustomCategories(prev => prev.map(c => c === oldValue ? trimmed : c));
    // Update local items
    setItems(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(i => i.category === oldValue ? { ...i, category: trimmed } : i);
      }
      return updated;
    });
    setEditingCategory(null);
    toast({ title: `Categoria renomeada para "${trimmed}"` });
  };

  const handleDeleteCategory = async (value: string) => {
    if (!user || DEFAULT_CATEGORIES.includes(value)) return;
    await supabase.from("user_custom_options").delete()
      .eq("user_id", user.id)
      .eq("option_type", CATEGORY_OPTION_TYPE)
      .eq("value", value);
    setCustomCategories(prev => prev.filter(c => c !== value));
    toast({ title: `Categoria "${value}" removida` });
  };

  // When filters that depend on items are active, fetch all items
  const needsItemData = filterStatus !== "all" || !!filterCategory || !!search.trim();
  useEffect(() => {
    if (needsItemData && lists.length > 0) {
      lists.forEach(l => {
        if (!items[l.id]) fetchItems(l.id);
      });
    }
  }, [needsItemData, lists, items, fetchItems]);

  // When a list is expanded, fetch its items
  useEffect(() => {
    expandedLists.forEach(id => {
      if (!items[id]) fetchItems(id);
    });
  }, [expandedLists, fetchItems, items]);

  const toggleExpand = (id: string) => {
    setExpandedLists(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- List CRUD ---
  const handleCreateList = async () => {
    if (!user || !newListName.trim() || !newListDate) return;
    setSavingList(true);
    const { error } = await supabase.from("shopping_lists").insert({
      user_id: user.id,
      name: newListName.trim(),
      list_date: newListDate,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewListName("");
      setNewListDate(format(new Date(), "yyyy-MM-dd"));
      setShowNewList(false);
      fetchLists();
    }
    setSavingList(false);
  };

  const handleUpdateList = async (id: string) => {
    if (!editListName.trim() || !editListDate) return;
    await supabase.from("shopping_lists").update({
      name: editListName.trim(),
      list_date: editListDate,
    }).eq("id", id);
    setEditingListId(null);
    fetchLists();
  };

  const handleDeleteList = async (id: string) => {
    await supabase.from("shopping_lists").delete().eq("id", id);
    setItems(prev => { const n = { ...prev }; delete n[id]; return n; });
    fetchLists();
  };

  // --- Item CRUD ---
  const handleAddItem = async (listId: string) => {
    if (!user || !newItemName.trim()) return;
    const maxPos = (items[listId] || []).reduce((m, i) => Math.max(m, i.position), -1);
    const { error } = await supabase.from("shopping_items").insert({
      list_id: listId,
      user_id: user.id,
      name: newItemName.trim(),
      quantity: newItemQty ? parseFloat(newItemQty) : 1,
      unit: newItemUnit || null,
      estimated_value: newItemValue ? parseFloat(newItemValue.replace(",", ".")) : null,
      position: maxPos + 1,
      category: newItemCategory || null,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewItemName("");
      setNewItemQty("1");
      setNewItemUnit("");
      setNewItemValue("");
      setNewItemCategory("");
      fetchItems(listId);
      fetchItems(listId);
    }
  };

  const handleTogglePurchased = async (item: ShoppingItem) => {
    await supabase.from("shopping_items").update({ purchased: !item.purchased }).eq("id", item.id);
    setItems(prev => ({
      ...prev,
      [item.list_id]: (prev[item.list_id] || []).map(i => i.id === item.id ? { ...i, purchased: !i.purchased } : i),
    }));
  };

  const startEditItem = (item: ShoppingItem) => {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemQty(item.quantity?.toString() || "1");
    setEditItemUnit(item.unit || "");
    setEditItemValue(item.estimated_value?.toString() || "");
    setEditItemCategory(item.category || "");
  };

  const handleUpdateItem = async (item: ShoppingItem) => {
    if (!editItemName.trim()) return;
    const updated = {
      name: editItemName.trim(),
      quantity: editItemQty ? parseFloat(editItemQty) : 1,
      unit: editItemUnit || null,
      estimated_value: editItemValue ? parseFloat(editItemValue.replace(",", ".")) : null,
      category: editItemCategory || null,
    };
    await supabase.from("shopping_items").update(updated).eq("id", item.id);
    setItems(prev => ({
      ...prev,
      [item.list_id]: (prev[item.list_id] || []).map(i =>
        i.id === item.id ? { ...i, ...updated } : i
      ),
    }));
    setEditingItemId(null);
  };

  const handleDeleteItem = async (item: ShoppingItem) => {
    await supabase.from("shopping_items").delete().eq("id", item.id);
    setItems(prev => ({
      ...prev,
      [item.list_id]: (prev[item.list_id] || []).filter(i => i.id !== item.id),
    }));
  };

  const handleDragEnd = async (result: DropResult, listId: string) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const listItems = [...(items[listId] || [])];
    const [moved] = listItems.splice(result.source.index, 1);
    listItems.splice(result.destination.index, 0, moved);
    const reordered = listItems.map((item, idx) => ({ ...item, position: idx }));
    setItems(prev => ({ ...prev, [listId]: reordered }));
    // Persist positions
    const updates = reordered.map(item =>
      supabase.from("shopping_items").update({ position: item.position }).eq("id", item.id)
    );
    await Promise.all(updates);
  };

  const handleToggleAllPurchased = async (listId: string, markAs: boolean) => {
    const listItems = items[listId] || [];
    if (listItems.length === 0) return;
    setItems(prev => ({
      ...prev,
      [listId]: (prev[listId] || []).map(i => ({ ...i, purchased: markAs })),
    }));
    const ids = listItems.map(i => i.id);
    await supabase.from("shopping_items").update({ purchased: markAs }).in("id", ids);
  };

  // --- (JSON export/import removidos por regra do sistema) ---

  // Filter
  const filteredLists = useMemo(() => {
    let result = lists;

    // Text search (list name + item names)
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(l => {
        if (l.name.toLowerCase().includes(s)) return true;
        const listItems = items[l.id] || [];
        return listItems.some(i => i.name.toLowerCase().includes(s));
      });
    }

    // Date range
    if (filterDateFrom) {
      result = result.filter(l => l.list_date >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter(l => l.list_date <= filterDateTo);
    }

    // Status filter
    if (filterStatus === "completed") {
      result = result.filter(l => {
        const li = items[l.id] || [];
        return li.length > 0 && li.every(i => i.purchased);
      });
    } else if (filterStatus === "pending") {
      result = result.filter(l => {
        const li = items[l.id] || [];
        return li.length === 0 || li.some(i => !i.purchased);
      });
    }

    // Category filter (show lists that contain items with this category)
    if (filterCategory) {
      result = result.filter(l => {
        const li = items[l.id] || [];
        return li.some(i => i.category === filterCategory);
      });
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      if (sortBy === "name") return dir * a.name.localeCompare(b.name);
      if (sortBy === "progress") {
        const aItems = items[a.id] || [];
        const bItems = items[b.id] || [];
        const aP = aItems.length > 0 ? aItems.filter(i => i.purchased).length / aItems.length : 0;
        const bP = bItems.length > 0 ? bItems.filter(i => i.purchased).length / bItems.length : 0;
        return dir * (aP - bP);
      }
      return dir * a.list_date.localeCompare(b.list_date);
    });

    return result;
  }, [lists, search, items, filterDateFrom, filterDateTo, filterStatus, filterCategory, sortBy, sortDir]);

  const activeFilterCount = [filterDateFrom, filterDateTo, filterStatus !== "all" ? filterStatus : null, filterCategory].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setFilterDateFrom(null);
    setFilterDateTo(null);
    setFilterStatus("all");
    setFilterCategory("");
  };

  const formatCurrency = (v: number | null) => {
    if (v === null || v === undefined) return "";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const handlePrintList = async (list: ShoppingList) => {
    let listItems = items[list.id];
    if (!listItems && user) {
      const { data } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", list.id)
        .eq("user_id", user.id)
        .order("position");
      if (data) {
        listItems = data as ShoppingItem[];
        setItems(prev => ({ ...prev, [list.id]: listItems }));
      }
    }
    if (!listItems) listItems = [];

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 18;

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(list.name, pw / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${format(new Date(list.list_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`, pw / 2, y, { align: "center" });
    y += 4;

    const purchasedCount = listItems.filter(i => i.purchased).length;
    const totalValue = listItems.reduce((s, i) => s + ((i.estimated_value || 0) * (i.quantity || 1)), 0);
    const purchasedValue = listItems.filter(i => i.purchased).reduce((s, i) => s + ((i.estimated_value || 0) * (i.quantity || 1)), 0);
    doc.text(`${purchasedCount}/${listItems.length} itens concluídos · ${formatCurrency(purchasedValue)} / ${formatCurrency(totalValue)}`, pw / 2, y, { align: "center" });
    y += 6;

    doc.setDrawColor(180);
    doc.line(margin, y, pw - margin, y);
    y += 5;

    // Group by category
    const grouped: Record<string, ShoppingItem[]> = {};
    listItems.forEach(item => {
      const cat = item.category || "Sem categoria";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    const categoryKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "Sem categoria") return 1;
      if (b === "Sem categoria") return -1;
      return a.localeCompare(b);
    });

    for (const cat of categoryKeys) {
      if (y > 270) { doc.addPage(); y = 18; }

      if (categoryKeys.length > 1 || cat !== "Sem categoria") {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(cat.toUpperCase(), margin, y);
        y += 5;
      }

      for (const item of grouped[cat]) {
        if (y > 275) { doc.addPage(); y = 18; }

        const checkbox = item.purchased ? "[x]" : "[  ]";
        doc.setFontSize(9);
        doc.setFont("helvetica", item.purchased ? "italic" : "normal");

        let line = `${checkbox}  ${item.name}`;
        if (item.quantity || item.unit) {
          line += `  (${item.quantity || ""}${item.unit ? ` ${item.unit}` : ""})`;
        }
        doc.text(line, margin + 2, y);

        if (item.estimated_value && item.estimated_value > 0) {
          const val = formatCurrency(item.estimated_value * (item.quantity || 1));
          doc.text(val, pw - margin, y, { align: "right" });
        }
        y += 5;
      }
      y += 2;
    }

    // Footer total
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setDrawColor(180);
    doc.line(margin, y, pw - margin, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", margin, y);
    doc.text(formatCurrency(totalValue), pw - margin, y, { align: "right" });

    const blobUrl = URL.createObjectURL(doc.output("blob"));
    navigate("/visualizador", {
      state: {
        items: [{ url: blobUrl, name: `lista-${list.name.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.pdf`, type: "application/pdf" }],
        startIndex: 0,
      },
    });
  };

  const handleShareWhatsApp = async (list: ShoppingList) => {
    let listItems = items[list.id];
    if (!listItems && user) {
      const { data } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", list.id)
        .eq("user_id", user.id)
        .order("position");
      if (data) {
        listItems = data as ShoppingItem[];
        setItems(prev => ({ ...prev, [list.id]: listItems }));
      }
    }
    if (!listItems) listItems = [];

    const dateStr = format(new Date(list.list_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
    const purchasedCount = listItems.filter(i => i.purchased).length;
    const totalValue = listItems.reduce((s, i) => s + ((i.estimated_value || 0) * (i.quantity || 1)), 0);

    let text = `📋 *${list.name}*\n📅 ${dateStr}\n✅ ${purchasedCount}/${listItems.length} itens`;
    if (totalValue > 0) text += ` · ${formatCurrency(totalValue)}`;
    text += "\n\n";

    // Group by category
    const grouped: Record<string, ShoppingItem[]> = {};
    listItems.forEach(item => {
      const cat = item.category || "Sem categoria";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    const categoryKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "Sem categoria") return 1;
      if (b === "Sem categoria") return -1;
      return a.localeCompare(b);
    });
    const hasCategories = categoryKeys.length > 1 || (categoryKeys.length === 1 && categoryKeys[0] !== "Sem categoria");

    for (const cat of categoryKeys) {
      if (hasCategories) text += `*${cat}*\n`;
      for (const item of grouped[cat]) {
        const check = item.purchased ? "☑️" : "⬜";
        let line = `${check} ${item.name}`;
        if (item.quantity || item.unit) line += ` (${item.quantity || ""}${item.unit ? ` ${item.unit}` : ""})`;
        if (item.estimated_value && item.estimated_value > 0) line += ` - ${formatCurrency(item.estimated_value * (item.quantity || 1))}`;
        text += line + "\n";
      }
      if (hasCategories) text += "\n";
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDuplicateList = async (list: ShoppingList) => {
    if (!user) return;
    let listItems = items[list.id];
    if (!listItems) {
      const { data } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", list.id)
        .eq("user_id", user.id)
        .order("position");
      if (data) listItems = data as ShoppingItem[];
    }
    if (!listItems) listItems = [];

    const { data: newList, error } = await supabase.from("shopping_lists").insert({
      user_id: user.id,
      name: `${list.name} (cópia)`,
      list_date: format(new Date(), "yyyy-MM-dd"),
    }).select().single();
    if (error || !newList) {
      toast({ title: "Erro ao duplicar", description: error?.message, variant: "destructive" });
      return;
    }
    if (listItems.length > 0) {
      await supabase.from("shopping_items").insert(
        listItems.map(({ id, list_id, ...rest }) => ({
          ...rest,
          list_id: newList.id,
          user_id: user.id,
          purchased: false,
        }))
      );
    }
    toast({ title: `Lista "${list.name}" duplicada!` });
    fetchLists();
  };

  const renderItem = (item: ShoppingItem, dragHandleProps?: any) => {
    const isEditingThis = editingItemId === item.id;

    if (isEditingThis) {
      return (
        <div className="space-y-1.5 p-2 rounded-md bg-muted/50 border border-primary/20 animate-fade-in">
          <input
            type="text"
            value={editItemName}
            onChange={e => setEditItemName(e.target.value)}
            className="w-full py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleUpdateItem(item); if (e.key === "Escape") setEditingItemId(null); }}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <input type="number" placeholder="Qtd" value={editItemQty} onChange={e => setEditItemQty(e.target.value)}
              className="py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30" min="0" step="0.1" />
            <select value={editItemUnit} onChange={e => setEditItemUnit(e.target.value)}
              className="py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30">
              <option value="">Unidade</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input type="text" inputMode="decimal" placeholder="R$ valor" value={editItemValue} onChange={e => setEditItemValue(e.target.value)}
              className="py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30" />
          </div>
          <div className="space-y-1">
            <select value={editItemCategory} onChange={e => {
              if (e.target.value === "__new__") { setShowNewCategoryInput("edit"); setNewCategoryInput(""); }
              else setEditItemCategory(e.target.value);
            }}
              className="w-full py-1.5 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30">
              <option value="">Categoria (opcional)</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Nova categoria...</option>
            </select>
            {showNewCategoryInput === "edit" && (
              <div className="flex gap-1">
                <input type="text" value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)}
                  placeholder="Nome da categoria" autoFocus
                  className="flex-1 py-1 px-2 rounded-md bg-background text-foreground text-[10px] outline-none focus:ring-1 ring-primary/30"
                  onKeyDown={e => { if (e.key === "Enter") handleAddCategory(newCategoryInput, "edit"); if (e.key === "Escape") setShowNewCategoryInput(null); }}
                />
                <button onClick={() => handleAddCategory(newCategoryInput, "edit")} disabled={!newCategoryInput.trim()}
                  className="px-1.5 py-1 rounded-md bg-primary text-primary-foreground text-[10px] disabled:opacity-50"><Plus className="w-3 h-3" /></button>
                <button onClick={() => setShowNewCategoryInput(null)}
                  className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground text-[10px]"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => handleUpdateItem(item)} disabled={!editItemName.trim()}
              title="Salvar alterações do item"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50">
              <Check className="w-3 h-3" /> Salvar
            </button>
            <button onClick={() => setEditingItemId(null)}
              title="Cancelar edição do item"
              className="px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground text-[10px] font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={cn(
        "flex items-center gap-1 px-1 py-1.5 rounded-md transition-colors",
        item.purchased ? "bg-muted/50" : "hover:bg-muted/30"
      )}>
        {dragHandleProps && (
          <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/50 hover:text-muted-foreground shrink-0 touch-none">
            <GripVertical className="w-3 h-3" />
          </span>
        )}
        <Checkbox checked={item.purchased} onCheckedChange={() => handleTogglePurchased(item)} />
        <div className={cn("flex-1 min-w-0 cursor-pointer ml-1", item.purchased && "line-through opacity-50")}
          onClick={() => startEditItem(item)} title="Clique para editar">
          <span className="text-xs font-medium text-foreground">{item.name}</span>
          {(item.quantity || item.unit) && (
            <span className="text-[10px] text-muted-foreground ml-1.5">
              {item.quantity || ""}{item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          {item.category && (
            <span className="text-[10px] text-muted-foreground ml-1.5 bg-primary/10 px-1 py-0.5 rounded">
              {item.category}
            </span>
          )}
        </div>
        {item.estimated_value !== null && item.estimated_value > 0 && (
          <span className={cn("text-[10px] font-medium shrink-0", item.purchased ? "text-muted-foreground line-through" : "text-primary")}>
            {formatCurrency(item.estimated_value * (item.quantity || 1))}
          </span>
        )}
        <button onClick={() => startEditItem(item)} className="p-1 rounded text-muted-foreground hover:text-primary transition-colors shrink-0" title="Editar item">
          <Edit2 className="w-3 h-3" />
        </button>
        <button onClick={() => handleDeleteItem(item)} title="Excluir item" className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar lista ou item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-2 ring-primary/30"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "p-2 rounded-lg transition-colors relative",
            showFilters || activeFilterCount > 0
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-primary/10"
          )}
          title="Filtros"
        >
          <Filter className="w-3.5 h-3.5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowCategoryManager(!showCategoryManager)}
          className={cn(
            "p-2 rounded-lg transition-colors",
            showCategoryManager
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-primary/10"
          )}
          title="Gerenciar categorias"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowNewList(!showNewList)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Lista
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="p-3 rounded-lg border border-border bg-card space-y-2.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Filtros</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="flex items-center gap-1 text-[10px] text-destructive hover:underline">
                <XCircle className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Data de</label>
              <DateInput value={filterDateFrom} onChange={setFilterDateFrom} size="sm" placeholder="Início" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Data até</label>
              <DateInput value={filterDateTo} onChange={setFilterDateTo} size="sm" placeholder="Fim" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="all">Todos</option>
                <option value="completed">Concluídas</option>
                <option value="pending">Pendentes</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Categoria do item</label>
              <select
                value={filterCategory}
                onChange={e => {
                  if (e.target.value === "__new__") { setShowNewCategoryInput("filter"); setNewCategoryInput(""); }
                  else setFilterCategory(e.target.value);
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="">Todas</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ Nova categoria...</option>
              </select>
              {showNewCategoryInput === "filter" && (
                <div className="flex gap-1 mt-1">
                  <input type="text" value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)}
                    placeholder="Nome da categoria" autoFocus
                    className="flex-1 py-1 px-2 rounded-md bg-muted text-foreground text-[10px] outline-none focus:ring-1 ring-primary/30"
                    onKeyDown={e => { if (e.key === "Enter") handleAddCategory(newCategoryInput, "filter"); if (e.key === "Escape") setShowNewCategoryInput(null); }}
                  />
                  <button onClick={() => handleAddCategory(newCategoryInput, "filter")} disabled={!newCategoryInput.trim()}
                    className="px-1.5 py-1 rounded-md bg-primary text-primary-foreground text-[10px] disabled:opacity-50"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => setShowNewCategoryInput(null)}
                    className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground text-[10px]"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Ordenar por</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
              >
                <option value="date">Data</option>
                <option value="name">Nome</option>
                <option value="progress">Progresso</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Direção</label>
              <button
                onClick={() => setSortDir(prev => prev === "asc" ? "desc" : "asc")}
                title="Alternar direção da ordenação"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-muted text-foreground text-xs hover:bg-primary/10 transition-colors"
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortDir === "asc" ? "Crescente" : "Decrescente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Panel */}
      {showCategoryManager && (
        <div className="p-3 rounded-lg border border-border bg-card space-y-2.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-primary" /> Gerenciar Categorias
            </span>
            <button onClick={() => setShowCategoryManager(false)} title="Fechar gerenciador de categorias" className="p-1 rounded text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add new category */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={managerNewCatInput}
              onChange={e => setManagerNewCatInput(e.target.value)}
              placeholder="Nova categoria..."
              className="flex-1 py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
              onKeyDown={e => {
                if (e.key === "Enter" && managerNewCatInput.trim()) {
                  handleAddCategory(managerNewCatInput, "filter");
                  setManagerNewCatInput("");
                }
              }}
            />
            <button
              onClick={() => { handleAddCategory(managerNewCatInput, "filter"); setManagerNewCatInput(""); }}
              disabled={!managerNewCatInput.trim()}
              title="Criar nova categoria"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Criar
            </button>
          </div>

          {/* Default categories */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Categorias padrão (não editáveis)</p>
            <div className="flex flex-wrap gap-1">
              {DEFAULT_CATEGORIES.map(c => (
                <span key={c} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Custom categories */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">
              Categorias personalizadas ({customCategories.length})
            </p>
            {customCategories.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60 italic py-1">Nenhuma categoria personalizada criada</p>
            ) : (
              <div className="space-y-1">
                {[...customCategories].sort((a, b) => a.localeCompare(b)).map(cat => (
                  <div key={cat} className="flex items-center gap-1.5 group">
                    {editingCategory?.old === cat ? (
                      <>
                        <input
                          type="text"
                          value={editingCategory.new}
                          onChange={e => setEditingCategory({ ...editingCategory, new: e.target.value })}
                          className="flex-1 py-1 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") handleEditCategory(editingCategory.old, editingCategory.new);
                            if (e.key === "Escape") setEditingCategory(null);
                          }}
                        />
                        <button onClick={() => handleEditCategory(editingCategory.old, editingCategory.new)}
                          className="p-1 rounded text-primary hover:bg-primary/10"><Check className="w-3 h-3" /></button>
                        <button onClick={() => setEditingCategory(null)}
                          className="p-1 rounded text-muted-foreground hover:bg-muted"><X className="w-3 h-3" /></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs text-foreground px-2 py-1 rounded-md bg-primary/5">{cat}</span>
                        <button
                          onClick={() => setEditingCategory({ old: cat, new: cat })}
                          className="p-1 rounded text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Renomear"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Excluir">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
                              <AlertDialogDescription>A categoria "{cat}" será removida. Os itens existentes manterão o valor atual.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteCategory(cat)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New list form */}
      {showNewList && (
        <div className="p-3 rounded-lg border border-border bg-card space-y-2 animate-fade-in">
          <input
            type="text"
            placeholder="Nome da lista (ex: Supermercado)"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
            autoFocus
          />
          <DateInput value={newListDate} onChange={setNewListDate} size="sm" />
          <div className="flex gap-2">
            <button
              onClick={handleCreateList}
              disabled={savingList || !newListName.trim() || !newListDate}
              title="Criar nova lista"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {savingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Criar
            </button>
            <button
              onClick={() => setShowNewList(false)}
              title="Cancelar criação da lista"
              className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lists */}
      {filteredLists.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{(search || activeFilterCount > 0) ? "Nenhuma lista encontrada com os filtros aplicados" : "Nenhuma lista de atividades criada"}</p>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} title="Limpar todos os filtros" className="mt-2 text-xs text-primary hover:underline">Limpar filtros</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLists.map(list => {
            const listItems = items[list.id] || [];
            const isExpanded = expandedLists.has(list.id);
            const isEditing = editingListId === list.id;
            const purchasedCount = listItems.filter(i => i.purchased).length;
            const totalItems = listItems.length;
            const totalValue = listItems.reduce((s, i) => s + ((i.estimated_value || 0) * (i.quantity || 1)), 0);
            const purchasedValue = listItems.filter(i => i.purchased).reduce((s, i) => s + ((i.estimated_value || 0) * (i.quantity || 1)), 0);

            return (
              <div key={list.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* List header */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => toggleExpand(list.id)} className="flex-1 flex items-center gap-2 min-w-0 text-left">
                    <ClipboardList className="w-4 h-4 text-primary shrink-0" />
                    {isEditing ? (
                      <div className="flex-1 space-y-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text" value={editListName}
                          onChange={e => setEditListName(e.target.value)}
                          className="w-full py-1 px-2 rounded bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          autoFocus
                        />
                        <DateInput value={editListDate} onChange={setEditListDate} size="sm" />
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{list.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(list.list_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                          {totalItems > 0 && (
                            <span className="ml-2">
                              {purchasedCount}/{totalItems} itens
                              {totalValue > 0 && ` · ${formatCurrency(purchasedValue)}/${formatCurrency(totalValue)}`}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {!isEditing && (isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />)}
                  </button>
                  {isEditing ? (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleUpdateList(list.id)} title="Salvar alterações da lista" className="p-1.5 rounded bg-primary text-primary-foreground"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingListId(null)} title="Cancelar edição" className="p-1.5 rounded bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleShareWhatsApp(list); }}
                        className="p-1.5 rounded text-whatsapp hover:bg-whatsapp/10 transition-colors"
                        title="Compartilhar via WhatsApp"
                      ><Send className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={e => { e.stopPropagation(); handlePrintList(list); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        title="Imprimir/Salvar PDF"
                      ><Printer className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDuplicateList(list); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        title="Duplicar lista como modelo"
                      ><Copy className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingListId(list.id); setEditListName(list.name); setEditListDate(list.list_date); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
                        title="Editar lista"
                      ><Edit2 className="w-3.5 h-3.5" /></button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button onClick={e => e.stopPropagation()} title="Excluir lista" className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
                            <AlertDialogDescription>A lista "{list.name}" e todos os seus itens serão removidos.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteList(list.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {totalItems > 0 && (
                  <div className="px-3 pb-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${(purchasedCount / totalItems) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-border px-3 py-2 space-y-1.5 animate-fade-in">
                    {/* Toggle all + items */}
                    {listItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">Nenhum item adicionado</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 pb-1">
                          {purchasedCount < totalItems && (
                            <button
                              onClick={() => handleToggleAllPurchased(list.id, true)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                              title="Marcar todos como concluídos"
                            >
                              <CheckCheck className="w-3 h-3" /> Marcar todos
                            </button>
                          )}
                          {purchasedCount > 0 && (
                            <button
                              onClick={() => handleToggleAllPurchased(list.id, false)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                              title="Desmarcar todos"
                            >
                              <Square className="w-3 h-3" /> Desmarcar todos
                            </button>
                          )}
                        </div>
                      <DragDropContext onDragEnd={(result) => handleDragEnd(result, list.id)}>
                        <Droppable droppableId={`list-${list.id}`}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-0.5">
                              {(() => {
                                const grouped: Record<string, ShoppingItem[]> = {};
                                listItems.forEach(item => {
                                  const cat = item.category || "Sem categoria";
                                  if (!grouped[cat]) grouped[cat] = [];
                                  grouped[cat].push(item);
                                });
                                const categoryKeys = Object.keys(grouped).sort((a, b) => {
                                  if (a === "Sem categoria") return 1;
                                  if (b === "Sem categoria") return -1;
                                  return a.localeCompare(b);
                                });
                                const hasMultipleCategories = categoryKeys.length > 1 || (categoryKeys.length === 1 && categoryKeys[0] !== "Sem categoria");

                                // For DnD we render a flat list with category headers interspersed
                                let globalIndex = 0;
                                return hasMultipleCategories ? (
                                  <>
                                    {categoryKeys.map(cat => (
                                      <React.Fragment key={cat}>
                                        <div className="flex items-center gap-1.5 mb-0.5 mt-1.5 first:mt-0">
                                          <Tag className="w-3 h-3 text-primary/70" />
                                          <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider">{cat}</span>
                                          <span className="text-[10px] text-muted-foreground">({grouped[cat].filter(i => i.purchased).length}/{grouped[cat].length})</span>
                                        </div>
                                        {grouped[cat].map(item => {
                                          const idx = listItems.indexOf(item);
                                          return (
                                            <Draggable key={item.id} draggableId={item.id} index={idx}>
                                              {(dragProvided, snapshot) => (
                                                <div
                                                  ref={dragProvided.innerRef}
                                                  {...dragProvided.draggableProps}
                                                  className={cn(snapshot.isDragging && "opacity-80 shadow-lg rounded-md bg-card")}
                                                >
                                                  {renderItem(item, dragProvided.dragHandleProps)}
                                                </div>
                                              )}
                                            </Draggable>
                                          );
                                        })}
                                      </React.Fragment>
                                    ))}
                                  </>
                                ) : (
                                  listItems.map((item, idx) => (
                                    <Draggable key={item.id} draggableId={item.id} index={idx}>
                                      {(dragProvided, snapshot) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          className={cn(snapshot.isDragging && "opacity-80 shadow-lg rounded-md bg-card")}
                                        >
                                          {renderItem(item, dragProvided.dragHandleProps)}
                                        </div>
                                      )}
                                    </Draggable>
                                  ))
                                );
                              })()}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                      </>
                    )}

                    {/* Add item form */}
                    {newItemListId === list.id ? (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        <input
                          type="text"
                          placeholder="Nome do item"
                          value={newItemName}
                          onChange={e => setNewItemName(e.target.value)}
                          className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter" && newItemName.trim()) handleAddItem(list.id); }}
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                          <input
                            type="number"
                            placeholder="Qtd"
                            value={newItemQty}
                            onChange={e => setNewItemQty(e.target.value)}
                            className="py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                            min="0"
                            step="0.1"
                          />
                          <select
                            value={newItemUnit}
                            onChange={e => setNewItemUnit(e.target.value)}
                            className="py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          >
                            <option value="">Unidade</option>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="R$ valor"
                            value={newItemValue}
                            onChange={e => setNewItemValue(e.target.value)}
                            className="py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          />
                        </div>
                        <div className="space-y-1">
                          <select
                            value={newItemCategory}
                            onChange={e => {
                              if (e.target.value === "__new__") { setShowNewCategoryInput("new"); setNewCategoryInput(""); }
                              else setNewItemCategory(e.target.value);
                            }}
                            className="w-full py-1.5 px-2 rounded-md bg-muted text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
                          >
                            <option value="">Categoria (opcional)</option>
                            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__new__">+ Nova categoria...</option>
                          </select>
                          {showNewCategoryInput === "new" && (
                            <div className="flex gap-1">
                              <input type="text" value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)}
                                placeholder="Nome da categoria" autoFocus
                                className="flex-1 py-1 px-2 rounded-md bg-muted text-foreground text-[10px] outline-none focus:ring-1 ring-primary/30"
                                onKeyDown={e => { if (e.key === "Enter") handleAddCategory(newCategoryInput, "new"); if (e.key === "Escape") setShowNewCategoryInput(null); }}
                              />
                              <button onClick={() => handleAddCategory(newCategoryInput, "new")} disabled={!newCategoryInput.trim()}
                                className="px-1.5 py-1 rounded-md bg-primary text-primary-foreground text-[10px] disabled:opacity-50"><Plus className="w-3 h-3" /></button>
                              <button onClick={() => setShowNewCategoryInput(null)}
                                className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground text-[10px]"><X className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button
            onClick={() => handleAddItem(list.id)}
                            disabled={!newItemName.trim()}
                            title="Adicionar item à lista"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" /> Adicionar
                          </button>
                          <button
                            onClick={() => { setNewItemListId(null); setNewItemName(""); setNewItemQty("1"); setNewItemUnit(""); setNewItemValue(""); setNewItemCategory(""); }}
                            title="Fechar formulário de item"
                            className="px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground text-[10px] font-semibold"
                          >
                            Fechar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setNewItemListId(list.id)}
                        title="Adicionar novo item à lista"
                        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar item
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

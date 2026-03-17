import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, BarChart3, PieChart, X, FileDown, CreditCard, Layers, Repeat, User, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import DateInput from "@/components/common/DateInput";
import type { FinanceRecord } from "./FinanceFormModal";

interface FinanceReportsProps {
  records: (FinanceRecord & { id: string })[];
  onClose: () => void;
}

const FinanceReports = ({ records, onClose }: FinanceReportsProps) => {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [filterPayee, setFilterPayee] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Extract unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const payees = [...new Set(records.map(r => r.payee?.trim()).filter(Boolean))].sort() as string[];
    const categories = [...new Set(records.map(r => r.category))].sort();
    const methods = [...new Set(records.map(r => (r as any).payment_method).filter(Boolean))].sort() as string[];
    return { payees, categories, methods };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const d = r.entry_date;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      if (filterPayee && (r.payee?.trim() || "") !== filterPayee) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterPaymentMethod && ((r as any).payment_method || "") !== filterPaymentMethod) return false;
      return true;
    });
  }, [records, startDate, endDate, filterPayee, filterCategory, filterType, filterStatus, filterPaymentMethod]);

  const hasActiveFilters = !!(filterPayee || filterCategory || filterType || filterStatus || filterPaymentMethod);
  const activeFilterCount = [filterPayee, filterCategory, filterType, filterStatus, filterPaymentMethod].filter(Boolean).length;

  const stats = useMemo(() => {
    const receitas = filteredRecords.filter(r => r.type === "receita");
    const despesas = filteredRecords.filter(r => r.type === "despesa");
    const totalReceitas = receitas.reduce((sum, r) => sum + r.amount, 0);
    const totalDespesas = despesas.reduce((sum, r) => sum + r.amount, 0);
    const saldo = totalReceitas - totalDespesas;
    const pendentes = filteredRecords.filter(r => r.status === "pendente");
    const totalPendente = pendentes.reduce((sum, r) => sum + r.amount, 0);
    const vencidos = filteredRecords.filter(r => r.status === "vencido");
    const totalVencido = vencidos.reduce((sum, r) => sum + r.amount, 0);
    const pagos = filteredRecords.filter(r => r.status === "pago");
    const totalPago = pagos.reduce((sum, r) => sum + r.amount, 0);
    const totalJuros = filteredRecords.reduce((sum, r) => sum + (r.interest_amount || 0), 0);
    const totalDesconto = filteredRecords.reduce((sum, r) => sum + (r.discount_amount || 0), 0);
    const totalDevido = totalReceitas + totalDespesas - totalPago;

    const byCategory: Record<string, { receita: number; despesa: number; juros: number; desconto: number }> = {};
    filteredRecords.forEach(r => {
      if (!byCategory[r.category]) byCategory[r.category] = { receita: 0, despesa: 0, juros: 0, desconto: 0 };
      byCategory[r.category][r.type] += r.amount;
      byCategory[r.category].juros += (r.interest_amount || 0);
      byCategory[r.category].desconto += (r.discount_amount || 0);
    });

    const byMonth: Record<string, { receita: number; despesa: number }> = {};
    filteredRecords.forEach(r => {
      const month = r.entry_date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { receita: 0, despesa: 0 };
      byMonth[month][r.type] += r.amount;
    });

    // Por forma de pagamento
    const byPaymentMethod: Record<string, { receita: number; despesa: number; count: number }> = {};
    filteredRecords.forEach(r => {
      const method = (r as any).payment_method || "Não informado";
      if (!byPaymentMethod[method]) byPaymentMethod[method] = { receita: 0, despesa: 0, count: 0 };
      byPaymentMethod[method][r.type] += r.amount;
      byPaymentMethod[method].count += 1;
    });

    // Parcelas vs Recorrentes
    const parcelas = filteredRecords.filter(r => r.installment_total && r.installment_total > 1 && !(r as any).is_recurring);
    const recorrentes = filteredRecords.filter(r => (r as any).is_recurring);
    const totalParcelas = parcelas.reduce((sum, r) => sum + r.amount, 0);
    const totalRecorrentes = recorrentes.reduce((sum, r) => sum + r.amount, 0);

    // Por favorecido
    const byPayee: Record<string, { receita: number; despesa: number; count: number }> = {};
    filteredRecords.forEach(r => {
      const payee = r.payee?.trim() || "Não informado";
      if (!byPayee[payee]) byPayee[payee] = { receita: 0, despesa: 0, count: 0 };
      byPayee[payee][r.type] += r.amount;
      byPayee[payee].count += 1;
    });

    return {
      totalReceitas, totalDespesas, saldo, totalPendente, totalVencido, totalPago, totalDevido,
      totalJuros, totalDesconto, pendentes: pendentes.length, vencidos: vencidos.length,
      byCategory, byMonth, byPaymentMethod, byPayee,
      parcelas: parcelas.length, totalParcelas,
      recorrentes: recorrentes.length, totalRecorrentes,
      total: filteredRecords.length,
    };
  }, [filteredRecords]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const sortedPaymentMethods = Object.entries(stats.byPaymentMethod).sort((a, b) =>
    (b[1].receita + b[1].despesa) - (a[1].receita + a[1].despesa)
  );

  const sortedCategories = Object.entries(stats.byCategory).sort((a, b) => 
    (b[1].despesa + b[1].receita) - (a[1].despesa + a[1].receita)
  );

  const sortedMonths = Object.entries(stats.byMonth).sort((a, b) => a[0].localeCompare(b[0]));

  const sortedPayees = Object.entries(stats.byPayee).sort((a, b) =>
    (b[1].receita + b[1].despesa) - (a[1].receita + a[1].despesa)
  );

  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    const addLine = (text: string, size = 10, bold = false) => {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(text, 14, y);
      y += size * 0.5 + 2;
    };

    const addSeparator = () => {
      doc.setDrawColor(200);
      doc.line(14, y, pageW - 14, y);
      y += 4;
    };

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório Financeiro", 14, y); y += 8;

    // Period & Filters
    const periodParts: string[] = [];
    if (startDate) periodParts.push(`De: ${format(new Date(startDate + "T12:00:00"), "dd/MM/yyyy")}`);
    if (endDate) periodParts.push(`Até: ${format(new Date(endDate + "T12:00:00"), "dd/MM/yyyy")}`);
    if (periodParts.length > 0) {
      addLine(periodParts.join("  •  "), 9);
    }
    // Print active filters
    const filterParts: string[] = [];
    if (filterPayee) filterParts.push(`Favorecido: ${filterPayee}`);
    if (filterCategory) filterParts.push(`Categoria: ${filterCategory}`);
    if (filterType) filterParts.push(`Tipo: ${filterType === "receita" ? "Receita" : "Despesa"}`);
    if (filterStatus) filterParts.push(`Status: ${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}`);
    if (filterPaymentMethod) filterParts.push(`Pagamento: ${filterPaymentMethod}`);
    if (filterParts.length > 0) {
      addLine(`Filtros: ${filterParts.join("  •  ")}`, 8);
    }
    addLine(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 8);
    addLine(`${stats.total} registro${stats.total !== 1 ? "s" : ""}`, 8);
    y += 2;
    addSeparator();

    // Summary
    addLine("RESUMO GERAL", 12, true); y += 1;
    addLine(`Devido:     ${fmt(stats.totalDevido)}  −  Pago: ${fmt(stats.totalPago)}  =  Saldo: ${fmt(stats.saldo)}`);
    addLine(`Receitas:   ${fmt(stats.totalReceitas)}`);
    addLine(`Despesas:   ${fmt(stats.totalDespesas)}`);
    addLine(`Pendentes:  ${fmt(stats.totalPendente)} (${stats.pendentes} reg.)`);
    addLine(`Vencidos:   ${fmt(stats.totalVencido)} (${stats.vencidos} reg.)`);
    addLine(`Pagos:      ${fmt(stats.totalPago)}`);
    if (stats.totalJuros > 0) addLine(`Juros:      ${fmt(stats.totalJuros)}`);
    if (stats.totalDesconto > 0) addLine(`Descontos:  ${fmt(stats.totalDesconto)}`);
    if (stats.parcelas > 0) addLine(`Parcelas:   ${fmt(stats.totalParcelas)} (${stats.parcelas} reg.)`);
    if (stats.recorrentes > 0) addLine(`Recorrentes: ${fmt(stats.totalRecorrentes)} (${stats.recorrentes} reg.)`);
    y += 2;
    addSeparator();

    // By Category
    if (sortedCategories.length > 0) {
      addLine("POR CATEGORIA", 12, true); y += 1;
      sortedCategories.forEach(([cat, vals]) => {
        const parts = [cat + ":"];
        if (vals.receita > 0) parts.push(`+${fmt(vals.receita)}`);
        if (vals.despesa > 0) parts.push(`-${fmt(vals.despesa)}`);
        if (vals.juros > 0) parts.push(`J:${fmt(vals.juros)}`);
        if (vals.desconto > 0) parts.push(`D:${fmt(vals.desconto)}`);
        addLine(parts.join("  "));
      });
      y += 2;
      addSeparator();
    }

    // By Payment Method
    if (sortedPaymentMethods.length > 0) {
      addLine("POR FORMA DE PAGAMENTO", 12, true); y += 1;
      sortedPaymentMethods.forEach(([method, vals]) => {
        const parts = [`${method} (${vals.count}):`];
        if (vals.receita > 0) parts.push(`+${fmt(vals.receita)}`);
        if (vals.despesa > 0) parts.push(`-${fmt(vals.despesa)}`);
        addLine(parts.join("  "));
      });
      y += 2;
      addSeparator();
    }

    // By Payee
    if (sortedPayees.length > 0) {
      addLine("POR FAVORECIDO", 12, true); y += 1;
      sortedPayees.forEach(([payee, vals]) => {
        const saldo = vals.receita - vals.despesa;
        const parts = [`${payee} (${vals.count}):`];
        if (vals.receita > 0) parts.push(`+${fmt(vals.receita)}`);
        if (vals.despesa > 0) parts.push(`-${fmt(vals.despesa)}`);
        parts.push(`Saldo: ${fmt(saldo)}`);
        addLine(parts.join("  "));
      });
      y += 2;
      addSeparator();
    }

    // By Month
    if (sortedMonths.length > 0) {
      addLine("POR MÊS", 12, true); y += 1;
      sortedMonths.forEach(([month, vals]) => {
        const [yr, mo] = month.split("-");
        const saldo = vals.receita - vals.despesa;
        addLine(`${mo}/${yr}:  Rec: ${fmt(vals.receita)}  Desp: ${fmt(vals.despesa)}  Saldo: ${fmt(saldo)}`);
      });
    }

    const fileName = `relatorio-financeiro${startDate ? `-${startDate.replace(/-/g, "")}` : ""}${endDate ? `-${endDate.replace(/-/g, "")}` : ""}.pdf`;
    const blobUrl = URL.createObjectURL(doc.output("blob"));
    navigate("/visualizador", {
      state: {
        items: [{ url: blobUrl, name: fileName, type: "application/pdf" }],
        startIndex: 0,
      },
    });
  }, [stats, sortedCategories, sortedMonths, sortedPaymentMethods, sortedPayees, startDate, endDate, filterPayee, filterCategory, filterType, filterStatus, filterPaymentMethod, fmt, navigate]);

  const clearAllFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setFilterPayee("");
    setFilterCategory("");
    setFilterType("");
    setFilterStatus("");
    setFilterPaymentMethod("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Relatórios
        </h3>
        <div className="flex items-center gap-3">
          <button onClick={handleExportPDF} title="Exportar PDF" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={onClose} title="Voltar" className="text-xs text-primary font-semibold hover:underline">Voltar</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="glass-card rounded-xl p-3 space-y-2">
        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-foreground shrink-0">Período:</span>
          <DateInput value={startDate} onChange={setStartDate} placeholder="Início" size="sm" wrapperClassName="flex-1" />
          <span className="text-[10px] text-muted-foreground shrink-0">até</span>
          <DateInput value={endDate} onChange={setEndDate} placeholder="Fim" size="sm" wrapperClassName="flex-1" />
        </div>

        {/* Toggle filtros adicionais */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          title="Mostrar/ocultar filtros"
          className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline w-full justify-center"
        >
          <Filter className="w-3 h-3" />
          Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase">Favorecido</label>
              <select
                value={filterPayee}
                onChange={e => setFilterPayee(e.target.value)}
                title="Filtrar por favorecido"
                className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
              >
                <option value="">Todos</option>
                {filterOptions.payees.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase">Categoria</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                title="Filtrar por categoria"
                className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
              >
                <option value="">Todas</option>
                {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase">Tipo</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                title="Filtrar por tipo"
                className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
              >
                <option value="">Todos</option>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                title="Filtrar por status"
                className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
              >
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            {filterOptions.methods.length > 0 && (
              <div className="space-y-0.5 col-span-2">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase">Forma de Pagamento</label>
                <select
                  value={filterPaymentMethod}
                  onChange={e => setFilterPaymentMethod(e.target.value)}
                  title="Filtrar por forma de pagamento"
                  className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground"
                >
                  <option value="">Todas</option>
                  {filterOptions.methods.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Info e limpar */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {stats.total} registro{stats.total !== 1 ? "s" : ""}
            {(hasActiveFilters || startDate || endDate) ? " filtrado(s)" : ""}
          </p>
          {(hasActiveFilters || startDate || endDate) && (
            <button
              onClick={clearAllFilters}
              title="Limpar todos os filtros"
              className="text-[10px] text-primary font-semibold hover:underline flex items-center gap-0.5"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Summary: Devido - Pago - Saldo */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-foreground">Resumo</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-bold flex-wrap">
          <span className="text-primary">{fmt(stats.totalDevido)}</span>
          <span className="text-muted-foreground">devido</span>
          <span className="text-muted-foreground">−</span>
          <span className="text-green-500">{fmt(stats.totalPago)}</span>
          <span className="text-muted-foreground">pago</span>
          <span className="text-muted-foreground">=</span>
          <span className={stats.saldo >= 0 ? "text-green-500" : "text-destructive"}>{fmt(stats.saldo)}</span>
          <span className="text-muted-foreground">saldo</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="glass-card rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-green-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Receitas</span>
          </div>
          <p className="text-sm font-bold text-green-500">{fmt(stats.totalReceitas)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-destructive">
            <TrendingDown className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Despesas</span>
          </div>
          <p className="text-sm font-bold text-destructive">{fmt(stats.totalDespesas)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Devido</span>
          <p className="text-sm font-bold text-primary">{fmt(stats.totalDevido)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Pendentes</span>
          <p className="text-sm font-bold text-primary">{fmt(stats.totalPendente)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.pendentes} registros</p>
        </div>
        <div className="glass-card rounded-xl p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Vencidos</span>
          <p className="text-sm font-bold text-destructive">{fmt(stats.totalVencido)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.vencidos} registros</p>
        </div>
        <div className="glass-card rounded-xl p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-green-500">Pagos</span>
          <p className="text-sm font-bold text-green-500">{fmt(stats.totalPago)}</p>
        </div>
        {stats.totalJuros > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">Juros</span>
            <p className="text-sm font-bold text-orange-500">{fmt(stats.totalJuros)}</p>
          </div>
        )}
        {stats.totalDesconto > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Descontos</span>
            <p className="text-sm font-bold text-blue-500">{fmt(stats.totalDesconto)}</p>
          </div>
        )}
      </div>

      {/* Parcelas vs Recorrentes */}
      {(stats.parcelas > 0 || stats.recorrentes > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {stats.parcelas > 0 && (
            <div className="glass-card rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-primary">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Parcelas</span>
              </div>
              <p className="text-sm font-bold text-primary">{fmt(stats.totalParcelas)}</p>
              <p className="text-[10px] text-muted-foreground">{stats.parcelas} registros</p>
            </div>
          )}
          {stats.recorrentes > 0 && (
            <div className="glass-card rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-accent-foreground">
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Recorrentes</span>
              </div>
              <p className="text-sm font-bold text-accent-foreground">{fmt(stats.totalRecorrentes)}</p>
              <p className="text-[10px] text-muted-foreground">{stats.recorrentes} registros</p>
            </div>
          )}
        </div>
      )}

      {/* Por Forma de Pagamento */}
      {sortedPaymentMethods.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" /> Por Forma de Pagamento
          </h4>
          <div className="space-y-2">
            {sortedPaymentMethods.map(([method, vals]) => {
              const total = vals.receita + vals.despesa;
              const maxTotal = sortedPaymentMethods[0]?.[1] ? sortedPaymentMethods[0][1].receita + sortedPaymentMethods[0][1].despesa : 1;
              return (
                <div key={method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{method} <span className="text-muted-foreground font-normal">({vals.count})</span></span>
                    <div className="flex items-center gap-3">
                      {vals.receita > 0 && <span className="text-green-500">+{fmt(vals.receita)}</span>}
                      {vals.despesa > 0 && <span className="text-destructive">-{fmt(vals.despesa)}</span>}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                    {vals.receita > 0 && (
                      <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(vals.receita / maxTotal) * 100}%` }} />
                    )}
                    {vals.despesa > 0 && (
                      <div className="h-full bg-destructive" style={{ width: `${(vals.despesa / maxTotal) * 100}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Por Favorecido (Extrato) */}
      {sortedPayees.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Por Favorecido
          </h4>
          <div className="space-y-2">
            {sortedPayees.map(([payee, vals]) => {
              const total = vals.receita + vals.despesa;
              const maxTotal = sortedPayees[0]?.[1] ? sortedPayees[0][1].receita + sortedPayees[0][1].despesa : 1;
              const saldo = vals.receita - vals.despesa;
              return (
                <div key={payee} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{payee} <span className="text-muted-foreground font-normal">({vals.count})</span></span>
                    <div className="flex items-center gap-3">
                      {vals.receita > 0 && <span className="text-green-500">+{fmt(vals.receita)}</span>}
                      {vals.despesa > 0 && <span className="text-destructive">-{fmt(vals.despesa)}</span>}
                      <span className={`font-bold ${saldo >= 0 ? "text-green-500" : "text-destructive"}`}>{fmt(saldo)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                    {vals.receita > 0 && (
                      <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(vals.receita / maxTotal) * 100}%` }} />
                    )}
                    {vals.despesa > 0 && (
                      <div className="h-full bg-destructive" style={{ width: `${(vals.despesa / maxTotal) * 100}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Por Categoria */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" /> Por Categoria
        </h4>
        <div className="space-y-2">
          {sortedCategories.map(([cat, vals]) => {
            const total = vals.receita + vals.despesa;
            const maxTotal = sortedCategories[0]?.[1] ? sortedCategories[0][1].receita + sortedCategories[0][1].despesa : 1;
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">{cat}</span>
                  <div className="flex items-center gap-3">
                    {vals.receita > 0 && <span className="text-green-500">+{fmt(vals.receita)}</span>}
                    {vals.despesa > 0 && <span className="text-destructive">-{fmt(vals.despesa)}</span>}
                    {vals.juros > 0 && <span className="text-orange-500">J:{fmt(vals.juros)}</span>}
                    {vals.desconto > 0 && <span className="text-blue-500">D:{fmt(vals.desconto)}</span>}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                  {vals.receita > 0 && (
                    <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${(vals.receita / maxTotal) * 100}%` }} />
                  )}
                  {vals.despesa > 0 && (
                    <div className="h-full bg-destructive" style={{ width: `${(vals.despesa / maxTotal) * 100}%` }} />
                  )}
                </div>
              </div>
            );
          })}
          {sortedCategories.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado disponível.</p>
          )}
        </div>
      </div>

      {/* Por mês */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Por Mês
        </h4>
        <div className="space-y-2">
          {sortedMonths.map(([month, vals]) => {
            const [y, m] = month.split("-");
            const label = `${m}/${y}`;
            const maxVal = Math.max(...sortedMonths.map(([, v]) => Math.max(v.receita, v.despesa)), 1);
            return (
              <div key={month} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className={`font-semibold ${vals.receita - vals.despesa >= 0 ? "text-green-500" : "text-destructive"}`}>
                    {fmt(vals.receita - vals.despesa)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="h-3 rounded bg-green-500/80" style={{ width: `${(vals.receita / maxVal) * 50}%`, minWidth: vals.receita > 0 ? 4 : 0 }} />
                  <div className="h-3 rounded bg-destructive/80" style={{ width: `${(vals.despesa / maxVal) * 50}%`, minWidth: vals.despesa > 0 ? 4 : 0 }} />
                </div>
              </div>
            );
          })}
          {sortedMonths.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado disponível.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceReports;

import { useState, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, Pencil, Trash2, FileDown, FileText, X, Check, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type TipoLancamento = "debito" | "credito";

interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  bu: string;
  negociacao: string;
  volume: number | null;
  valorPedido: number | null;
  dataAprovacao: string;
  valorUnit: number | null;
  investimentoTotal: number | null;
  percInvestimento: number | null;
}

const STORAGE_KEY = "vilasales_conta_corrente";

const loadData = (): Lancamento[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((l: any) => ({ ...l, tipo: l.tipo || "debito" }));
  } catch { return []; }
};

const saveData = (data: Lancamento[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const emptyForm = (): Omit<Lancamento, "id"> => ({
  tipo: "debito",
  bu: "",
  negociacao: "",
  volume: null,
  valorPedido: null,
  dataAprovacao: format(new Date(), "yyyy-MM-dd"),
  valorUnit: null,
  investimentoTotal: null,
  percInvestimento: null,
});

const fmtMoney = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const fmtPerc = (v: number | null) =>
  v != null ? `${(v * 100).toFixed(1)}%` : "—";

const fmtNum = (v: number | null) => (v != null ? v.toLocaleString("pt-BR") : "—");

const parseNum = (s: string): number | null => {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const inputStyle =
  "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const ContaCorrente = () => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(loadData);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [filterFrom, setFilterFrom] = useState<Date | undefined>(undefined);
  const [filterTo, setFilterTo] = useState<Date | undefined>(undefined);

  const persist = (data: Lancamento[]) => {
    setLancamentos(data);
    saveData(data);
  };

  const handleSave = () => {
    if (!form.negociacao.trim()) return;
    if (editingId) {
      persist(lancamentos.map((l) => (l.id === editingId ? { ...form, id: editingId } : l)));
    } else {
      persist([...lancamentos, { ...form, id: crypto.randomUUID() }]);
    }
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (l: Lancamento) => {
    setForm({ tipo: l.tipo, bu: l.bu, negociacao: l.negociacao, volume: l.volume, valorPedido: l.valorPedido, dataAprovacao: l.dataAprovacao, valorUnit: l.valorUnit, investimentoTotal: l.investimentoTotal, percInvestimento: l.percInvestimento });
    setEditingId(l.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    persist(lancamentos.filter((l) => l.id !== id));
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const filtered = useMemo(() => {
    return lancamentos.filter((l) => {
      const d = new Date(l.dataAprovacao + "T00:00:00");
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      return true;
    });
  }, [lancamentos, filterFrom, filterTo]);

  const totalCredito = useMemo(() => filtered.filter((l) => l.tipo === "credito").reduce((s, l) => s + (l.investimentoTotal ?? 0), 0), [filtered]);
  const totalDebito = useMemo(() => filtered.filter((l) => l.tipo === "debito").reduce((s, l) => s + (l.investimentoTotal ?? 0), 0), [filtered]);
  const saldo = totalCredito - totalDebito;

  const exportExcel = () => {
    const rows = filtered.map((l) => ({
      Tipo: l.tipo === "credito" ? "Crédito" : "Débito",
      BU: l.bu,
      Negociação: l.negociacao,
      Volume: l.volume ?? "",
      "Valor Pedido": l.valorPedido ?? "",
      "Data Aprovação": l.dataAprovacao ? format(new Date(l.dataAprovacao + "T00:00:00"), "dd/MM/yyyy") : "",
      "Valor Unit": l.valorUnit ?? "",
      "Investimento Total": l.investimentoTotal ?? "",
      "% Investimento": l.percInvestimento != null ? l.percInvestimento : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conta Corrente");
    XLSX.writeFile(wb, "conta_corrente.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Conta Corrente", 14, 18);
    doc.setFontSize(9);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 24);
    doc.text(`Crédito: ${fmtMoney(totalCredito)}  |  Débito: ${fmtMoney(totalDebito)}  |  Saldo: ${fmtMoney(saldo)}`, 14, 30);

    const head = [["Tipo", "BU", "Negociação", "Volume", "Valor Pedido", "Data Aprovação", "Valor Unit", "Investimento Total", "% Investimento"]];
    const body = filtered.map((l) => [
      l.tipo === "credito" ? "Crédito" : "Débito",
      l.bu,
      l.negociacao,
      fmtNum(l.volume),
      fmtMoney(l.valorPedido),
      l.dataAprovacao ? format(new Date(l.dataAprovacao + "T00:00:00"), "dd/MM/yyyy") : "—",
      fmtMoney(l.valorUnit),
      fmtMoney(l.investimentoTotal),
      fmtPerc(l.percInvestimento),
    ]);

    autoTable(doc, {
      startY: 36,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    doc.save("conta_corrente.pdf");
  };

  const setField = (key: keyof Omit<Lancamento, "id">, value: string) => {
    if (["volume", "valorPedido", "valorUnit", "investimentoTotal", "percInvestimento"].includes(key)) {
      setForm((f) => ({ ...f, [key]: value === "" ? null : parseNum(value) }));
    } else {
      setForm((f) => ({ ...f, [key]: value }));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Conta Corrente" description="Gestão de negociações e investimentos" />

      {/* Summary Cards - Crédito / Débito / Saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center">
            <ArrowUpCircle className="w-6 h-6 text-success" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Crédito</p>
            <p className="text-2xl font-bold text-success">{fmtMoney(totalCredito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
            <ArrowDownCircle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Débito</p>
            <p className="text-2xl font-bold text-destructive">{fmtMoney(totalDebito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", saldo >= 0 ? "bg-success/15" : "bg-destructive/15")}>
            {saldo >= 0 ? <TrendingUp className="w-6 h-6 text-success" /> : <TrendingDown className="w-6 h-6 text-destructive" />}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Saldo</p>
            <p className={cn("text-2xl font-bold", saldo >= 0 ? "text-success" : "text-destructive")}>{fmtMoney(saldo)}</p>
          </div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Data Início</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !filterFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filterFrom ? format(filterFrom, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterFrom} onSelect={setFilterFrom} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !filterTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filterTo ? format(filterTo, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterTo} onSelect={setFilterTo} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        {(filterFrom || filterTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(undefined); setFilterTo(undefined); }}>
            <X className="w-4 h-4 mr-1" /> Limpar filtros
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileDown className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }}>
            <Plus className="w-4 h-4 mr-1" /> Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">{editingId ? "Editar Lançamento" : "Novo Lançamento"}</h3>
          
          {/* Tipo selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, tipo: "credito" }))}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                form.tipo === "credito"
                  ? "border-success bg-success/10 text-success"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              )}
            >
              <ArrowUpCircle className="w-4 h-4" /> Crédito
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, tipo: "debito" }))}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                form.tipo === "debito"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              )}
            >
              <ArrowDownCircle className="w-4 h-4" /> Débito
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">BU</label>
              <input className={inputStyle} value={form.bu} onChange={(e) => setField("bu", e.target.value)} placeholder="Ex: HC" />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Negociação</label>
              <input className={inputStyle} value={form.negociacao} onChange={(e) => setField("negociacao", e.target.value)} placeholder="Descrição da negociação" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Aprovação</label>
              <input type="date" className={inputStyle} value={form.dataAprovacao} onChange={(e) => setField("dataAprovacao", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Volume</label>
              <input className={inputStyle} value={form.volume ?? ""} onChange={(e) => setField("volume", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor Pedido (R$)</label>
              <input className={inputStyle} value={form.valorPedido ?? ""} onChange={(e) => setField("valorPedido", e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor Unitário (R$)</label>
              <input className={inputStyle} value={form.valorUnit ?? ""} onChange={(e) => setField("valorUnit", e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Investimento Total (R$)</label>
              <input className={inputStyle} value={form.investimentoTotal ?? ""} onChange={(e) => setField("investimentoTotal", e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">% Investimento</label>
              <input className={inputStyle} value={form.percInvestimento != null ? (form.percInvestimento * 100).toString() : ""} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, percInvestimento: v === "" ? null : (parseFloat(v.replace(",", ".")) / 100) || null })); }} placeholder="Ex: 6.0" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSave}>
              <Check className="w-4 h-4 mr-1" /> {editingId ? "Salvar Alterações" : "Adicionar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">BU</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Negociação</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Volume</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Pedido</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Data Aprovação</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Unit</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Investimento Total</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">% Invest.</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Nenhum lançamento encontrado</td></tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-center">
                    {l.tipo === "credito" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-full">
                        <ArrowUpCircle className="w-3 h-3" /> Crédito
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                        <ArrowDownCircle className="w-3 h-3" /> Débito
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{l.bu || "—"}</td>
                  <td className="px-4 py-3">{l.negociacao}</td>
                  <td className="px-4 py-3 text-right">{fmtNum(l.volume)}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(l.valorPedido)}</td>
                  <td className="px-4 py-3 text-center">{l.dataAprovacao ? format(new Date(l.dataAprovacao + "T00:00:00"), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(l.valorUnit)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(l.investimentoTotal)}</td>
                  <td className="px-4 py-3 text-right">{fmtPerc(l.percInvestimento)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(l)}>
                        <Pencil className="w-4 h-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(l.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContaCorrente;

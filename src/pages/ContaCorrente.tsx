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
  competencia: string;
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
    return parsed.map((l: any) => ({ ...l, tipo: l.tipo || "debito", competencia: l.competencia || "" }));
  } catch { return []; }
};

const saveData = (data: Lancamento[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const emptyForm = (): Omit<Lancamento, "id"> => ({
  tipo: "debito",
  bu: "",
  negociacao: "",
  competencia: "",
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

// Cents-based money mask: user types digits, display formats as R$ X.XXX,XX
const moneyMask = (cents: number): string => {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const handleMoneyInput = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
};

const moneyDisplay = (v: number | null): string => {
  if (v == null) return "";
  return moneyMask(Math.round(v * 100));
};

// Percentage mask: user types digits, display formats as X,XX%
const handlePercInput = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return parseInt(digits, 10) / 10000; // stored as decimal (6% = 0.06)
};

const percDisplay = (v: number | null): string => {
  if (v == null) return "";
  const val = Math.round(v * 10000);
  const int = Math.floor(val / 100);
  const dec = (val % 100).toString().padStart(2, "0");
  return `${int},${dec}%`;
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
  const [filterBu, setFilterBu] = useState<string>("");

  const buOptions = useMemo(() => {
    const set = new Set(lancamentos.map((l) => l.bu).filter(Boolean));
    return Array.from(set).sort();
  }, [lancamentos]);

  const persist = (data: Lancamento[]) => {
    setLancamentos(data);
    saveData(data);
  };

  const handleSave = () => {
    if (!form.negociacao.trim()) return;
    const calcPerc = form.valorPedido && form.investimentoTotal ? form.investimentoTotal / form.valorPedido : form.percInvestimento;
    const finalForm = { ...form, percInvestimento: calcPerc };
    if (editingId) {
      persist(lancamentos.map((l) => (l.id === editingId ? { ...finalForm, id: editingId } : l)));
    } else {
      persist([...lancamentos, { ...finalForm, id: crypto.randomUUID() }]);
    }
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (l: Lancamento) => {
    setForm({ tipo: l.tipo, bu: l.bu, negociacao: l.negociacao, competencia: l.competencia, volume: l.volume, valorPedido: l.valorPedido, dataAprovacao: l.dataAprovacao, valorUnit: l.valorUnit, investimentoTotal: l.investimentoTotal, percInvestimento: l.percInvestimento });
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
      if (filterBu && l.bu !== filterBu) return false;
      return true;
    });
  }, [lancamentos, filterFrom, filterTo, filterBu]);

  const totalCredito = useMemo(() => filtered.filter((l) => l.tipo === "credito").reduce((s, l) => s + (l.investimentoTotal ?? 0), 0), [filtered]);
  const totalDebito = useMemo(() => filtered.filter((l) => l.tipo === "debito").reduce((s, l) => s + (l.investimentoTotal ?? 0), 0), [filtered]);
  const saldo = totalCredito - totalDebito;

  const exportExcel = () => {
    const rows = filtered.map((l) => ({
      Tipo: l.tipo === "credito" ? "Crédito" : "Débito",
      BU: l.bu,
      Negociação: l.negociacao,
      Competência: l.competencia || "",
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

    const head = [["Tipo", "BU", "Negociação", "Competência", "Volume", "Valor Pedido", "Data Aprovação", "Valor Unit", "Investimento Total", "% Investimento"]];
    const body = filtered.map((l) => [
      l.tipo === "credito" ? "Crédito" : "Débito",
      l.bu,
      l.negociacao,
      l.competencia || "—",
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
      setForm((f) => ({ ...f, [key]: value.toUpperCase() }));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Conta Corrente" description="Gestão de negociações e investimentos" />

      {/* Summary Cards - Crédito / Débito / Saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-success/15 flex items-center justify-center">
            <ArrowUpCircle className="w-4.5 h-4.5 text-success" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Total Crédito</p>
            <p className="text-lg font-bold text-success">{fmtMoney(totalCredito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/15 flex items-center justify-center">
            <ArrowDownCircle className="w-4.5 h-4.5 text-destructive" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Total Débito</p>
            <p className="text-lg font-bold text-destructive">{fmtMoney(totalDebito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", saldo >= 0 ? "bg-success/15" : "bg-destructive/15")}>
            {saldo >= 0 ? <TrendingUp className="w-4.5 h-4.5 text-success" /> : <TrendingDown className="w-4.5 h-4.5 text-destructive" />}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Saldo</p>
            <p className={cn("text-lg font-bold", saldo >= 0 ? "text-success" : "text-destructive")}>{fmtMoney(saldo)}</p>
          </div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">Data Início</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[130px] h-8 justify-start text-left text-xs font-normal", !filterFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {filterFrom ? format(filterFrom, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterFrom} onSelect={setFilterFrom} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">Data Fim</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[130px] h-8 justify-start text-left text-xs font-normal", !filterTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {filterTo ? format(filterTo, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterTo} onSelect={setFilterTo} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">BU</label>
          <select className={cn(inputStyle, "w-[120px] h-8 text-xs py-1.5")} value={filterBu} onChange={(e) => setFilterBu(e.target.value)}>
            <option value="">Todos</option>
            {buOptions.map((bu) => (
              <option key={bu} value={bu}>{bu}</option>
            ))}
          </select>
        </div>
        {(filterFrom || filterTo || filterBu) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(undefined); setFilterTo(undefined); setFilterBu(""); }}>
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
            <div className={cn("space-y-1", form.tipo === "credito" ? "lg:col-span-1" : "lg:col-span-2")}>
              <label className="text-xs font-medium text-muted-foreground">Negociação</label>
              <input className={inputStyle} value={form.negociacao} onChange={(e) => setField("negociacao", e.target.value)} placeholder="Descrição da negociação" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Competência</label>
              <input className={inputStyle} value={form.competencia} onChange={(e) => setField("competencia", e.target.value)} placeholder="Ex: Abril/2026" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Aprovação</label>
              <input type="date" className={inputStyle} value={form.dataAprovacao} onChange={(e) => setField("dataAprovacao", e.target.value)} />
            </div>
            {form.tipo === "credito" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
                <input className={inputStyle} value={moneyDisplay(form.investimentoTotal)} onChange={(e) => setForm((f) => ({ ...f, investimentoTotal: handleMoneyInput(e.target.value) }))} placeholder="R$ 0,00" />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Volume</label>
                  <input className={inputStyle} value={form.volume ?? ""} onChange={(e) => setField("volume", e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor Pedido (R$)</label>
                  <input className={inputStyle} value={moneyDisplay(form.valorPedido)} onChange={(e) => setForm((f) => ({ ...f, valorPedido: handleMoneyInput(e.target.value) }))} placeholder="R$ 0,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Investimento Unit (R$)</label>
                  <input className={inputStyle} value={moneyDisplay(form.valorUnit)} onChange={(e) => setForm((f) => ({ ...f, valorUnit: handleMoneyInput(e.target.value) }))} placeholder="R$ 0,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Investimento Total (R$)</label>
                  <input className={inputStyle} value={moneyDisplay(form.investimentoTotal)} onChange={(e) => setForm((f) => ({ ...f, investimentoTotal: handleMoneyInput(e.target.value) }))} placeholder="R$ 0,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">% Investimento</label>
                  <input className={cn(inputStyle, "bg-muted/50 cursor-not-allowed")} value={form.valorPedido && form.investimentoTotal ? percDisplay(form.investimentoTotal / form.valorPedido) : "0,00%"} readOnly placeholder="0,00%" />
                </div>
              </>
            )}
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Competência</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Volume</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Pedido</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Data Aprovação</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Investimento Unit</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Investimento Total</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">% Invest.</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-10 text-muted-foreground">Nenhum lançamento encontrado</td></tr>
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
                  <td className="px-4 py-3">{l.competencia || "—"}</td>
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

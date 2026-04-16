import { useState, useMemo, useCallback } from "react";
import { Package, AlertTriangle, Clock, Search, Download } from "lucide-react";
import * as XLSX from "xlsx";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Product {
  familia: string;
  seqProd: string;
  descricao: string;
  estoque: number;
  custoLiq: number;
  atual: number;
  ddv: number;
  filial: string;
  bu: string;
  embCmp: string;
}

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const fmtAbrev = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(2)}`;
};

const getStatus = (ddv: number, estoque: number) => {
  if (estoque === 0 || ddv === 0) return "Sem Estoque";
  if (ddv < 7) return "Baixo";
  if (ddv > 40) return "Alto";
  return "OK";
};

const filialNames: Record<string, string> = {
  "01": "Filial 01 - Poços",
  "11": "Filial 11 - Campinas",
  "12": "Filial 12 - Osasco",
  "14": "Filial 14 - Betim",
  "501": "Filial 501 - Focomix SP",
  "502": "Filial 502 - Focomix MG",
};

const columns = [
  { key: "filialNome", label: "CD" },
  { key: "bu", label: "BU", align: "center" as const },
  { key: "seqProd", label: "Código" },
  { key: "descricao", label: "Descrição" },
  { key: "embCmp", label: "Unid/CX", align: "center" as const },
  { key: "estoque", label: "Estoque", align: "right" as const, render: (v: number) => v.toLocaleString("pt-BR") },
  {
    key: "ddv",
    label: "Cobertura (dias)",
    align: "center" as const,
    render: (v: number) => (
      <span className={`font-semibold ${v > 90 ? "text-destructive" : v < 15 ? "text-warning" : "text-foreground"}`}>
        {v} dias
      </span>
    ),
  },
  {
    key: "custoLiq",
    label: "Preço de Custo",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  },
  {
    key: "atual",
    label: "Preço de Venda",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  },
  {
    key: "valorEstoque",
    label: "Valor Estoque Custo",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  },
  {
    key: "valorEstoqueVenda",
    label: "Valor Estoque Venda",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  },
  {
    key: "status",
    label: "Status",
    align: "center" as const,
    render: (v: string) => (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          v === "Alto" || v === "Sem Estoque"
            ? "bg-destructive/10 text-destructive"
            : v === "Baixo"
            ? "bg-warning/10 text-warning"
            : "bg-success/10 text-success"
        }`}
      >
        {v}
      </span>
    ),
  },
];

const AnaliseEstoque = () => {
  const [filial, setFilial] = useState("all");
  const [search, setSearch] = useState("");
  const [ddvFilter, setDdvFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "excessivo" | "ruptura">("all");
  const [buFilter, setBuFilter] = useState<"all" | "HC" | "FR">("all");

  const allProducts = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("vilasales_data") || "{}");
      if (!raw || typeof raw !== "object") return [];
      // FilialData is { [filial: string]: Product[] }
      const products: any[] = [];
      Object.entries(raw).forEach(([filialKey, arr]: [string, any]) => {
        if (Array.isArray(arr)) {
          arr.forEach((p: any) => {
            const estoque = num(p.estoque);
            const custoLiq = num(p.custoLiq);
            const embCmp = num(p.embCmp) || 1;
            const ddv = num(p.ddv);
            const atual = num(p.atual);
            products.push({
              ...p,
              estoque,
              custoLiq,
              embCmp,
              atual,
              ddv,
              filialNome: filialNames[p.filial || filialKey] || p.filial || filialKey,
              valorEstoque: estoque * embCmp * custoLiq,
              valorEstoqueVenda: estoque * embCmp * atual,
              status: getStatus(ddv, estoque),
            });
          });
        }
      });
      return products;
    } catch {
      return [];
    }
  }, []);

  const baseFiltered = useMemo(() => {
    let list = allProducts;
    if (buFilter !== "all") {
      list = list.filter((p: any) => (p.bu || "").toUpperCase() === buFilter);
    }
    if (filial !== "all") {
      list = list.filter((p: any) => p.filial === filial);
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (p: any) =>
          (p.seqProd || "").toLowerCase().includes(term) ||
          (p.descricao || "").toLowerCase().includes(term)
      );
    }
    if (ddvFilter.trim()) {
      const maxDdv = parseFloat(ddvFilter);
      if (!isNaN(maxDdv)) {
        list = list.filter((p: any) => p.ddv >= maxDdv);
      }
    }
    return list;
  }, [allProducts, filial, search, ddvFilter, buFilter]);

  const excessivo = useMemo(() => baseFiltered.filter((p: any) => p.ddv > 90).length, [baseFiltered]);
  const ruptura = useMemo(() => baseFiltered.filter((p: any) => p.estoque > 0 && p.ddv > 0 && p.ddv < 7).length, [baseFiltered]);

  const filtered = useMemo(() => {
    let list = baseFiltered;
    if (statusFilter === "excessivo") {
      list = list.filter((p: any) => p.ddv > 90);
    } else if (statusFilter === "ruptura") {
      list = list.filter((p: any) => p.estoque > 0 && p.ddv > 0 && p.ddv < 7);
    }
    return list;
  }, [baseFiltered, statusFilter]);

  const totalValor = useMemo(() => filtered.reduce((s: number, p: any) => s + p.valorEstoque, 0), [filtered]);
  const totalValorVenda = useMemo(() => filtered.reduce((s: number, p: any) => s + (p.valorEstoqueVenda || 0), 0), [filtered]);
  const totalVolumeCaixas = useMemo(() => filtered.reduce((s: number, p: any) => s + (p.estoque || 0), 0), [filtered]);
  const avgDdv = useMemo(() => {
    const withStock = filtered.filter((p: any) => p.estoque > 0);
    return withStock.length ? Math.round(withStock.reduce((s: number, p: any) => s + p.ddv, 0) / withStock.length) : 0;
  }, [filtered]);

  const exportToExcel = useCallback(() => {
    const rows = filtered.map((p: any) => ({
      "CD": p.filialNome,
      "BU": p.bu || "",
      "Código": p.seqProd,
      "Descrição": p.descricao,
      "Unid/CX": p.embCmp,
      "Estoque": p.estoque,
      "Cobertura (dias)": p.ddv,
      "Preço de Custo": p.custoLiq,
      "Preço de Venda": p.atual,
      "Valor Estoque Custo": p.valorEstoque,
      "Valor Estoque Venda": p.valorEstoqueVenda,
      "Status": p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(k.length, 15) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, "analise_estoque.xlsx");
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="Análise de Estoque"
        description="Níveis de estoque, cobertura e valores por produto e filial"
        actions={
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline" className="font-semibold">
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
            <Button className="bg-primary text-primary-foreground font-semibold">
              <Package className="w-4 h-4 mr-2" />
              Gerar Análise
            </Button>
          </div>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(["all", "HC", "FR"] as const).map((bu) => (
          <Button
            key={bu}
            variant={buFilter === bu ? "default" : "outline"}
            size="sm"
            onClick={() => setBuFilter(bu)}
            className="font-semibold"
          >
            {bu === "all" ? "Todas as BUs" : bu}
          </Button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilialSelector selected={filial} onChange={setFilial} />
        <div className="bg-card rounded-xl shadow-[var(--shadow-card)] px-4 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-primary" />
          <label className="text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Cobertura máx. (DDV)</label>
          <Input
            type="number"
            placeholder="Ex: 30"
            value={ddvFilter}
            onChange={(e) => setDdvFilter(e.target.value)}
            className="w-24 h-8 text-sm"
          />
          <span className="text-xs text-muted-foreground">dias</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KpiCard title="Valor Total Estoque Custo" value={fmtAbrev(totalValor)} icon={Package} variant="primary" />
        <KpiCard title="Valor Total Estoque Venda" value={fmtAbrev(totalValorVenda)} icon={Package} variant="info" />
        <KpiCard title="Volume Total (Caixas)" value={totalVolumeCaixas.toLocaleString("pt-BR")} icon={Package} variant="success" />
        <KpiCard title="Cobertura Média" value={`${avgDdv} dias`} icon={Clock} variant="purple" />
        <div onClick={() => setStatusFilter(statusFilter === "excessivo" ? "all" : "excessivo")} className={`cursor-pointer rounded-xl transition-all ${statusFilter === "excessivo" ? "ring-2 ring-destructive" : ""}`}>
          <KpiCard title="Estoque Excessivo" value={`${excessivo} SKUs`} subtitle="> 90 dias" icon={AlertTriangle} variant="destructive" />
        </div>
        <div onClick={() => setStatusFilter(statusFilter === "ruptura" ? "all" : "ruptura")} className={`cursor-pointer rounded-xl transition-all ${statusFilter === "ruptura" ? "ring-2 ring-warning" : ""}`}>
          <KpiCard title="Ruptura Iminente" value={`${ruptura} SKUs`} subtitle="< 7 dias" icon={AlertTriangle} variant="warning" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div onClick={() => setStatusFilter(statusFilter === "excessivo" ? "all" : "excessivo")} className="cursor-pointer">
          <AlertCard type="critical" title="Estoque Excessivo" description="Produtos com cobertura superior a 90 dias — capital parado" count={excessivo} />
        </div>
        <div onClick={() => setStatusFilter(statusFilter === "ruptura" ? "all" : "ruptura")} className="cursor-pointer">
          <AlertCard type="warning" title="Ruptura Iminente" description="Produtos com menos de 7 dias de cobertura" count={ruptura} />
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <DataTable title="Detalhamento de Estoque" columns={columns} data={filtered} />
    </div>
  );
};

export default AnaliseEstoque;

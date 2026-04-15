import { useState, useMemo } from "react";
import { Package, AlertTriangle, Clock, Search } from "lucide-react";
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

const columns = [
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

  const allProducts = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("vilasales_data") || "{}");
      if (!raw || typeof raw !== "object") return [];
      // FilialData is { [filial: string]: Product[] }
      const products: any[] = [];
      Object.values(raw).forEach((arr: any) => {
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

  const filtered = useMemo(() => {
    let list = allProducts;
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
    return list;
  }, [allProducts, filial, search]);

  const totalValor = useMemo(() => filtered.reduce((s: number, p: any) => s + p.valorEstoque, 0), [filtered]);
  const totalValorVenda = useMemo(() => filtered.reduce((s: number, p: any) => s + (p.valorEstoqueVenda || 0), 0), [filtered]);
  const avgDdv = useMemo(() => {
    const withStock = filtered.filter((p: any) => p.estoque > 0);
    return withStock.length ? Math.round(withStock.reduce((s: number, p: any) => s + p.ddv, 0) / withStock.length) : 0;
  }, [filtered]);
  const excessivo = useMemo(() => filtered.filter((p: any) => p.ddv > 90).length, [filtered]);
  const ruptura = useMemo(() => filtered.filter((p: any) => p.estoque > 0 && p.ddv > 0 && p.ddv < 7).length, [filtered]);

  return (
    <div>
      <PageHeader
        title="Análise de Estoque"
        description="Níveis de estoque, cobertura e valores por produto e filial"
        actions={
          <Button className="bg-primary text-primary-foreground font-semibold">
            <Package className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        }
      />
      <div className="mb-6">
        <FilialSelector selected={filial} onChange={setFilial} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Valor Total Estoque" value={fmtAbrev(totalValor)} icon={Package} variant="default" />
        <KpiCard title="Cobertura Média" value={`${avgDdv} dias`} icon={Clock} variant="default" />
        <KpiCard title="Estoque Excessivo" value={`${excessivo} SKUs`} subtitle="> 90 dias" icon={AlertTriangle} variant="destructive" />
        <KpiCard title="Ruptura Iminente" value={`${ruptura} SKUs`} subtitle="< 7 dias" icon={AlertTriangle} variant="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <AlertCard type="critical" title="Estoque Excessivo" description="Produtos com cobertura superior a 90 dias — capital parado" count={excessivo} />
        <AlertCard type="warning" title="Ruptura Iminente" description="Produtos com menos de 7 dias de cobertura" count={ruptura} />
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

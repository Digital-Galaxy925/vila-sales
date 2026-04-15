import { useState, useMemo } from "react";
import { Package, AlertTriangle, TrendingUp, Clock, Search } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const mockProducts = [
  { codigo: "7891024", descricao: "Sabonete Dove 90g", estoque: 1250, cobertura: 120, valor: 4312.50, status: "Alto" },
  { codigo: "7891035", descricao: "Desodorante Rexona 150ml", estoque: 45, cobertura: 8, valor: 400.50, status: "Baixo" },
  { codigo: "7891046", descricao: "Shampoo Clear Men 400ml", estoque: 320, cobertura: 45, valor: 3936.00, status: "OK" },
  { codigo: "7891057", descricao: "Creme Dental Close Up 90g", estoque: 890, cobertura: 95, valor: 3738.00, status: "Alto" },
  { codigo: "7891068", descricao: "Amaciante Comfort 2L", estoque: 150, cobertura: 30, valor: 1470.00, status: "OK" },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  { key: "estoque", label: "Estoque", align: "right" as const, render: (v: number) => v.toLocaleString("pt-BR") },
  {
    key: "cobertura",
    label: "Cobertura (dias)",
    align: "center" as const,
    render: (v: number) => (
      <span className={`font-semibold ${v > 90 ? "text-destructive" : v < 15 ? "text-warning" : "text-foreground"}`}>
        {v} dias
      </span>
    ),
  },
  { key: "valor", label: "Valor Estoque", align: "right" as const, render: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
  {
    key: "status",
    label: "Status",
    align: "center" as const,
    render: (v: string) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === "Alto" ? "bg-destructive/10 text-destructive" : v === "Baixo" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
        {v}
      </span>
    ),
  },
];

const AnaliseEstoque = () => {
  const [filial, setFilial] = useState("all");
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return mockProducts;
    const term = search.trim().toLowerCase();
    return mockProducts.filter(
      (p) => p.codigo.toLowerCase().includes(term) || p.descricao.toLowerCase().includes(term)
    );
  }, [search]);

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
      <div className="mb-6"><FilialSelector selected={filial} onChange={setFilial} /></div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Valor Total Estoque" value="R$ 2.8M" icon={Package} variant="default" />
        <KpiCard title="Cobertura Média" value="52 dias" icon={Clock} variant="default" />
        <KpiCard title="Estoque Excessivo" value="124 SKUs" subtitle="> 90 dias" icon={AlertTriangle} variant="destructive" />
        <KpiCard title="Ruptura Iminente" value="38 SKUs" subtitle="< 7 dias" icon={AlertTriangle} variant="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <AlertCard type="critical" title="Estoque Excessivo" description="Produtos com cobertura superior a 90 dias — capital parado" count={124} />
        <AlertCard type="warning" title="Ruptura Iminente" description="Produtos com menos de 7 dias de cobertura" count={38} />
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

      <DataTable title="Detalhamento de Estoque" columns={columns} data={filteredProducts} />
    </div>
  );
};

export default AnaliseEstoque;

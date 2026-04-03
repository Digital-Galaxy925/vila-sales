import { useState } from "react";
import { DollarSign, TrendingDown, TrendingUp, ArrowUpDown } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import { Button } from "@/components/ui/button";

const mockProducts = [
  { codigo: "7891024", descricao: "Sabonete Dove 90g", precoCusto: 3.45, precoVenda: 5.99, diferenca: 2.54, variacao: "12.3%" },
  { codigo: "7891035", descricao: "Desodorante Rexona 150ml", precoCusto: 8.90, precoVenda: 12.49, diferenca: 3.59, variacao: "-3.2%" },
  { codigo: "7891046", descricao: "Shampoo Clear Men 400ml", precoCusto: 12.30, precoVenda: 18.99, diferenca: 6.69, variacao: "0.0%" },
  { codigo: "7891057", descricao: "Creme Dental Close Up 90g", precoCusto: 4.20, precoVenda: 4.89, diferenca: 0.69, variacao: "-8.5%" },
  { codigo: "7891068", descricao: "Amaciante Comfort 2L", precoCusto: 9.80, precoVenda: 14.99, diferenca: 5.19, variacao: "5.1%" },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  {
    key: "precoCusto",
    label: "Preço Custo",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toFixed(2)}`,
  },
  {
    key: "precoVenda",
    label: "Preço Venda",
    align: "right" as const,
    render: (v: number) => `R$ ${v.toFixed(2)}`,
  },
  {
    key: "diferenca",
    label: "Diferença",
    align: "right" as const,
    render: (v: number) => (
      <span className="font-semibold text-foreground">R$ {v.toFixed(2)}</span>
    ),
  },
  {
    key: "variacao",
    label: "Variação",
    align: "center" as const,
    render: (v: string) => {
      const num = parseFloat(v);
      return (
        <span className={`flex items-center justify-center gap-1 text-xs font-medium ${num > 0 ? "text-success" : num < 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {num > 0 ? <TrendingUp className="w-3 h-3" /> : num < 0 ? <TrendingDown className="w-3 h-3" /> : null}
          {v}
        </span>
      );
    },
  },
];

const AnalisePreco = () => {
  const [filial, setFilial] = useState("all");

  return (
    <div>
      <PageHeader
        title="Análise de Preço"
        description="Comparativo de preços de custo e venda por produto e filial"
        actions={
          <Button className="bg-primary text-primary-foreground font-semibold">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        }
      />

      <div className="mb-6">
        <FilialSelector selected={filial} onChange={setFilial} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Preço Médio Custo" value="R$ 8.42" icon={DollarSign} variant="default" />
        <KpiCard title="Preço Médio Venda" value="R$ 12.87" icon={DollarSign} variant="default" />
        <KpiCard title="Produtos c/ Aumento" value="342" icon={TrendingUp} trend="up" trendValue="+27%" variant="success" />
        <KpiCard title="Produtos c/ Redução" value="89" icon={TrendingDown} trend="down" trendValue="-7%" variant="warning" />
      </div>

      <DataTable title="Detalhamento de Preços" columns={columns} data={mockProducts} />
    </div>
  );
};

export default AnalisePreco;

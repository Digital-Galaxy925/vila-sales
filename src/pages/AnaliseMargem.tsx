import { useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { motion } from "framer-motion";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import MarginBadge from "@/components/MarginBadge";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";

const mockDistribution = [
  { range: "0-5%", count: 23 },
  { range: "5-10%", count: 64 },
  { range: "10-15%", count: 156 },
  { range: "15-17%", count: 155 },
  { range: "17-20%", count: 289 },
  { range: "20-25%", count: 312 },
  { range: "25-30%", count: 148 },
  { range: ">30%", count: 100 },
];

const mockProducts = [
  { codigo: "7891024", descricao: "Sabonete Dove 90g", precoCusto: 3.45, precoVenda: 5.99, margem: 42.4 },
  { codigo: "7891057", descricao: "Creme Dental Close Up 90g", precoCusto: 4.20, precoVenda: 4.89, margem: 14.1 },
  { codigo: "7891035", descricao: "Desodorante Rexona 150ml", precoCusto: 8.90, precoVenda: 12.49, margem: 28.7 },
  { codigo: "7891079", descricao: "Detergente Ypê 500ml", precoCusto: 2.80, precoVenda: 3.19, margem: 12.2 },
  { codigo: "7891090", descricao: "Sabão em Pó OMO 1kg", precoCusto: 11.50, precoVenda: 12.99, margem: 11.5 },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  { key: "precoCusto", label: "Custo", align: "right" as const, render: (v: number) => `R$ ${v.toFixed(2)}` },
  { key: "precoVenda", label: "Venda", align: "right" as const, render: (v: number) => `R$ ${v.toFixed(2)}` },
  { key: "margem", label: "Margem", align: "center" as const, render: (v: number) => <MarginBadge value={v} /> },
];

const AnaliseMargem = () => {
  const [filial, setFilial] = useState("all");

  return (
    <div>
      <PageHeader
        title="Análise de Margem"
        description="Margem = (Preço Venda − Preço Custo) / Preço Venda · Meta: ≥ 17%"
        actions={
          <Button className="bg-primary text-primary-foreground font-semibold">
            <Target className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        }
      />

      <div className="mb-6">
        <FilialSelector selected={filial} onChange={setFilial} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Margem Média" value="17.4%" icon={TrendingUp} trend="up" trendValue="+0.4%" variant="success" />
        <KpiCard title="Abaixo de 17%" value="398 SKUs" subtitle="31.9% do mix" icon={AlertTriangle} variant="destructive" />
        <KpiCard title="Acima de 17%" value="849 SKUs" subtitle="68.1% do mix" icon={TrendingUp} variant="success" />
        <KpiCard title="Margem Mínima" value="2.1%" subtitle="Cod: 7891090" icon={TrendingDown} variant="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <AlertCard type="critical" title="Margens < 10%" description="Ação urgente: produtos com margem abaixo de 10%" count={87} />
        <AlertCard type="warning" title="Margens 10-17%" description="Revisar precificação: produtos entre 10% e 17%" count={311} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl shadow-[var(--shadow-card)] p-5 mb-8">
        <h3 className="text-sm font-heading font-semibold text-card-foreground mb-4">Distribuição de Margens por Faixa</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={mockDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
            <XAxis dataKey="range" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(220, 15%, 90%)", fontSize: "12px" }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {mockDistribution.map((entry, i) => {
                const rangeStart = parseInt(entry.range);
                const color = rangeStart < 17 ? "hsl(0, 72%, 51%)" : "hsl(152, 60%, 42%)";
                return <ReferenceLine key={`c-${i}`} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <DataTable title="Produtos com Margem Baixa (< 17%)" columns={columns} data={mockProducts.filter(p => p.margem < 17)} />
    </div>
  );
};

export default AnaliseMargem;

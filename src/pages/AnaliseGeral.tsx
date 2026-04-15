import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  DollarSign,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import AlertCard from "@/components/AlertCard";
import DataTable from "@/components/DataTable";
import MarginBadge from "@/components/MarginBadge";
import { Button } from "@/components/ui/button";

const mockBarData = [
  { filial: "Poços", margem: 18.2 },
  { filial: "Campinas", margem: 15.4 },
  { filial: "Osasco", margem: 21.1 },
  { filial: "Betim", margem: 14.8 },
  { filial: "Focomix SP", margem: 19.3 },
  { filial: "Focomix MG", margem: 16.2 },
];

const mockPieData = [
  { name: "Margem OK", value: 68, color: "hsl(152, 60%, 42%)" },
  { name: "Margem Baixa", value: 32, color: "hsl(0, 72%, 51%)" },
];

const mockProducts = [
  { codigo: "7891024", descricao: "Sabonete Dove 90g", margem: 12.3, estoque: 450, status: "Crítico" },
  { codigo: "7891035", descricao: "Desodorante Rexona 150ml", margem: 15.8, estoque: 230, status: "Atenção" },
  { codigo: "7891046", descricao: "Shampoo Clear Men 400ml", margem: 22.4, estoque: 89, status: "OK" },
  { codigo: "7891057", descricao: "Creme Dental Close Up 90g", margem: 8.9, estoque: 670, status: "Crítico" },
  { codigo: "7891068", descricao: "Amaciante Comfort 2L", margem: 19.1, estoque: 150, status: "OK" },
  { codigo: "7891079", descricao: "Detergente Ypê 500ml", margem: 14.2, estoque: 320, status: "Atenção" },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  {
    key: "margem",
    label: "Margem",
    align: "center" as const,
    render: (v: number) => <MarginBadge value={v} />,
  },
  {
    key: "estoque",
    label: "Estoque",
    align: "right" as const,
    render: (v: number) => v.toLocaleString("pt-BR"),
  },
  {
    key: "status",
    label: "Status",
    align: "center" as const,
    render: (v: string) => (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          v === "Crítico"
            ? "bg-destructive/10 text-destructive"
            : v === "Atenção"
            ? "bg-warning/10 text-warning"
            : "bg-success/10 text-success"
        }`}
      >
        {v === "Crítico" ? <AlertTriangle className="w-3 h-3" /> : v === "OK" ? <CheckCircle className="w-3 h-3" /> : null}
        {v}
      </span>
    ),
  },
];

const AnaliseGeral = () => {
  const [filial, setFilial] = useState("all");

  return (
    <div>
      <PageHeader
        title="Análise Geral"
        description="Visão consolidada dos KPIs de compras — Unilever / Grupo Vila Nova"
        actions={
          <Button className="bg-primary text-primary-foreground font-semibold">
            <BarChart3 className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        }
      />

      <div className="mb-6">
        <FilialSelector selected={filial} onChange={setFilial} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Total SKUs"
          value="1.247"
          subtitle="Produtos ativos"
          icon={Package}
          variant="default"
        />
        <KpiCard
          title="Margem Média"
          value="17.4%"
          subtitle="Meta: 17%"
          icon={TrendingUp}
          trend="up"
          trendValue="+0.4%"
          variant="success"
        />
        <KpiCard
          title="SKUs Margem Baixa"
          value="398"
          subtitle="Abaixo de 17%"
          icon={AlertTriangle}
          trend="down"
          trendValue="31.9%"
          variant="destructive"
        />
        <KpiCard
          title="Valor em Estoque"
          value="R$ 2.8M"
          subtitle="Todas as filiais"
          icon={DollarSign}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <AlertCard
          type="critical"
          title="Margens Críticas"
          description="Produtos com margem abaixo de 10% que precisam de ação imediata"
          count={87}
        />
        <AlertCard
          type="warning"
          title="Estoques Elevados"
          description="Produtos com estoque acima de 90 dias de cobertura"
          count={124}
        />
        <AlertCard
          type="success"
          title="Top Performers"
          description="Produtos acelerando resultados com margem e giro adequados"
          count={342}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-card rounded-xl shadow-[var(--shadow-card)] p-5"
        >
          <h3 className="text-sm font-heading font-semibold text-card-foreground mb-4">
            Margem Média por Filial
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mockBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
              <XAxis dataKey="filial" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(220, 15%, 90%)",
                  fontSize: "12px",
                }}
              />
              <Bar
                dataKey="margem"
                radius={[6, 6, 0, 0]}
                fill="hsl(192, 85%, 40%)"
              />
              {/* Reference line at 17% */}
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

      </div>

    </div>
  );
};

export default AnaliseGeral;

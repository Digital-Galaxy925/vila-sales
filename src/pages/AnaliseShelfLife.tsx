import { useState } from "react";
import { Clock, AlertTriangle, CheckCircle, Calendar } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";

const mockProducts = [
  { codigo: "7891024", descricao: "Sabonete Dove 90g", validade: "2026-05-15", diasRestantes: 42, estoque: 450, status: "Atenção" },
  { codigo: "7891035", descricao: "Desodorante Rexona 150ml", validade: "2026-12-01", diasRestantes: 242, estoque: 230, status: "OK" },
  { codigo: "7891046", descricao: "Shampoo Clear Men 400ml", validade: "2026-04-20", diasRestantes: 17, estoque: 89, status: "Crítico" },
  { codigo: "7891057", descricao: "Creme Dental Close Up 90g", validade: "2026-06-30", diasRestantes: 88, estoque: 670, status: "OK" },
  { codigo: "7891079", descricao: "Detergente Ypê 500ml", validade: "2026-04-10", diasRestantes: 7, estoque: 320, status: "Crítico" },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  { key: "validade", label: "Validade", render: (v: string) => new Date(v).toLocaleDateString("pt-BR") },
  {
    key: "diasRestantes",
    label: "Dias Restantes",
    align: "center" as const,
    render: (v: number) => (
      <span className={`font-bold ${v <= 15 ? "text-destructive" : v <= 45 ? "text-warning" : "text-success"}`}>
        {v} dias
      </span>
    ),
  },
  { key: "estoque", label: "Estoque", align: "right" as const, render: (v: number) => v.toLocaleString("pt-BR") },
  {
    key: "status",
    label: "Status",
    align: "center" as const,
    render: (v: string) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === "Crítico" ? "bg-destructive/10 text-destructive" : v === "Atenção" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
        {v}
      </span>
    ),
  },
];

const AnaliseShelfLife = () => {
  const [filial, setFilial] = useState("all");

  return (
    <div>
      <PageHeader
        title="Análise de Shelf Life"
        description="Monitoramento de validade e risco de perdas por vencimento"
        actions={
          <Button className="bg-primary text-primary-foreground font-semibold">
            <Calendar className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        }
      />
      <div className="mb-6"><FilialSelector selected={filial} onChange={setFilial} /></div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Vencimento < 15 dias" value="23 SKUs" icon={AlertTriangle} variant="destructive" />
        <KpiCard title="Vencimento 15-45 dias" value="67 SKUs" icon={Clock} variant="warning" />
        <KpiCard title="Vencimento > 45 dias" value="1.157 SKUs" icon={CheckCircle} variant="success" />
        <KpiCard title="Risco de Perda" value="R$ 45.2K" subtitle="Valor em risco" icon={AlertTriangle} variant="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <AlertCard type="critical" title="Vencimento Iminente" description="Produtos com menos de 15 dias para vencer" count={23} />
        <AlertCard type="warning" title="Atenção na Validade" description="Produtos entre 15 e 45 dias para vencer" count={67} />
      </div>

      <DataTable title="Produtos Próximos ao Vencimento" columns={columns} data={mockProducts} />
    </div>
  );
};

export default AnaliseShelfLife;

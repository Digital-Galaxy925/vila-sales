import { motion } from "framer-motion";
import { BarChart3, TrendingUp, DollarSign, Package } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";

const AnaliseGerencial = () => {
  return (
    <div>
      <PageHeader
        title="Análise Gerencial"
        description="Visão executiva consolidada dos principais indicadores comerciais"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <KpiCard title="Faturamento Total" value="R$ 2.450.000" icon={DollarSign} trend={5.2} />
        <KpiCard title="Margem Média" value="18,4%" icon={TrendingUp} trend={-1.1} />
        <KpiCard title="Itens em Estoque" value="12.384" icon={Package} trend={3.7} />
        <KpiCard title="SKUs Ativos" value="1.856" icon={BarChart3} trend={0.8} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl p-8 shadow-[var(--shadow-card)] text-center"
      >
        <p className="text-muted-foreground text-sm">
          Carregue os dados na página de Upload para visualizar os indicadores gerenciais consolidados.
        </p>
      </motion.div>
    </div>
  );
};

export default AnaliseGerencial;

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  DollarSign,
  Package,
  TrendingUp,
  AlertTriangle,
  TrendingDown,
  Clock,
  ShieldAlert,
  BoxSelect,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";

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

const FILIAL_CONFIG: { id: string; label: string }[] = [
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
  { id: "01", label: "Filial 01 - Poços" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "03", label: "Filial 03 - Varginha" },
];

interface FilialSummary {
  id: string;
  label: string;
  totalProdutos: number;
  margemMedia: number;
  estoqueCusto: number;
  estoqueVenda: number;
  ddvMedio: number;
  abaixoMargem: number;
  ruptura: number;
  abaixo10dias: number;
}

const MIN_MARGIN = 17;

const AnaliseGeral = () => {
  const [filial, setFilial] = useState("all");

  const allData = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("vilasales_data") || "{}");
      if (!raw || typeof raw !== "object") return {};
      return raw;
    } catch {
      return {};
    }
  }, []);

  const filialSummaries = useMemo((): FilialSummary[] => {
    return FILIAL_CONFIG.map((fc) => {
      const products: any[] = [];
      // Collect products for this filial from all keys
      Object.entries(allData).forEach(([, arr]: [string, any]) => {
        if (Array.isArray(arr)) {
          arr.forEach((p: any) => {
            if ((p.filial || "") === fc.id) {
              products.push(p);
            }
          });
        }
      });

      if (products.length === 0) {
        return { id: fc.id, label: fc.label, totalProdutos: 0, margemMedia: 0, estoqueCusto: 0, estoqueVenda: 0, ddvMedio: 0, abaixoMargem: 0, ruptura: 0, abaixo10dias: 0 };
      }

      let totalEstCusto = 0;
      let totalEstVenda = 0;
      let totalMargem = 0;
      let countWithStock = 0;
      let totalDdv = 0;
      let abaixoMargem = 0;
      let rupturaCount = 0;
      let abaixo10dias = 0;

      products.forEach((p: any) => {
        const estoque = num(p.estoque);
        const custoLiq = num(p.custoLiq);
        const atual = num(p.atual);
        const embCmp = num(p.embCmp) || 1;
        const ddv = num(p.ddv);
        const marg = atual > 0 ? ((atual - custoLiq) / atual) * 100 : 0;

        totalEstCusto += estoque * embCmp * custoLiq;
        totalEstVenda += estoque * embCmp * atual;

        if (estoque > 0) {
          countWithStock++;
          totalDdv += ddv;
          totalMargem += marg;
        }

        if (marg < MIN_MARGIN && estoque > 0) abaixoMargem++;
        if (estoque === 0 || ddv === 0) rupturaCount++;
        if (ddv > 0 && ddv < 10 && estoque > 0) abaixo10dias++;
      });

      const margemMedia = countWithStock > 0 ? totalMargem / countWithStock : 0;
      const ddvMedio = countWithStock > 0 ? Math.round(totalDdv / countWithStock) : 0;

      return {
        id: fc.id,
        label: fc.label,
        totalProdutos: products.length,
        margemMedia,
        estoqueCusto: totalEstCusto,
        estoqueVenda: totalEstVenda,
        ddvMedio,
        abaixoMargem,
        ruptura: rupturaCount,
        abaixo10dias,
      };
    }).filter((s) => s.totalProdutos > 0);
  }, [allData]);

  // Global KPIs
  const globalKpis = useMemo(() => {
    const all = filialSummaries;
    const totalSkus = all.reduce((s, f) => s + f.totalProdutos, 0);
    const totalEstCusto = all.reduce((s, f) => s + f.estoqueCusto, 0);
    const avgMargem = all.length > 0 ? all.reduce((s, f) => s + f.margemMedia, 0) / all.length : 0;
    const totalAbaixo = all.reduce((s, f) => s + f.abaixoMargem, 0);
    const totalEstVenda = all.reduce((s, f) => s + f.estoqueVenda, 0);
    return { totalSkus, totalEstCusto, totalEstVenda, avgMargem, totalAbaixo };
  }, [filialSummaries]);

  const barData = useMemo(() => {
    return filialSummaries.map((f) => ({
      filial: f.label.replace(/Filial \d+ - /, ""),
      margem: parseFloat(f.margemMedia.toFixed(1)),
    }));
  }, [filialSummaries]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard
          title="Total SKUs"
          value={globalKpis.totalSkus.toLocaleString("pt-BR")}
          subtitle="Produtos ativos"
          icon={Package}
          variant="default"
        />
        <KpiCard
          title="Margem Média"
          value={`${globalKpis.avgMargem.toFixed(1)}%`}
          subtitle="Meta: 17%"
          icon={TrendingUp}
          trend={globalKpis.avgMargem >= MIN_MARGIN ? "up" : "down"}
          trendValue={`${(globalKpis.avgMargem - MIN_MARGIN).toFixed(1)}%`}
          variant={globalKpis.avgMargem >= MIN_MARGIN ? "success" : "destructive"}
        />
        <KpiCard
          title="SKUs Margem Baixa"
          value={globalKpis.totalAbaixo.toLocaleString("pt-BR")}
          subtitle="Abaixo de 17%"
          icon={AlertTriangle}
          trend="down"
          trendValue={`${globalKpis.totalSkus > 0 ? ((globalKpis.totalAbaixo / globalKpis.totalSkus) * 100).toFixed(1) : 0}%`}
          variant="destructive"
        />
        <KpiCard
          title="Valor em Estoque Custo"
          value={fmtAbrev(globalKpis.totalEstCusto)}
          subtitle="Todas as filiais"
          icon={DollarSign}
          variant="default"
        />
        <KpiCard
          title="Valor em Estoque Venda"
          value={fmtAbrev(globalKpis.totalEstVenda)}
          subtitle="Todas as filiais"
          icon={DollarSign}
          variant="default"
        />
      </div>

      {/* Filial Summary Cards */}
      <h3 className="text-sm font-heading font-semibold text-foreground mb-4 uppercase tracking-wider">Resumo por Filial</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-8">
        {filialSummaries.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="bg-card rounded-xl shadow-card hover:shadow-card-hover transition-all duration-200 border border-border p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <h4 className="text-sm font-semibold text-card-foreground truncate">{f.label}</h4>
            </div>

            <div className="space-y-3">
              {/* Margem Média */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Margem Média</span>
                <span className={`text-sm font-bold ${f.margemMedia >= MIN_MARGIN ? "text-success" : "text-destructive"}`}>
                  {f.margemMedia.toFixed(1)}%
                </span>
              </div>

              {/* Estoque Custo */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Est. Custo</span>
                <span className="text-sm font-semibold text-card-foreground">{fmtAbrev(f.estoqueCusto)}</span>
              </div>

              {/* Estoque Venda */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Est. Venda</span>
                <span className="text-sm font-semibold text-card-foreground">{fmtAbrev(f.estoqueVenda)}</span>
              </div>

              {/* DDV Médio */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">DDV Médio</span>
                <span className="text-sm font-semibold text-card-foreground">{f.ddvMedio} dias</span>
              </div>

              <div className="border-t border-border pt-3 mt-3 space-y-2">
                {/* Abaixo da margem */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-[11px] text-muted-foreground">Margem &lt; 17%</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${f.abaixoMargem > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                    {f.abaixoMargem}
                  </span>
                </div>

                {/* Ruptura */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                    <span className="text-[11px] text-muted-foreground">Ruptura</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${f.ruptura > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                    {f.ruptura}
                  </span>
                </div>

                {/* Abaixo 10 dias */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-warning" />
                    <span className="text-[11px] text-muted-foreground">Est. &lt; 10 dias</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${f.abaixo10dias > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                    {f.abaixo10dias}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart */}
      {barData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] p-5 mb-8"
        >
          <h3 className="text-sm font-heading font-semibold text-card-foreground mb-4">
            Margem Média por Filial
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
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
              <Bar dataKey="margem" radius={[6, 6, 0, 0]} fill="hsl(192, 85%, 40%)">
                <LabelList dataKey="margem" position="top" fontSize={11} fontWeight={600} formatter={(v: number) => `${v}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </div>
  );
};

export default AnaliseGeral;

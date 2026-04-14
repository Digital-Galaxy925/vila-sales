import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Target, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";
import KpiCard from "@/components/KpiCard";
import FilialSelector from "@/components/FilialSelector";
import PageHeader from "@/components/PageHeader";
import MarginBadge from "@/components/MarginBadge";
import AlertCard from "@/components/AlertCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Product {
  seqProd: string;
  descricao: string;
  custoLiq: number;
  atual: number;
  estoque: number;
  marg: number;
  filial: string;
}

type DataMap = Record<string, Product[]>;

const FILIAL_ORDER = ["01", "11", "12", "14", "501", "502"];

const calcMargem = (pv: number, pc: number) => (pv > 0 ? ((pv - pc) / pv) * 100 : 0);

const AnaliseMargem = () => {
  const [filial, setFilial] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [minMargem, setMinMargem] = useState(17);
  const [activeFilter, setActiveFilter] = useState<"all" | "abaixo" | "acima" | "minima">("all");

  const data: DataMap = useMemo(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const hasData = Object.keys(data).length > 0;

  // All products with margin calculated, filtered by filial
  const products = useMemo(() => {
    let allProducts: (Product & { margemCalc: number })[] = [];
    const filiais = filial === "all" ? FILIAL_ORDER : [filial];

    filiais.forEach((f) => {
      const items = data[f];
      if (!items) return;
      items.forEach((p) => {
        const m = calcMargem(p.atual, p.custoLiq);
        allProducts.push({ ...p, margemCalc: m, filial: f });
      });
    });

    // Filter out products with no price data
    allProducts = allProducts.filter((p) => p.atual > 0 && p.custoLiq > 0);

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      allProducts = allProducts.filter(
        (p) =>
          p.seqProd?.toLowerCase().includes(term) ||
          p.descricao?.toLowerCase().includes(term)
      );
    }

    return allProducts;
  }, [data, filial, searchTerm]);

  // KPIs
  const kpis = useMemo(() => {
    if (products.length === 0) {
      return { margemMedia: 0, abaixo: 0, acima: 0, margemMin: 0, margemMinCod: "—", percAbaixo: 0, percAcima: 0 };
    }

    const margens = products.map((p) => p.margemCalc);
    const media = margens.reduce((s, m) => s + m, 0) / margens.length;
    const abaixo = products.filter((p) => p.margemCalc < minMargem).length;
    const acima = products.filter((p) => p.margemCalc >= minMargem).length;

    let minVal = Infinity;
    let minCod = "—";
    products.forEach((p) => {
      if (p.margemCalc < minVal) {
        minVal = p.margemCalc;
        minCod = p.seqProd || "—";
      }
    });

    return {
      margemMedia: media,
      abaixo,
      acima,
      margemMin: minVal === Infinity ? 0 : minVal,
      margemMinCod: minCod,
      percAbaixo: products.length > 0 ? (abaixo / products.length) * 100 : 0,
      percAcima: products.length > 0 ? (acima / products.length) * 100 : 0,
    };
  }, [products, minMargem]);

  // Distribution chart data
  const distribution = useMemo(() => {
    const ranges = [
      { range: "< 0%", min: -Infinity, max: 0 },
      { range: "0-5%", min: 0, max: 5 },
      { range: "5-10%", min: 5, max: 10 },
      { range: "10-15%", min: 10, max: 15 },
      { range: "15-17%", min: 15, max: 17 },
      { range: "17-20%", min: 17, max: 20 },
      { range: "20-25%", min: 20, max: 25 },
      { range: "25-30%", min: 25, max: 30 },
      { range: "> 30%", min: 30, max: Infinity },
    ];

    return ranges.map((r) => ({
      range: r.range,
      count: products.filter((p) => p.margemCalc >= r.min && p.margemCalc < r.max).length,
      isBelowTarget: r.max <= minMargem,
    }));
  }, [products, minMargem]);

  // Alerts
  const criticalCount = useMemo(() => products.filter((p) => p.margemCalc < 10).length, [products]);
  const warningCount = useMemo(() => products.filter((p) => p.margemCalc >= 10 && p.margemCalc < minMargem).length, [products, minMargem]);

  // Table: products below target
  const lowMarginProducts = useMemo(() => {
    return products
      .filter((p) => p.margemCalc < minMargem)
      .sort((a, b) => a.margemCalc - b.margemCalc)
      .slice(0, 100);
  }, [products, minMargem]);

  const columns: { key: string; label: string; align?: "left" | "center" | "right"; render?: (v: any) => React.ReactNode }[] = [
    { key: "seqProd", label: "Código" },
    { key: "descricao", label: "Descrição" },
    { key: "custoLiq", label: "Custo", align: "right" as const, render: (v: number) => `R$ ${v.toFixed(2)}` },
    { key: "atual", label: "Venda", align: "right" as const, render: (v: number) => `R$ ${v.toFixed(2)}` },
    { key: "margemCalc", label: "Margem", align: "center" as const, render: (v: number) => <MarginBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Análise de Margem"
        description={`Margem = (Preço Venda − Preço Custo) / Preço Venda · Meta: ≥ ${minMargem}%`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Meta mínima:</label>
              <Input
                type="number"
                value={minMargem}
                onChange={(e) => setMinMargem(Number(e.target.value) || 0)}
                className="w-20 h-9 text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        }
      />

      <div className="mb-6">
        <FilialSelector selected={filial} onChange={setFilial} />
      </div>

      {!hasData ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] p-12 text-center"
        >
          <p className="text-muted-foreground text-sm">
            Nenhum dado carregado. Faça o upload dos arquivos na tela inicial para gerar a análise de margem.
          </p>
        </motion.div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              title="Margem Média"
              value={`${kpis.margemMedia.toFixed(1)}%`}
              icon={TrendingUp}
              variant={kpis.margemMedia >= minMargem ? "success" : "destructive"}
            />
            <KpiCard
              title={`Abaixo de ${minMargem}%`}
              value={`${kpis.abaixo} SKUs`}
              subtitle={`${kpis.percAbaixo.toFixed(1)}% do mix`}
              icon={AlertTriangle}
              variant="destructive"
            />
            <KpiCard
              title={`Acima de ${minMargem}%`}
              value={`${kpis.acima} SKUs`}
              subtitle={`${kpis.percAcima.toFixed(1)}% do mix`}
              icon={TrendingUp}
              variant="success"
            />
            <KpiCard
              title="Margem Mínima"
              value={`${kpis.margemMin.toFixed(1)}%`}
              subtitle={`Cod: ${kpis.margemMinCod}`}
              icon={TrendingDown}
              variant="destructive"
            />
          </div>

          {/* Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <AlertCard type="critical" title="Margens < 10%" description="Ação urgente: produtos com margem abaixo de 10%" count={criticalCount} />
            <AlertCard type="warning" title={`Margens 10-${minMargem}%`} description={`Revisar precificação: produtos entre 10% e ${minMargem}%`} count={warningCount} />
          </div>

          {/* Distribution Chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl shadow-[var(--shadow-card)] p-5 mb-8">
            <h3 className="text-sm font-heading font-semibold text-card-foreground mb-4">Distribuição de Margens por Faixa</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(220, 15%, 90%)", fontSize: "12px" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {distribution.map((entry, i) => (
                    <Cell key={i} fill={entry.isBelowTarget ? "hsl(0, 72%, 51%)" : "hsl(152, 60%, 42%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Search + Table */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-heading font-semibold text-card-foreground">
                Produtos com Margem Baixa (&lt; {minMargem}%) — {lowMarginProducts.length} itens
              </h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar código ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 w-[220px] text-xs"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-${col.align || "left"}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lowMarginProducts.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado abaixo da meta.
                      </td>
                    </tr>
                  ) : (
                    lowMarginProducts.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 text-sm text-card-foreground text-${col.align || "left"}`}
                          >
                            {col.render
                              ? col.render((row as any)[col.key])
                              : (row as any)[col.key]}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
};

export default AnaliseMargem;

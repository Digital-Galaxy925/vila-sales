import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Package, Boxes, Building2, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { loadLivrosFromSupabase, type FilialDataMap } from "@/lib/livrosSync";
import { toast } from "@/hooks/use-toast";

const FILIAL_LABELS: Record<string, string> = {
  "01": "01 - Poços de Caldas",
  "11": "11 - Campinas",
  "12": "12 - Osasco",
  "14": "14 - Betim",
  "501": "501 - Focomix SP",
  "502": "502 - Focomix MG",
};

const num = (v: any): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let n = s;
  if (lastComma >= 0 && lastDot >= 0) {
    n = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    n = s.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtNum = (v: number) => Math.round(v).toLocaleString("pt-BR");

const DashboardUnilever = () => {
  const [data, setData] = useState<FilialDataMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroBu, setFiltroBu] = useState<string>("todas");
  const [filtroFilial, setFiltroFilial] = useState<string>("todas");

  useEffect(() => {
    (async () => {
      try {
        const remote = await loadLivrosFromSupabase();
        setData(remote || {});
      } catch (e: any) {
        toast({ title: "Erro ao carregar livros", description: e?.message ?? String(e), variant: "destructive" });
        setData({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Flat product list with filial context
  const items = useMemo(() => {
    const out: { filial: string; bu: string; vAtu: number; v1: number; v2: number; v3: number }[] = [];
    const d = data || {};
    Object.entries(d).forEach(([filial, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((p: any) => {
        out.push({
          filial,
          bu: String(p?.bu ?? "").toUpperCase().trim(),
          vAtu: num(p?.vAtu),
          v1: num(p?.v1),
          v2: num(p?.v2),
          v3: num(p?.v3),
        });
      });
    });
    return out;
  }, [data]);

  const busDisponiveis = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.bu && s.add(i.bu));
    return Array.from(s).sort();
  }, [items]);

  const filiaisDisponiveis = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.filial && s.add(i.filial));
    return Array.from(s).sort();
  }, [items]);

  // Base do gráfico TOTAL: aplica apenas BU (ignora filial)
  const itemsBuOnly = useMemo(
    () => items.filter((i) => (filtroBu === "todas" ? true : i.bu === filtroBu)),
    [items, filtroBu],
  );

  // Base do gráfico por filial: aplica BU + filial
  const filtered = useMemo(
    () => itemsBuOnly.filter((i) => (filtroFilial === "todas" ? true : i.filial === filtroFilial)),
    [itemsBuOnly, filtroFilial],
  );

  const sumWeeks = (list: typeof items) => {
    const t = { v3: 0, v2: 0, v1: 0, vAtu: 0 };
    list.forEach((i) => {
      t.v3 += i.v3; t.v2 += i.v2; t.v1 += i.v1; t.vAtu += i.vAtu;
    });
    return t;
  };

  const totals = useMemo(() => sumWeeks(filtered), [filtered]);
  const totalsGeral = useMemo(() => sumWeeks(itemsBuOnly), [itemsBuOnly]);

  const toChart = (t: { v3: number; v2: number; v1: number; vAtu: number }) => [
    { name: "VD.SEM. -3", vendas: Math.round(t.v3) },
    { name: "VD.SEM. -2", vendas: Math.round(t.v2) },
    { name: "VD.SEM. -1", vendas: Math.round(t.v1) },
    { name: "VD.SEM. ATU", vendas: Math.round(t.vAtu) },
  ];

  const chartDataGeral = useMemo(() => toChart(totalsGeral), [totalsGeral]);
  const chartDataFilial = useMemo(() => toChart(totals), [totals]);


  const mediaTres = (totals.v3 + totals.v2 + totals.v1) / 3;
  const variacao = mediaTres > 0 ? ((totals.vAtu - mediaTres) / mediaTres) * 100 : 0;
  const skus = filtered.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Unilever"
        description="Indicadores de vendas semanais consolidados a partir dos livros"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Venda Semana Atual (Cx)" value={fmtNum(totals.vAtu)} icon={TrendingUp} trend={variacao >= 0 ? "up" : "down"} trendValue={`${variacao.toFixed(1)}%`} />
        <KpiCard title="Média Últimas 3 Semanas" value={fmtNum(mediaTres)} icon={BarChart3} />
        <KpiCard title="Total 4 Semanas (Cx)" value={fmtNum(totals.v3 + totals.v2 + totals.v1 + totals.vAtu)} icon={Boxes} />
        <KpiCard title="SKUs Analisados" value={fmtNum(skus)} icon={Package} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <label className="text-xs font-medium text-muted-foreground">BU:</label>
          <select
            value={filtroBu}
            onChange={(e) => setFiltroBu(e.target.value)}
            className="px-3 py-1.5 text-xs border border-border rounded-lg bg-background"
          >
            <option value="todas">Todas as BUs</option>
            {busDisponiveis.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Filial:</label>
          <select
            value={filtroFilial}
            onChange={(e) => setFiltroFilial(e.target.value)}
            className="px-3 py-1.5 text-xs border border-border rounded-lg bg-background"
          >
            <option value="todas">Todas as Filiais</option>
            {filiaisDisponiveis.map((f) => (
              <option key={f} value={f}>{FILIAL_LABELS[f] ?? f}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {loading ? "Carregando..." : `${fmtNum(skus)} produto(s)`}
        </span>
      </div>

      {/* Gráficos de Vendas Semanais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: "Vendas Semanais — Total (Cx)", data: chartDataGeral, color: "hsl(var(--primary))", delay: 0 },
          {
            title: `Vendas Semanais — ${filtroFilial === "todas" ? "Todas as Filiais" : FILIAL_LABELS[filtroFilial] ?? filtroFilial} (Cx)`,
            data: chartDataFilial,
            color: "#10b981",
            delay: 0.1,
          },
        ].map((g, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: g.delay }}
            className="bg-card rounded-2xl p-6 shadow-card border border-border"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-heading text-base font-semibold text-card-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: g.color }} />
                {g.title}
              </h3>
            </div>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={g.data} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmtNum(v)} />
                  <Tooltip
                    formatter={(v: number) => [`${fmtNum(v)} Cx`, "Vendas"]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px" }}
                  />
                  <Bar dataKey="vendas" fill={g.color} radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="vendas" position="top" formatter={(v: number) => fmtNum(v)} fontSize={11} fill="hsl(var(--muted-foreground))" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        ))}
      </div>

    </div>
  );
};

export default DashboardUnilever;

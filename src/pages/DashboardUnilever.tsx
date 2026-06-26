import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Package, Boxes, Building2, Search, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
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
  const [busca, setBusca] = useState<string>("");
  const [showSug, setShowSug] = useState<boolean>(false);


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
    const out: {
      filial: string; bu: string; familia: string; cod: string; descricao: string;
      cmp: number; estoque: number; custo: number; preco: number; promoc: number;
      vAtu: number; v1: number; v2: number; v3: number;
    }[] = [];
    const d = data || {};
    Object.entries(d).forEach(([filial, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((p: any) => {
        out.push({
          filial,
          bu: String(p?.bu ?? "").toUpperCase().trim(),
          familia: String(p?.familia ?? "").trim(),
          cod: String(p?.seqProd ?? p?.codigo ?? "").trim(),
          descricao: String(p?.descricao ?? "").trim(),
          cmp: num(p?.embCmp ?? p?.emb_cmp ?? p?.unidPorCaixa ?? p?.unid_por_caixa),
          estoque: num(p?.estoque),
          custo: num(p?.custoLiq ?? p?.custo_liq ?? p?.custo),
          preco: num(p?.atual ?? p?.preco),
          promoc: num(p?.promoc ?? p?.promocional),
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

  // Base do gráfico por filial: aplica BU + filial + busca por código/descrição
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itemsBuOnly.filter((i) => {
      if (filtroFilial !== "todas" && i.filial !== filtroFilial) return false;
      if (!q) return true;
      return i.cod.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q);
    });
  }, [itemsBuOnly, filtroFilial, busca]);


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

  const produtosEncontrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [] as { cod: string; descricao: string }[];
    const seen = new Set<string>();
    const out: { cod: string; descricao: string }[] = [];
    items.forEach((i) => {
      if (filtroBu !== "todas" && i.bu !== filtroBu) return;
      if (!(i.cod.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q))) return;
      const key = i.cod || i.descricao;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ cod: i.cod, descricao: i.descricao });
    });
    return out;
  }, [items, busca, filtroBu]);


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
      <div className="bg-card border border-border rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              placeholder="Buscar por código ou descrição do produto..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background"
              autoComplete="off"
            />
            {showSug && busca.trim().length >= 2 && produtosEncontrados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {produtosEncontrados.slice(0, 20).map((p) => (
                  <div
                    key={`${p.cod}-${p.descricao}`}
                    onMouseDown={(e) => { e.preventDefault(); setBusca(p.cod); setShowSug(false); }}
                    className="px-3 py-2 text-xs cursor-pointer border-b border-border/60 hover:bg-accent"
                  >
                    <div className="font-semibold text-primary">{p.cod}</div>
                    <div className="text-foreground/80">{p.descricao}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <span className="text-xs text-muted-foreground">
            {loading ? "Carregando..." : `${fmtNum(skus)} produto(s)`}
          </span>
        </div>
        {busca.trim() && (
          <div className="text-[11px] text-muted-foreground pl-1">
            {produtosEncontrados.length === 0 ? (
              <span className="text-destructive">Nenhum produto localizado.</span>
            ) : (
              <span>
                <span className="font-semibold text-foreground">Produto(s) localizado(s):</span>{" "}
                <span className="font-bold text-green-600">
                  {produtosEncontrados.slice(0, 5).map((p) => `${p.cod} — ${p.descricao}`).join(" • ")}
                  {produtosEncontrados.length > 5 && ` • +${produtosEncontrados.length - 5} outros`}
                </span>
              </span>
            )}
          </div>
        )}
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

      {/* Tabela detalhada */}
      <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-heading text-base font-semibold text-card-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Produtos ({fmtNum(filtered.length)})
          </h3>
          <button
            onClick={() => {
              const rows = filtered.map((i) => {
                const precoVenda = i.promoc > 0 ? i.promoc : i.preco;
                const margem = precoVenda > 0 ? ((precoVenda - i.custo) / precoVenda) * 100 : 0;
                return {
                  BU: i.bu,
                  Filial: FILIAL_LABELS[i.filial] ?? i.filial,
                  "Cód. Família": i.familia,
                  Código: i.cod,
                  Descrição: i.descricao,
                  "Unid/CX": Math.round(i.cmp),
                  Estoque: Math.round(i.estoque),
                  "Preço de Custo": i.custo,
                  "Preço de Venda": i.preco,
                  Promocional: i.promoc,
                  "Margem (%)": Number(margem.toFixed(2)),
                  "VD.SEM. -3": Math.round(i.v3),
                  "VD.SEM. -2": Math.round(i.v2),
                  "VD.SEM. -1": Math.round(i.v1),
                  "Venda Média": Math.round((i.v1 + i.v2 + i.v3) / 3),
                  "VD.SEM. ATU": Math.round(i.vAtu),
                };
              });
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
              const stamp = new Date().toISOString().slice(0, 10);
              XLSX.writeFile(wb, `Dashboard_Unilever_${stamp}.xlsx`);
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg text-white shadow-sm transition-colors"
            style={{ backgroundColor: "#107C41" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#0B5F31")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#107C41")}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr className="text-left text-muted-foreground">
                {["BU","Filial","Cód. Família","Código","Descrição","Unid/CX","Estoque","Preço de Custo","Preço de Venda","Promocional","Margem","VD.SEM. -3","VD.SEM. -2","VD.SEM. -1","Venda Média","VD.SEM. ATU"].map((h, i) => (
                  <th key={h} className={`px-2 py-2 font-semibold whitespace-nowrap ${i >= 5 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 1000).map((i, idx) => {
                const precoVenda = i.promoc > 0 ? i.promoc : i.preco;
                const margem = precoVenda > 0 ? ((precoVenda - i.custo) / precoVenda) * 100 : 0;
                return (
                  <tr key={idx} className="border-t border-border hover:bg-muted/40">
                    <td className="px-2 py-1.5 font-semibold">{i.bu}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{FILIAL_LABELS[i.filial] ?? i.filial}</td>
                    <td className="px-2 py-1.5">{i.familia}</td>
                    <td className="px-2 py-1.5 font-mono">{i.cod}</td>
                    <td className="px-2 py-1.5 min-w-[260px]">{i.descricao}</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.cmp)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.estoque)}</td>
                    <td className="px-2 py-1.5 text-right">{i.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="px-2 py-1.5 text-right">{i.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="px-2 py-1.5 text-right">{i.promoc > 0 ? i.promoc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${margem < 0 ? "text-destructive" : "text-emerald-600"}`}>{margem.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.v3)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.v2)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.v1)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmtNum((i.v1 + i.v2 + i.v3) / 3)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtNum(i.vAtu)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={16} className="px-4 py-8 text-center text-muted-foreground">Nenhum produto.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 1000 && (
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Exibindo primeiros 1.000 de {fmtNum(filtered.length)} produtos. Refine os filtros para ver mais.
          </div>
        )}
      </div>

    </div>
  );
};

export default DashboardUnilever;

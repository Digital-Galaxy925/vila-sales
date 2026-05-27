import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, RefreshCw, Wallet, TrendingUp, Package, Percent } from "lucide-react";

interface Proposta {
  id: string;
  codigo_produto: string;
  descricao_produto: string;
  filial: string;
  filial_nome: string;
  volume_caixas: number | null;
  unid_por_caixa: number | null;
  total_unidades: number | null;
  custo_unitario: number | null;
  preco_venda: number | null;
  margem_real: number | null;
  total_sellout: number | null;
  investimento_por_unidade: number | null;
  investimento_por_caixa: number | null;
  investimento_total: number | null;
  percentual_investimento: number | null;
  observacao: string | null;
  created_at: string;
}

const fmt = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) => ((v ?? 0) * 100).toFixed(2) + "%";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export default function ControleInvestimentos() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroFilial, setFiltroFilial] = useState<string>("todas");
  const [busca, setBusca] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("propostas_simulador")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setPropostas((data as Proposta[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function remover(id: string) {
    if (!confirm("Excluir esta proposta?")) return;
    const { error } = await supabase.from("propostas_simulador").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      setPropostas((p) => p.filter((x) => x.id !== id));
      toast({ title: "Proposta excluída" });
    }
  }

  const filtradas = useMemo(() => {
    return propostas.filter((p) => {
      if (filtroFilial !== "todas" && p.filial !== filtroFilial) return false;
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        if (
          !p.codigo_produto?.toLowerCase().includes(q) &&
          !p.descricao_produto?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [propostas, filtroFilial, busca]);

  const totais = useMemo(() => {
    const totalInvest = filtradas.reduce((s, p) => s + (p.investimento_total ?? 0), 0);
    const totalSellout = filtradas.reduce((s, p) => s + (p.total_sellout ?? 0), 0);
    const totalUnid = filtradas.reduce((s, p) => s + (p.total_unidades ?? 0), 0);
    const pctMedio = totalSellout > 0 ? totalInvest / totalSellout : 0;
    return { totalInvest, totalSellout, totalUnid, pctMedio, count: filtradas.length };
  }, [filtradas]);

  const filiaisDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    propostas.forEach((p) => m.set(p.filial, p.filial_nome || p.filial));
    return Array.from(m.entries());
  }, [propostas]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Controle de Investimentos"
        description="Histórico de todas as propostas salvas no Simulador de Ofertas"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Wallet className="w-4 h-4" />} label="Investimento Total" value={fmt(totais.totalInvest)} color="#dc2626" />
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Sell Out Total" value={fmt(totais.totalSellout)} color="#7c3aed" />
        <KpiCard icon={<Package className="w-4 h-4" />} label="Total Unidades" value={fmtNum(totais.totalUnid)} color="#0071e3" />
        <KpiCard icon={<Percent className="w-4 h-4" />} label="% Investimento Médio" value={fmtPct(totais.pctMedio)} color="#d97706" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
        <input
          type="text"
          placeholder="Buscar por código ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-border rounded-lg bg-background"
        />
        <select
          value={filtroFilial}
          onChange={(e) => setFiltroFilial(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        >
          <option value="todas">Todas as filiais</option>
          {filiaisDisponiveis.map(([id, nome]) => (
            <option key={id} value={id}>{id} – {nome}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{totais.count} proposta(s)</span>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <Th>Data</Th>
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th>Filial</Th>
                <Th right>Volume (CX)</Th>
                <Th right>Unidades</Th>
                <Th right>Custo Un.</Th>
                <Th right>Preço Venda</Th>
                <Th right>Margem</Th>
                <Th right>Sell Out</Th>
                <Th right>Invest. Total</Th>
                <Th right>% Invest.</Th>
                <Th>Obs.</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="text-center py-10 text-muted-foreground">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-muted-foreground">
                  Nenhuma proposta salva. Vá ao Simulador de Ofertas para criar a primeira.
                </td></tr>
              ) : (
                filtradas.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <Td>{fmtDate(p.created_at)}</Td>
                    <Td className="font-mono">{p.codigo_produto}</Td>
                    <Td className="max-w-[260px] truncate" title={p.descricao_produto}>{p.descricao_produto}</Td>
                    <Td>{p.filial} – {p.filial_nome}</Td>
                    <Td right>{fmtNum(p.volume_caixas)}</Td>
                    <Td right>{fmtNum(p.total_unidades)}</Td>
                    <Td right>{fmt(p.custo_unitario)}</Td>
                    <Td right>{fmt(p.preco_venda)}</Td>
                    <Td right>
                      <span style={{ color: (p.margem_real ?? 0) >= 0.17 ? "#16a34a" : (p.margem_real ?? 0) >= 0.10 ? "#d97706" : "#dc2626", fontWeight: 600 }}>
                        {fmtPct(p.margem_real)}
                      </span>
                    </Td>
                    <Td right>{fmt(p.total_sellout)}</Td>
                    <Td right><span style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(p.investimento_total)}</span></Td>
                    <Td right>{fmtPct(p.percentual_investimento)}</Td>
                    <Td className="max-w-[160px] truncate text-muted-foreground" title={p.observacao ?? ""}>{p.observacao}</Td>
                    <Td>
                      <button
                        onClick={() => remover(p.id)}
                        className="text-destructive hover:bg-destructive/10 p-1.5 rounded"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="text-lg font-bold tracking-tight" style={{ color }}>{value}</div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[10px] uppercase tracking-wider font-semibold ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, className = "", title }: { children?: React.ReactNode; right?: boolean; className?: string; title?: string }) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${className}`} title={title}>
      {children}
    </td>
  );
}

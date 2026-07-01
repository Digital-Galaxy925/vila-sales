import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, RefreshCw, Wallet, TrendingUp, Package, Percent, Pencil, X, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useAppData } from "@/contexts/AppDataContext";

const normCod = (v: string): string => {
  let s = (v ?? "").toString().trim();
  s = s.replace(/\.0+$/, "");
  s = s.replace(/^0+(\d)/, "$1");
  return s;
};
const normBu = (raw: unknown): string => {
  const b = (raw ?? "").toString().toUpperCase().trim();
  if (b === "FOODS" || b === "FR" || b === "FOOD") return "FR";
  if (b === "HC") return "HC";
  return "";
};

interface Proposta {
  id: string;
  codigo_produto: string;
  descricao_produto: string;
  bu: string | null;
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
  cota: string | null;
  cliente: string | null;
  gerente: string | null;
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
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroBu, setFiltroBu] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Proposta | null>(null);
  const [salvandoEdit, setSalvandoEdit] = useState(false);

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

  const { get } = useAppData();
  const buLookup = useMemo(() => {
    const data = get<Record<string, Array<{ seqProd?: string; bu?: string }>>>("vilasales_data") ?? {};
    const map = new Map<string, string>();
    for (const fid of Object.keys(data)) {
      const arr = data[fid];
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        const cod = normCod(p?.seqProd ?? "");
        const bu = normBu(p?.bu);
        if (cod && bu && !map.has(cod)) map.set(cod, bu);
      }
    }
    return map;
  }, [get]);

  const buOf = (p: Proposta): string => {
    const own = normBu(p.bu);
    if (own) return own;
    return buLookup.get(normCod(p.codigo_produto)) ?? "";
  };


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
      if (filtroBu !== "todas" && buOf(p) !== filtroBu) return false;
      if (filtroMes !== "todos") {
        const mes = p.created_at.slice(0, 7);
        if (mes !== filtroMes) return false;
      }
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
  }, [propostas, filtroFilial, filtroMes, filtroBu, busca, buLookup]);

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

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    propostas.forEach((p) => set.add(p.created_at.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [propostas]);

  function exportarExcel() {
    if (filtradas.length === 0) {
      toast({ title: "Nenhuma proposta para exportar", description: "Aplique filtros ou salve propostas primeiro." });
      return;
    }
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const rows = filtradas.map((p) => {
      const d = new Date(p.created_at);
      return {
        Mês: meses[d.getMonth()],
        Ano: d.getFullYear(),
        Filial: p.filial_nome || p.filial,
        BU: buOf(p),
        Código: p.codigo_produto,
        Descrição: p.descricao_produto,
        Data: fmtDate(p.created_at),
        "Volume (CX)": p.volume_caixas ?? 0,
        "Unid / CX": p.unid_por_caixa ?? 0,
        "Total Unidades": p.total_unidades ?? 0,
        "Custo Unitário": p.custo_unitario ?? 0,
        "Preço Venda": p.preco_venda ?? 0,
        "Margem Real": p.margem_real ?? 0,
        "Sell Out Total": p.total_sellout ?? 0,
        "Invest. por Unid": p.investimento_por_unidade ?? 0,
        "Invest. por CX": p.investimento_por_caixa ?? 0,
        "Invest. Total": p.investimento_total ?? 0,
        "% Investimento": p.percentual_investimento ?? 0,
        Cota: p.cota ?? "",
        Cliente: p.cliente ?? "",
        Gerente: p.gerente ?? "",
        Observação: p.observacao ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Propostas");
    XLSX.writeFile(wb, `Controle_Investimentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Exportação concluída" });
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Controle de Investimentos"
        description="Histórico de todas as propostas salvas no Simulador de Ofertas"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportarExcel}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
          </div>
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
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        >
          <option value="todos">Todos os meses</option>
          {mesesDisponiveis.map((m) => {
            const [ano, mes] = m.split("-");
            const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
            const label = `${nomes[Number(mes) - 1]}/${ano}`;
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
        <select
          value={filtroBu}
          onChange={(e) => setFiltroBu(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        >
          <option value="todas">Todas as BUs</option>
          <option value="HC">HC</option>
          <option value="FR">FR</option>
        </select>
        <span className="text-xs text-muted-foreground">{totais.count} proposta(s)</span>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <Th>Mês</Th>
                <Th>Ano</Th>
                <Th>Filial</Th>
                <Th>BU</Th>
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th>Data</Th>
                <Th right>Volume (CX)</Th>
                <Th right>Unidades</Th>
                <Th right>Custo Un.</Th>
                <Th right>Preço Venda</Th>
                <Th right>Margem</Th>
                <Th right>Sell Out</Th>
                <Th right>Invest. Total</Th>
                <Th right>% Invest.</Th>
                <Th>Cota</Th>
                <Th>Cliente</Th>
                <Th>Gerente</Th>
                <Th>Obs.</Th>
                <Th />

              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={20} className="text-center py-10 text-muted-foreground">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={20} className="text-center py-10 text-muted-foreground">
                  Nenhuma proposta salva. Vá ao Simulador de Ofertas para criar a primeira.
                </td></tr>
              ) : (
                filtradas.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    {(() => {
                      const d = new Date(p.created_at);
                      const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
                      return (<>
                        <Td>{meses[d.getMonth()]}</Td>
                        <Td>{d.getFullYear()}</Td>
                      </>);
                    })()}
                    <Td>{p.filial} – {p.filial_nome}</Td>
                    <Td>
                      {(() => {
                        const bu = buOf(p);
                        return bu ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{
                              background: bu === "HC" ? "#ede9fe" : bu === "FR" ? "#dcfce7" : "#f1f5f9",
                              color: bu === "HC" ? "#6d28d9" : bu === "FR" ? "#16a34a" : "#475569",
                            }}
                          >
                            {bu}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        );
                      })()}
                    </Td>
                    <Td className="font-mono">{p.codigo_produto}</Td>
                    <Td className="max-w-[260px] truncate" title={p.descricao_produto}>{p.descricao_produto}</Td>
                    <Td>{fmtDate(p.created_at)}</Td>
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
                    <Td className="max-w-[140px] truncate" title={p.cota ?? ""}>{p.cota ?? "–"}</Td>
                    <Td className="max-w-[140px] truncate" title={p.gerente ?? ""}>{p.gerente ?? "–"}</Td>
                    <Td className="max-w-[160px] truncate text-muted-foreground" title={p.observacao ?? ""}>{p.observacao}</Td>

                    <Td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditando(p)}
                          className="text-primary hover:bg-primary/10 p-1.5 rounded"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remover(p.id)}
                          className="text-destructive hover:bg-destructive/10 p-1.5 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <EditModal
          proposta={editando}
          salvando={salvandoEdit}
          onClose={() => setEditando(null)}
          onSave={async (patch) => {
            setSalvandoEdit(true);
            const volume = patch.volume_caixas ?? 0;
            const unidCx = patch.unid_por_caixa ?? 1;
            const custo = patch.custo_unitario ?? 0;
            const preco = patch.preco_venda ?? 0;
            const totalUnid = volume * unidCx;
            const totalSellout = totalUnid * preco;
            const margReal = preco > 0 ? (preco - custo) / preco : 0;

            const { error } = await supabase
              .from("propostas_simulador")
              .update({
                volume_caixas: volume,
                unid_por_caixa: unidCx,
                total_unidades: totalUnid,
                custo_unitario: custo,
                preco_venda: preco,
                margem_real: margReal,
                total_sellout: totalSellout,
                observacao: patch.observacao ?? "",
              })
              .eq("id", editando.id);
            setSalvandoEdit(false);
            if (error) {
              toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
            } else {
              toast({ title: "Proposta atualizada" });
              setEditando(null);
              load();
            }
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  proposta,
  salvando,
  onClose,
  onSave,
}: {
  proposta: Proposta;
  salvando: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Proposta>) => void;
}) {
  const [volume, setVolume] = useState(String(proposta.volume_caixas ?? ""));
  const [unidCx, setUnidCx] = useState(String(proposta.unid_por_caixa ?? ""));
  const [custo, setCusto] = useState(String(proposta.custo_unitario ?? ""));
  const [preco, setPreco] = useState(String(proposta.preco_venda ?? ""));
  const [obs, setObs] = useState(proposta.observacao ?? "");
  const num = (s: string) => parseFloat(s.replace(",", ".")) || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Editar Proposta</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{proposta.codigo_produto} – {proposta.descricao_produto}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Volume (CX)" value={volume} onChange={setVolume} />
          <Field label="Unid / CX" value={unidCx} onChange={setUnidCx} />
          <Field label="Custo Unitário (R$)" value={custo} onChange={setCusto} />
          <Field label="Preço de Venda (R$)" value={preco} onChange={setPreco} />
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Observação</label>
            <input
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted">
            Cancelar
          </button>
          <button
            disabled={salvando}
            onClick={() =>
              onSave({
                volume_caixas: num(volume),
                unid_por_caixa: num(unidCx),
                custo_unitario: num(custo),
                preco_venda: num(preco),
                observacao: obs,
              })
            }
            className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
      />
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

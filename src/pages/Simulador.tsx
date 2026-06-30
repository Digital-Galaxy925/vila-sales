import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAppDataKey } from "@/contexts/AppDataContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  familia: string;
  seqProd: string;
  descricao: string;
  embCmp: string;
  embVir: string;
  estoque: number;
  sellout: number;
  custoLiq: number;
  comis: number;
  marg: number;
  mesAnt: number;
  mesAtu: number;
  abc: string;
  custoNf: number;
  atual: number;
  sugerido: number;
  ddv: number;
  filial: string;
  bu: string;
  promoc: number;
}

type DataMap = Record<string, Product[]>;

const FILIAIS = [
  { id: "01", nome: "Poços de Caldas" },
  { id: "11", nome: "Campinas" },
  { id: "12", nome: "Osasco" },
  { id: "14", nome: "Betim" },
  { id: "501", nome: "Focomix SP" },
  { id: "502", nome: "Focomix MG" },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) => (v * 100).toFixed(2) + "%";

export default function Simulador() {
  const navigate = useNavigate();

  const cached = useAppDataKey<DataMap>("vilasales_data");
  const data: DataMap = useMemo(() => {
    if (cached && typeof cached === "object" && Object.keys(cached).length > 0) return cached;
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [cached]);

  const hasData = Object.keys(data).length > 0;

  const [codigo, setCodigo] = useState("");
  const [filial, setFilial] = useState("01");
  const [volumeCaixas, setVolumeCaixas] = useState("");
  const [precoVendaDesejado, setPrecoVendaDesejado] = useState("");
  const [margemMinimaDesejada, setMargemMinimaDesejada] = useState("17");
  const [observacao, setObservacao] = useState("");
  const [gerente, setGerente] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [selectedCod, setSelectedCod] = useState<string>("");
  const [showSug, setShowSug] = useState(false);

  const normCod = (v: string): string => {
    let s = (v ?? "").toString().trim();
    s = s.replace(/\.0+$/, "");
    s = s.replace(/^0+(\d)/, "$1");
    return s;
  };

  const produto = useMemo(() => {
    const q = codigo.trim();
    if (!q) return null;
    const codNorm = normCod(selectedCod || q);
    const qLower = q.toLowerCase();
    const searchInFilial = (fid: string) => {
      const arr = data[fid];
      if (!Array.isArray(arr)) return null;
      let f = arr.find((p) => normCod(p.seqProd) === codNorm);
      if (f) return f;
      if (!selectedCod) {
        f = arr.find((p) => (p.descricao ?? "").toLowerCase().includes(qLower));
        if (f) return f;
      }
      return null;
    };
    const found = searchInFilial(filial);
    if (found) return found;
    for (const key of Object.keys(data)) {
      const f = searchInFilial(key);
      if (f) return f;
    }
    return null;
  }, [codigo, filial, data, selectedCod]);

  const suggestions = useMemo(() => {
    const q = codigo.trim().toLowerCase();
    if (!q || q.length < 2 || selectedCod) return [];
    const qCod = normCod(codigo);
    const seen = new Set<string>();
    const out: Product[] = [];
    const arr = data[filial];
    const pools: Product[][] = [];
    if (Array.isArray(arr)) pools.push(arr);
    for (const k of Object.keys(data)) if (k !== filial && Array.isArray(data[k])) pools.push(data[k]);
    for (const pool of pools) {
      for (const p of pool) {
        const cod = normCod(p.seqProd);
        if (seen.has(cod)) continue;
        const desc = (p.descricao ?? "").toLowerCase();
        if ((qCod && cod.includes(qCod)) || desc.includes(q)) {
          seen.add(cod);
          out.push(p);
          if (out.length >= 15) return out;
        }
      }
    }
    return out;
  }, [codigo, filial, data, selectedCod]);

  const custoUnitario = produto?.custoLiq ?? 0;
  const precoVenda = parseFloat(precoVendaDesejado.replace(",", ".")) || 0;
  const volume = parseFloat(volumeCaixas.replace(",", ".")) || 0;
  const qtdPorCaixa = produto ? parseFloat(produto.embCmp) || 1 : 1;

  const margemReal = precoVenda > 0 ? (precoVenda - custoUnitario) / precoVenda : 0;
  const totalSellOut = volume * qtdPorCaixa * precoVenda;

  const margemMinima = (parseFloat(margemMinimaDesejada.replace(",", ".")) || 0) / 100;
  const totalUnidades = volume * qtdPorCaixa;
  const investimentoPorUnidade = precoVenda > 0 ? custoUnitario - precoVenda * (1 - margemMinima) : 0;
  const investimentoTotal = investimentoPorUnidade > 0 ? investimentoPorUnidade * totalUnidades : 0;
  const percentualInvestimento = totalSellOut > 0 ? investimentoTotal / totalSellOut : 0;

  const showResults = produto && precoVenda > 0;

  async function salvarProposta() {
    if (!produto || !showResults) return;
    setSalvando(true);
    try {
      const buRaw = (produto.bu ?? "").toString().toUpperCase();
      const buNorm = buRaw === "FOODS" || buRaw === "FR" || buRaw === "FOOD" ? "FR" : buRaw === "HC" ? "HC" : (buRaw || null);
      const { error } = await supabase.from("propostas_simulador").insert({
        codigo_produto: normCod(produto.seqProd),
        descricao_produto: produto.descricao ?? "",
        bu: buNorm,
        filial,
        filial_nome: FILIAIS.find((f) => f.id === filial)?.nome ?? "",
        volume_caixas: volume,
        unid_por_caixa: qtdPorCaixa,
        total_unidades: totalUnidades,
        custo_unitario: custoUnitario,
        preco_venda: precoVenda,
        margem_real: margemReal,
        margem_minima: margemMinima,
        total_sellout: totalSellOut,
        investimento_por_unidade: investimentoPorUnidade > 0 ? investimentoPorUnidade : 0,
        investimento_por_caixa: investimentoPorUnidade > 0 ? investimentoPorUnidade * qtdPorCaixa : 0,
        investimento_total: investimentoTotal,
        percentual_investimento: percentualInvestimento,
        observacao,
        gerente: gerente || null,
      });
      if (error) throw error;
      toast({ title: "Proposta salva", description: "Disponível em Controle de Investimentos." });
      setObservacao("");
      setGerente("");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#1a1a2e" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.02em", color: "#0f172a" }}>
        Simulador de Ofertas
      </h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        Simule preços, margens e sell out de um produto específico por filial.
      </p>

      {!hasData ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
            Nenhum dado carregado. Faça o upload dos arquivos na tela principal primeiro.
          </p>
          <button
            onClick={() => navigate("/")}
            style={{ background: "#0071e3", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 500, fontSize: 13 }}
          >
            Ir para Upload
          </button>
        </div>
      ) : (
        <>
          {/* ─── Inputs ─── */}
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 22px", border: "1px solid #e5e7eb", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, alignItems: "end" }}>
              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Código ou Descrição do Produto</label>
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => { setCodigo(e.target.value); setSelectedCod(""); setShowSug(true); }}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder="Ex: 125545 ou nome do produto"
                  style={inputStyle}
                  autoComplete="off"
                />
                {showSug && suggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                    marginTop: 4, background: "#fff", border: "1px solid #d1d5db",
                    borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    maxHeight: 280, overflowY: "auto",
                  }}>
                    {suggestions.map((p) => {
                      const cod = normCod(p.seqProd);
                      return (
                        <div
                          key={`${cod}-${p.filial}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedCod(cod);
                            setCodigo(cod);
                            setShowSug(false);
                          }}
                          style={{
                            padding: "8px 12px", fontSize: 12, cursor: "pointer",
                            borderBottom: "1px solid #f3f4f6", color: "#1f2937",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                        >
                          <div style={{ fontWeight: 600, color: "#0071e3" }}>{cod}</div>
                          <div style={{ color: "#374151" }}>{p.descricao}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Filial</label>
                <select value={filial} onChange={(e) => setFilial(e.target.value)} style={inputStyle}>
                  {FILIAIS.map((f) => (
                    <option key={f.id} value={f.id}>{f.id} – {f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Volume Sell Out (CX)</label>
                <input type="text" value={volumeCaixas} onChange={(e) => setVolumeCaixas(e.target.value)} placeholder="Ex: 1000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Preço Venda Desejado (R$)</label>
                <input type="text" value={precoVendaDesejado} onChange={(e) => setPrecoVendaDesejado(e.target.value)} placeholder="Ex: 13,99" style={inputStyle} disabled={!produto} />
              </div>
            </div>
          </div>

          {/* ─── Product info bar ─── */}
          {codigo.trim() && (
            <div style={{
              background: produto ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${produto ? "#bbf7d0" : "#fecaca"}`,
              borderRadius: 10, padding: "16px 20px", marginBottom: 16, fontSize: 13,
            }}>
              {produto ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {produto.descricao}</span>
                  <Chip label="Custo" value={fmt(custoUnitario)} color="#d97706" />
                  <Chip label="Unid/CX" value={String(qtdPorCaixa)} color="#374151" />
                  <Chip label="Estoque" value={String(produto.estoque)} color="#374151" />
                  <Chip label="Preço Atual" value={fmt(produto.atual)} color="#374151" />
                  <Chip label="Promocional" value={fmt(produto.promoc ?? 0)} color="#7c3aed" />
                  <Chip label="Sell Out" value={fmt(produto.sellout ?? 0)} color="#0284c7" />
                  {(() => {
                    const promo = produto.promoc ?? 0;
                    const precoRef = promo > 0 ? promo : produto.atual;
                    const margAtual = precoRef > 0 ? (precoRef - custoUnitario) / precoRef : 0;
                    const corMarg = margAtual >= 0.17 ? "#16a34a" : margAtual >= 0.10 ? "#d97706" : "#dc2626";
                    return <Chip label="Margem Atual" value={fmtPct(margAtual)} color={corMarg} />;
                  })()}
                  {(() => {
                    const pv = produto.atual;
                    const promo = produto.promoc ?? 0;
                    const precoRef = promo > 0 ? promo : pv;
                    const pc = custoUnitario;
                    const so = produto.sellout ?? 0;
                    const margPromo = precoRef > 0 ? (precoRef - (pc - so)) / precoRef : 0;
                    const corMargPromo = margPromo >= 0.17 ? "#16a34a" : margPromo >= 0.10 ? "#d97706" : "#dc2626";
                    return <Chip label="Margem Promocional" value={fmtPct(margPromo)} color={corMargPromo} />;
                  })()}
                </div>
              ) : (
                <span style={{ color: "#dc2626" }}>Produto não encontrado na filial {filial} – {FILIAIS.find(f => f.id === filial)?.nome}</span>
              )}
            </div>
          )}

          {/* ─── Results Dashboard ─── */}
          {showResults && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                <SimKpiCard
                  label="Margem Real"
                  value={fmtPct(margemReal)}
                  color={margemReal >= 0.17 ? "#16a34a" : margemReal >= 0.10 ? "#d97706" : "#dc2626"}
                  sub={`(${fmt(precoVenda)} − ${fmt(custoUnitario)}) / ${fmt(precoVenda)}`}
                />
                <SimKpiCard label="Preço de Custo" value={fmt(custoUnitario)} color="#d97706" />
                <SimKpiCard label="Preço Venda Desejado" value={fmt(precoVenda)} color="#0071e3" />
                {(() => {
                  const promo = produto.promoc ?? 0;
                  const ref = promo > 0 ? promo : produto.atual;
                  const desc = ref > 0 ? (precoVenda / ref) - 1 : 0;
                  const cor = desc < 0 ? "#16a34a" : desc > 0 ? "#dc2626" : "#374151";
                  return (
                    <SimKpiCard
                      label={`Desconto vs Preço ${promo > 0 ? "Promocional" : "Atual"}`}
                      value={fmtPct(desc)}
                      color={cor}
                      sub={`(${fmt(precoVenda)} / ${fmt(ref)}) − 1`}
                    />
                  );
                })()}
                <SimKpiCard
                  label="Lucro por Unidade"
                  value={fmt(precoVenda - custoUnitario)}
                  color={precoVenda - custoUnitario > 0 ? "#16a34a" : "#dc2626"}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>

                <MiniKpi label="Volume (CX)" value={volume.toLocaleString("pt-BR")} />
                <MiniKpi label="Unid/CX" value={String(qtdPorCaixa)} />
                <MiniKpi label="Total Unidades" value={totalUnidades.toLocaleString("pt-BR")} />
                <SimKpiCard
                  label="Valor Total Sell Out"
                  value={fmt(totalSellOut)}
                  color="#7c3aed"
                  sub={`${volume} cx × ${qtdPorCaixa} un × ${fmt(precoVenda)}`}
                  highlight
                />
              </div>

              {/* Investment analysis */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "18px 22px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>
                    Análise de Investimento
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Margem Mínima (%):</label>
                    <input type="text" value={margemMinimaDesejada} onChange={(e) => setMargemMinimaDesejada(e.target.value)} placeholder="17" style={{ ...inputStyle, width: 80 }} />
                  </div>
                  {margemMinima > 0 && margemMinima < 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f9ff", borderRadius: 8, padding: "6px 14px", border: "1px solid #bae6fd" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Preço Sugerido:</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#0071e3" }}>{fmt(custoUnitario / (1 - margemMinima))}</span>
                    </div>
                  )}
                </div>
                {margemReal >= margemMinima ? (
                  <div style={{
                    background: "#f0fdf4", borderRadius: 10, padding: "14px 20px",
                    border: "1px solid #bbf7d0", fontSize: 13, color: "#16a34a", fontWeight: 500,
                  }}>
                    ✓ A margem atual ({fmtPct(margemReal)}) já atende a margem mínima de {fmtPct(margemMinima)}. Nenhum investimento necessário.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <SimKpiCard
                      label="Investimento / Unidade"
                      value={fmt(investimentoPorUnidade)}
                      color="#dc2626"
                      sub={`Custo ${fmt(custoUnitario)} − Máx. permitido ${fmt(precoVenda * (1 - margemMinima))}`}
                    />
                    <SimKpiCard
                      label="Investimento por Caixa"
                      value={fmt(investimentoPorUnidade * qtdPorCaixa)}
                      color="#dc2626"
                      sub={`${fmt(investimentoPorUnidade)} × ${qtdPorCaixa} un/cx`}
                    />
                    <SimKpiCard
                      label="Investimento Total"
                      value={fmt(investimentoTotal)}
                      color="#dc2626"
                      sub={`${fmt(investimentoPorUnidade)} × ${totalUnidades.toLocaleString("pt-BR")} unidades`}
                      highlight
                    />
                    <SimKpiCard
                      label="% de Investimento"
                      value={fmtPct(percentualInvestimento)}
                      color="#d97706"
                      sub={`${fmt(investimentoTotal)} / ${fmt(totalSellOut)}`}
                    />
                  </div>
                )}
              </div>

              {/* Save proposal */}
              <div style={{ marginTop: 16, background: "#fff", borderRadius: 12, padding: "18px 22px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={labelStyle}>Observação (opcional)</label>
                  <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: cliente XYZ, campanha de junho..." style={inputStyle} />
                </div>
                <button
                  onClick={salvarProposta}
                  disabled={salvando}
                  style={{ background: salvando ? "#94a3b8" : "#0071e3", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, height: 38 }}
                >
                  {salvando ? "Salvando..." : "Salvar Proposta"}
                </button>
                <button
                  onClick={() => navigate("/controle-investimentos")}
                  style={{ background: "#fff", color: "#0071e3", border: "1px solid #0071e3", borderRadius: 8, padding: "10px 22px", cursor: "pointer", fontWeight: 600, fontSize: 13, height: 38 }}
                >
                  Ver Controle de Investimentos
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 500, color: "#6b7280",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #d1d5db", background: "#fafafa", color: "#1f2937",
  fontSize: 13, outline: "none", boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ color: "#6b7280", fontSize: 12 }}>
      {label}: <strong style={{ color, fontWeight: 600 }}>{value}</strong>
    </span>
  );
}

function SimKpiCard({ label, value, color, sub, highlight }: {
  label: string; value: string; color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      padding: "14px 16px", border: `1px solid ${highlight ? "#d1d5db" : "#e5e7eb"}`,
      boxShadow: highlight ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: highlight ? 22 : 18, fontWeight: 700, color, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, padding: "14px 16px",
      border: "1px solid #e5e7eb", textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#1f2937" }}>{value}</div>
    </div>
  );
}

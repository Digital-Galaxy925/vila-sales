import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

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

  const data: DataMap = useMemo(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const hasData = Object.keys(data).length > 0;

  const [codigo, setCodigo] = useState("");
  const [filial, setFilial] = useState("01");
  const [volumeCaixas, setVolumeCaixas] = useState("");
  const [precoVendaDesejado, setPrecoVendaDesejado] = useState("");
  const [margemMinimaDesejada, setMargemMinimaDesejada] = useState("17");

  const normCod = (v: string): string => {
    let s = v.trim();
    s = s.replace(/\.0+$/, "");
    s = s.replace(/^0+(\d)/, "$1");
    return s;
  };

  const produto = useMemo(() => {
    if (!codigo.trim()) return null;
    const cod = normCod(codigo);
    if (!cod) return null;
    const searchInFilial = (fid: string) => {
      const arr = data[fid];
      if (!Array.isArray(arr)) return null;
      return arr.find((p) => normCod(p.seqProd) === cod) ?? null;
    };
    const found = searchInFilial(filial);
    if (found) return found;
    for (const key of Object.keys(data)) {
      const f = searchInFilial(key);
      if (f) return f;
    }
    return null;
  }, [codigo, filial, data]);

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

  return (
    <div style={{ padding: "24px 32px", minHeight: "100vh", background: "#0b1120", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>🎛️ Simulador de Ofertas</h1>
      <p style={{ color: "#64748b", fontSize: 12, marginBottom: 20 }}>
        Simule preços, margens e sell out de um produto específico por filial.
      </p>

      {!hasData ? (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 32, textAlign: "center", border: "1px solid #334155" }}>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
            Nenhum dado carregado. Faça o upload dos arquivos na tela principal primeiro.
          </p>
          <button
            onClick={() => navigate("/")}
            style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            Ir para Upload
          </button>
        </div>
      ) : (
        <>
          {/* ─── Inputs: compact horizontal bar ─── */}
          <div style={{ background: "#111827", borderRadius: 12, padding: "16px 20px", border: "1px solid #1e293b", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 16, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Código do Produto</label>
                <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: 125545" style={inputStyle} />
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
              <div>
                <label style={labelStyle}>Margem Mínima (%)</label>
                <input type="text" value={margemMinimaDesejada} onChange={(e) => setMargemMinimaDesejada(e.target.value)} placeholder="17" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* ─── Product info bar ─── */}
          {codigo.trim() && (
            <div style={{
              background: produto ? "#0d1f17" : "#1f1215",
              border: `1px solid ${produto ? "#166534" : "#7f1d1d"}`,
              borderRadius: 10, padding: "20px 24px", marginBottom: 16, fontSize: 13,
            }}>
              {produto ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>✅ {produto.descricao}</span>
                  <Chip label="Custo" value={fmt(custoUnitario)} color="#fbbf24" />
                  <Chip label="Unid/CX" value={String(qtdPorCaixa)} color="#e2e8f0" />
                  <Chip label="Estoque" value={String(produto.estoque)} color="#e2e8f0" />
                  <Chip label="Preço Atual" value={fmt(produto.atual)} color="#e2e8f0" />
                  <Chip label="Promocional" value={fmt(produto.promoc ?? 0)} color="#c084fc" />
                  <Chip label="Sell Out" value={fmt(produto.sellout ?? 0)} color="#38bdf8" />
                </div>
              ) : (
                <span style={{ color: "#f87171" }}>❌ Produto não encontrado na filial {filial} – {FILIAIS.find(f => f.id === filial)?.nome}</span>
              )}
            </div>
          )}

          {/* ─── Results Dashboard ─── */}
          {showResults && (
            <>
              {/* Row 1: Key metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                <KpiCard
                  label="Margem Real"
                  value={fmtPct(margemReal)}
                  color={margemReal >= 0.17 ? "#4ade80" : margemReal >= 0.10 ? "#fbbf24" : "#f87171"}
                  sub={`(${fmt(precoVenda)} − ${fmt(custoUnitario)}) / ${fmt(precoVenda)}`}
                />
                <KpiCard label="Preço de Custo" value={fmt(custoUnitario)} color="#fbbf24" />
                <KpiCard label="Preço Venda Desejado" value={fmt(precoVenda)} color="#60a5fa" />
                <KpiCard
                  label="Lucro por Unidade"
                  value={fmt(precoVenda - custoUnitario)}
                  color={precoVenda - custoUnitario > 0 ? "#4ade80" : "#f87171"}
                />
              </div>

              {/* Row 2: Sell Out projection */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                <MiniKpi label="Volume (CX)" value={volume.toLocaleString("pt-BR")} />
                <MiniKpi label="Unid/CX" value={String(qtdPorCaixa)} />
                <MiniKpi label="Total Unidades" value={totalUnidades.toLocaleString("pt-BR")} />
                <KpiCard
                  label="Valor Total Sell Out"
                  value={fmt(totalSellOut)}
                  color="#a78bfa"
                  sub={`${volume} cx × ${qtdPorCaixa} un × ${fmt(precoVenda)}`}
                  highlight
                />
              </div>

              {/* Row 3: Investment analysis */}
              <div style={{ background: "#111827", borderRadius: 12, padding: "16px 20px", border: "1px solid #1e293b" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>
                  💰 Análise de Investimento
                </h3>
                {margemReal >= margemMinima ? (
                  <div style={{
                    background: "#0f2a1f", borderRadius: 10, padding: "14px 20px",
                    border: "1px solid #166534", fontSize: 13, color: "#4ade80", fontWeight: 600,
                  }}>
                    ✅ A margem atual ({fmtPct(margemReal)}) já atende a margem mínima de {fmtPct(margemMinima)}. Nenhum investimento necessário.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <KpiCard
                      label="Investimento / Unidade"
                      value={fmt(investimentoPorUnidade)}
                      color="#f87171"
                      sub={`Custo ${fmt(custoUnitario)} − Máx. permitido ${fmt(precoVenda * (1 - margemMinima))}`}
                    />
                    <KpiCard
                      label="Investimento Total"
                      value={fmt(investimentoTotal)}
                      color="#f87171"
                      sub={`${fmt(investimentoPorUnidade)} × ${totalUnidades.toLocaleString("pt-BR")} unidades`}
                      highlight
                    />
                    <KpiCard
                      label="% de Investimento"
                      value={fmtPct(percentualInvestimento)}
                      color="#fbbf24"
                      sub={`${fmt(investimentoTotal)} / ${fmt(totalSellOut)}`}
                    />
                  </div>
                )}
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
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #334155", background: "#0b1120", color: "#e2e8f0",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ color: "#94a3b8", fontSize: 12 }}>
      {label}: <strong style={{ color }}>{value}</strong>
    </span>
  );
}

function KpiCard({ label, value, color, sub, highlight }: {
  label: string; value: string; color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight ? "#111827" : "#0f1729", borderRadius: 10,
      padding: "14px 16px", border: `1px solid ${highlight ? "#334155" : "#1e293b"}`,
    }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: highlight ? 22 : 18, fontWeight: 800, color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#0f1729", borderRadius: 10, padding: "14px 16px",
      border: "1px solid #1e293b", textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{value}</div>
    </div>
  );
}

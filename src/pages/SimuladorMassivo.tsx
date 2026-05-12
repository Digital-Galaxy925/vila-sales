import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Plus } from "lucide-react";

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

interface Oferta {
  id: string;
  codigo: string;
  filial: string;
  volume: string;
  preco: string;
  margem: string;
}

const FILIAIS = [
  { id: "01", nome: "Poços de Caldas" },
  { id: "11", nome: "Campinas" },
  { id: "12", nome: "Osasco" },
  { id: "14", nome: "Betim" },
  { id: "501", nome: "Focomix SP" },
  { id: "502", nome: "Focomix MG" },
];

const MAX_OFERTAS = 10;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => (v * 100).toFixed(2) + "%";

const normCod = (v: string): string => {
  let s = v.trim();
  s = s.replace(/\.0+$/, "");
  s = s.replace(/^0+(\d)/, "$1");
  return s;
};

const novaOferta = (): Oferta => ({
  id: crypto.randomUUID(),
  codigo: "",
  filial: "01",
  volume: "",
  preco: "",
  margem: "17",
});

export default function SimuladorMassivo() {
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

  const [ofertas, setOfertas] = useState<Oferta[]>([novaOferta()]);
  const [margemDesejadaStr, setMargemDesejadaStr] = useState("17");
  const margemDesejada = (parseFloat(margemDesejadaStr.replace(",", ".")) || 0) / 100;

  const findProduto = (codigo: string, filial: string): Product | null => {
    if (!codigo.trim()) return null;
    const cod = normCod(codigo);
    if (!cod) return null;
    const arr = data[filial];
    if (!Array.isArray(arr)) return null;
    return arr.find((p) => normCod(p.seqProd) === cod) ?? null;
  };

  const linhas = useMemo(() => {
    return ofertas.map((o) => {
      const produto = findProduto(o.codigo, o.filial);
      const custo = produto?.custoLiq ?? 0;
      const qtdPorCx = produto ? parseFloat(produto.embCmp) || 1 : 1;
      const volume = parseFloat(o.volume.replace(",", ".")) || 0;
      const preco = parseFloat(o.preco.replace(",", ".")) || 0;
      const totalUnid = volume * qtdPorCx;
      const totalSellOut = totalUnid * preco;
      const custoTotal = totalUnid * custo;
      const lucro = totalSellOut - custoTotal;
      const margem = totalSellOut > 0 ? lucro / totalSellOut : 0;
      // Investimento necessário para atingir margem desejada
      const investUnit = preco > 0 && produto ? Math.max(0, custo - preco * (1 - margemDesejada)) : 0;
      const investTotal = investUnit * totalUnid;
      return { oferta: o, produto, custo, qtdPorCx, volume, preco, totalUnid, totalSellOut, custoTotal, lucro, margem, investUnit, investTotal };
    });
  }, [ofertas, data, margemDesejada]);

  const totalVolume = linhas.reduce((s, l) => s + l.volume, 0);
  const totalUnidades = linhas.reduce((s, l) => s + l.totalUnid, 0);
  const totalPedido = linhas.reduce((s, l) => s + l.totalSellOut, 0);
  const totalCusto = linhas.reduce((s, l) => s + l.custoTotal, 0);
  const totalInvestimento = linhas.reduce((s, l) => s + l.investTotal, 0);
  const lucroTotal = totalPedido - totalCusto;
  const margemFinal = totalPedido > 0 ? lucroTotal / totalPedido : 0;
  const pctInvestimento = totalPedido > 0 ? totalInvestimento / totalPedido : 0;

  const updateOferta = (id: string, patch: Partial<Oferta>) => {
    setOfertas((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };
  const removeOferta = (id: string) => {
    setOfertas((prev) => (prev.length === 1 ? prev : prev.filter((o) => o.id !== id)));
  };
  const addOferta = () => {
    setOfertas((prev) => (prev.length >= MAX_OFERTAS ? prev : [...prev, novaOferta()]));
  };
  const limparTudo = () => setOfertas([novaOferta()]);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#1a1a2e" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.02em", color: "#0f172a" }}>
        Simulador de Ofertas Massivas
      </h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        Inclua até {MAX_OFERTAS} ofertas e veja volume, valor total do pedido e margem final consolidada.
      </p>

      {!hasData ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
            Nenhum dado carregado. Faça o upload dos arquivos primeiro.
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
          {/* Ações */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button
              onClick={addOferta}
              disabled={ofertas.length >= MAX_OFERTAS}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: ofertas.length >= MAX_OFERTAS ? "#9ca3af" : "#0071e3",
                color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px",
                fontSize: 13, fontWeight: 500,
                cursor: ofertas.length >= MAX_OFERTAS ? "not-allowed" : "pointer",
              }}
            >
              <Plus size={14} /> Adicionar Oferta
            </button>
            <button
              onClick={limparTudo}
              style={{
                background: "#fff", color: "#374151", border: "1px solid #d1d5db",
                borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Limpar Tudo
            </button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Margem Desejada (%)
                </label>
                <input
                  type="text"
                  value={margemDesejadaStr}
                  onChange={(e) => setMargemDesejadaStr(e.target.value)}
                  placeholder="17"
                  style={{ ...miniInput, width: 70 }}
                />
              </div>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {ofertas.length} / {MAX_OFERTAS} ofertas
              </span>
            </div>
          </div>

          {/* Tabela de ofertas */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={th}>#</th>
                    <th style={th}>Código</th>
                    <th style={th}>Filial</th>
                    <th style={{ ...th, minWidth: 220 }}>Produto</th>
                    <th style={th}>Custo</th>
                    <th style={th}>Un/CX</th>
                    <th style={th}>Volume (CX)</th>
                    <th style={th}>Preço Venda</th>
                    <th style={th}>Total Unid.</th>
                    <th style={th}>Sell Out</th>
                    <th style={th}>Margem</th>
                    <th style={th}>Invest./Un</th>
                    <th style={th}>Invest. Total</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, idx) => {
                    const corMarg = l.margem >= 0.17 ? "#16a34a" : l.margem >= 0.10 ? "#d97706" : "#dc2626";
                    const naoEncontrado = l.oferta.codigo.trim() && !l.produto;
                    return (
                      <tr key={l.oferta.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={td}>{idx + 1}</td>
                        <td style={td}>
                          <input
                            type="text"
                            value={l.oferta.codigo}
                            onChange={(e) => updateOferta(l.oferta.id, { codigo: e.target.value })}
                            placeholder="125545"
                            style={{ ...miniInput, width: 90 }}
                          />
                        </td>
                        <td style={td}>
                          <select
                            value={l.oferta.filial}
                            onChange={(e) => updateOferta(l.oferta.id, { filial: e.target.value })}
                            style={{ ...miniInput, width: 80 }}
                          >
                            {FILIAIS.map((f) => (
                              <option key={f.id} value={f.id}>{f.id}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...td, color: naoEncontrado ? "#dc2626" : "#374151" }}>
                          {l.produto ? l.produto.descricao : naoEncontrado ? "Não encontrado" : "—"}
                        </td>
                        <td style={td}>{l.produto ? fmt(l.custo) : "—"}</td>
                        <td style={td}>{l.produto ? l.qtdPorCx : "—"}</td>
                        <td style={td}>
                          <input
                            type="text"
                            value={l.oferta.volume}
                            onChange={(e) => updateOferta(l.oferta.id, { volume: e.target.value })}
                            placeholder="0"
                            style={{ ...miniInput, width: 80 }}
                          />
                        </td>
                        <td style={td}>
                          <input
                            type="text"
                            value={l.oferta.preco}
                            onChange={(e) => updateOferta(l.oferta.id, { preco: e.target.value })}
                            placeholder="0,00"
                            disabled={!l.produto}
                            style={{ ...miniInput, width: 90 }}
                          />
                        </td>
                        <td style={td}>{l.totalUnid > 0 ? l.totalUnid.toLocaleString("pt-BR") : "—"}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{l.totalSellOut > 0 ? fmt(l.totalSellOut) : "—"}</td>
                        <td style={{ ...td, color: corMarg, fontWeight: 600 }}>
                          {l.totalSellOut > 0 ? fmtPct(l.margem) : "—"}
                        </td>
                        <td style={{ ...td, color: l.investUnit > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                          {l.preco > 0 && l.produto ? fmt(l.investUnit) : "—"}
                        </td>
                        <td style={{ ...td, color: l.investTotal > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                          {l.preco > 0 && l.produto ? fmt(l.investTotal) : "—"}
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => removeOferta(l.oferta.id)}
                            disabled={ofertas.length === 1}
                            style={{
                              background: "transparent", border: "none",
                              cursor: ofertas.length === 1 ? "not-allowed" : "pointer",
                              color: ofertas.length === 1 ? "#d1d5db" : "#dc2626",
                              padding: 4,
                            }}
                            aria-label="Remover oferta"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totais */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
            <KpiCard label="Volume Total (CX)" value={totalVolume.toLocaleString("pt-BR")} color="#374151" />
            <KpiCard label="Total Unidades" value={totalUnidades.toLocaleString("pt-BR")} color="#374151" />
            <KpiCard label="Valor Total do Pedido" value={fmt(totalPedido)} color="#7c3aed" highlight />
            <KpiCard
              label="Margem Final"
              value={totalPedido > 0 ? fmtPct(margemFinal) : "—"}
              color={margemFinal >= 0.17 ? "#16a34a" : margemFinal >= 0.10 ? "#d97706" : "#dc2626"}
              sub={totalPedido > 0 ? `Lucro: ${fmt(lucroTotal)}` : undefined}
              highlight
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <KpiCard
              label={`Investimento Total (p/ margem ${fmtPct(margemDesejada)})`}
              value={fmt(totalInvestimento)}
              color={totalInvestimento > 0 ? "#dc2626" : "#16a34a"}
              sub={
                totalInvestimento > 0
                  ? "Valor a investir por unidade somado em todas as ofertas"
                  : "Margem desejada já atendida em todas as ofertas"
              }
              highlight
            />
            <KpiCard
              label="% de Investimento sobre Pedido"
              value={totalPedido > 0 ? fmtPct(pctInvestimento) : "—"}
              color="#d97706"
              sub={totalPedido > 0 ? `${fmt(totalInvestimento)} / ${fmt(totalPedido)}` : undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "8px 12px", color: "#374151", fontSize: 12, whiteSpace: "nowrap",
};

const miniInput: React.CSSProperties = {
  padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db",
  background: "#fafafa", color: "#1f2937", fontSize: 12, outline: "none",
  boxSizing: "border-box",
};

function KpiCard({ label, value, color, sub, highlight }: {
  label: string; value: string; color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${highlight ? "#d1d5db" : "#e5e7eb"}`,
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

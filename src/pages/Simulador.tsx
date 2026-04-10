import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";

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

const FILIAIS: { id: string; nome: string }[] = [
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

  // ─── Load data from localStorage ──────────────────────────────────────────
  const data: DataMap = useMemo(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const hasData = Object.keys(data).length > 0;

  // ─── State ────────────────────────────────────────────────────────────────
  const [codigo, setCodigo] = useState("");
  const [filial, setFilial] = useState("01");
  const [volumeCaixas, setVolumeCaixas] = useState("");
  const [precoVendaDesejado, setPrecoVendaDesejado] = useState("");
  const [margemMinimaDesejada, setMargemMinimaDesejada] = useState("17");

  // ─── Find product ─────────────────────────────────────────────────────────
  const produto = useMemo(() => {
    if (!codigo.trim() || !data[filial]) return null;
    const cod = codigo.trim();
    return data[filial].find(
      (p) => p.seqProd === cod || p.seqProd === cod.padStart(6, "0")
    ) ?? null;
  }, [codigo, filial, data]);

  // ─── Calculations ─────────────────────────────────────────────────────────
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

  // ─── Sidebar (matches Index.tsx style) ────────────────────────────────────
  const sidebarModules = [
    { id: "cruzamento", label: "Análise de Custos", icon: "🔗" },
    { id: "estoque", label: "Análise de Estoque", icon: "📦" },
    { id: "margem", label: "Análise de Margem", icon: "📊" },
    { id: "preco", label: "Análise de Preço", icon: "💰" },
    { id: "shelflife", label: "Análise de Shelf Life", icon: "⏰" },
    { id: "geral", label: "Análise Geral", icon: "🏢" },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0b1120",
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
        color: "#e2e8f0",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          background: "#0f1729",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #1e293b",
        }}
      >
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800, color: "#fff",
              }}
            >📊</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>Vila Sales</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Gestão Comercial</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e293b" }}>
            Unilever · {new Date().getFullYear()}
          </div>
        </div>

        <nav style={{ flex: 1, padding: "0 12px" }}>
          {/* 1 - Análise de Custos */}
          <button
            className="sidebar-nav-btn"
            onClick={() => navigate("/")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 4, background: "transparent", color: "#475569",
              fontWeight: 400, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 16 }}>🔗</span>
            Análise de Custos
          </button>
          {/* 2 - Simulador de Ofertas (active) */}
          <button
            className="sidebar-nav-btn"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 4, background: "#1e3a5f", color: "#60a5fa",
              fontWeight: 700, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 16 }}>🎛️</span>
            Simulador de Ofertas
          </button>
          {/* 3 - Simulador de Propostas */}
          <button
            className="sidebar-nav-btn"
            onClick={() => navigate("/propostas")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 4, background: "transparent", color: "#475569",
              fontWeight: 400, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 16 }}>📝</span>
            Simulador de Propostas
          </button>
          {/* Tabela de ST */}
          <button
            className="sidebar-nav-btn"
            onClick={() => navigate("/tabela-st")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 4, background: "transparent", color: "#475569",
              fontWeight: 400, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 16 }}>📋</span>
            Tabela de ST
          </button>
          {/* Comparativo de Livros */}
          <button
            className="sidebar-nav-btn"
            onClick={() => navigate("/comparativo-livros")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 4, background: "transparent", color: "#475569",
              fontWeight: 400, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 16 }}>📚</span>
            Comparativo de Livros
          </button>
          {/* 4-8 - Remaining modules */}
          {sidebarModules.filter(m => m.id !== "cruzamento").map((m) => (
            <button
              className="sidebar-nav-btn"
              key={m.id}
              onClick={() => navigate("/")}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                marginBottom: 4, background: "transparent", color: "#475569",
                fontWeight: 400, fontSize: 13, textAlign: "left" as const, transition: "all .2s",
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
          🎛️ Simulador de Ofertas
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 32 }}>
          Simule preços, margens e sell out de um produto específico por filial.
        </p>

        {!hasData && (
          <div
            style={{
              background: "#1e293b", borderRadius: 12, padding: 32, textAlign: "center",
              border: "1px solid #334155",
            }}
          >
            <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
              Nenhum dado carregado. Faça o upload dos arquivos na tela principal primeiro.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
                padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13,
              }}
            >
              Ir para Upload
            </button>
          </div>
        )}

        {hasData && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {/* Input card */}
            <div
              style={{
                background: "#111827", borderRadius: 14, padding: 28,
                border: "1px solid #1e293b", flex: "1 1 380px", minWidth: 340,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: "#e2e8f0" }}>
                Dados do Produto
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Código */}
                <div>
                  <label style={labelStyle}>Código do Produto</label>
                  <input
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Ex: 112004"
                    style={inputStyle}
                  />
                </div>

                {/* Filial */}
                <div>
                  <label style={labelStyle}>Filial</label>
                  <select
                    value={filial}
                    onChange={(e) => setFilial(e.target.value)}
                    style={inputStyle}
                  >
                    {FILIAIS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} – {f.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Volume */}
                <div>
                  <label style={labelStyle}>Volume de Sell Out (caixas)</label>
                  <input
                    type="text"
                    value={volumeCaixas}
                    onChange={(e) => setVolumeCaixas(e.target.value)}
                    placeholder="Ex: 100"
                    style={inputStyle}
                  />
                </div>

                {/* Produto encontrado info */}
                {codigo.trim() && (
                  <div
                    style={{
                      background: produto ? "#0f2a1f" : "#2a1215",
                      border: `1px solid ${produto ? "#166534" : "#7f1d1d"}`,
                      borderRadius: 10, padding: 14, fontSize: 13,
                    }}
                  >
                    {produto ? (
                      <>
                        <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>
                          ✅ Produto encontrado
                        </div>
                        <div style={{ color: "#94a3b8" }}>
                          <strong style={{ color: "#e2e8f0" }}>{produto.descricao}</strong>
                        </div>
                        <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ color: "#94a3b8" }}>
                            Custo: <strong style={{ color: "#fbbf24" }}>{fmt(custoUnitario)}</strong>
                          </span>
                          <span style={{ color: "#94a3b8" }}>
                            Unid/CX: <strong style={{ color: "#e2e8f0" }}>{qtdPorCaixa}</strong>
                          </span>
                          <span style={{ color: "#94a3b8" }}>
                            Estoque: <strong style={{ color: "#e2e8f0" }}>{produto.estoque}</strong>
                          </span>
                          <span style={{ color: "#94a3b8" }}>
                            Preço Atual: <strong style={{ color: "#e2e8f0" }}>{fmt(produto.atual)}</strong>
                          </span>
                          <span style={{ color: "#94a3b8" }}>
                            Promocional: <strong style={{ color: "#c084fc" }}>{fmt(produto.promoc ?? 0)}</strong>
                          </span>
                          <span style={{ color: "#94a3b8" }}>
                            Sell Out: <strong style={{ color: "#38bdf8" }}>{fmt(produto.sellout ?? 0)}</strong>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#f87171" }}>
                        ❌ Produto não encontrado na filial {filial} – {FILIAIS.find(f => f.id === filial)?.nome}
                      </div>
                    )}
                  </div>
                )}

                {/* Preço de venda desejado */}
                {produto && (
                  <div>
                    <label style={labelStyle}>Preço de Venda Desejado (R$)</label>
                    <input
                      type="text"
                      value={precoVendaDesejado}
                      onChange={(e) => setPrecoVendaDesejado(e.target.value)}
                      placeholder="Ex: 15,90"
                      style={inputStyle}
                    />
                  </div>
                )}

              </div>
            </div>

            {/* Results card */}
            {produto && precoVenda > 0 && (
              <div
                style={{
                  background: "#111827", borderRadius: 14, padding: 28,
                  border: "1px solid #1e293b", flex: "1 1 340px", minWidth: 300,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: "#e2e8f0" }}>
                  Resultado da Simulação
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Margem Real */}
                  <ResultCard
                    label="Margem Real"
                    value={fmtPct(margemReal)}
                    color={margemReal >= 0.17 ? "#4ade80" : margemReal >= 0.10 ? "#fbbf24" : "#f87171"}
                    subtitle={`(${fmt(precoVenda)} - ${fmt(custoUnitario)}) / ${fmt(precoVenda)}`}
                  />

                  {/* Preço de Custo */}
                  <ResultCard
                    label="Preço de Custo"
                    value={fmt(custoUnitario)}
                    color="#fbbf24"
                  />

                  {/* Preço de Venda Desejado */}
                  <ResultCard
                    label="Preço de Venda Desejado"
                    value={fmt(precoVenda)}
                    color="#60a5fa"
                  />

                  {/* Lucro por unidade */}
                  <ResultCard
                    label="Lucro por Unidade"
                    value={fmt(precoVenda - custoUnitario)}
                    color={precoVenda - custoUnitario > 0 ? "#4ade80" : "#f87171"}
                  />

                  <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>
                      Projeção de Sell Out
                    </h3>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <MiniCard label="Volume (CX)" value={volume.toString()} />
                      <MiniCard label="Unid/CX" value={qtdPorCaixa.toString()} />
                      <MiniCard label="Total Unidades" value={(volume * qtdPorCaixa).toLocaleString("pt-BR")} />
                    </div>

                    <ResultCard
                      label="Valor Total de Sell Out"
                      value={fmt(totalSellOut)}
                      color="#a78bfa"
                      large
                      subtitle={`${volume} cx × ${qtdPorCaixa} un/cx × ${fmt(precoVenda)}`}
                    />
                  </div>

                  {/* Margem mínima desejada */}
                  <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                    <div>
                      <label style={labelStyle}>Margem Mínima Desejada (%)</label>
                      <input
                        type="text"
                        value={margemMinimaDesejada}
                        onChange={(e) => setMargemMinimaDesejada(e.target.value)}
                        placeholder="Ex: 17"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Investimento necessário */}
                  <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>
                      Investimento Necessário
                    </h3>
                    {margemReal >= margemMinima ? (
                      <div
                        style={{
                          background: "#0f2a1f", borderRadius: 10, padding: 16,
                          border: "1px solid #166534", fontSize: 13, color: "#4ade80",
                          fontWeight: 600,
                        }}
                      >
                        ✅ A margem atual ({fmtPct(margemReal)}) já atende a margem mínima de {fmtPct(margemMinima)}. Nenhum investimento necessário.
                      </div>
                    ) : (
                      <>
                        <ResultCard
                          label="Investimento por Unidade"
                          value={fmt(investimentoPorUnidade)}
                          color="#f87171"
                          subtitle={`Custo (${fmt(custoUnitario)}) - Custo máximo permitido (${fmt(precoVenda * (1 - margemMinima))})`}
                        />
                        <div style={{ marginTop: 12 }}>
                          <ResultCard
                            label="Investimento Total Necessário"
                            value={fmt(investimentoTotal)}
                            color="#f87171"
                            large
                            subtitle={`${fmt(investimentoPorUnidade)} × ${totalUnidades.toLocaleString("pt-BR")} unidades`}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1px solid #334155", background: "#0b1120", color: "#e2e8f0",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ResultCard({
  label, value, color, subtitle, large,
}: {
  label: string; value: string; color: string; subtitle?: string; large?: boolean;
}) {
  return (
    <div
      style={{
        background: "#0b1120", borderRadius: 10, padding: large ? 20 : 14,
        border: "1px solid #1e293b",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: 800, color, marginTop: 4 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#0b1120", borderRadius: 8, padding: "10px 14px",
        border: "1px solid #1e293b", flex: "1 1 80px", textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginTop: 2 }}>{value}</div>
    </div>
  );
}

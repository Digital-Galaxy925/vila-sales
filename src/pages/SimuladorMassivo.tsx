import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import NoDataNotice from "@/components/NoDataNotice";




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

interface Simulacao {
  id: string;
  codigo: string;
  filial: string;
  volumeCaixas: string;
  precoVendaDesejado: string;
  produto: Product | null;
  margemAjustada: string;
  contraProposta?: string;
  viaUpload?: boolean;
}

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

const normCod = (v: string): string => {
  let s = v.trim();
  s = s.replace(/\.0+$/, "");
  s = s.replace(/^0+(\d)/, "$1");
  return s;
};

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

  // ─── Form de entrada (topo) ─────────────────────────────────────────────────
  const [codigo, setCodigo] = useState("");
  const [filial, setFilial] = useState("01");
  const [volumeCaixas, setVolumeCaixas] = useState("");
  const [precoVendaDesejado, setPrecoVendaDesejado] = useState("");

  const findProduto = (cod: string, fid: string): Product | null => {
    if (!cod.trim()) return null;
    const key = normCod(cod);
    if (!key) return null;
    const searchInFilial = (f: string) => {
      const arr = data[f];
      if (!Array.isArray(arr)) return null;
      return arr.find((p) => normCod(p.seqProd) === key) ?? null;
    };
    const found = searchInFilial(fid);
    if (found) return found;
    for (const k of Object.keys(data)) {
      const f = searchInFilial(k);
      if (f) return f;
    }
    return null;
  };

  const produtoAtual = useMemo(
    () => findProduto(codigo, filial),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codigo, filial, data],
  );
  const custoAtual = produtoAtual?.custoLiq ?? 0;
  const precoAtual = parseFloat(precoVendaDesejado.replace(",", ".")) || 0;

  // ─── Lista de simulações (persistida em localStorage) ──────────────────────
  const STORAGE_KEY = "vilasales_simulador_massivo";
  const [simulacoes, setSimulacoes] = useState<Simulacao[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(simulacoes));
    } catch {
      /* ignore */
    }
  }, [simulacoes]);

  const podeAdicionar =
    !!produtoAtual &&
    parseFloat(volumeCaixas.replace(",", ".")) > 0 &&
    precoAtual > 0;

  const handleAdicionar = () => {
    if (!podeAdicionar || !produtoAtual) return;
    setSimulacoes((prev) => [
      {
        id: crypto.randomUUID(),
        codigo,
        filial,
        volumeCaixas,
        precoVendaDesejado,
        produto: produtoAtual,
        margemAjustada: "",
      },
      ...prev,
    ]);
    setCodigo("");
    setVolumeCaixas("");
    setPrecoVendaDesejado("");
  };

  const handleRemover = (id: string) => {
    setSimulacoes((prev) => prev.filter((s) => s.id !== id));
  };

  const handleMargemAjustada = (id: string, value: string) => {
    setSimulacoes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, margemAjustada: value } : s)),
    );
  };

  const handleVolumeChange = (id: string, value: string) => {
    setSimulacoes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, volumeCaixas: value } : s)),
    );
  };

  const handleContraProposta = (id: string, value: string) => {
    setSimulacoes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, contraProposta: value } : s)),
    );
  };

  const handleLimpar = () => setSimulacoes([]);

  const [salvando, setSalvando] = useState(false);
  const handleSalvarTodas = async () => {
    const validas = simulacoes.filter((s) => {
      const pv = parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
      const vol = parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
      return s.produto && pv > 0 && vol > 0;
    });
    if (validas.length === 0) {
      toast({ title: "Nada para salvar", description: "Adicione simulações com preço e volume válidos.", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      const rows = validas.map((s) => {
        const p = s.produto!;
        const pv = parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
        const vol = parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
        const qpc = parseFloat(p.embCmp) || 1;
        const un = vol * qpc;
        const margAjustFrac = (parseFloat(s.margemAjustada.replace(",", ".")) || 0) / 100;
        const margReal = pv > 0 ? (pv - p.custoLiq) / pv : 0;
        const totalSellOut = un * pv;
        const investUnit = margAjustFrac > 0 && margAjustFrac < 1 && pv > 0 ? p.custoLiq - pv * (1 - margAjustFrac) : 0;
        const investTotal = investUnit > 0 ? investUnit * un : 0;
        const pctInv = totalSellOut > 0 && investTotal > 0 ? investTotal / totalSellOut : 0;
        const buRaw = (p.bu ?? "").toString().toUpperCase();
        const buNorm = buRaw === "FOODS" || buRaw === "FR" || buRaw === "FOOD" ? "FR" : buRaw === "HC" ? "HC" : (buRaw || null);
        return {
          codigo_produto: normCod(p.seqProd),
          descricao_produto: p.descricao ?? "",
          bu: buNorm,
          filial: s.filial,
          filial_nome: FILIAIS.find((f) => f.id === s.filial)?.nome ?? "",
          volume_caixas: vol,
          unid_por_caixa: qpc,
          total_unidades: un,
          custo_unitario: p.custoLiq,
          preco_venda: pv,
          margem_real: margReal,
          margem_minima: margAjustFrac,
          total_sellout: totalSellOut,
          investimento_por_unidade: investUnit > 0 ? investUnit : 0,
          investimento_por_caixa: investUnit > 0 ? investUnit * qpc : 0,
          investimento_total: investTotal,
          percentual_investimento: pctInv,
          observacao: s.viaUpload ? "Importado via planilha" : "",
        };
      });
      const { error } = await supabase.from("propostas_simulador").insert(rows);
      if (error) throw error;
      toast({ title: `${rows.length} proposta(s) salva(s)`, description: "Disponíveis em Controle de Investimentos." });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  // ─── Upload de planilha ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRows, setPendingRows] = useState<
    { codigo: string; volume: string; preco: string }[]
  >([]);
  const [uploadFilial, setUploadFilial] = useState("01");
  const [showFilialModal, setShowFilialModal] = useState(false);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [uploadFileName, setUploadFileName] = useState("");

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
      });
      // Detecta cabeçalho e mapeia colunas por nome
      const norm = (v: unknown) =>
        String(v ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
      const header = rows[0]?.map(norm) ?? [];
      const hasHeader = header.some((h) =>
        ["codigo", "sku", "volume", "preco", "qtd", "quantidade"].includes(h),
      );
      let idxCod = 0;
      let idxVol = -1;
      let idxPreco = 2;
      if (hasHeader) {
        const find = (keys: string[]) =>
          header.findIndex((h) => keys.some((k) => h.includes(k)));
        const c = find(["codigo", "sku", "cod"]);
        const v = find(["volume", "quantidade", "qtd", "caixa", "cx"]);
        const p = find(["preco", "venda", "proposta"]);
        if (c >= 0) idxCod = c;
        if (v >= 0) idxVol = v;
        if (p >= 0) idxPreco = p;
      }
      const toNumericText = (value: unknown) => {
        if (value === null || value === undefined || value === "") return "";
        if (typeof value === "number" && Number.isFinite(value)) {
          return String(value).replace(".", ",");
        }
        const raw = String(value).trim();
        if (!raw) return "";
        // Mantém só dígitos, separadores e sinal — tolera "10 CX", "10,00 un", "1.234,56".
        const cleaned = raw.replace(/[^\d,.\-]/g, "");
        if (!cleaned) return "";
        // Se tem vírgula, vírgula é decimal e pontos são milhares; senão último ponto é decimal.
        let normalized: string;
        if (cleaned.includes(",")) {
          normalized = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
          normalized = cleaned;
        }
        const n = parseFloat(normalized);
        if (!Number.isFinite(n)) return "";
        return String(n).replace(".", ",");
      };
      const startIdx = hasHeader ? 1 : 0;
      const parsed = rows
        .slice(startIdx)
        .map((r) => ({
          codigo: String(r[idxCod] ?? "").trim(),
          volume: idxVol >= 0 ? toNumericText(r[idxVol]) : "",
          preco: String(r[idxPreco] ?? "").trim().replace(".", ","),
        }))
        .filter((r) => r.codigo)
        .slice(0, 300);
      if (parsed.length === 0) {
        alert("Nenhum item válido encontrado na planilha.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setPendingRows(parsed);
      setNotFound([]);
      setShowFilialModal(true);
    } catch (err) {
      alert("Erro ao ler a planilha. Verifique o formato do arquivo.");
      console.error(err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmUpload = () => {
    const novas: Simulacao[] = [];
    const naoEncontrados: string[] = [];
    pendingRows.forEach((r) => {
      const prod = findProduto(r.codigo, uploadFilial);
      if (!prod) {
        naoEncontrados.push(r.codigo);
        return;
      }
      novas.push({
        id: crypto.randomUUID(),
        codigo: r.codigo,
        filial: uploadFilial,
        volumeCaixas: r.volume,
        precoVendaDesejado: r.preco,
        produto: prod,
        margemAjustada: "",
        viaUpload: true,
      });
    });
    setSimulacoes((prev) => [...novas, ...prev]);
    setNotFound(naoEncontrados);
    setShowFilialModal(false);
    setPendingRows([]);
  };

  const handleCancelUpload = () => {
    setShowFilialModal(false);
    setPendingRows([]);
    setUploadFileName("");
  };

  const handleExportExcel = () => {
    if (simulacoes.length === 0) return;
    const data = simulacoes.map((s) => {
      const p = s.produto!;
      const pvInput = parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
      const vol = parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
      const qpc = parseFloat(p.embCmp) || 1;
      const un = vol * qpc;
      const promo = p.promoc ?? 0;
      const precoRef = promo > 0 ? promo : p.atual;
      const pv = pvInput > 0 ? pvInput : (s.viaUpload ? precoRef : 0);
      const margAtual = precoRef > 0 ? (precoRef - p.custoLiq) / precoRef : 0;
      const margProposta = pv > 0 ? (pv - p.custoLiq) / pv : 0;
      const contraProp = parseFloat(s.contraProposta?.replace(",", ".") || "") || 0;
      const margContra = contraProp > 0 ? (contraProp - p.custoLiq) / contraProp : 0;
      const valorPedido = un * pv;
      const margAjustFrac = (parseFloat(s.margemAjustada.replace(",", ".")) || 0) / 100;
      const investUnit =
        margAjustFrac > 0 && margAjustFrac < 1 && pv > 0
          ? p.custoLiq - pv * (1 - margAjustFrac)
          : 0;
      const sellOutAjustado = investUnit > 0 ? investUnit : 0;
      const investTotal = investUnit > 0 ? investUnit * un : 0;
      const pctInvest = valorPedido > 0 && investTotal > 0 ? investTotal / valorPedido : 0;
      const filialNome = FILIAIS.find((f) => f.id === s.filial)?.nome ?? s.filial;
      return {
        BU: p.bu || "",
        CD: filialNome,
        FAMILIA: p.familia || "",
        CODIGO: s.codigo,
        DESCRICAO: p.descricao,
        ESTOQUE: p.estoque ?? 0,
        "UNID/CX": qpc,
        CUSTO: p.custoLiq,
        "SELL OUT ATUAL": p.sellout ?? 0,
        "PRECO ATUAL": p.atual,
        "PRECO PROMOCIONAL": promo,
        "MARGEM ATUAL": margAtual,
        PROPOSTA: pv,
        "MARGEM PROPOSTA": margProposta,
        "CONTRA PROPOSTA": contraProp,
        "MARGEM CONTRA PROPOSTA": margContra,
        
        "MARGEM AJUSTADA": margAjustFrac,
        "SELL OUT AJUSTADO": sellOutAjustado,
        VOLUME: vol,
        "INVESTIMENTO TOTAL": sellOutAjustado * un,
        "VALOR PEDIDO": valorPedido,
        "% INVESTIMENTO": pctInvest,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Simulações");
    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `simulador-massivo-${ts}.xlsx`);
  };

  // Totais consolidados
  const totais = useMemo(() => {
    let totalSellOut = 0;
    let totalUnidades = 0;
    let totalLucro = 0;
    simulacoes.forEach((s) => {
      const p = s.produto;
      if (!p) return;
      const pv = parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
      const vol = parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
      const qpc = parseFloat(p.embCmp) || 1;
      const un = vol * qpc;
      totalSellOut += un * pv;
      totalUnidades += un;
      totalLucro += un * (pv - p.custoLiq);
    });
    return { totalSellOut, totalUnidades, totalLucro };
  }, [simulacoes]);

  if (!hasData) return <NoDataNotice />;

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily:
          "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        color: "#1a1a2e",
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 4,
          letterSpacing: "-0.02em",
          color: "#0f172a",
        }}
      >
        Simulador de Ofertas Massivas
      </h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        Adicione múltiplas simulações de produtos e filiais, e visualize o
        consolidado.
      </p>

      {!hasData ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
            Nenhum dado carregado. Faça o upload dos arquivos na tela principal
            primeiro.
          </p>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "#0071e3",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            Ir para Upload
          </button>
        </div>
      ) : (
        <>
          {/* ─── Inputs (topo, clone do Simulador) ─── */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "18px 22px",
              border: "1px solid #e5e7eb",
              marginBottom: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
                gap: 16,
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle}>Código do Produto</label>
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ex: 125545"
                  style={inputStyle}
                />
              </div>
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
              <div>
                <label style={labelStyle}>Volume Sell Out (CX)</label>
                <input
                  type="text"
                  value={volumeCaixas}
                  onChange={(e) => setVolumeCaixas(e.target.value)}
                  placeholder="Ex: 1000"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Preço Venda Desejado (R$)</label>
                <input
                  type="text"
                  value={precoVendaDesejado}
                  onChange={(e) => setPrecoVendaDesejado(e.target.value)}
                  placeholder="Ex: 13,99"
                  style={inputStyle}
                  disabled={!produtoAtual}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleAdicionar}
                  disabled={!podeAdicionar}
                  style={{
                    height: 38,
                    padding: "0 18px",
                    borderRadius: 8,
                    border: "none",
                    background: podeAdicionar ? "#0071e3" : "#cbd5e1",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: podeAdicionar ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Adicionar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </div>
            </div>

            {/* Barra de info do produto digitado */}
            {codigo.trim() && (
              <div
                style={{
                  marginTop: 14,
                  background: produtoAtual ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${produtoAtual ? "#bbf7d0" : "#fecaca"}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 13,
                }}
              >
                {produtoAtual ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>
                      ✓ {produtoAtual.descricao}
                    </span>
                    <Chip
                      label="Custo"
                      value={fmt(custoAtual)}
                      color="#d97706"
                    />
                    <Chip
                      label="Unid/CX"
                      value={String(parseFloat(produtoAtual.embCmp) || 1)}
                      color="#374151"
                    />
                    <Chip
                      label="Estoque"
                      value={String(produtoAtual.estoque)}
                      color="#374151"
                    />
                    <Chip
                      label="Preço Atual"
                      value={fmt(produtoAtual.atual)}
                      color="#374151"
                    />
                    <Chip
                      label="Promocional"
                      value={fmt(produtoAtual.promoc ?? 0)}
                      color="#7c3aed"
                    />
                    <Chip
                      label="Sell Out"
                      value={fmt(produtoAtual.sellout ?? 0)}
                      color="#0284c7"
                    />
                    {(() => {
                      const promo = produtoAtual.promoc ?? 0;
                      const precoRef = promo > 0 ? promo : produtoAtual.atual;
                      const margAtual =
                        precoRef > 0
                          ? (precoRef - custoAtual) / precoRef
                          : 0;
                      const corMarg =
                        margAtual >= 0.17
                          ? "#16a34a"
                          : margAtual >= 0.1
                            ? "#d97706"
                            : "#dc2626";
                      return (
                        <Chip
                          label="Margem Atual"
                          value={fmtPct(margAtual)}
                          color={corMarg}
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <span style={{ color: "#dc2626" }}>
                    Produto não encontrado na filial {filial} –{" "}
                    {FILIAIS.find((f) => f.id === filial)?.nome}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─── Totais consolidados ─── */}
          {simulacoes.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <SimKpiCard
                label="Total de Simulações"
                value={String(simulacoes.length)}
                color="#0f172a"
              />
              <SimKpiCard
                label="Total Unidades"
                value={totais.totalUnidades.toLocaleString("pt-BR")}
                color="#374151"
              />
              <SimKpiCard
                label="Valor Total Sell Out"
                value={fmt(totais.totalSellOut)}
                color="#7c3aed"
                highlight
              />
              <SimKpiCard
                label="Lucro Total Estimado"
                value={fmt(totais.totalLucro)}
                color={totais.totalLucro >= 0 ? "#16a34a" : "#dc2626"}
              />
            </div>
          )}

          {/* ─── Lista de simulações ─── */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  margin: 0,
                }}
              >
                Simulações Adicionadas ({simulacoes.length})
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleUploadClick}
                  style={{
                    background: "#7c3aed",
                    border: "none",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Importar planilha Excel/CSV com colunas: código, descrição, volume, preço"
                >
                  📥 Upload Planilha
                </button>
                {simulacoes.length > 0 && (
                  <>
                    <button
                      onClick={handleSalvarTodas}
                      disabled={salvando}
                      style={{
                        background: salvando ? "#94a3b8" : "#0071e3",
                        border: "none",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: salvando ? "not-allowed" : "pointer",
                      }}
                    >
                      {salvando ? "Salvando..." : "💾 Salvar"}
                    </button>
                    <button
                      onClick={() => navigate("/controle-investimentos")}
                      style={{
                        background: "#fff",
                        border: "1px solid #0071e3",
                        color: "#0071e3",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Ver Controle
                    </button>
                    <button
                      onClick={handleExportExcel}
                      style={{
                        background: "#16a34a",
                        border: "1px solid #15803d",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ⬇ Exportar Excel
                    </button>
                    <button
                      onClick={handleLimpar}
                      style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        color: "#dc2626",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Limpar Tudo
                    </button>
                  </>
                )}
              </div>
            </div>

            {simulacoes.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 13,
                }}
              >
                Nenhuma simulação salva. Preencha os campos acima e clique
                em <strong>💾 Salvar</strong>.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#1e3a5f" }}>
                      {[
                        "BU",
                        "CD",
                        "FAMILIA",
                        "CODIGO",
                        "DESCRIÇÃO",
                        "ESTOQUE",
                        "UNID/CX",
                        "CUSTO",
                        "SELL OUT ATUAL",
                        "PREÇO ATUAL",
                        "PREÇO PROMOCIONAL",
                        "MARGEM ATUAL",
                        "PROPOSTA",
                        "MARGEM PROPOSTA",
                        "CONTRA PROPOSTA",
                        "MARGEM CONTRA PROPOSTA",
                        
                        "MARGEM AJUSTADA",
                        "SELL OUT AJUSTADO",
                        "VOLUME",
                        "INVESTIMENTO TOTAL",
                        "VALOR PEDIDO",
                        "% INVESTIMENTO",
                        "",
                      ].map((h, idx) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "#fff",
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                            borderRight: "1px solid #34548a",
                            whiteSpace: "nowrap",
                            ...freezeHeader(idx),
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {simulacoes.map((s) => {
                       const p = s.produto!;
                       const pvInput =
                         parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
                       const vol =
                         parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
                       const qpc = parseFloat(p.embCmp) || 1;
                       const un = vol * qpc;
                       const promo = p.promoc ?? 0;
                       const precoRef = promo > 0 ? promo : p.atual;
                       // Em upload sem preço informado, usa preço de referência (promo/atual)
                       const pv = pvInput > 0 ? pvInput : (s.viaUpload ? precoRef : 0);
                      const margAtual =
                        precoRef > 0 ? (precoRef - p.custoLiq) / precoRef : 0;
                      const margProposta = pv > 0 ? (pv - p.custoLiq) / pv : 0;
                      const sellOutNecUn = Math.max(0, p.custoLiq - pv);
                      const sellOutNecTotal = sellOutNecUn * un;
                      const valorPedido = un * pv;
                      const margAjustNumRow =
                        parseFloat(s.margemAjustada.replace(",", ".")) || 0;
                      const margAjustFracRow = margAjustNumRow / 100;
                      const investUnitAjustRow =
                        margAjustFracRow > 0 && margAjustFracRow < 1 && pv > 0
                          ? p.custoLiq - pv * (1 - margAjustFracRow)
                          : 0;
                      const investTotalAjustRow =
                        investUnitAjustRow > 0 ? investUnitAjustRow * un : 0;
                      const pctInvestimento =
                        valorPedido > 0 && investTotalAjustRow > 0
                          ? investTotalAjustRow / valorPedido
                          : 0;
                      const filialNome =
                        FILIAIS.find((f) => f.id === s.filial)?.nome ?? s.filial;
                      const corMA =
                        margAtual >= 0.17
                          ? "#16a34a"
                          : margAtual >= 0.1
                            ? "#d97706"
                            : "#dc2626";
                      const corMP =
                        margProposta >= 0.17
                          ? "#16a34a"
                          : margProposta >= 0.1
                            ? "#d97706"
                            : "#dc2626";
                      const contraProp = parseFloat(s.contraProposta?.replace(",", ".") || "") || 0;
                      const margContra = contraProp > 0 ? (contraProp - p.custoLiq) / contraProp : 0;
                      const corMC =
                        margContra >= 0.17
                          ? "#16a34a"
                          : margContra >= 0.1
                            ? "#d97706"
                            : "#dc2626";
                      return (
                        <tr
                          key={s.id}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td style={{ ...cellStyle, ...freezeCell(0) }}>{p.bu || "—"}</td>
                          <td style={{ ...cellStyle, ...freezeCell(1) }}>{filialNome}</td>
                          <td style={{ ...cellStyle, ...freezeCell(2) }}>{p.familia || "—"}</td>
                          <td style={{ ...cellStyle, ...freezeCell(3) }}>
                            <strong>{s.codigo}</strong>
                          </td>
                          <td style={{ ...cellStyle, ...freezeCell(4) }}>{p.descricao}</td>
                          <td style={cellStyle}>
                            {(p.estoque ?? 0).toLocaleString("pt-BR")}
                          </td>
                          <td style={cellStyle}>
                            {(parseFloat(p.embCmp) || 1).toLocaleString("pt-BR")}
                          </td>
                          <td style={cellStyle}>{fmt(p.custoLiq)}</td>
                          <td style={cellStyle}>{fmt(p.sellout ?? 0)}</td>
                          <td style={cellStyle}>{fmt(p.atual)}</td>
                          <td style={cellStyle}>{fmt(promo)}</td>
                          <td
                            style={{
                              ...cellStyle,
                              color: corMA,
                              fontWeight: 600,
                            }}
                          >
                            {fmtPct(margAtual)}
                          </td>
                          <td style={cellStyle}>{fmt(pv)}</td>
                          <td
                            style={{
                              ...cellStyle,
                              color: corMP,
                              fontWeight: 600,
                            }}
                          >
                            {fmtPct(margProposta)}
                          </td>
                          <td style={{ ...cellStyle, padding: "6px 8px" }}>
                            <input
                              type="text"
                              value={s.contraProposta || ""}
                              onChange={(e) =>
                                handleContraProposta(s.id, e.target.value)
                              }
                              placeholder="0,00"
                              style={{
                                width: 80,
                                padding: "5px 8px",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                fontSize: 12,
                                textAlign: "right",
                                outline: "none",
                                fontWeight: contraProp > 0 ? 600 : 400,
                                color: contraProp > 0 ? "#0f172a" : "#1f2937",
                              }}
                            />
                          </td>
                          <td
                            style={{
                              ...cellStyle,
                              color: corMC,
                              fontWeight: 600,
                            }}
                          >
                            {contraProp > 0 ? fmtPct(margContra) : "—"}
                          </td>
                          {(() => {
                            const margAjustNum =
                              parseFloat(
                                s.margemAjustada.replace(",", "."),
                              ) || 0;
                            const margAjustFrac = margAjustNum / 100;
                            const investUnitAjust =
                              margAjustFrac > 0 && margAjustFrac < 1 && pv > 0
                                ? p.custoLiq - pv * (1 - margAjustFrac)
                                : 0;
                            const sellOutAjustado =
                              investUnitAjust > 0 ? investUnitAjust : 0;
                            const corMAjust =
                              margAjustFrac >= 0.17
                                ? "#16a34a"
                                : margAjustFrac >= 0.1
                                  ? "#d97706"
                                  : "#dc2626";
                            return (
                              <>
                                <td
                                  style={{ ...cellStyle, padding: "6px 8px" }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={s.margemAjustada}
                                      onChange={(e) =>
                                        handleMargemAjustada(
                                          s.id,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="0"
                                      style={{
                                        width: 60,
                                        padding: "5px 8px",
                                        borderRadius: 6,
                                        border: "1px solid #d1d5db",
                                        fontSize: 12,
                                        textAlign: "right",
                                        outline: "none",
                                        color:
                                          margAjustFrac > 0
                                            ? corMAjust
                                            : "#1f2937",
                                        fontWeight:
                                          margAjustFrac > 0 ? 600 : 400,
                                      }}
                                    />
                                    <span
                                      style={{
                                        color: "#6b7280",
                                        fontSize: 12,
                                      }}
                                    >
                                      %
                                    </span>
                                  </div>
                                </td>
                                <td
                                  style={{
                                    ...cellStyle,
                                    color:
                                      sellOutAjustado > 0
                                        ? "#0f172a"
                                        : "#9ca3af",
                                    fontWeight:
                                      sellOutAjustado > 0 ? 600 : 400,
                                  }}
                                >
                                  {sellOutAjustado > 0
                                    ? fmt(sellOutAjustado)
                                    : "—"}
                                </td>
                                <td style={cellStyle}>
                                  <input
                                    type="text"
                                    value={s.volumeCaixas}
                                    onChange={(e) =>
                                      handleVolumeChange(s.id, e.target.value)
                                    }
                                    placeholder="0"
                                    style={{
                                      width: 70,
                                      padding: "5px 8px",
                                      borderRadius: 6,
                                      border: "1px solid #d1d5db",
                                      fontSize: 12,
                                      textAlign: "right",
                                      outline: "none",
                                      fontWeight: vol > 0 ? 600 : 400,
                                      color: vol > 0 ? "#0f172a" : "#1f2937",
                                    }}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...cellStyle,
                                    color:
                                      sellOutAjustado > 0
                                        ? "#0f172a"
                                        : "#9ca3af",
                                    fontWeight:
                                      sellOutAjustado > 0 ? 600 : 400,
                                  }}
                                >
                                  {sellOutAjustado > 0
                                    ? fmt(sellOutAjustado * un)
                                    : "—"}
                                </td>
                              </>
                            );
                          })()}
                          
                          <td style={cellStyle}>{fmt(valorPedido)}</td>
                          <td
                            style={{
                              ...cellStyle,
                              color:
                                pctInvestimento > 0.1 ? "#dc2626" : "#374151",
                              fontWeight: 600,
                            }}
                          >
                            {fmtPct(pctInvestimento)}
                          </td>
                          <td style={cellStyle}>
                            <button
                              onClick={() => handleRemover(s.id)}
                              title="Remover"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#dc2626",
                                cursor: "pointer",
                                fontSize: 16,
                                padding: 0,
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {(() => {
                    const tot = simulacoes.reduce(
                      (acc, s) => {
                        const p = s.produto!;
                        const pv =
                          parseFloat(s.precoVendaDesejado.replace(",", ".")) || 0;
                        const vol =
                          parseFloat(s.volumeCaixas.replace(",", ".")) || 0;
                        const qpc = parseFloat(p.embCmp) || 1;
                        const un = vol * qpc;
                        const margProp = pv > 0 ? (pv - p.custoLiq) / pv : 0;
                        const margAjustFrac =
                          (parseFloat(s.margemAjustada.replace(",", ".")) || 0) /
                          100;
                        const investUnit =
                          margAjustFrac > 0 && margAjustFrac < 1 && pv > 0
                            ? p.custoLiq - pv * (1 - margAjustFrac)
                            : 0;
                        const investTot = investUnit > 0 ? investUnit * un : 0;
                        const valPed = un * pv;
                        acc.volume += vol;
                        acc.invest += investTot;
                        acc.valor += valPed;
                        acc.margNum += valPed * margAjustFrac;
                        acc.margPropNum += valPed * margProp;
                        return acc;
                      },
                      { volume: 0, invest: 0, valor: 0, margNum: 0, margPropNum: 0 },
                    );
                    const pct = tot.valor > 0 ? tot.invest / tot.valor : 0;
                    const margPond = tot.valor > 0 ? tot.margNum / tot.valor : 0;
                    const margPondProp = tot.valor > 0 ? tot.margPropNum / tot.valor : 0;
                    const colorFor = (m: number) =>
                      m >= 0.17 ? "#16a34a" : m >= 0.1 ? "#d97706" : "#dc2626";
                    const corMP = colorFor(margPond);
                    const corMProp = colorFor(margPondProp);
                    const footCell: React.CSSProperties = {
                      padding: "10px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#0f172a",
                      borderTop: "2px solid #1e3a5f",
                      background: "#f1f5f9",
                      whiteSpace: "nowrap",
                    };
                    return (
                      <tfoot>
                        <tr>
                          <td
                            colSpan={13}
                            style={{
                              ...footCell,
                              textAlign: "right",
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              fontSize: 11,
                              color: "#374151",
                            }}
                          >
                            Total
                          </td>
                          <td style={{ ...footCell, color: corMProp }}>
                            {(margPondProp * 100).toFixed(2).replace(".", ",")}%
                          </td>
                          <td style={footCell}></td>
                          <td style={footCell}></td>
                          <td style={{ ...footCell, color: corMP }}>
                            {(margPond * 100).toFixed(2).replace(".", ",")}%
                          </td>
                          <td style={footCell}></td>
                          <td style={footCell}>
                            {tot.volume.toLocaleString("pt-BR")}
                          </td>
                          <td style={footCell}>{fmt(tot.invest)}</td>
                          <td style={footCell}>{fmt(tot.valor)}</td>
                          <td
                            style={{
                              ...footCell,
                              color: pct > 0.1 ? "#dc2626" : "#0f172a",
                            }}
                          >
                            {fmtPct(pct)}
                          </td>
                          <td style={footCell}></td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            )}
          </div>
          {/* ─── Alerta de itens não encontrados ─── */}
          {notFound.length > 0 && (
            <div
              style={{
                marginTop: 16,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "14px 18px",
                fontSize: 13,
                color: "#991b1b",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  ⚠ {notFound.length}{" "}
                  {notFound.length === 1
                    ? "item não foi encontrado"
                    : "itens não foram encontrados"}{" "}
                  na filial selecionada:
                </strong>
                <span style={{ wordBreak: "break-word" }}>
                  {notFound.join(", ")}
                </span>
              </div>
              <button
                onClick={() => setNotFound([])}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#991b1b",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Modal de seleção da filial após upload ─── */}
      {showFilialModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 460,
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#0f172a",
                margin: 0,
                marginBottom: 6,
              }}
            >
              Selecione a filial para simulação
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "#64748b",
                marginTop: 0,
                marginBottom: 18,
              }}
            >
              Arquivo: <strong>{uploadFileName}</strong> · {pendingRows.length}{" "}
              {pendingRows.length === 1 ? "item" : "itens"} encontrados
            </p>
            <label style={labelStyle}>Filial</label>
            <select
              value={uploadFilial}
              onChange={(e) => setUploadFilial(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}
            >
              {FILIAIS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} – {f.nome}
                </option>
              ))}
            </select>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                onClick={handleCancelUpload}
                style={{
                  height: 38,
                  padding: "0 18px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmUpload}
                style={{
                  height: 38,
                  padding: "0 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0071e3",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Carregar Itens
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  color: "#6b7280",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fafafa",
  color: "#1f2937",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "#1f2937",
  whiteSpace: "nowrap",
};

const FREEZE_WIDTHS = [70, 130, 140, 100, 260];
const FREEZE_LEFTS = FREEZE_WIDTHS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + FREEZE_WIDTHS[i - 1]);
  return acc;
}, []);
const freezeHeader = (i: number): React.CSSProperties =>
  i < 5
    ? {
        position: "sticky",
        left: FREEZE_LEFTS[i],
        zIndex: 3,
        background: "#1e3a5f",
        width: FREEZE_WIDTHS[i],
        minWidth: FREEZE_WIDTHS[i],
        boxShadow: i === 4 ? "2px 0 4px -2px rgba(0,0,0,0.35)" : undefined,
      }
    : {};
const freezeCell = (i: number): React.CSSProperties =>
  i < 5
    ? {
        position: "sticky",
        left: FREEZE_LEFTS[i],
        zIndex: 2,
        background: "#ffffff",
        width: FREEZE_WIDTHS[i],
        minWidth: FREEZE_WIDTHS[i],
        boxShadow: i === 4 ? "2px 0 4px -2px rgba(0,0,0,0.15)" : undefined,
      }
    : {};


// ─── Sub-components ───────────────────────────────────────────────────────────
function Chip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span style={{ color: "#6b7280", fontSize: 12 }}>
      {label}:{" "}
      <strong style={{ color, fontWeight: 600 }}>{value}</strong>
    </span>
  );
}

function SimKpiCard({
  label,
  value,
  color,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: "14px 16px",
        border: `1px solid ${highlight ? "#d1d5db" : "#e5e7eb"}`,
        boxShadow: highlight
          ? "0 2px 8px rgba(0,0,0,0.06)"
          : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6b7280",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 22 : 18,
          fontWeight: 700,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

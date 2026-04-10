import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProdutoComparativo {
  bu: string;
  categoria: string;
  seqProd: string;
  familia: string;
  descricao: string;
  filial: string;
  precoAnterior: number;
  precoAtual: number;
  diff: number;
  diffPct: number;
  status: "aumento" | "reducao" | "igual" | "novo" | "removido";
}

const FILIAIS = [
  { id: "all", label: "Todas as Filiais" },
  { id: "01", label: "Filial 01 - Poços" },
  { id: "10", label: "Filial 10" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
  { id: "510", label: "Filial 510" },
];

function extractFilialFromFileName(name: string): string {
  const clean = name.replace(/^P_/i, "");
  const m = clean.match(/(?:livro)[_\s-]*(\d+)/i);
  return m ? m[1] : "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function num(v: string | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\u00a0/g, " ").replace(/^R\$\s*/i, "").replace(/%$/g, "").trim().replace(/[^\d,.-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[._\-/]+/g, " ").replace(/\s+/g, " ").trim();
}

function findCol(row: Record<string, string>, candidates: string[]): string {
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (normalizedCandidates.some((c) => nk === c || nk.includes(c) || c.includes(nk)) && value !== undefined) return value;
  }
  return "";
}

function parseCSV(text: string): Record<string, string>[] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (!firstLine) return [];
  const sep = firstLine.includes(";") ? ";" : ",";
  const wb = XLSX.read(text, { type: "string", raw: false, FS: sep });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false }).map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim().replace(/"/g, ""), String(v ?? "").trim()]))
  );
}

async function readFileText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res(e.target?.result as string);
    reader.onerror = rej;
    reader.readAsText(file, "latin1");
  });
}

async function readExcelAsRows(file: File): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(file.name)) return parseCSV(await readFileText(file));
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

interface ParsedProduct {
  bu: string;
  categoria: string;
  seqProd: string;
  familia: string;
  descricao: string;
  preco: number;
}

function rowToSimple(row: Record<string, string>): ParsedProduct {
  const pv = num(findCol(row, ["ATUAL", "PRECO_VENDA", "PV", "PRECO DE VENDA", "PRECO VENDA"]));
  // BU column specifically (HC / FOODS)
  let bu = "";
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (nk === "BU" || nk === "B U" || nk === "B.U") {
      bu = String(value ?? "").trim().toUpperCase();
      break;
    }
  }
  // Categoria/subcategoria column
  const categoria = findCol(row, ["CATEGORIA", "SUBCATEGORIA", "SUB CATEGORIA"]);
  return {
    bu,
    categoria,
    seqProd: findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD", "CODIGO", "CÓDIGO", "COD PRODUTO"]),
    familia: findCol(row, ["FAMILIA", "COD FAMILIA", "COD.FAMILIA", "COD_FAMILIA"]),
    descricao: findCol(row, ["DESCRICAO", "DESCRIÇÃO", "DESC", "NOME", "PRODUTO"]),
    preco: pv,
  };
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ComparativoLivros() {
  const [anterioresFiles, setAnterioresFiles] = useState<File[]>([]);
  const [atuaisFiles, setAtuaisFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProdutoComparativo[] | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortCol, setSortCol] = useState<string>("diffPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedFilial, setSelectedFilial] = useState("all");
  const [produtoFilterFile, setProdutoFilterFile] = useState<File | null>(null);
  const [produtoFilterCodes, setProdutoFilterCodes] = useState<Set<string> | null>(null);
  const [selectedBU, setSelectedBU] = useState("all");

  const handleDrop = useCallback((e: React.DragEvent, type: "anterior" | "atual") => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name)
    );
    if (type === "anterior") setAnterioresFiles((prev) => [...prev, ...files]);
    else setAtuaisFiles((prev) => [...prev, ...files]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: "anterior" | "atual") => {
    const files = Array.from(e.target.files || []);
    if (type === "anterior") setAnterioresFiles((prev) => [...prev, ...files]);
    else setAtuaisFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }, []);

  const handleProdutoFilterFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProdutoFilterFile(file);
    try {
      const rows = await readExcelAsRows(file);
      const codes = new Set<string>();
      for (const row of rows) {
        const cod = findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD", "CODIGO", "CÓDIGO", "COD PRODUTO", "COD_PRODUTO"]);
        if (cod) codes.add(String(cod).replace(/^0+/, "").trim());
      }
      setProdutoFilterCodes(codes.size > 0 ? codes : null);
    } catch {
      setProdutoFilterCodes(null);
    }
    e.target.value = "";
  }, []);

  const processar = useCallback(async () => {
    setProcessing(true);
    try {
      const anteriorMap = new Map<string, ParsedProduct & { filial: string }>();
      const atualMap = new Map<string, ParsedProduct & { filial: string }>();

      for (const f of anterioresFiles) {
        const filial = extractFilialFromFileName(f.name);
        const rows = await readExcelAsRows(f);
        for (const row of rows) {
          const p = rowToSimple(row);
          if (p.seqProd) anteriorMap.set(`${filial}_${p.seqProd.replace(/^0+/, "")}`, { ...p, filial });
        }
      }

      for (const f of atuaisFiles) {
        const filial = extractFilialFromFileName(f.name);
        const rows = await readExcelAsRows(f);
        for (const row of rows) {
          const p = rowToSimple(row);
          if (p.seqProd) atualMap.set(`${filial}_${p.seqProd.replace(/^0+/, "")}`, { ...p, filial });
        }
      }

      const allKeys = new Set([...anteriorMap.keys(), ...atualMap.keys()]);
      const comparativo: ProdutoComparativo[] = [];

      for (const key of allKeys) {
        const codOnly = key.split("_").pop() || "";
        if (produtoFilterCodes && !produtoFilterCodes.has(codOnly)) continue;

        const ant = anteriorMap.get(key);
        const atu = atualMap.get(key);
        const precoAnt = ant?.preco ?? 0;
        const precoAtu = atu?.preco ?? 0;
        const diff = precoAtu - precoAnt;
        const diffPct = precoAnt > 0 ? (diff / precoAnt) * 100 : 0;

        let status: ProdutoComparativo["status"] = "igual";
        if (!ant) status = "novo";
        else if (!atu) status = "removido";
        else if (diff > 0.01) status = "aumento";
        else if (diff < -0.01) status = "reducao";

        comparativo.push({
          bu: atu?.bu || ant?.bu || "",
          categoria: atu?.categoria || ant?.categoria || "",
          seqProd: atu?.seqProd || ant?.seqProd || key.split("_").pop() || "",
          familia: atu?.familia || ant?.familia || "",
          descricao: atu?.descricao || ant?.descricao || "",
          filial: atu?.filial || ant?.filial || "",
          precoAnterior: precoAnt,
          precoAtual: precoAtu,
          diff,
          diffPct,
          status,
        });
      }

      setResult(comparativo);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }, [anterioresFiles, atuaisFiles, produtoFilterCodes]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    let data = result;
    if (selectedFilial !== "all") data = data.filter((p) => p.filial === selectedFilial);
    if (selectedBU !== "all") data = data.filter((p) => p.bu.toUpperCase() === selectedBU);
    if (filterStatus !== "all") data = data.filter((p) => p.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((p) => p.seqProd.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q) || p.familia.toLowerCase().includes(q));
    }
    data = [...data].sort((a, b) => {
      const av = (a as any)[sortCol];
      const bv = (b as any)[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return data;
  }, [result, selectedFilial, selectedBU, filterStatus, search, sortCol, sortDir]);

  const stats = useMemo(() => {
    if (!result) return { total: 0, aumentos: 0, reducoes: 0, iguais: 0, novos: 0, removidos: 0 };
    return {
      total: result.length,
      aumentos: result.filter((p) => p.status === "aumento").length,
      reducoes: result.filter((p) => p.status === "reducao").length,
      iguais: result.filter((p) => p.status === "igual").length,
      novos: result.filter((p) => p.status === "novo").length,
      removidos: result.filter((p) => p.status === "removido").length,
    };
  }, [result]);

  const availableBUs = useMemo(() => {
    if (!result) return [];
    const bus = new Set(result.map((p) => p.bu.toUpperCase()).filter(Boolean));
    return Array.from(bus).sort();
  }, [result]);

  const thStyle = (col: string): React.CSSProperties => ({
    padding: "11px 16px", textAlign: "left" as const, color: "#64748b", fontSize: 11,
    letterSpacing: 0.5, textTransform: "uppercase" as const, borderBottom: "2px solid #1e293b",
    whiteSpace: "nowrap" as const, cursor: "pointer", userSelect: "none" as const,
  });

  const statusColor: Record<string, { bg: string; text: string; label: string }> = {
    aumento: { bg: "#450a0a", text: "#f87171", label: "📈 Aumento" },
    reducao: { bg: "#052e16", text: "#4ade80", label: "📉 Redução" },
    igual: { bg: "#1e293b", text: "#94a3b8", label: "= Igual" },
    novo: { bg: "#1e1b4b", text: "#a78bfa", label: "🆕 Novo" },
    removido: { bg: "#2a1215", text: "#f87171", label: "❌ Removido" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b1120", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: "#e2e8f0", padding: "32px 40px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📚 Comparativo de Livros</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 32 }}>
        Compare os livros da semana anterior com os atuais para identificar alterações de preço.
      </p>

      {/* Upload area */}
      {!result && (<>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
          {/* Anteriores */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, "anterior")}
            style={{
              flex: "1 1 400px", background: "#111827", borderRadius: 14, padding: 28,
              border: "2px dashed #334155", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>
              Livros Anteriores (P_)
            </h3>
            <p style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
              Arraste os arquivos da semana anterior (prefixo P_) ou clique para selecionar
            </p>
            <label style={{
              display: "inline-block", background: "#1e3a5f", color: "#60a5fa", border: "none",
              borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}>
              Selecionar Arquivos
              <input type="file" multiple accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => handleFileSelect(e, "anterior")} />
            </label>
            {anterioresFiles.length > 0 && (
              <div style={{ marginTop: 16, textAlign: "left" }}>
                {anterioresFiles.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#0b1120", borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: "#fbbf24" }}>📄 {f.name}</span>
                    <button onClick={() => setAnterioresFiles((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Atuais */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, "atual")}
            style={{
              flex: "1 1 400px", background: "#111827", borderRadius: 14, padding: 28,
              border: "2px dashed #334155", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#60a5fa", marginBottom: 8 }}>
              Livros Atuais
            </h3>
            <p style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
              Arraste os arquivos atuais ou clique para selecionar
            </p>
            <label style={{
              display: "inline-block", background: "#1e3a5f", color: "#60a5fa", border: "none",
              borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}>
              Selecionar Arquivos
              <input type="file" multiple accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => handleFileSelect(e, "atual")} />
            </label>
            {atuaisFiles.length > 0 && (
              <div style={{ marginTop: 16, textAlign: "left" }}>
                {atuaisFiles.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#0b1120", borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: "#60a5fa" }}>📄 {f.name}</span>
                    <button onClick={() => setAtuaisFiles((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upload de produtos para filtro */}
        <div style={{
          background: "#111827", borderRadius: 14, padding: 24,
          border: "2px dashed #334155", textAlign: "center", marginBottom: 32,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#34d399", marginBottom: 6 }}>
            Filtro de Produtos (opcional)
          </h3>
          <p style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>
            Faça upload de uma planilha com os códigos dos produtos que deseja analisar. Se não enviar, todos os produtos serão comparados.
          </p>
          <label style={{
            display: "inline-block", background: "#064e3b", color: "#34d399", border: "none",
            borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}>
            Selecionar Planilha
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={handleProdutoFilterFile} />
          </label>
          {produtoFilterFile && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <span style={{ color: "#34d399", fontSize: 12 }}>📄 {produtoFilterFile.name}</span>
              {produtoFilterCodes && (
                <span style={{ color: "#94a3b8", fontSize: 11 }}>({produtoFilterCodes.size} códigos)</span>
              )}
              <button onClick={() => { setProdutoFilterFile(null); setProdutoFilterCodes(null); }}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          )}
        </div>
      </>)}

      {/* Processar button */}
      {!result && anterioresFiles.length > 0 && atuaisFiles.length > 0 && (
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <button
            onClick={processar}
            disabled={processing}
            style={{
              background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff",
              border: "none", borderRadius: 12, padding: "14px 48px", cursor: "pointer",
              fontWeight: 700, fontSize: 15, opacity: processing ? 0.6 : 1,
            }}
          >
            {processing ? "Processando..." : "🔍 Comparar Livros"}
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Categoria filter */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 10 }}>Selecione a BU</h3>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {[
                { key: "all", label: "Todas", count: result.length },
                { key: "HC", label: "HC", count: result.filter((p) => p.bu === "HC").length },
                { key: "FOODS", label: "FR", count: result.filter((p) => p.bu === "FOODS").length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setSelectedBU(key)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "2px solid", cursor: "pointer",
                    fontSize: 13, fontWeight: 700, transition: "all .2s",
                    background: selectedBU === key
                      ? (key === "FOODS" ? "#052e16" : key === "HC" ? "#1e1b4b" : "#1e3a5f")
                      : "#080f1a",
                    color: selectedBU === key
                      ? (key === "FOODS" ? "#4ade80" : key === "HC" ? "#a78bfa" : "#60a5fa")
                      : "#475569",
                    borderColor: selectedBU === key
                      ? (key === "FOODS" ? "#166534" : key === "HC" ? "#6d28d9" : "#1d4ed8")
                      : "#1e293b",
                  }}
                >
                  {label}
                  <span style={{
                    padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800, marginLeft: 8,
                    background: selectedBU === key ? "rgba(255,255,255,0.1)" : "#1e293b",
                    color: selectedBU === key
                      ? (key === "FOODS" ? "#4ade80" : key === "HC" ? "#a78bfa" : "#60a5fa")
                      : "#64748b",
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {[
              { label: "Total", value: stats.total, color: "#60a5fa", icon: "📊" },
              { label: "Aumentos", value: stats.aumentos, color: "#f87171", icon: "📈" },
              { label: "Reduções", value: stats.reducoes, color: "#4ade80", icon: "📉" },
              { label: "Iguais", value: stats.iguais, color: "#94a3b8", icon: "=" },
              { label: "Novos", value: stats.novos, color: "#a78bfa", icon: "🆕" },
              { label: "Removidos", value: stats.removidos, color: "#f87171", icon: "❌" },
            ].map((k) => (
              <div key={k.label} style={{
                flex: "1 1 140px", background: "#0f172a", borderRadius: 14, padding: "16px 20px",
                border: `1px solid ${k.color}33`,
              }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Filial Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {FILIAIS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilial(f.id)}
                style={{
                  padding: "6px 14px", borderRadius: 99, border: "1px solid",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: selectedFilial === f.id ? "#1e3a5f" : "#0f172a",
                  color: selectedFilial === f.id ? "#60a5fa" : "#475569",
                  borderColor: selectedFilial === f.id ? "#1d4ed8" : "#1e293b",
                  transition: "all .2s",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>



          {/* Filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 300px" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código, descrição ou família..."
                style={{
                  width: "100%", padding: "8px 12px 8px 32px", borderRadius: 10,
                  border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            {["all", "aumento", "reducao", "igual", "novo", "removido"].map((v) => (
              <button key={v} onClick={() => setFilterStatus(v)} style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: filterStatus === v ? "#1e3a5f" : "#0f172a",
                color: filterStatus === v ? "#60a5fa" : "#475569",
                borderColor: filterStatus === v ? "#1d4ed8" : "#1e293b",
              }}>
                {v === "all" ? "Todos" : v === "aumento" ? "📈 Aumentos" : v === "reducao" ? "📉 Reduções" : v === "igual" ? "= Iguais" : v === "novo" ? "🆕 Novos" : "❌ Removidos"}
              </button>
            ))}

            <button
              onClick={() => { setResult(null); setAnterioresFiles([]); setAtuaisFiles([]); setSearch(""); setFilterStatus("all"); setSelectedFilial("all"); setSelectedBU("all"); setProdutoFilterFile(null); setProdutoFilterCodes(null); }}
              style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid #7f1d1d",
                fontSize: 11, fontWeight: 700, cursor: "pointer", background: "#450a0a", color: "#f87171",
              }}
            >
              🔄 Nova Comparação
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
            Exibindo <strong style={{ color: "#94a3b8" }}>{Math.min(filtered.length, 500)}</strong> de <strong style={{ color: "#94a3b8" }}>{filtered.length}</strong> produtos
          </div>

          {/* Table */}
          <div style={{ overflow: "auto", borderRadius: 14, border: "1px solid #1e293b", boxShadow: "0 4px 24px #00000040" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#080f1a" }}>
                  <th onClick={() => toggleSort("bu")} style={thStyle("bu")}>
                    Categoria {sortCol === "bu" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("seqProd")} style={thStyle("seqProd")}>
                    Cód. Produto {sortCol === "seqProd" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("familia")} style={thStyle("familia")}>
                    Cód. Família {sortCol === "familia" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("descricao")} style={thStyle("descricao")}>
                    Descrição {sortCol === "descricao" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("precoAnterior")} style={{ ...thStyle("precoAnterior"), textAlign: "right", color: "#fbbf24" }}>
                    Preço Anterior {sortCol === "precoAnterior" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("precoAtual")} style={{ ...thStyle("precoAtual"), textAlign: "right", color: "#60a5fa" }}>
                    Preço Atual {sortCol === "precoAtual" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("diff")} style={{ ...thStyle("diff"), textAlign: "right" }}>
                    Diferença (R$) {sortCol === "diff" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("diffPct")} style={{ ...thStyle("diffPct"), textAlign: "right" }}>
                    Var. (%) {sortCol === "diffPct" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th style={{ ...thStyle("status"), cursor: "default" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((p, i) => {
                  const rowBg = i % 2 === 0 ? "#080f1a" : "#060c14";
                  const sc = statusColor[p.status];
                  return (
                    <tr key={`${p.seqProd}-${i}`} style={{ borderBottom: "1px solid #111827", background: rowBg, transition: "background .15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1929")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 6,
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                          background: p.bu === "FOODS" ? "#052e16" : "#1e1b4b",
                          color: p.bu === "FOODS" ? "#4ade80" : "#a78bfa",
                          border: `1px solid ${p.bu === "FOODS" ? "#166534" : "#4c1d95"}`,
                        }}>{p.bu || "–"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#60a5fa", whiteSpace: "nowrap" }}>{p.seqProd}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>{p.familia || "–"}</td>
                      <td style={{ padding: "10px 16px", maxWidth: 280 }}>
                        <div style={{ color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.descricao}>{p.descricao}</div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#fbbf24" }}>{p.precoAnterior > 0 ? fmt(p.precoAnterior) : "–"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#60a5fa" }}>{p.precoAtual > 0 ? fmt(p.precoAtual) : "–"}</td>
                      <td style={{
                        padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700,
                        color: p.diff > 0.01 ? "#f87171" : p.diff < -0.01 ? "#4ade80" : "#94a3b8",
                      }}>
                        {p.status === "novo" || p.status === "removido" ? "–" : fmt(p.diff)}
                      </td>
                      <td style={{
                        padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700,
                        color: p.diffPct > 0 ? "#f87171" : p.diffPct < 0 ? "#4ade80" : "#94a3b8",
                      }}>
                        {p.status === "novo" || p.status === "removido" ? "–" : fmtPct(p.diffPct)}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 6,
                          fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.text,
                          border: `1px solid ${sc.text}33`,
                        }}>{sc.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

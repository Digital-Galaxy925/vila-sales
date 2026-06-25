import { useState, useCallback, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import NoDataNotice from "@/components/NoDataNotice";

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
  promocionalAnterior: number;
  promocionalAtual: number;
  diff: number;
  diffPct: number;
  status: "aumento" | "reducao" | "igual" | "novo" | "removido";
}

const FILIAIS = [
  { id: "all", label: "Todas as Filiais" },
  { id: "01", label: "Filial 01 - Poços" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
];

const COMPARATIVO_CACHE_KEY = "vilasales_comparativo_result_v2";

// Map livro numbers to their logical filial
const LIVRO_TO_FILIAL: Record<string, string> = {
  "10": "01",
  "510": "502",
};

const FILIAL_SOURCE_RULES: Record<string, { estoque: string; preco: string; custo: string; promocional: string }> = {
  "01": { estoque: "01", preco: "10", custo: "10", promocional: "10" },
  "11": { estoque: "11", preco: "11", custo: "11", promocional: "11" },
  "12": { estoque: "12", preco: "12", custo: "12", promocional: "12" },
  "14": { estoque: "14", preco: "14", custo: "14", promocional: "14" },
  "501": { estoque: "501", preco: "501", custo: "501", promocional: "501" },
  "502": { estoque: "502", preco: "510", custo: "510", promocional: "510" },
};

function extractSourceLivroFromFileName(name: string): string {
  const clean = name.replace(/^P_/i, "");
  const m = clean.match(/(?:livro)[_\s-]*(\d+)/i);
  return m ? m[1] : "";
}

function extractFilialFromFileName(name: string): string {
  const raw = extractSourceLivroFromFileName(name);
  return raw ? LIVRO_TO_FILIAL[raw] || raw : "";
}

function normCod(value: unknown): string {
  return String(value ?? "").replace(/^0+/, "").trim();
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
    if (normalizedCandidates.some((c) => nk === c) && value !== undefined) return value;
  }
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (normalizedCandidates.some((c) => nk.startsWith(c) || c.startsWith(nk)) && value !== undefined) return value;
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
  promocional: number;
}

interface ParsedProductWithSource extends ParsedProduct {
  filial: string;
  sourceLivro: string;
}

function findAtualCol(row: Record<string, string>): number {
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (nk === "ATUAL") return num(value);
  }
  return num(findCol(row, ["PRECO_VENDA", "PV", "PRECO DE VENDA", "PRECO VENDA"]));
}

function findPromocCol(row: Record<string, string>): number {
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if ((nk === "PROMOC" || nk === "PROMOCAO" || nk === "PROMO") && value !== undefined) {
      return num(value);
    }
  }
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (nk.startsWith("PROMOC") && nk.length <= 10 && value !== undefined) {
      return num(value);
    }
  }
  return 0;
}

function rowToSimple(row: Record<string, string>, debugCode?: string): ParsedProduct {
  const pv = findAtualCol(row);
  const promocional = findPromocCol(row);
  let bu = "";
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (nk === "BU" || nk === "B U" || nk === "B.U") {
      bu = String(value ?? "").trim().toUpperCase();
      break;
    }
  }
  const categoria = findCol(row, ["CATEGORIA", "SUBCATEGORIA", "SUB CATEGORIA"]);
  const seqProd = findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD", "CODIGO", "CÓDIGO", "COD PRODUTO"]);

  if (debugCode && normCod(seqProd) === debugCode) {
    const promRaw = findCol(row, ["PROMOC", "PROMOÇÃO", "PROMOCAO", "PROMO"]);
    console.log(`[DEBUG ${debugCode}] PROMOC raw="${promRaw}", parsed=${promocional}, preco=${pv}`);
    for (const [key, value] of Object.entries(row)) {
      if (normalizeHeader(key).includes("PROMO")) {
        console.log(`[DEBUG ${debugCode}] Col "${key}" = "${value}"`);
      }
    }
  }

  return {
    bu,
    categoria,
    seqProd,
    familia: findCol(row, ["FAMILIA", "COD FAMILIA", "COD.FAMILIA", "COD_FAMILIA"]),
    descricao: findCol(row, ["DESCRICAO", "DESCRIÇÃO", "DESC", "NOME", "PRODUTO"]),
    preco: pv,
    promocional,
  };
}

function pushParsedProduct(map: Map<string, ParsedProductWithSource[]>, key: string, item: ParsedProductWithSource) {
  const current = map.get(key);
  if (current) current.push(item);
  else map.set(key, [item]);
}

function pickPreferredItem(items: ParsedProductWithSource[], preferredSource: string): ParsedProductWithSource | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].sourceLivro === preferredSource) return items[i];
  }
  return items[items.length - 1];
}

function pickFirstText(items: Array<ParsedProductWithSource | undefined>, selector: (item: ParsedProductWithSource) => string): string {
  for (const item of items) {
    const value = item ? selector(item) : "";
    if (value) return value;
  }
  return "";
}

function resolveMergedProduct(items: ParsedProductWithSource[] | undefined, filial: string): ParsedProductWithSource | undefined {
  if (!items?.length) return undefined;

  const rule = FILIAL_SOURCE_RULES[filial] ?? { estoque: filial, preco: filial, custo: filial, promocional: filial };
  const priceItem = pickPreferredItem(items, rule.preco);
  const promoItem = pickPreferredItem(items, rule.promocional);
  const fallbackItem = items[items.length - 1];
  const orderedItems = [priceItem, promoItem, fallbackItem, ...items.filter((item) => item !== priceItem && item !== promoItem && item !== fallbackItem)];

  const resolved: ParsedProductWithSource = {
    ...(priceItem ?? promoItem ?? fallbackItem),
    filial,
    sourceLivro: (priceItem ?? promoItem ?? fallbackItem).sourceLivro,
    bu: pickFirstText(orderedItems, (item) => item.bu),
    categoria: pickFirstText(orderedItems, (item) => item.categoria),
    seqProd: pickFirstText(orderedItems, (item) => item.seqProd),
    familia: pickFirstText(orderedItems, (item) => item.familia),
    descricao: pickFirstText(orderedItems, (item) => item.descricao),
    preco: priceItem?.preco ?? 0,
    promocional: promoItem?.promocional ?? 0,
  };

  if (normCod(resolved.seqProd) === "125949") {
    console.log(
      `[Resolve 125949] filial=${filial} regra.preco=${rule.preco} regra.promoc=${rule.promocional} fontes=${items
        .map((item) => `${item.sourceLivro}: preco=${item.preco} promoc=${item.promocional}`)
        .join(" | ")} => preco=${resolved.preco} promoc=${resolved.promocional}`
    );
  }

  return resolved;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ComparativoLivros() {
  const [anterioresFiles, setAnterioresFiles] = useState<File[]>([]);
  const [atuaisFiles, setAtuaisFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProdutoComparativo[] | null>(() => {
    try {
      localStorage.removeItem("vilasales_comparativo_result");
      const saved = localStorage.getItem(COMPARATIVO_CACHE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && !("promocionalAnterior" in parsed[0])) {
        localStorage.removeItem(COMPARATIVO_CACHE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortCol, setSortCol] = useState<string>("diffPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedFilial, setSelectedFilial] = useState("all");
  const [produtoFilterFile, setProdutoFilterFile] = useState<File | null>(null);
  const [produtoFilterCodes, setProdutoFilterCodes] = useState<Set<string> | null>(null);
  const [produtoBUMap, setProdutoBUMap] = useState<Map<string, string>>(new Map());
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
      const buMap = new Map<string, string>();
      const buValues = new Set<string>();
      for (const row of rows) {
        const cod = findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD", "CODIGO", "CÓDIGO", "COD PRODUTO", "COD_PRODUTO"]);
        const codNorm = normCod(cod);
        if (codNorm) {
          codes.add(codNorm);
          let bu = "";
          for (const [key, value] of Object.entries(row)) {
            const nk = normalizeHeader(key);
            if (nk === "BU" || nk === "B U") {
              bu = String(value ?? "").trim().toUpperCase();
              break;
            }
          }
          if (bu) {
            buValues.add(bu);
            buMap.set(codNorm, bu);
          }
        }
      }
      console.log("[Produtos] Valores únicos de BU encontrados:", [...buValues]);
      console.log("[Produtos] Colunas da planilha:", rows.length > 0 ? Object.keys(rows[0]) : "vazio");
      setProdutoFilterCodes(codes.size > 0 ? codes : null);
      setProdutoBUMap(buMap);
    } catch {
      setProdutoFilterCodes(null);
    }
    e.target.value = "";
  }, []);

  const processar = useCallback(async () => {
    setProcessing(true);
    try {
      const anteriorBuckets = new Map<string, ParsedProductWithSource[]>();
      const atualBuckets = new Map<string, ParsedProductWithSource[]>();

      for (const f of anterioresFiles) {
        const filial = extractFilialFromFileName(f.name);
        const sourceLivro = extractSourceLivroFromFileName(f.name);
        const rows = await readExcelAsRows(f);
        console.log(`[Anterior] Arquivo: ${f.name}, filial lógica: ${filial}, livro origem: ${sourceLivro}, linhas: ${rows.length}`);
        if (rows.length > 0) {
          console.log("[Anterior] Colunas:", Object.keys(rows[0]));
          const sample = rowToSimple(rows[0]);
          console.log("[Anterior] Amostra 1º produto:", { cod: sample.seqProd, desc: sample.descricao, preco: sample.preco });
        }
        let matched = 0;
        for (const row of rows) {
          const p = rowToSimple(row, "125949");
          const codNorm = normCod(p.seqProd);
          if (codNorm) {
            pushParsedProduct(anteriorBuckets, `${filial}_${codNorm}`, { ...p, filial, sourceLivro });
            matched++;
          }
        }
        console.log(`[Anterior] Produtos com código válido: ${matched}`);
      }

      for (const f of atuaisFiles) {
        const filial = extractFilialFromFileName(f.name);
        const sourceLivro = extractSourceLivroFromFileName(f.name);
        const rows = await readExcelAsRows(f);
        console.log(`[Atual] Arquivo: ${f.name}, filial lógica: ${filial}, livro origem: ${sourceLivro}, linhas: ${rows.length}`);
        if (rows.length > 0) console.log("[Atual] Colunas:", Object.keys(rows[0]));
        let matched = 0;
        for (const row of rows) {
          const p = rowToSimple(row, "125949");
          const codNorm = normCod(p.seqProd);
          if (codNorm) {
            pushParsedProduct(atualBuckets, `${filial}_${codNorm}`, { ...p, filial, sourceLivro });
            matched++;
          }
        }
        console.log(`[Atual] Produtos com código válido: ${matched}`);
      }

      const allKeys = new Set([...anteriorBuckets.keys(), ...atualBuckets.keys()]);
      console.log(`[Comparativo] Total de chaves únicas: ${allKeys.size}, filtro de produtos: ${produtoFilterCodes ? produtoFilterCodes.size + " códigos" : "desativado"}`);

      const comparativo: ProdutoComparativo[] = [];
      let filtered_out = 0;

      for (const key of allKeys) {
        const [filial, codOnly = ""] = key.split("_");
        if (produtoFilterCodes && !produtoFilterCodes.has(codOnly)) {
          filtered_out++;
          continue;
        }

        const ant = resolveMergedProduct(anteriorBuckets.get(key), filial);
        const atu = resolveMergedProduct(atualBuckets.get(key), filial);
        const precoAnt = ant?.preco ?? 0;
        const precoAtu = atu?.preco ?? 0;
        const promAnt = ant?.promocional ?? 0;
        const promAtu = atu?.promocional ?? 0;
        const baseAnt = promAnt > 0 && promAtu > 0 ? promAnt : precoAnt;
        const baseAtu = promAnt > 0 && promAtu > 0 ? promAtu : precoAtu;
        const diff = baseAtu - baseAnt;
        const diffPct = baseAnt > 0 ? (diff / baseAnt) * 100 : 0;

        let status: ProdutoComparativo["status"] = "igual";
        if (!ant) status = "novo";
        else if (!atu) status = "removido";
        else if (diff > 0.01) status = "aumento";
        else if (diff < -0.01) status = "reducao";

        const seqProd = atu?.seqProd || ant?.seqProd || codOnly;
        const buFromProducts = produtoBUMap.get(normCod(seqProd)) || "";

        comparativo.push({
          bu: buFromProducts || atu?.bu || ant?.bu || "",
          categoria: atu?.categoria || ant?.categoria || "",
          seqProd: seqProd,
          familia: atu?.familia || ant?.familia || "",
          descricao: atu?.descricao || ant?.descricao || "",
          filial: atu?.filial || ant?.filial || filial,
          precoAnterior: precoAnt,
          precoAtual: precoAtu,
          promocionalAnterior: promAnt,
          promocionalAtual: promAtu,
          diff,
          diffPct,
          status,
        });
      }

      console.log(`[Comparativo] Resultado: ${comparativo.length} produtos, filtrados pelo produto filter: ${filtered_out}`);
      setResult(comparativo);
      try {
        localStorage.setItem(COMPARATIVO_CACHE_KEY, JSON.stringify(comparativo));
      } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }, [anterioresFiles, atuaisFiles, produtoFilterCodes, produtoBUMap]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    let data = result;
    if (selectedFilial !== "all") data = data.filter((p) => p.filial === selectedFilial);
    if (selectedBU !== "all") {
      if (selectedBU === "FR") {
        data = data.filter((p) => { const b = p.bu.toUpperCase(); return b === "FR" || b === "FOODS" || b === "FOOD"; });
      } else {
        data = data.filter((p) => p.bu.toUpperCase() === selectedBU);
      }
    }
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
    let data = result;
    if (selectedFilial !== "all") data = data.filter((p) => p.filial === selectedFilial);
    if (selectedBU !== "all") {
      if (selectedBU === "FR") {
        data = data.filter((p) => { const b = p.bu.toUpperCase(); return b === "FR" || b === "FOODS" || b === "FOOD"; });
      } else {
        data = data.filter((p) => p.bu.toUpperCase() === selectedBU);
      }
    }
    return {
      total: data.length,
      aumentos: data.filter((p) => p.status === "aumento").length,
      reducoes: data.filter((p) => p.status === "reducao").length,
      iguais: data.filter((p) => p.status === "igual").length,
      novos: data.filter((p) => p.status === "novo").length,
      removidos: data.filter((p) => p.status === "removido").length,
    };
  }, [result, selectedFilial, selectedBU]);

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
    <div style={{ minHeight: "100vh", background: "#0b1120", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📚 Comparativo de Livros</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 32 }}>
        Compare os livros da semana anterior com os atuais para identificar alterações de preço.
      </p>

      {!result && (
        <div style={{ background: "#111827", borderRadius: 14, padding: 8, marginBottom: 24 }}>
          <NoDataNotice
            description="O Comparativo de Livros agora usa exclusivamente os dados do Upload de Livros. Faça o upload das semanas anterior e atual naquela tela para visualizar a comparação aqui."
          />
        </div>
      )}

      {false && !result && (<>
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
              <button onClick={() => { setProdutoFilterFile(null); setProdutoFilterCodes(null); setProdutoBUMap(new Map()); }}
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
                { key: "HC", label: "HC", count: result.filter((p) => p.bu.toUpperCase() === "HC").length },
                { key: "FR", label: "FR", count: result.filter((p) => { const b = p.bu.toUpperCase(); return b === "FR" || b === "FOODS" || b === "FOOD"; }).length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setSelectedBU(key)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "2px solid", cursor: "pointer",
                    fontSize: 13, fontWeight: 700, transition: "all .2s",
                    background: selectedBU === key
                      ? (key === "FR" ? "#052e16" : key === "HC" ? "#1e1b4b" : "#1e3a5f")
                      : "#080f1a",
                    color: selectedBU === key
                      ? (key === "FR" ? "#4ade80" : key === "HC" ? "#a78bfa" : "#60a5fa")
                      : "#475569",
                    borderColor: selectedBU === key
                      ? (key === "FR" ? "#166534" : key === "HC" ? "#6d28d9" : "#1d4ed8")
                      : "#1e293b",
                  }}
                >
                  {label}
                  <span style={{
                    padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800, marginLeft: 8,
                    background: selectedBU === key ? "rgba(255,255,255,0.1)" : "#1e293b",
                    color: selectedBU === key
                      ? (key === "FR" ? "#4ade80" : key === "HC" ? "#a78bfa" : "#60a5fa")
                      : "#64748b",
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Filial Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
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

          {/* KPIs */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {[
              { label: "Total", value: stats.total, color: "#60a5fa", icon: "📊", statusKey: "all" },
              { label: "Aumentos", value: stats.aumentos, color: "#f87171", icon: "📈", statusKey: "aumento" },
              { label: "Reduções", value: stats.reducoes, color: "#4ade80", icon: "📉", statusKey: "reducao" },
              { label: "Iguais", value: stats.iguais, color: "#94a3b8", icon: "=", statusKey: "igual" },
              { label: "Novos", value: stats.novos, color: "#a78bfa", icon: "🆕", statusKey: "novo" },
              { label: "Removidos", value: stats.removidos, color: "#f87171", icon: "❌", statusKey: "removido" },
            ].map((k) => (
              <div key={k.label} onClick={() => setFilterStatus(filterStatus === k.statusKey ? "all" : k.statusKey)} style={{
                flex: "1 1 140px", background: filterStatus === k.statusKey ? `${k.color}15` : "#0f172a", borderRadius: 14, padding: "16px 20px",
                border: filterStatus === k.statusKey ? `2px solid ${k.color}` : `1px solid ${k.color}33`,
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
              </div>
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
              onClick={() => {
                const wb = XLSX.utils.book_new();
                const data = filtered.map((r) => ({
                  "Filial": FILIAIS.find((f) => f.id === r.filial)?.label || r.filial,
                  "BU": r.bu,
                  "Categoria": r.categoria,
                  "Cód. Produto": r.seqProd,
                  "Cód. Família": r.familia,
                  "Descrição": r.descricao,
                  "Preço Anterior": r.precoAnterior,
                  "Preço Atual": r.precoAtual,
                  "Promocional Anterior": r.promocionalAnterior,
                  "Promocional Atual": r.promocionalAtual,
                  "Diferença (R$)": r.diff,
                  "Variação (%)": r.diffPct,
                  "Status": r.status === "aumento" ? "Aumento" : r.status === "reducao" ? "Redução" : r.status === "igual" ? "Igual" : r.status === "novo" ? "Novo" : "Removido",
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                ws["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
                XLSX.utils.book_append_sheet(wb, ws, "Comparativo");
                XLSX.writeFile(wb, `Comparativo_Livros_${new Date().toISOString().slice(0, 10)}.xlsx`);
              }}
              style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid #065f46",
                fontSize: 11, fontWeight: 700, cursor: "pointer", background: "#052e16", color: "#34d399",
              }}
            >
              📥 Exportar Excel
            </button>

            <button
              onClick={() => { setResult(null); setAnterioresFiles([]); setAtuaisFiles([]); setSearch(""); setFilterStatus("all"); setSelectedFilial("all"); setSelectedBU("all"); setProdutoFilterFile(null); setProdutoFilterCodes(null); setProdutoBUMap(new Map()); }}
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
                  <th onClick={() => toggleSort("filial")} style={thStyle("filial")}>
                    Filial {sortCol === "filial" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("bu")} style={thStyle("bu")}>
                    BU {sortCol === "bu" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("categoria")} style={thStyle("categoria")}>
                    Categoria {sortCol === "categoria" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
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
                  <th onClick={() => toggleSort("promocionalAnterior")} style={{ ...thStyle("promocionalAnterior"), textAlign: "right", color: "#c084fc" }}>
                    Prom. Anterior {sortCol === "promocionalAnterior" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  <th onClick={() => toggleSort("promocionalAtual")} style={{ ...thStyle("promocionalAtual"), textAlign: "right", color: "#e879f9" }}>
                    Prom. Atual {sortCol === "promocionalAtual" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
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
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap", fontWeight: 600, color: "#94a3b8", fontSize: 12 }}>
                        {FILIAIS.find((f) => f.id === p.filial)?.label || p.filial || "–"}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 6,
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                          background: p.bu === "FOODS" ? "#052e16" : "#1e1b4b",
                          color: p.bu === "FOODS" ? "#4ade80" : "#a78bfa",
                          border: `1px solid ${p.bu === "FOODS" ? "#166534" : "#4c1d95"}`,
                        }}>{p.bu || "–"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 6,
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                          background: "#1e293b", color: "#e2e8f0",
                          border: "1px solid #334155",
                        }}>{p.categoria || "–"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#60a5fa", whiteSpace: "nowrap" }}>{p.seqProd}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>{p.familia || "–"}</td>
                      <td style={{ padding: "10px 16px", maxWidth: 280 }}>
                        <div style={{ color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.descricao}>{p.descricao}</div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#fbbf24" }}>{p.precoAnterior > 0 ? fmt(p.precoAnterior) : "–"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#60a5fa" }}>{p.precoAtual > 0 ? fmt(p.precoAtual) : "–"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#c084fc" }}>{p.promocionalAnterior > 0 ? fmt(p.promocionalAnterior) : "–"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#e879f9" }}>{p.promocionalAtual > 0 ? fmt(p.promocionalAtual) : "–"}</td>
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

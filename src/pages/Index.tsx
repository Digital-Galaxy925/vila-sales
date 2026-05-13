import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { notifyAppDataChanged, useAppDataKey } from "@/contexts/AppDataContext";
import { saveLivrosToSupabase, clearLivrosFromSupabase } from "@/lib/livrosSync";

// ─── Types ────────────────────────────────────────────────────────────────────
type Filial = "01" | "11" | "12" | "14" | "501" | "502";
type Module = "cruzamento" | "preco" | "estoque" | "margem" | "shelflife" | "geral";

interface Product {
  familia: string;
  seqProd: string;
  descricao: string;
  embCmp: string;
  embVir: string;
  estoque: number;
  sellout: number;
  promoc: number;
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
  pendCmp: number;
  filial: Filial;
  bu: string; // FOODS | HC
}

interface FilialData {
  [filial: string]: Product[];
}

interface LivroMetricRow {
  estoque: number;
  ddv: number;
  pendCmp: number;
}

interface LivroMetricsData {
  [filial: string]: Record<string, LivroMetricRow>;
}

const LIVRO_METRICS_STORAGE_KEY = "vilasales_livro_metrics";

interface UploadedFiles {
  livro_01?: File;
  livro_10?: File;
  livro_11?: File;
  livro_12?: File;
  livro_14?: File;
  livro_501?: File;
  livro_502?: File;
  livro_510?: File;
  base?: File;
}

// ─── File auto-detection ──────────────────────────────────────────────────────
function detectFileKey(filename: string): keyof UploadedFiles | null {
  const name = filename.toLowerCase().replace(/\s+/g, "_").replace(/\.csv$|\.xlsx$|\.xls$/, "");
  if (name.includes("livro_01") || name === "livro01" || name.endsWith("_01")) return "livro_01";
  if (name.includes("livro_10") || name === "livro10" || name.endsWith("_10")) return "livro_10";
  if (name.includes("livro_11") || name === "livro11" || name.endsWith("_11")) return "livro_11";
  if (name.includes("livro_12") || name === "livro12" || name.endsWith("_12")) return "livro_12";
  if (name.includes("livro_14") || name === "livro14" || name.endsWith("_14")) return "livro_14";
  if (name.includes("livro_501") || name === "livro501" || name.endsWith("_501")) return "livro_501";
  if (name.includes("livro_510") || name === "livro510" || name.endsWith("_510")) return "livro_510";
  if (name.includes("livro_502") || name === "livro502" || name.endsWith("_502")) return "livro_502";
  if (name.includes("base") || name.includes("produto")) return "base";
  return null;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  if (!firstLine) return [];
  const sep = firstLine.includes(";") ? ";" : ",";
  const wb = XLSX.read(text, { type: "string", raw: false, FS: sep });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "", raw: false }).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        String(key).trim().replace(/"/g, ""),
        String(value ?? "").trim(),
      ])
    )
  );
}

function num(v: string | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s
    .replace(/\u00a0/g, " ")
    .replace(/^R\$\s*/i, "")
    .replace(/%$/g, "")
    .trim()
    .replace(/[^\d,.-]/g, "");

  if (!s || s === "-" || s === "." || s === ",") return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const decimalPlaces = s.length - lastDot - 1;
    if (decimalPlaces > 2) s = s.replace(/\./g, "");
  }

  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIndex(header: string[], candidates: string[], fallback: number): number {
  const normalizedHeader = header.map(normalizeHeader);
  const normalizedCandidates = candidates.map(normalizeHeader);
  const index = normalizedHeader.findIndex((value) =>
    normalizedCandidates.some((candidate) => value === candidate || value.includes(candidate))
  );
  return index >= 0 ? index : fallback;
}

function findCol(row: Record<string, string>, candidates: string[]): string {
  const entries = Object.entries(row);
  const normalizedCandidates = candidates.map(normalizeHeader);

  for (const [key, value] of entries) {
    const normalizedKey = normalizeHeader(key);
    const matched = normalizedCandidates.some(
      (candidate) => normalizedKey === candidate || normalizedKey.includes(candidate) || candidate.includes(normalizedKey)
    );
    if (matched && value !== undefined) return value;
  }

  return "";
}

function rowToProduct(row: Record<string, string>, filial: Filial): Product {
  const pv = num(findCol(row, ["ATUAL", "PRECO_VENDA", "PV"]));
  const pc = num(findCol(row, ["CUSTO.LIQ", "CUSTO_LIQ", "CUSTOLIQ", "PC"]));
  const margCalc = pv > 0 ? ((pv - pc) / pv) * 100 : 0;
  return {
    familia: findCol(row, ["FAMILIA"]),
    seqProd: findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD"]),
    descricao: findCol(row, ["DESCRICAO", "DESCRIÇÃO", "DESC"]),
    embCmp: findCol(row, ["EMB.CMP", "EMBCMP", "EMB_CMP"]),
    embVir: findCol(row, ["EMB.VIR", "EMBVIR", "EMB_VIR"]),
    estoque: num(findCol(row, ["ESTOQUE"])),
    sellout: num(findCol(row, ["SELLOUT", "SELL OUT", "SELL.OUT", "SELL_OUT"])),
    promoc: num(findCol(row, ["PROMOC", "PROMOÇÃO", "PROMOCAO", "PROMO"])),
    pendCmp: num(findCol(row, ["PEND.CMP", "PEND CMP", "PENDCMP", "PEND_COMPRA", "PENDENCIA"])),
    custoLiq: pc,
    comis: num(findCol(row, ["COMIS"])),
    marg: num(findCol(row, ["MARG"])) || margCalc,
    mesAnt: num(findCol(row, ["MES ANT", "MES_ANT", "MESANT"])),
    mesAtu: num(findCol(row, ["MES ATU", "MES_ATU", "MESATU"])),
    abc: findCol(row, ["ABC"]),
    custoNf: num(findCol(row, ["CUSTO NF", "CUSTO_NF", "CUSTONF"])),
    atual: pv,
    sugerido: num(findCol(row, ["SUGERIDO"])),
    ddv: num(findCol(row, ["DDV"])),
    filial,
    bu: "",
  };
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
  if (/\.csv$/i.test(file.name)) {
    const text = await readFileText(file);
    return parseCSV(text);
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Arquivo Excel sem planilhas.");
  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (rows.length === 0) throw new Error(
    "Planilha lida mas sem dados.\n💡 Solução: verifique se os dados estão na primeira aba."
  );
  return rows;
}

// ─── Filial Config ────────────────────────────────────────────────────────────
const FILIAL_INFO: Record<Filial, { nome: string; cor: string; livro: string }> = {
  "01": { nome: "Poços de Caldas", cor: "#3B82F6", livro: "livro_01" },
  "11": { nome: "Campinas", cor: "#8B5CF6", livro: "livro_11" },
  "12": { nome: "Osasco", cor: "#EC4899", livro: "livro_12" },
  "14": { nome: "Betim", cor: "#F59E0B", livro: "livro_14" },
  "501": { nome: "Focomix SP", cor: "#10B981", livro: "livro_501" },
  "502": { nome: "Focomix MG", cor: "#EF4444", livro: "livro_502" },
};

const FILIAIS: Filial[] = ["01", "11", "12", "14", "501", "502"];

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${color}33`,
        borderRadius: 16,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          fontSize: 80,
          opacity: 0.06,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 28, fontWeight: 600, color }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "#6b7280" }}>{sub}</span>}
    </div>
  );
}

function MargemBadge({ marg }: { marg: number }) {
  const ok = marg >= 17;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 700,
        background: ok ? "#f0fdf4" : "#fef2f2",
        color: ok ? "#16a34a" : "#dc2626",
        border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
      }}
    >
      {ok ? "▲" : "▼"} {marg.toFixed(1)}%
    </span>
  );
}

function ABCBadge({ abc }: { abc: string }) {
  const colors: Record<string, [string, string]> = {
    A: ["rgba(0,113,227,0.1)", "#0071e3"],
    B: ["rgba(22,163,74,0.1)", "#16a34a"],
    C: ["rgba(217,119,6,0.1)", "#d97706"],
  };
  const letter = abc?.trim().toUpperCase() || "–";
  const [bg, fg] = colors[letter] || ["#e5e7eb", "#9ca3af"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color: fg,
      }}
    >
      {letter}
    </span>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 99, height: 6, width: "100%", minWidth: 80 }}>
      <div
        style={{
          height: 6,
          borderRadius: 99,
          width: `${pct}%`,
          background: color,
          transition: "width .4s",
        }}
      />
    </div>
  );
}

// ─── Upload Wizard (2 steps) ──────────────────────────────────────────────────
const LIVRO_META: { key: keyof UploadedFiles; label: string; desc: string }[] = [
  { key: "livro_01",  label: "livro_01",  desc: "Filial 01 – Poços (estoque)"              },
  { key: "livro_10",  label: "livro_10",  desc: "Poços (preço custo/venda)"               },
  { key: "livro_11",  label: "livro_11",  desc: "Filial 11 – Campinas"                   },
  { key: "livro_12",  label: "livro_12",  desc: "Filial 12 – Osasco"                     },
  { key: "livro_14",  label: "livro_14",  desc: "Filial 14 – Betim"                      },
  { key: "livro_501", label: "livro_501", desc: "Filial 501 – Focomix SP"                },
  { key: "livro_502", label: "livro_502", desc: "Filial 502 – Focomix MG (estoque)"      },
  { key: "livro_510", label: "livro_510", desc: "Focomix MG (preço custo/venda)"         },
];

// Step indicator
function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600, fontSize: 14, flexShrink: 0,
        background: done ? "#f0fdf4" : active ? "rgba(0,113,227,0.12)" : "#ffffff",
        color: done ? "#16a34a" : active ? "#0071e3" : "#d1d5db",
        border: `2px solid ${done ? "#bbf7d0" : active ? "#3B82F6" : "#e5e7eb"}`,
        transition: "all .3s",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: done ? "#16a34a" : active ? "#1f2937" : "#d1d5db" }}>
        {label}
      </span>
    </div>
  );
}

// Drag-and-drop zone
function DropZone({
  onFiles,
  multiple,
  accept,
  label,
  sublabel,
  icon,
  draggingColor,
}: {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  accept?: string;
  label: string;
  sublabel: string;
  icon: string;
  draggingColor?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = draggingColor || "#3B82F6";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? color : "#e5e7eb"}`,
        borderRadius: 14,
        padding: "28px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? `${color}11` : "#fafafa",
        transition: "all .2s",
      }}
    >
      <input ref={inputRef} type="file" multiple={multiple} accept={accept} style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
      <div style={{ fontSize: 36, marginBottom: 8 }}>{dragging ? "📥" : icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1f2937", marginBottom: 4 }}>
        {dragging ? "Solte aqui!" : label}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>{sublabel}</div>
      <div style={{ display: "inline-block", padding: "7px 20px", borderRadius: 99, background: `${color}22`, color, fontSize: 12, fontWeight: 700, border: `1px solid ${color}44` }}>
        Selecionar arquivos
      </div>
    </div>
  );
}

function UploadPanel({
  files,
  baseFile,
  onCsvFiles,
  onBaseFile,
  onClear,
  unrecognized,
}: {
  files: UploadedFiles;
  baseFile: File | null;
  onCsvFiles: (newFiles: Partial<UploadedFiles>, unrecognized: string[]) => void;
  onBaseFile: (f: File) => void;
  onClear: () => void;
  unrecognized: string[];
}) {
  const csvLoaded = LIVRO_META.filter(({ key }) => !!files[key]).length;
  const step1Done = csvLoaded > 0;
  const step2Done = !!baseFile;

  const handleCsvFileList = (fileList: FileList) => {
    const result: Partial<UploadedFiles> = {};
    const bad: string[] = [];
    Array.from(fileList).forEach((f) => {
      const key = detectFileKey(f.name);
      // only accept CSV keys (not base) in step 1
      if (key && key !== "base") result[key] = f;
      else if (!key) bad.push(f.name);
    });
    onCsvFiles(result, bad);
  };

  const handleBaseFileList = (fileList: FileList) => {
    const f = Array.from(fileList)[0];
    if (f) onBaseFile(f);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        <StepBadge n={1} label="Arquivos das Filiais (CSV)" active={!step1Done} done={step1Done} />
        <div style={{ flex: 1, height: 2, margin: "0 12px", background: step1Done ? "#bbf7d0" : "#e5e7eb", transition: "background .4s" }} />
        <StepBadge n={2} label="Base de Produtos (Excel)" active={step1Done && !step2Done} done={step2Done} />
      </div>

      {/* ── STEP 1 ── */}
      <div style={{
        border: `1px solid ${step1Done ? "#bbf7d0" : "#e5e7eb"}`,
        borderRadius: 16,
        padding: 20,
        background: step1Done ? "#f0fdf4" : "#fafafa",
        transition: "all .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: step1Done ? "#16a34a" : "#1f2937" }}>
              {step1Done ? `✅ Passo 1 concluído — ${csvLoaded} de ${LIVRO_META.length} arquivos carregados` : "Passo 1 — Arquivos das Filiais"}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Selecione todos os livros CSV de uma vez. O sistema identifica cada filial automaticamente pelo nome do arquivo.
            </div>
          </div>
          {step1Done && (
            <button onClick={onClear} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 11, textDecoration: "underline", flexShrink: 0, marginLeft: 12 }}>
              Refazer
            </button>
          )}
        </div>

        <DropZone
          onFiles={handleCsvFileList}
          multiple
          accept=".csv"
          label="Arraste ou clique para selecionar todos os CSVs"
          sublabel="livro_01, livro_10, livro_11, livro_12, livro_14, livro_501, livro_502, livro_510"
          icon="🗂️"
          draggingColor="#3B82F6"
        />

        {/* Status grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 14 }}>
          {LIVRO_META.map(({ key, label, desc }) => {
            const loaded = !!files[key];
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderRadius: 8, background: loaded ? "#f0fdf4" : "#f0fdf4",
                border: `1px solid ${loaded ? "#bbf7d0" : "#e5e7eb"}`, transition: "all .3s",
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{loaded ? "✅" : "⬜"}</span>
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: loaded ? "#16a34a" : "#6b7280" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {loaded ? files[key]!.name : desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress */}
        <div style={{ marginTop: 12, background: "#e5e7eb", borderRadius: 99, height: 4 }}>
          <div style={{
            height: 4, borderRadius: 99, transition: "width .4s",
            width: `${(csvLoaded / LIVRO_META.length) * 100}%`,
            background: csvLoaded === LIVRO_META.length ? "#16a34a" : "#3B82F6",
          }} />
        </div>

        {unrecognized.length > 0 && (
          <div style={{ marginTop: 10, background: "#431407", border: "1px solid #7c2d12", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#fb923c" }}>
            ⚠️ Não reconhecidos (verifique os nomes): <strong>{unrecognized.join(", ")}</strong>
          </div>
        )}
      </div>

      {/* ── STEP 2 ── */}
      <div style={{
        border: `1px solid ${!step1Done ? "#ffffff" : step2Done ? "#bbf7d0" : "rgba(0,113,227,0.12)"}`,
        borderRadius: 16,
        padding: 20,
        background: !step1Done ? "#fafafa" : step2Done ? "#f0fdf4" : "#fafafa",
        opacity: step1Done ? 1 : 0.45,
        transition: "all .3s",
        pointerEvents: step1Done ? "auto" : "none",
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: step2Done ? "#16a34a" : step1Done ? "#1f2937" : "#d1d5db" }}>
            {step2Done ? `✅ Passo 2 concluído — ${baseFile!.name}` : "Passo 2 — Base de Produtos"}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            Planilha Excel com os produtos que serão analisados. Deve conter colunas de <strong style={{ color: "#9ca3af" }}>código</strong> e <strong style={{ color: "#9ca3af" }}>descrição</strong>.
          </div>
        </div>

        {!step2Done ? (
          <>
            <DropZone
              onFiles={handleBaseFileList}
              multiple={false}
              accept=".xlsx,.xls,.xlsm,.xlsb,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              label="Arraste ou clique para selecionar a base de produtos"
              sublabel="Aceita .xlsx ou .csv — com colunas: BU, Cod Família, Cod Produto, DESCRICAO"
              icon="📋"
              draggingColor="#8B5CF6"
            />
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11, color: "#6b7280" }}>
              <strong style={{ color: "#6b7280" }}>💡 Recomendado:</strong> Se o upload do .xlsx falhar, salve a planilha como <strong style={{ color: "#9ca3af" }}>.csv (separado por ponto-e-vírgula)</strong> no Excel (Arquivo → Salvar como → CSV UTF-8) e faça upload do CSV.
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{baseFile!.name}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{(baseFile!.size / 1024).toFixed(1)} KB · Base de produtos carregada</div>
            </div>
            <button
              onClick={() => onBaseFile(null as any)}
              style={{ background: "#fecaca", border: "none", borderRadius: 6, color: "#dc2626", cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700 }}
            >
              Trocar
            </button>
          </div>
        )}

        <div style={{ marginTop: 14, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11, color: "#6b7280" }}>
          <strong style={{ color: "#6b7280" }}>💡 Dica:</strong> A base de produtos funciona como <strong style={{ color: "#9ca3af" }}>filtro</strong> — somente os produtos presentes nela serão exibidos nas análises. Se quiser ver todos os produtos das filiais, pode pular este passo e clicar em Gerar Análise diretamente.
        </div>
      </div>

      {/* Ready state */}
      {step1Done && step2Done && (
        <div style={{ padding: "14px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>🚀</span>
          <div>
            <div style={{ fontWeight: 600, color: "#16a34a", fontSize: 14 }}>Tudo pronto para análise!</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Clique em "Gerar Análise" no topo para processar os dados.</div>
          </div>
        </div>
      )}
    </div>
  );
}
const isFoods = (bu: string) => { const b = bu.toUpperCase(); return b === "FOODS" || b === "FR" || b === "FOOD"; };

// ─── Step 3: Cross Analysis Table ────────────────────────────────────────────
function CrossAnalysis({ data }: { data: FilialData }) {
  const livroMetrics = useAppDataKey<LivroMetricsData>("vilasales_livro_metrics");
  // Mapeamento estrito filial → livro de origem do DDV
  // 01→01, 11→11, 12→12, 14→14, 501→501, 502→502
  const ddvFromLivro = (filial: string, seqProd: string): number => {
    const livro = livroMetrics?.[filial];
    if (!livro) return 0;
    return livro[String(seqProd)]?.ddv ?? 0;
  };
  const [selectedFilial, setSelectedFilial] = useState<Filial | "all">("all");
  const [selectedBU, setSelectedBU] = useState<"all" | "FOODS" | "HC">("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"seqProd" | "descricao" | "estoque" | "custoLiq" | "sellout" | "atual" | "promoc" | "marg">("marg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterMarg, setFilterMarg] = useState<"all" | "critico" | "ok">("all");
  const [minMargin, setMinMargin] = useState(17);
  const [bulkMargin, setBulkMargin] = useState("");
  const [bulkDiscount, setBulkDiscount] = useState("");
  const [desiredMargins, setDesiredMargins] = useState<Record<string, string>>({});
  const [desiredPrices, setDesiredPrices] = useState<Record<string, string>>({});
  const [promoDiscounts, setPromoDiscounts] = useState<Record<string, string>>({});
  const [addedSellout, setAddedSellout] = useState<Record<string, string>>({});
  const [margSelloutInput, setMargSelloutInput] = useState<Record<string, string>>({});
  const [analiseSelect, setAnaliseSelect] = useState<Record<string, string>>({});
  const [specificList, setSpecificList] = useState<string[] | null>(null);
  const [specificFileName, setSpecificFileName] = useState("");
  const [specificNotFound, setSpecificNotFound] = useState<string[]>([]);
  const specificFileRef = useRef<HTMLInputElement>(null);

  const handleSpecificUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(d, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const rawCodes: string[] = [];
        for (const row of rows) {
          if (!row || row[0] == null) continue;
          const val = String(row[0]).trim();
          if (!val || /[a-zA-ZÀ-ú]/.test(val)) continue; // skip headers/text
          rawCodes.push(val);
        }
        const allProds = Object.values(data).flat();
        // Build lookup: both raw seqProd and stripped-leading-zeros version
        const prodByRaw = new Map<string, string>();
        allProds.forEach((p) => {
          prodByRaw.set(p.seqProd, p.seqProd);
          prodByRaw.set(p.seqProd.replace(/^0+/, ""), p.seqProd);
        });
        const matchedCodes: string[] = [];
        const notFound: string[] = [];
        for (const c of rawCodes) {
          const matched = prodByRaw.get(c) ?? prodByRaw.get(c.replace(/^0+/, ""));
          if (matched) {
            matchedCodes.push(matched);
          } else {
            notFound.push(c);
          }
        }
        setSpecificList(matchedCodes);
        setSpecificFileName(file.name);
        setSpecificNotFound(notFound);
      } catch { /* ignore */ }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const allProducts = Object.values(data).flat();
  const base = selectedFilial === "all" ? allProducts : (data[selectedFilial] || []);

  const filtered = base
    .filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.seqProd.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
      const matchMarg = filterMarg === "all" || (filterMarg === "critico" ? p.marg < minMargin : p.marg >= minMargin);
      const matchBU = selectedBU === "all" || (selectedBU === "FOODS" ? isFoods(p.bu) : p.bu === selectedBU);
      const matchSpecific = !specificList || specificList.includes(p.seqProd);
      return matchSearch && matchMarg && matchBU && matchSpecific;
    })
    .sort((a, b) => {
      let va: string | number = a[sortCol];
      let vb: string | number = b[sortCol];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  // KPIs respeitam filtro de BU
  const buBase = selectedBU === "all" ? base : base.filter((p) => selectedBU === "FOODS" ? isFoods(p.bu) : p.bu === selectedBU);
  const criticos = buBase.filter((p) => p.marg < minMargin).length;
  const margMedia = buBase.length ? buBase.reduce((s, p) => s + p.marg, 0) / buBase.length : 0;
  const totalEstoque = buBase.reduce((s, p) => s + p.estoque, 0);

  // Contagens por BU para os badges
  const countFoods = base.filter((p) => isFoods(p.bu)).length;
  const countHC    = base.filter((p) => p.bu === "HC").length;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) =>
    sortCol === col ? (
      <span style={{ color: "#0071e3", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span style={{ color: "#d1d5db", marginLeft: 4 }}>↕</span>
    );

  const ThBtn = ({ col, children }: { col: typeof sortCol; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "11px 16px", textAlign: "left", color: sortCol === col ? "#0071e3" : "#6b7280",
        fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap",
        cursor: "pointer", userSelect: "none",
        borderBottom: `2px solid ${sortCol === col ? "rgba(0,113,227,0.12)" : "#e5e7eb"}`,
      }}
    >
      {children}<SortIcon col={col} />
    </th>
  );

  // Export XLSX
  const exportXLSX = () => {
    const header = ["BU","Cód. Família","Filial","Código","Descrição","Unid/CX","Estoque","Custo Liq (R$)","Sell Out (R$)","Preço Venda (R$)","Promoção (R$)","Margem (%)","Status Margem","Margem com Sell Out (%)","Adicionar Sell Out (R$)","Margem Desejada (%)","Preço Futuro (R$)","Preço Desejado (R$)","Margem Futura (%)","Desconto Promocional (%)","Preço Futuro Final (R$)","Análise"];
    const rows = filtered.map((p) => {
      const key = `${p.filial}-${p.seqProd}`;
      // Margem com Sell Out
      const margSellVal = margSelloutInput[key] || "";
      const margSellNum = margSellVal ? num(margSellVal) : NaN;
      // Adicionar Sell Out (calculado)
      let adicionarSellout = "";
      if (!isNaN(margSellNum) && margSellNum > 0 && margSellNum < 100) {
        const precoAlvo = p.promoc > 0 ? p.promoc : p.atual;
        if (precoAlvo > 0) {
          const custoMaximo = precoAlvo * (1 - margSellNum / 100);
          const selloutNecessario = p.custoLiq - custoMaximo;
          adicionarSellout = selloutNecessario > 0 ? selloutNecessario.toFixed(2) : "";
        }
      }
      // Margem desejada / Preço futuro
      const raw = desiredMargins[key];
      const margDes = raw ? parseFloat(raw.replace(",", ".")) : NaN;
      const futuro = !isNaN(margDes) && margDes < 100 ? p.custoLiq / (1 - margDes / 100) : NaN;
      const rawPreco = desiredPrices[key];
      const precoDesejado = rawPreco ? parseFloat(rawPreco.replace(",", ".")) : NaN;
      const margFutura = !isNaN(precoDesejado) && precoDesejado > 0 ? (((precoDesejado - p.custoLiq) / precoDesejado) * 100).toFixed(2) : "";
      const rawDesc = promoDiscounts[key];
      const descPerc = rawDesc ? parseFloat(rawDesc.replace(",", ".")) : NaN;
      const basePreco = !isNaN(precoDesejado) && precoDesejado > 0 ? precoDesejado : futuro;
      const precoFuturoFinal = !isNaN(basePreco) && !isNaN(descPerc) ? (basePreco - (basePreco * descPerc / 100)).toFixed(2) : "";
      return [
        p.bu,
        p.familia,
        FILIAL_INFO[p.filial]?.nome || p.filial,
        p.seqProd,
        p.descricao,
        p.embCmp || "",
        p.estoque,
        p.custoLiq,
        p.sellout,
        p.atual,
        p.promoc ?? 0,
        p.marg / 100,
        p.marg >= minMargin ? "Saudável" : "Crítico",
        margSellVal ? margSellNum / 100 : "",
        adicionarSellout ? parseFloat(adicionarSellout) : "",
        raw ? margDes / 100 : "",
        !isNaN(futuro) ? futuro : "",
        rawPreco ? precoDesejado : "",
        margFutura ? parseFloat(margFutura) / 100 : "",
        rawDesc ? descPerc / 100 : "",
        precoFuturoFinal ? parseFloat(precoFuturoFinal) : "",
        analiseSelect[key] || "",
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Auto-ajustar largura das colunas
    ws["!cols"] = header.map((h, i) => {
      const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? "").length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    // Aplicar formatação de moeda e porcentagem
    const fmtMoeda = 'R$ #,##0.00';
    const fmtPerc = '0.00%';
    // Índices das colunas (0-based): 7=Custo, 8=Sellout, 9=Venda, 10=Promo, 11=Margem, 13=MargSellout, 14=AddSellout, 15=MargDesejada, 16=PrecoFuturo, 17=PrecoDesejado, 18=MargFutura, 19=DescPromo, 20=PrecoFutFinal
    const moedaCols = [7, 8, 9, 10, 14, 16, 17, 20];
    const percCols = [11, 13, 15, 18, 19];
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (const C of moedaCols) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === "number") ws[addr].z = fmtMoeda;
      }
      for (const C of percCols) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === "number") ws[addr].z = fmtPerc;
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análise de Custos");
    XLSX.writeFile(wb, "analise_custos.xlsx");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header + export */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#1f2937" }}>
            📋 Análise de Custos
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Produtos da sua base cruzados com os dados das filiais
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setDesiredMargins({});
              setDesiredPrices({});
              setPromoDiscounts({});
              setBulkMargin("");
              setBulkDiscount("");
            }}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid #991b1b",
              background: "#fef2f2", color: "#dc2626", cursor: "pointer",
              fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
            }}
          >
             🗑️ Limpar Tudo
          </button>
          <button
            onClick={exportXLSX}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid #bbf7d0",
              background: "#f0fdf4", color: "#16a34a", cursor: "pointer",
              fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            ⬇️ Exportar Excel
          </button>
          <input
            ref={specificFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={handleSpecificUpload}
          />
          {specificList ? (
            <button
              onClick={() => { setSpecificList(null); setSpecificFileName(""); setSpecificNotFound([]); }}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "1px solid #b45309",
                background: "#451a03", color: "#d97706", cursor: "pointer",
                fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ✕ {specificFileName} ({specificList.length} itens)
            </button>
          ) : (
            <button
              onClick={() => specificFileRef.current?.click()}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "1px solid #1e40af",
                background: "#dbeafe", color: "#0071e3", cursor: "pointer",
                fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              📋 Upload Lista Específica
            </button>
          )}
        </div>

        {specificNotFound.length > 0 && (
          <div style={{
            margin: "12px 0", padding: "14px 18px", borderRadius: 10,
            background: "#451a03", border: "1px solid #b45309", color: "#d97706",
          }}>
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              ⚠️ {specificNotFound.length} código(s) não encontrado(s) nos dados:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {specificNotFound.map((code) => (
                <span key={code} style={{
                  background: "#78350f", padding: "2px 10px", borderRadius: 6,
                  fontSize: 12, fontFamily: "monospace",
                }}>
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BU filter — destaque visual no topo */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Categoria:</span>
        {([
          { key: "all",   label: "Todas",  icon: "🏢", count: base.length },
          { key: "FOODS", label: "Foods",  icon: "🍽️", count: countFoods },
          { key: "HC",    label: "HC",     icon: "🧴", count: countHC },
        ] as const).map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setSelectedBU(key)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 18px", borderRadius: 10, border: "2px solid", cursor: "pointer",
              fontSize: 13, fontWeight: 700, transition: "all .2s",
              background: selectedBU === key
                ? (key === "FOODS" ? "#f0fdf4" : key === "HC" ? "#ffffff" : "rgba(0,113,227,0.12)")
                : "#fafafa",
              color: selectedBU === key
                ? (key === "FOODS" ? "#16a34a" : key === "HC" ? "#a78bfa" : "#0071e3")
                : "#6b7280",
              borderColor: selectedBU === key
                ? (key === "FOODS" ? "#bbf7d0" : key === "HC" ? "#6d28d9" : "#1d4ed8")
                : "#e5e7eb",
            }}
          >
            <span>{icon}</span>
            {label}
            <span style={{
              padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: selectedBU === key ? "rgba(255,255,255,0.1)" : "#e5e7eb",
              color: selectedBU === key
                ? (key === "FOODS" ? "#16a34a" : key === "HC" ? "#a78bfa" : "#0071e3")
                : "#6b7280",
            }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Margem mínima */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#9ca3af", fontSize: 13, fontWeight: 600 }}>Margem mínima:</span>
        <div style={{ position: "relative", width: 120 }}>
          <input
            type="number"
            value={minMargin}
            onChange={(e) => setMinMargin(Number(e.target.value) || 0)}
            style={{
              width: "100%", padding: "6px 28px 6px 12px",
              background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8,
              color: "#1f2937", fontSize: 14, fontWeight: 700, outline: "none",
              textAlign: "center",
            }}
          />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: 13, pointerEvents: "none" }}>%</span>
        </div>
        <span style={{ color: "#6b7280", fontSize: 11 }}>Produtos abaixo desse valor serão considerados críticos</span>

        <div style={{ width: 1, height: 24, background: "#e5e7eb", margin: "0 6px" }} />

        <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>⚡ Aplicar margem nos críticos:</span>
        <div style={{ position: "relative", width: 120 }}>
          <input
            type="number"
            value={bulkMargin}
            onChange={(e) => setBulkMargin(e.target.value)}
            placeholder="ex: 20"
            style={{
              width: "100%", padding: "6px 28px 6px 12px",
              background: "#fef9c3", border: "1px solid #854d0e", borderRadius: 8,
              color: "#fff", fontSize: 14, fontWeight: 700, outline: "none",
              textAlign: "center",
            }}
          />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#d97706", fontSize: 13, pointerEvents: "none" }}>%</span>
        </div>
        <button
          onClick={() => {
            const val = bulkMargin.replace(",", ".");
            if (!val || isNaN(Number(val))) return;
            const criticosItems = buBase.filter((p) => p.marg < minMargin);
            const newMargins = { ...desiredMargins };
            criticosItems.forEach((p) => {
              newMargins[`${p.filial}-${p.seqProd}`] = val;
            });
            setDesiredMargins(newMargins);
          }}
          style={{
            padding: "6px 16px", borderRadius: 8, border: "1px solid #854d0e",
            background: "#451a03", color: "#d97706", cursor: "pointer",
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          Aplicar
        </button>

        <div style={{ width: 1, height: 24, background: "#e5e7eb", margin: "0 6px" }} />

        <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: 600 }}>🏷️ Desconto promocional geral:</span>
        <div style={{ position: "relative", width: 120 }}>
          <input
            type="number"
            value={bulkDiscount}
            onChange={(e) => setBulkDiscount(e.target.value)}
            placeholder="ex: 10"
            style={{
              width: "100%", padding: "6px 28px 6px 12px",
              background: "#f3e8ff", border: "1px solid #6d28d9", borderRadius: 8,
              color: "#fff", fontSize: 14, fontWeight: 700, outline: "none",
              textAlign: "center",
            }}
          />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#7c3aed", fontSize: 13, pointerEvents: "none" }}>%</span>
        </div>
        <button
          onClick={() => {
            const val = bulkDiscount.replace(",", ".");
            if (!val || isNaN(Number(val))) return;
            const newDiscounts = { ...promoDiscounts };
            buBase.forEach((p) => {
              newDiscounts[`${p.filial}-${p.seqProd}`] = val;
            });
            setPromoDiscounts(newDiscounts);
          }}
          style={{
            padding: "6px 16px", borderRadius: 8, border: "1px solid #6d28d9",
            background: "#f3e8ff", color: "#7c3aed", cursor: "pointer",
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          Aplicar
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KpiCard label="Produtos Analisados" value={String(buBase.length)} sub={selectedBU === "all" ? "todas as categorias" : selectedBU} color="#0071e3" icon="📦" />
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= minMargin ? "#16a34a" : "#dc2626"} icon="📊" />
        <div onClick={() => setFilterMarg(filterMarg === "critico" ? "all" : "critico")} className="cursor-pointer">
          <KpiCard label={`Críticos (< ${minMargin}%)`} value={String(criticos)} sub={`${buBase.length ? ((criticos/buBase.length)*100).toFixed(0) : 0}% do mix${filterMarg === "critico" ? " • filtro ativo" : ""}`} color="#dc2626" icon="🚨" />
        </div>
        <KpiCard label="Estoque Total" value={totalEstoque.toLocaleString("pt-BR")} sub="caixas" color="#a78bfa" icon="🏭" />
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código ou descrição..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8,
              color: "#1f2937", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Filial filter */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", ...FILIAIS] as (Filial | "all")[]).map((f) => (
            <button key={f} onClick={() => setSelectedFilial(f)} style={{
              padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              background: selectedFilial === f ? (f === "all" ? "rgba(0,113,227,0.12)" : FILIAL_INFO[f as Filial].cor + "33") : "#ffffff",
              color: selectedFilial === f ? (f === "all" ? "#0071e3" : FILIAL_INFO[f as Filial].cor) : "#6b7280",
              borderWidth: 1, borderStyle: "solid",
              borderColor: selectedFilial === f ? (f === "all" ? "#3B82F6" : FILIAL_INFO[f as Filial].cor) : "#e5e7eb",
            }}>
              {f === "all" ? "Todas" : FILIAL_INFO[f as Filial].nome}
            </button>
          ))}
        </div>

        {/* Margin filter */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {(["all","critico","ok"] as const).map((v) => (
            <button key={v} onClick={() => setFilterMarg(v)} style={{
              padding: "6px 14px", borderRadius: 99, border: "1px solid", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              background: filterMarg === v ? (v === "critico" ? "#fef2f2" : v === "ok" ? "#f0fdf4" : "rgba(0,113,227,0.12)") : "#ffffff",
              color: filterMarg === v ? (v === "critico" ? "#dc2626" : v === "ok" ? "#16a34a" : "#0071e3") : "#6b7280",
              borderColor: filterMarg === v ? (v === "critico" ? "#fecaca" : v === "ok" ? "#bbf7d0" : "#1d4ed8") : "#e5e7eb",
            }}>
              {v === "all" ? "Todos" : v === "critico" ? "🚨 Críticos" : "✅ Saudáveis"}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Exibindo <strong style={{ color: "#9ca3af" }}>{Math.min(filtered.length, 500)}</strong> de <strong style={{ color: "#9ca3af" }}>{filtered.length}</strong> produtos
        {search && <span> · filtrado por "<em style={{ color: "#0071e3" }}>{search}</em>"</span>}
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 4px 24px #00000040" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 3, background: "#fafafa" }}>
                Filial
              </th>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", position: "sticky", left: 120, zIndex: 3, background: "#fafafa" }}>
                BU
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", position: "sticky", left: 190, zIndex: 3, background: "#fafafa" }}>
                Cód. Família
              </th>
              <th onClick={() => toggleSort("seqProd")} style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", cursor: "pointer", position: "sticky", left: 300, zIndex: 3, background: "#fafafa" }}>
                Código {sortCol === "seqProd" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
              </th>
              <th onClick={() => toggleSort("descricao")} style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", cursor: "pointer", position: "sticky", left: 400, zIndex: 3, background: "#fafafa", borderRight: "2px solid #d1d5db" }}>
                Descrição {sortCol === "descricao" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Unid/CX
              </th>
              <ThBtn col="estoque">Estoque</ThBtn>
              <th style={{ padding: "11px 16px", textAlign: "right", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                DDV
              </th>
              <ThBtn col="custoLiq">Custo Liq</ThBtn>
              <ThBtn col="sellout">Sell Out</ThBtn>
              <ThBtn col="atual">Preço Venda</ThBtn>
              <ThBtn col="promoc">Promoção</ThBtn>
              <ThBtn col="marg">Margem</ThBtn>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb" }}>
                Status
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#0ea5e9", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Margem com Sell Out
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#16a34a", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Adicionar Sell Out
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#d97706", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Margem Desejada
              </th>
              <th style={{ padding: "11px 16px", textAlign: "right", color: "#d97706", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Preço Futuro
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#38bdf8", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Preço Desejado
              </th>
              <th style={{ padding: "11px 16px", textAlign: "right", color: "#38bdf8", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Margem Futura
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#c084fc", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Desconto Promocional
              </th>
              <th style={{ padding: "11px 16px", textAlign: "right", color: "#c084fc", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Preço Futuro Final
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#ef4444", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                Análise
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((p, i) => {
              const ok = p.marg >= minMargin;
              const rowBg = p.marg < 10 ? "#fef2f2" : p.marg < minMargin ? "#fff7ed" : i % 2 === 0 ? "#fafafa" : "#f9fafb";
              return (
                <tr
                  key={`${p.filial}-${p.seqProd}-${i}`}
                  style={{ borderBottom: "1px solid #ffffff", background: rowBg, transition: "background .15s" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f3f4f6")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = rowBg)}
                >
                  {/* Filial */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1, background: rowBg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>
                        {FILIAL_INFO[p.filial]?.nome || p.filial}
                      </span>
                    </div>
                  </td>

                  {/* BU */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap", position: "sticky", left: 120, zIndex: 1, background: rowBg }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 6,
                      fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                      background: isFoods(p.bu) ? "#f0fdf4" : "#eef2ff",
                      color:      isFoods(p.bu) ? "#16a34a"  : "#a78bfa",
                      border: `1px solid ${isFoods(p.bu) ? "#bbf7d0" : "#4c1d95"}`,
                    }}>
                      {p.bu || "–"}
                    </span>
                  </td>

                  {/* Cód. Família */}
                  <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap", position: "sticky", left: 190, zIndex: 1, background: rowBg }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>
                      {p.familia || "–"}
                    </span>
                  </td>

                  {/* Código */}
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#0071e3", whiteSpace: "nowrap", position: "sticky", left: 300, zIndex: 1, background: rowBg }}>
                    {p.seqProd}
                  </td>

                  {/* Descrição */}
                  <td style={{ padding: "10px 16px", maxWidth: 260, position: "sticky", left: 400, zIndex: 1, background: rowBg, borderRight: "2px solid #e5e7eb" }}>
                    <div style={{ color: "#1f2937", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.descricao}>
                      {p.descricao}
                    </div>
                  </td>

                  {/* Unid/CX */}
                  <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>
                      {p.embCmp || "–"}
                    </span>
                  </td>

                  {/* Estoque */}
                  <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontFamily: "monospace", fontWeight: 700, fontSize: 13,
                      color: p.estoque === 0 ? "#dc2626" : p.estoque < 5 ? "#fb923c" : "#1f2937",
                    }}>
                      {p.estoque.toLocaleString("pt-BR")}
                    </span>
                    {p.estoque === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: "#dc2626" }}>RUPTURA</span>}
                  </td>

                  {/* DDV */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontWeight: 600, fontSize: 13,
                      color: !p.ddv ? "#9ca3af" : p.ddv < 7 ? "#dc2626" : p.ddv > 40 ? "#0071e3" : "#16a34a",
                    }}>
                      {p.ddv ? `${p.ddv} d` : "–"}
                    </span>
                  </td>

                  {/* Custo Liq */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", color: "#9ca3af", whiteSpace: "nowrap" }}>
                    R$ {p.custoLiq.toFixed(2)}
                  </td>

                  {/* Sell Out */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", color: "#38bdf8", whiteSpace: "nowrap" }}>
                    R$ {p.sellout.toFixed(2)}
                  </td>

                  {/* Preço Venda */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap" }}>
                    R$ {p.atual.toFixed(2)}
                  </td>

                  {/* Promoção */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", color: "#c084fc", whiteSpace: "nowrap" }}>
                    R$ {(p.promoc ?? 0).toFixed(2)}
                  </td>

                  {/* Margem */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontFamily: "monospace", fontWeight: 600, fontSize: 13,
                        color: p.marg < 10 ? "#f43f5e" : p.marg < minMargin ? "#dc2626" : p.marg < 25 ? "#d97706" : "#16a34a",
                      }}>
                        {p.marg.toFixed(1)}%
                      </span>
                      <div style={{ width: 48, background: "#e5e7eb", borderRadius: 99, height: 5, flexShrink: 0 }}>
                        <div style={{
                          height: 5, borderRadius: 99,
                          width: `${Math.min((p.marg / 40) * 100, 100)}%`,
                          background: p.marg < 10 ? "#f43f5e" : p.marg < minMargin ? "#dc2626" : p.marg < 25 ? "#d97706" : "#16a34a",
                        }} />
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 99,
                      fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                      background: ok ? "#f0fdf4" : "#fef2f2",
                      color: ok ? "#16a34a" : "#dc2626",
                      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
                    }}>
                      {ok ? "✓ Saudável" : "✗ Crítico"}
                    </span>
                  </td>

                  {/* Margem com Sell Out */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={margSelloutInput[`${p.filial}-${p.seqProd}`] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, "");
                        setMargSelloutInput((prev) => ({ ...prev, [`${p.filial}-${p.seqProd}`]: val }));
                      }}
                      style={{
                        width: 70, padding: "5px 8px", borderRadius: 6,
                        background: "#ffffff", border: "1px solid #d1d5db", color: "#0ea5e9",
                        fontSize: 13, fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                        outline: "none",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#0ea5e9")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    />
                  </td>

                  {/* Adicionar Sell Out (calculado) */}
                  <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "monospace", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                    {(() => {
                      const key = `${p.filial}-${p.seqProd}`;
                      const margInput = margSelloutInput[key];
                      if (!margInput) return <span style={{ color: "#9ca3af" }}>—</span>;
                      const margDesejada = num(margInput);
                      if (margDesejada <= 0 || margDesejada >= 100) return <span style={{ color: "#9ca3af" }}>—</span>;
                      const precoAlvo = p.promoc > 0 ? p.promoc : p.atual;
                      if (precoAlvo <= 0) return <span style={{ color: "#9ca3af" }}>—</span>;
                      const custoMaximo = precoAlvo * (1 - margDesejada / 100);
                      const selloutNecessario = p.custoLiq - custoMaximo;
                      if (selloutNecessario <= 0) return <span style={{ color: "#16a34a" }}>—</span>;
                      return <span style={{ color: "#16a34a" }}>R$ {selloutNecessario.toFixed(2)}</span>;
                    })()}
                  </td>

                  {/* Margem Desejada */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={desiredMargins[`${p.filial}-${p.seqProd}`] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, "");
                        setDesiredMargins((prev) => ({ ...prev, [`${p.filial}-${p.seqProd}`]: val }));
                      }}
                      style={{
                        width: 70, padding: "5px 8px", borderRadius: 6,
                        background: "#ffffff", border: "1px solid #d1d5db", color: "#d97706",
                        fontSize: 13, fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                        outline: "none",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#d97706")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    />
                  </td>

                  {/* Preço Futuro */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {(() => {
                      const raw = desiredMargins[`${p.filial}-${p.seqProd}`];
                      if (!raw) return <span style={{ color: "#d1d5db" }}>—</span>;
                      const margDes = parseFloat(raw.replace(",", "."));
                      if (isNaN(margDes) || margDes >= 100) return <span style={{ color: "#dc2626" }}>—</span>;
                      const futuro = p.custoLiq / (1 - margDes / 100);
                      return <span style={{ color: "#d97706" }}>R$ {futuro.toFixed(2)}</span>;
                    })()}
                  </td>

                  {/* Preço Desejado */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={desiredPrices[`${p.filial}-${p.seqProd}`] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, "");
                        setDesiredPrices((prev) => ({ ...prev, [`${p.filial}-${p.seqProd}`]: val }));
                      }}
                      style={{
                        width: 80, padding: "5px 8px", borderRadius: 6,
                        background: "#ffffff", border: "1px solid #d1d5db", color: "#38bdf8",
                        fontSize: 13, fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                        outline: "none",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#38bdf8")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    />
                  </td>

                  {/* Margem Futura */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {(() => {
                      const raw = desiredPrices[`${p.filial}-${p.seqProd}`];
                      if (!raw) return <span style={{ color: "#d1d5db" }}>—</span>;
                      const precoDesejado = parseFloat(raw.replace(",", "."));
                      if (isNaN(precoDesejado) || precoDesejado <= 0) return <span style={{ color: "#dc2626" }}>—</span>;
                      const margFutura = ((precoDesejado - p.custoLiq) / precoDesejado) * 100;
                      const cor = margFutura < 10 ? "#f43f5e" : margFutura < minMargin ? "#dc2626" : margFutura < 25 ? "#d97706" : "#16a34a";
                      return <span style={{ color: cor }}>{margFutura.toFixed(1)}%</span>;
                    })()}
                  </td>

                  {/* Desconto Promocional */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={promoDiscounts[`${p.filial}-${p.seqProd}`] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, "");
                        setPromoDiscounts((prev) => ({ ...prev, [`${p.filial}-${p.seqProd}`]: val }));
                      }}
                      style={{
                        width: 70, padding: "5px 8px", borderRadius: 6,
                        background: "#ffffff", border: "1px solid #d1d5db", color: "#c084fc",
                        fontSize: 13, fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                        outline: "none",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#c084fc")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    />
                  </td>

                  {/* Preço Futuro Final */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {(() => {
                      const rawDesc = promoDiscounts[`${p.filial}-${p.seqProd}`];
                      if (!rawDesc) return <span style={{ color: "#d1d5db" }}>—</span>;
                      const descPerc = parseFloat(rawDesc.replace(",", "."));
                      if (isNaN(descPerc)) return <span style={{ color: "#dc2626" }}>—</span>;

                      const rawPreco = desiredPrices[`${p.filial}-${p.seqProd}`];
                      const precoDesejado = rawPreco ? parseFloat(rawPreco.replace(",", ".")) : NaN;

                      const rawMarg = desiredMargins[`${p.filial}-${p.seqProd}`];
                      const margDes = rawMarg ? parseFloat(rawMarg.replace(",", ".")) : NaN;
                      const futuro = !isNaN(margDes) && margDes < 100 ? p.custoLiq / (1 - margDes / 100) : NaN;

                      const base = !isNaN(precoDesejado) && precoDesejado > 0 ? precoDesejado : futuro;
                      if (isNaN(base)) return <span style={{ color: "#d1d5db" }}>—</span>;

                      const final_ = base - (base * descPerc / 100);
                      return <span style={{ color: "#c084fc" }}>R$ {final_.toFixed(2)}</span>;
                    })()}
                  </td>

                  {/* Análise */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <select
                      value={analiseSelect[`${p.filial}-${p.seqProd}`] || ""}
                      onChange={(e) => setAnaliseSelect((prev) => ({ ...prev, [`${p.filial}-${p.seqProd}`]: e.target.value }))}
                      style={{
                        width: 140, padding: "5px 6px", borderRadius: 6,
                        background: "#ffffff", border: "1px solid #d1d5db", color: analiseSelect[`${p.filial}-${p.seqProd}`] ? "#1f2937" : "#9ca3af",
                        fontSize: 11, fontWeight: 600, outline: "none", cursor: "pointer",
                      }}
                    >
                      <option value="">Selecione</option>
                      <option value="Margem Baixa">Margem Baixa</option>
                      <option value="Estoque Zerado">Estoque Zerado</option>
                      <option value="Custo Zerado Com Estoque">Custo Zerado Com Estoque</option>
                      <option value="Estoque Baixo">Estoque Baixo</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ fontWeight: 700, color: "#6b7280" }}>Nenhum produto encontrado</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tente ajustar os filtros ou a busca</div>
          </div>
        )}

        {filtered.length > 500 && (
          <div style={{ textAlign: "center", padding: "12px 20px", color: "#6b7280", fontSize: 12, borderTop: "1px solid #e5e7eb" }}>
            Exibindo primeiros 500 resultados. Use os filtros para refinar.
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11, color: "#6b7280" }}>
        <span><span style={{ color: "#f43f5e" }}>●</span> Margem &lt; 10% — Crítico grave</span>
        <span><span style={{ color: "#dc2626" }}>●</span> 10–17% — Abaixo da meta</span>
        <span><span style={{ color: "#d97706" }}>●</span> 17–25% — Aceitável</span>
        <span><span style={{ color: "#16a34a" }}>●</span> &gt; 25% — Saudável</span>
        <span><span style={{ color: "#dc2626" }}>●</span> RUPTURA — Estoque zerado</span>
      </div>
    </div>
  );
}

// ─── Analysis Views ───────────────────────────────────────────────────────────
function PrecoAnalysis({ data }: { data: FilialData }) {
  const [selectedFilial, setSelectedFilial] = useState<Filial | "all">("all");
  const [sortBy, setSortBy] = useState<"marg" | "atual" | "sellout">("marg");
  const [filter, setFilter] = useState<"all" | "critico" | "ok">("all");

  const allProducts = Object.values(data).flat();
  const products = selectedFilial === "all"
    ? allProducts
    : data[selectedFilial] || [];

  const filtered = products
    .filter((p) => {
      if (filter === "critico") return p.marg < 17;
      if (filter === "ok") return p.marg >= 17;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "marg") return a.marg - b.marg;
      if (sortBy === "atual") return b.atual - a.atual;
      return b.sellout - a.sellout;
    });

  const criticos = products.filter((p) => p.marg < 17).length;
  const ok = products.filter((p) => p.marg >= 17).length;
  const margMedia = products.length
    ? products.reduce((s, p) => s + p.marg, 0) / products.length
    : 0;
  const maxSellout = Math.max(...products.map((p) => p.sellout), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#16a34a" : "#dc2626"} icon="📊" />
        <KpiCard label="Produtos Críticos" value={String(criticos)} sub="Margem < 17%" color="#dc2626" icon="🚨" />
        <KpiCard label="Produtos Saudáveis" value={String(ok)} sub="Margem ≥ 17%" color="#16a34a" icon="✅" />
        <KpiCard label="Total Analisado" value={String(products.length)} sub="produtos" color="#0071e3" icon="📦" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#6b7280", fontSize: 12 }}>Filial:</span>
        {(["all", ...FILIAIS] as (Filial | "all")[]).map((f) => (
          <button
            key={f}
            onClick={() => setSelectedFilial(f)}
            style={{
              padding: "5px 14px",
              borderRadius: 99,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: selectedFilial === f
                ? (f === "all" ? "#3B82F6" : FILIAL_INFO[f as Filial].cor)
                : "#e5e7eb",
              color: selectedFilial === f ? "#fff" : "#6b7280",
              transition: "all .2s",
            }}
          >
            {f === "all" ? "Todas" : FILIAL_INFO[f as Filial].nome}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {(["all", "critico", "ok"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              style={{
                padding: "5px 14px",
                borderRadius: 99,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: filter === v ? (v === "critico" ? "#fecaca" : v === "ok" ? "#f0fdf4" : "rgba(0,113,227,0.12)") : "#e5e7eb",
                color: filter === v ? (v === "critico" ? "#dc2626" : v === "ok" ? "#16a34a" : "#0071e3") : "#6b7280",
              }}
            >
              {v === "all" ? "Todos" : v === "critico" ? "🚨 Críticos" : "✅ Saudáveis"}
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              background: "#e5e7eb",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              color: "#1f2937",
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="marg">↑ Menor Margem</option>
            <option value="atual">↓ Maior Preço</option>
            <option value="sellout">↓ Maior Sellout</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
              {["Filial", "Cód.", "Descrição", "Emb", "ABC", "Custo Liq", "Preço Venda", "Margem", "Sellout"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    color: "#6b7280",
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((p, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  background: i % 2 === 0 ? "#fafafa" : "#f3f4f6",
                  transition: "background .15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#ffffff")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#fafafa" : "#f3f4f6")}
              >
                <td style={{ padding: "8px 14px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: FILIAL_INFO[p.filial]?.cor || "#6b7280",
                      marginRight: 6,
                    }}
                  />
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>
                    {FILIAL_INFO[p.filial]?.nome || p.filial}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", color: "#6b7280", fontFamily: "monospace" }}>
                  {p.seqProd}
                </td>
                <td style={{ padding: "8px 14px", color: "#1f2937", maxWidth: 220 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.descricao}
                  </div>
                </td>
                <td style={{ padding: "8px 14px", color: "#6b7280" }}>{p.embVir}</td>
                <td style={{ padding: "8px 14px" }}><ABCBadge abc={p.abc} /></td>
                <td style={{ padding: "8px 14px", color: "#9ca3af", fontFamily: "monospace" }}>
                  R$ {p.custoLiq.toFixed(2)}
                </td>
                <td style={{ padding: "8px 14px", color: "#1f2937", fontFamily: "monospace", fontWeight: 700 }}>
                  R$ {p.atual.toFixed(2)}
                </td>
                <td style={{ padding: "8px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MargemBadge marg={p.marg} />
                    <ProgressBar value={p.marg} max={40} color={p.marg >= 17 ? "#16a34a" : "#dc2626"} />
                  </div>
                </td>
                <td style={{ padding: "8px 14px", color: "#9ca3af", fontFamily: "monospace" }}>
                  {p.sellout.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Nenhum produto encontrado com os filtros selecionados.
          </div>
        )}
        {filtered.length > 200 && (
          <div style={{ textAlign: "center", padding: 12, color: "#6b7280", fontSize: 12 }}>
            Exibindo 200 de {filtered.length} produtos
          </div>
        )}
      </div>

      {/* Sellout chart by filial */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 20 }}>
        <h3 style={{ color: "#1f2937", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          Sellout por Filial
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FILIAIS.map((f) => {
            const prods = data[f] || [];
            const total = prods.reduce((s, p) => s + p.sellout, 0);
            const maxTotal = Math.max(...FILIAIS.map((ff) => (data[ff] || []).reduce((s, p) => s + p.sellout, 0)), 1);
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 110, fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>
                  {FILIAL_INFO[f].nome}
                </span>
                <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 99, height: 12 }}>
                  <div
                    style={{
                      height: 12,
                      borderRadius: 99,
                      width: `${(total / maxTotal) * 100}%`,
                      background: FILIAL_INFO[f].cor,
                      transition: "width .6s",
                    }}
                  />
                </div>
                <span style={{ width: 60, fontSize: 12, color: FILIAL_INFO[f].cor, fontFamily: "monospace", textAlign: "right" }}>
                  {total.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EstoqueAnalysis({ data }: { data: FilialData }) {
  const allProducts = Object.values(data).flat();

  const [selectedFilial, setSelectedFilial] = useState<Filial | "all">("all");
  const [selectedBU, setSelectedBU] = useState<"all" | "FOODS" | "HC">("all");
  const [filtro, setFiltro] = useState<"todos" | "sem" | "baixo" | "ok" | "alto">("todos");
  const [estSortCol, setEstSortCol] = useState<string>("estoque");
  const [estSortDir, setEstSortDir] = useState<"asc" | "desc">("desc");

  const toggleEstSort = (col: string) => {
    if (estSortCol === col) setEstSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setEstSortCol(col); setEstSortDir("desc"); }
  };

  const EstSortIcon = ({ col }: { col: string }) =>
    estSortCol === col ? (
      <span style={{ color: "#0071e3", marginLeft: 4 }}>{estSortDir === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span style={{ color: "#d1d5db", marginLeft: 4 }}>↕</span>
    );

  const base = selectedFilial === "all" ? allProducts : (data[selectedFilial] || []);
  const buBase = selectedBU === "all" ? base : base.filter((p) => selectedBU === "FOODS" ? isFoods(p.bu) : p.bu === selectedBU);

  const semEstoque = buBase.filter((p) => p.estoque === 0).length;
  const estoqueBaixo = buBase.filter((p) => p.estoque > 0 && p.ddv < 7).length;
  const estoqueOk = buBase.filter((p) => p.estoque > 0 && p.ddv > 7 && p.ddv < 40).length;
  const estoqueAlto = buBase.filter((p) => p.estoque > 0 && p.ddv > 40).length;

  const totalValorCusto = buBase.reduce((s, p) => {
    const v = p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.custoLiq;
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const totalValorVenda = buBase.reduce((s, p) => {
    const v = p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.atual;
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const countFoods = base.filter((p) => isFoods(p.bu)).length;
  const countHC = base.filter((p) => p.bu === "HC").length;

  const filtered = buBase.filter((p) => {
    if (filtro === "sem") return p.estoque === 0;
    if (filtro === "baixo") return p.estoque > 0 && p.ddv < 7;
    if (filtro === "ok") return p.estoque > 0 && p.ddv > 7 && p.ddv < 40;
    if (filtro === "alto") return p.estoque > 0 && p.ddv > 40;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* BU filter */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Categoria:</span>
        {([
          { key: "all",   label: "Todas",  icon: "🏢", count: base.length },
          { key: "FOODS", label: "Foods",  icon: "🍽️", count: countFoods },
          { key: "HC",    label: "HC",     icon: "🧴", count: countHC },
        ] as const).map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setSelectedBU(key)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 18px", borderRadius: 10, border: "2px solid", cursor: "pointer",
              fontSize: 13, fontWeight: 700, transition: "all .2s",
              background: selectedBU === key
                ? (key === "FOODS" ? "#f0fdf4" : key === "HC" ? "#ffffff" : "rgba(0,113,227,0.12)")
                : "#fafafa",
              color: selectedBU === key
                ? (key === "FOODS" ? "#16a34a" : key === "HC" ? "#a78bfa" : "#0071e3")
                : "#6b7280",
              borderColor: selectedBU === key
                ? (key === "FOODS" ? "#bbf7d0" : key === "HC" ? "#6d28d9" : "#1d4ed8")
                : "#e5e7eb",
            }}
          >
            <span>{icon}</span>
            {label}
            <span style={{
              padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: selectedBU === key ? "rgba(255,255,255,0.1)" : "#e5e7eb",
              color: selectedBU === key
                ? (key === "FOODS" ? "#16a34a" : key === "HC" ? "#a78bfa" : "#0071e3")
                : "#6b7280",
            }}>
              {count}
            </span>
          </button>
        ))}

        <div style={{ width: 1, height: 28, background: "#e5e7eb", margin: "0 6px" }} />

        {/* Filial filter */}
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Filial:</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", ...FILIAIS] as (Filial | "all")[]).map((f) => (
            <button key={f} onClick={() => setSelectedFilial(f)} style={{
              padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              background: selectedFilial === f ? (f === "all" ? "rgba(0,113,227,0.12)" : FILIAL_INFO[f as Filial].cor + "33") : "#ffffff",
              color: selectedFilial === f ? (f === "all" ? "#0071e3" : FILIAL_INFO[f as Filial].cor) : "#6b7280",
              borderWidth: 1, borderStyle: "solid",
              borderColor: selectedFilial === f ? (f === "all" ? "#3B82F6" : FILIAL_INFO[f as Filial].cor) : "#e5e7eb",
            }}>
              {f === "all" ? "Todas" : FILIAL_INFO[f as Filial].nome}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div onClick={() => setFiltro(filtro === "sem" ? "todos" : "sem")} style={{ cursor: "pointer", outline: filtro === "sem" ? "2px solid #dc2626" : "none", borderRadius: 16 }}>
          <KpiCard label="Sem Estoque" value={String(semEstoque)} sub="ruptura total" color="#dc2626" icon="📭" />
        </div>
        <div onClick={() => setFiltro(filtro === "baixo" ? "todos" : "baixo")} style={{ cursor: "pointer", outline: filtro === "baixo" ? "2px solid #fb923c" : "none", borderRadius: 16 }}>
          <KpiCard label="Estoque Baixo" value={String(estoqueBaixo)} sub="DDV < 7 dias" color="#fb923c" icon="⚠️" />
        </div>
        <div onClick={() => setFiltro(filtro === "ok" ? "todos" : "ok")} style={{ cursor: "pointer", outline: filtro === "ok" ? "2px solid #16a34a" : "none", borderRadius: 16 }}>
          <KpiCard label="Estoque OK" value={String(estoqueOk)} sub="DDV 7-40 dias" color="#16a34a" icon="📦" />
        </div>
        <div onClick={() => setFiltro(filtro === "alto" ? "todos" : "alto")} style={{ cursor: "pointer", outline: filtro === "alto" ? "2px solid #0071e3" : "none", borderRadius: 16 }}>
          <KpiCard label="Estoque Alto" value={String(estoqueAlto)} sub="DDV > 40 dias" color="#0071e3" icon="📈" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <div style={{ borderRadius: 16 }}>
          <KpiCard label="Estoque Valor Pr Custo" value={`R$ ${totalValorCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="somatória custo" color="#38bdf8" icon="💰" />
        </div>
        <div style={{ borderRadius: 16 }}>
          <KpiCard label="Estoque Valor Pr Venda" value={`R$ ${totalValorVenda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="somatória venda" color="#a78bfa" icon="🏷️" />
        </div>
      </div>
      {filtro !== "todos" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af" }}>
          <span>Filtrando: <strong style={{ color: "#1f2937" }}>{filtro === "sem" ? "Sem Estoque" : filtro === "baixo" ? "Estoque Baixo" : filtro === "ok" ? "Estoque OK" : "Estoque Alto"}</strong></span>
          <span onClick={() => setFiltro("todos")} style={{ cursor: "pointer", color: "#dc2626", textDecoration: "underline" }}>Limpar filtro</span>
        </div>
      )}
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
              {([
                { key: "filial", label: "Filial" },
                { key: "seqProd", label: "Cód." },
                { key: "descricao", label: "Descrição" },
                { key: "embCmp", label: "Unid/CX" },
                { key: "estoque", label: "Estoque" },
                { key: "custoLiq", label: "Preço de Custo" },
                { key: "valorCusto", label: "Estoque Valor Pr Custo" },
                { key: "atual", label: "Preço de Venda" },
                { key: "valorVenda", label: "Estoque Valor Pr Venda" },
                { key: "ddv", label: "DDV" },
                { key: "mesAnt", label: "Mes Ant" },
                { key: "mesAtu", label: "Mes Atu" },
                { key: "status", label: "Status" },
              ] as { key: string; label: string }[]).map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleEstSort(h.key)}
                  style={{ padding: "10px 14px", textAlign: "left", color: estSortCol === h.key ? "#0071e3" : "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", borderBottom: `2px solid ${estSortCol === h.key ? "rgba(0,113,227,0.12)" : "#e5e7eb"}` }}
                >
                  {h.label}<EstSortIcon col={h.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered
              .map((p) => ({
                ...p,
                valorCusto: p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.custoLiq,
                valorVenda: p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.atual,
                status: p.ddv === 0 || p.estoque === 0 ? 0 : p.ddv < 7 ? 1 : p.ddv > 40 ? 3 : 2,
              }))
              .sort((a, b) => {
                const numVal = (item: typeof a, col: string): number => {
                  const raw = item[col as keyof typeof item];
                  if (raw == null) return 0;
                  if (typeof raw === "number") return raw;
                  // Handle pt-BR formatted strings like "18.616,2"
                  const s = String(raw).replace(/\./g, "").replace(",", ".");
                  return parseFloat(s) || 0;
                };

                const numCols = ["estoque", "custoLiq", "valorCusto", "atual", "valorVenda", "ddv", "mesAnt", "mesAtu", "status", "embCmp"];

                if (numCols.includes(estSortCol)) {
                  const va = numVal(a, estSortCol);
                  const vb = numVal(b, estSortCol);
                  return estSortDir === "asc" ? va - vb : vb - va;
                }

                const va = String(a[estSortCol as keyof typeof a] ?? "").toLowerCase();
                const vb = String(b[estSortCol as keyof typeof b] ?? "").toLowerCase();
                return estSortDir === "asc"
                  ? va.localeCompare(vb, "pt-BR", { numeric: true })
                  : vb.localeCompare(va, "pt-BR", { numeric: true });
              })
              .slice(0, 200)
              .map((p, i) => {
                const status =
                  p.ddv === 0 || p.estoque === 0 ? { label: "Sem Estoque", color: "#dc2626", bg: "#fef2f2" } :
                  p.ddv < 7 ? { label: "Estoque Baixo", color: "#fb923c", bg: "#431407" } :
                  p.ddv > 40 ? { label: "Estoque Alto", color: "#0071e3", bg: "#dbeafe" } :
                  { label: "Estoque OK", color: "#16a34a", bg: "#f0fdf4" };
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#fafafa" : "#f3f4f6" }}>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#6b7280", marginRight: 6 }} />
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome || p.filial}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#6b7280", fontFamily: "monospace" }}>{p.seqProd}</td>
                    <td style={{ padding: "8px 14px", color: "#1f2937", maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#9ca3af", fontFamily: "monospace", textAlign: "center" }}>{p.embCmp || "–"}</td>
                    <td style={{ padding: "8px 14px", color: "#1f2937", fontWeight: 700, fontFamily: "monospace" }}>{p.estoque.toLocaleString("pt-BR")}</td>
                    <td style={{ padding: "8px 14px", color: "#38bdf8", fontFamily: "monospace", textAlign: "right" }}>
                      {isNaN(p.custoLiq) ? "–" : `R$ ${p.custoLiq.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#38bdf8", fontFamily: "monospace", textAlign: "right" }}>
                      {(() => { const v = p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.custoLiq; return isNaN(v) ? "–" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })()}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#a78bfa", fontFamily: "monospace", textAlign: "right" }}>
                      {isNaN(p.atual) ? "–" : `R$ ${p.atual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#a78bfa", fontFamily: "monospace", textAlign: "right" }}>
                      {(() => { const v = p.estoque * (parseFloat(String(p.embCmp)) || 1) * p.atual; return isNaN(v) ? "–" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })()}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#6b7280" }}>{p.ddv || "–"}</td>
                    <td style={{ padding: "8px 14px", color: "#9ca3af", fontFamily: "monospace" }}>{p.mesAnt}</td>
                    <td style={{ padding: "8px 14px", color: "#9ca3af", fontFamily: "monospace" }}>{p.mesAtu}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MargemAnalysis({ data }: { data: FilialData }) {
  const allProducts = Object.values(data).flat();
  const criticos = allProducts.filter((p) => p.marg < 17);
  const saudaveis = allProducts.filter((p) => p.marg >= 17);
  const margMedia = allProducts.length ? allProducts.reduce((s, p) => s + p.marg, 0) / allProducts.length : 0;
  const perdaEstimada = criticos.reduce((s, p) => s + (17 - p.marg) * p.sellout * p.atual / 100, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#16a34a" : "#dc2626"} icon="📊" />
        <KpiCard label="Críticos" value={String(criticos.length)} sub="abaixo de 17%" color="#dc2626" icon="🚨" />
        <KpiCard label="Saudáveis" value={String(saudaveis.length)} sub="acima de 17%" color="#16a34a" icon="✅" />
        <KpiCard label="Perda Est." value={`R$ ${perdaEstimada.toFixed(0)}`} sub="impacto financeiro" color="#fb923c" icon="💸" />
      </div>

      {/* Margem por filial */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 20 }}>
        <h3 style={{ color: "#1f2937", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          Margem Média por Filial
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FILIAIS.map((f) => {
            const prods = data[f] || [];
            const avg = prods.length ? prods.reduce((s, p) => s + p.marg, 0) / prods.length : 0;
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 110, fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{FILIAL_INFO[f].nome}</span>
                <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 99, height: 14, position: "relative" }}>
                  <div style={{ height: 14, borderRadius: 99, width: `${Math.min(avg / 40 * 100, 100)}%`, background: avg >= 17 ? "#16a34a" : "#dc2626", transition: "width .6s" }} />
                  {/* 17% marker */}
                  <div style={{ position: "absolute", left: `${17 / 40 * 100}%`, top: 0, bottom: 0, width: 2, background: "#f59e0b" }} />
                </div>
                <span style={{ width: 50, fontSize: 13, fontWeight: 700, color: avg >= 17 ? "#16a34a" : "#dc2626", textAlign: "right" }}>
                  {avg.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
          ▐ Linha amarela = meta mínima de 17%
        </div>
      </div>

      {/* Top críticos */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #fecaca", padding: 20 }}>
        <h3 style={{ color: "#dc2626", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          🚨 Top 20 Produtos Mais Críticos
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {criticos
            .sort((a, b) => a.marg - b.marg)
            .slice(0, 20)
            .map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f3f4f6", borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#fecaca", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>
                  <div style={{ color: "#6b7280", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome} · {p.seqProd}</div>
                </div>
                <MargemBadge marg={p.marg} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function GeralAnalysis({ data }: { data: FilialData }) {
  const allProducts = Object.values(data).flat();
  const totalProdutos = allProducts.length;
  const totalFiliais = Object.keys(data).length;
  const margMedia = totalProdutos ? allProducts.reduce((s, p) => s + p.marg, 0) / totalProdutos : 0;
  const criticos = allProducts.filter((p) => p.marg < 17).length;
  const ruptura = allProducts.filter((p) => p.estoque === 0).length;
  const totalSellout = allProducts.reduce((s, p) => s + p.sellout, 0);

  // ABC distribution
  const abcDist: Record<string, number> = {};
  allProducts.forEach((p) => {
    const l = p.abc?.trim().toUpperCase() || "–";
    abcDist[l] = (abcDist[l] || 0) + 1;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KpiCard label="Total Produtos" value={String(totalProdutos)} sub={`${totalFiliais} filiais`} color="#0071e3" icon="📦" />
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#16a34a" : "#dc2626"} icon="📊" />
        <KpiCard label="Sellout Total" value={totalSellout.toFixed(0)} color="#a78bfa" icon="🛒" />
        <KpiCard label="Críticos (< 17%)" value={String(criticos)} sub={`${((criticos / totalProdutos) * 100).toFixed(0)}% do mix`} color="#dc2626" icon="🚨" />
        <KpiCard label="Ruptura" value={String(ruptura)} sub="sem estoque" color="#fb923c" icon="📭" />
        <KpiCard label="Classificação A" value={String(abcDist["A"] || 0)} sub="curva A" color="#0071e3" icon="⭐" />
      </div>

      {/* Painel por filial */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FILIAIS.map((f) => {
          const prods = data[f] || [];
          const avg = prods.length ? prods.reduce((s, p) => s + p.marg, 0) / prods.length : 0;
          const crit = prods.filter((p) => p.marg < 17).length;
          const rupt = prods.filter((p) => p.estoque === 0).length;
          const ddvMedio = prods.length ? prods.reduce((s, p) => s + (p.ddv || 0), 0) / prods.length : 0;
          const valorEstoqueCusto = prods.reduce((s, p) => s + (p.estoque || 0) * (Number(p.embCmp) || 1) * (p.custoLiq || 0), 0);
          const fmtValor = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(1)}K` : `R$ ${v.toFixed(2)}`;
          return (
            <div key={f} style={{ background: "#ffffff", border: `1px solid ${FILIAL_INFO[f].cor}44`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: FILIAL_INFO[f].cor }} />
                <span style={{ fontWeight: 600, color: "#1f2937", fontSize: 13 }}>{FILIAL_INFO[f].nome}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Produtos</span>
                  <span style={{ color: "#1f2937", fontWeight: 700 }}>{prods.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Margem Média</span>
                  <span style={{ color: avg >= 17 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{avg.toFixed(1)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>DDV Médio</span>
                  <span style={{ color: ddvMedio >= 7 ? "#0071e3" : "#fb923c", fontWeight: 700 }}>{ddvMedio.toFixed(0)} dias</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Valor Estoque (Custo)</span>
                  <span style={{ color: "#a78bfa", fontWeight: 700 }}>{fmtValor(valorEstoqueCusto)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Críticos</span>
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>{crit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Rupturas</span>
                  <span style={{ color: "#fb923c", fontWeight: 700 }}>{rupt}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShelfLifeAnalysis({ data }: { data: FilialData }) {
  const allProducts = Object.values(data).flat().filter((p) => p.ddv > 0);
  const vencendo = allProducts.filter((p) => p.ddv <= 30);
  const atencao = allProducts.filter((p) => p.ddv > 30 && p.ddv <= 90);
  const ok = allProducts.filter((p) => p.ddv > 90);

  const [slSortCol, setSlSortCol] = useState<string>("ddv");
  const [slSortDir, setSlSortDir] = useState<"asc" | "desc">("asc");

  const toggleSlSort = (col: string) => {
    if (slSortCol === col) setSlSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSlSortCol(col); setSlSortDir("desc"); }
  };

  const SlSortIcon = ({ col }: { col: string }) =>
    slSortCol === col ? (
      <span style={{ color: "#0071e3", marginLeft: 4 }}>{slSortDir === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span style={{ color: "#d1d5db", marginLeft: 4 }}>↕</span>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KpiCard label="Vencendo em 30d" value={String(vencendo.length)} color="#dc2626" icon="⏰" />
        <KpiCard label="Atenção (31–90d)" value={String(atencao.length)} color="#fb923c" icon="⚠️" />
        <KpiCard label="Shelf Life OK" value={String(ok.length)} sub="> 90 dias" color="#16a34a" icon="✅" />
      </div>
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
              {([
                { key: "filial", label: "Filial" },
                { key: "seqProd", label: "Cód." },
                { key: "descricao", label: "Descrição" },
                { key: "ddv", label: "DDV (dias)" },
                { key: "estoque", label: "Estoque" },
                { key: "status", label: "Status" },
              ] as { key: string; label: string }[]).map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleSlSort(h.key)}
                  style={{ padding: "10px 14px", textAlign: "left", color: slSortCol === h.key ? "#0071e3" : "#6b7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", userSelect: "none", borderBottom: `2px solid ${slSortCol === h.key ? "rgba(0,113,227,0.12)" : "#e5e7eb"}` }}
                >
                  {h.label}<SlSortIcon col={h.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allProducts
              .map((p) => ({
                ...p,
                status: p.ddv <= 30 ? 0 : p.ddv <= 90 ? 1 : 2,
              }))
              .sort((a, b) => {
                const numVal = (item: typeof a, col: string): number => {
                  const raw = item[col as keyof typeof item];
                  if (raw == null) return 0;
                  if (typeof raw === "number") return raw;
                  const s = String(raw).replace(/\./g, "").replace(",", ".");
                  return parseFloat(s) || 0;
                };
                const numCols = ["estoque", "ddv", "status"];
                if (numCols.includes(slSortCol)) {
                  const va = numVal(a, slSortCol);
                  const vb = numVal(b, slSortCol);
                  return slSortDir === "asc" ? va - vb : vb - va;
                }
                const va = String(a[slSortCol as keyof typeof a] ?? "").toLowerCase();
                const vb = String(b[slSortCol as keyof typeof b] ?? "").toLowerCase();
                return slSortDir === "asc"
                  ? va.localeCompare(vb, "pt-BR", { numeric: true })
                  : vb.localeCompare(va, "pt-BR", { numeric: true });
              })
              .slice(0, 200)
              .map((p, i) => {
                const status =
                  p.ddv <= 30 ? { label: "Vencendo", color: "#dc2626", bg: "#fef2f2" } :
                  p.ddv <= 90 ? { label: "Atenção", color: "#fb923c", bg: "#431407" } :
                  { label: "OK", color: "#16a34a", bg: "#f0fdf4" };
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#fafafa" : "#f3f4f6" }}>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#6b7280", marginRight: 6 }} />
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome || p.filial}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#6b7280", fontFamily: "monospace" }}>{p.seqProd}</td>
                    <td style={{ padding: "8px 14px", color: "#1f2937" }}>{p.descricao}</td>
                    <td style={{ padding: "8px 14px", color: "#1f2937", fontWeight: 700, fontFamily: "monospace" }}>{p.ddv}</td>
                    <td style={{ padding: "8px 14px", color: "#9ca3af" }}>{p.estoque.toLocaleString("pt-BR")}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color }}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {allProducts.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Nenhum produto com DDV encontrado nos dados carregados.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState<Module>("cruzamento");
  const [files, setFiles] = useState<UploadedFiles>({});
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [unrecognizedFiles, setUnrecognizedFiles] = useState<string[]>([]);
  const [data, setData] = useState<FilialData>(() => {
    try {
      const saved = localStorage.getItem("vilasales_data");
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {};
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(() => {
    try {
      const saved = localStorage.getItem("vilasales_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        return !Object.values(parsed).some((arr: any) => arr.length > 0);
      }
    } catch (_) {}
    return true;
  });
  const [lastUpdate, setLastUpdate] = useState<string | null>(() => {
    return localStorage.getItem("vilasales_lastUpdate") || null;
  });

  const handleFiles = useCallback((newFiles: Partial<UploadedFiles>, unrecognized: string[]) => {
    setFiles((prev) => ({ ...prev, ...newFiles }));
    setUnrecognizedFiles(unrecognized);
  }, []);

  const handleBaseFile = useCallback((f: File | null) => {
    setBaseFile(f);
  }, []);

  const handleClear = useCallback(() => {
    setFiles({});
    setBaseFile(null);
    setUnrecognizedFiles([]);
    setData({});
    setLastUpdate(null);
    try {
      localStorage.removeItem("vilasales_data");
      localStorage.removeItem("vilasales_lastUpdate");
      localStorage.removeItem(LIVRO_METRICS_STORAGE_KEY);
    } catch (_) {}
    notifyAppDataChanged();
    // Espelha no Supabase (não bloqueia a UI)
    clearLivrosFromSupabase().catch((e) => console.warn("clearLivros:", e));
  }, []);

  const processFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {

      // ── 1. Lê a base Excel (Etapa 2) ──────────────────────────────────────────
      // Coluna 3 (índice 2) = Cod Produto
      if (!baseFile) throw new Error("Faça o upload da planilha de produtos na Etapa 2.");

      const baseRows = await readExcelAsRows(baseFile);
      if (baseRows.length === 0) throw new Error("A planilha de produtos está vazia ou não foi lida corretamente.");

      // Pega o nome real das colunas da base
      const baseCols = Object.keys(baseRows[0]);
      const baseColBU   = baseCols[0]; // coluna A → BU (FOODS / HC)
      const baseColCod  = baseCols[2]; // coluna C → Cod Produto
      const baseColDesc = baseCols[3]; // coluna D → Descrição

      // Monta Map: cod_normalizado → { cod original, desc, bu }
      const normCod = (v: any): string => {
        let s = String(v ?? "").trim();
        s = s.replace(/\.0+$/, "");       // Excel converte números para 114667.0
        s = s.replace(/^0+(\d)/, "$1");   // remove zeros à esquerda
        return s;
      };

      const baseMap = new Map<string, { cod: string; desc: string; bu: string }>();
      baseRows.forEach((r) => {
        const cod = normCod(r[baseColCod]);
        if (cod) {
          const desc = String(r[baseColDesc] ?? "").trim();
          const bu   = String(r[baseColBU]   ?? "").trim().toUpperCase();
          baseMap.set(cod, { cod, desc, bu });
        }
      });

      if (baseMap.size === 0)
        throw new Error(`Nenhum código encontrado na coluna 3 ("${baseColCod}") da base de produtos.`);

      // ── 2. Parser CSV por posição ──────────────────────────────────────────────
      // Retorna array de arrays (sem depender de nomes de colunas)
      const parseCSVRaw = async (file: File | undefined): Promise<string[][]> => {
        if (!file) return [];
        const text = await readFileText(file);
        const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
        if (!firstLine) return [];
        const sep = firstLine.includes(";") ? ";" : ",";
        const wb = XLSX.read(text, { type: "string", raw: false, FS: sep });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) return [];
        const sheet = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false })
          .map((row) => row.map((cell) => String(cell ?? "").trim()));
      };

      const chooseBestMetric = (...values: Array<string | undefined>): string => {
        const cleaned = values
          .map((value) => String(value ?? "").trim())
          .filter((value) => value !== "");
        const nonZero = cleaned.find((value) => num(value) !== 0);
        return nonZero ?? cleaned[0] ?? "0";
      };

      const buildOverrideMap = async (file: File | undefined, label: string) => {
        const map = new Map<string, { custo: string; preco: string; sellout: string; promoc: string }>();
        if (!file) return map;

        if (/\.csv$/i.test(file.name)) {
          const rawRows = await parseCSVRaw(file);
          const header = rawRows[0] ?? [];
          const colCod = findHeaderIndex(header, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO", "SEQPROD", "SEQ_PROD"], 1);
          const colCusto = findHeaderIndex(header, ["CUSTO LIQ", "CUSTO.LIQ", "CUSTO_LIQ", "CUSTOLIQ", "CUSTO LIQUIDO"], 16);
          const colPreco = findHeaderIndex(header, ["ATUAL", "PRECO VENDA", "PRECO DE VENDA", "PV", "PRECO_VENDA"], 19);
          const colSellout = findHeaderIndex(header, ["SELLOUT", "SELL OUT", "SELL.OUT", "SELL_OUT"], -1);
          const colPromoc = findHeaderIndex(header, ["PROMOC", "PROMOCAO", "PROMOÇÃO", "PROMO"], -1);

          rawRows.slice(1).forEach((cols) => {
            const cod = normCod(cols[colCod] ?? "");
            if (!cod) return;

            const current = map.get(cod);
            map.set(cod, {
              custo: chooseBestMetric(cols[colCusto], current?.custo),
              preco: chooseBestMetric(cols[colPreco], current?.preco),
              sellout: chooseBestMetric(colSellout >= 0 ? cols[colSellout] : undefined, current?.sellout),
              promoc: chooseBestMetric(colPromoc >= 0 ? cols[colPromoc] : undefined, current?.promoc),
            });
          });
        } else {
          const rows = await readExcelAsRows(file);
          rows.forEach((row) => {
            const cod = normCod(findCol(row, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO", "SEQPROD", "SEQ_PROD"]));
            if (!cod) return;

            const current = map.get(cod);
            map.set(cod, {
              custo: chooseBestMetric(
                findCol(row, ["CUSTO LIQ", "CUSTO.LIQ", "CUSTO_LIQ", "CUSTOLIQ", "CUSTO LIQUIDO"]),
                current?.custo,
              ),
              preco: chooseBestMetric(
                findCol(row, ["ATUAL", "PRECO VENDA", "PRECO DE VENDA", "PV", "PRECO_VENDA"]),
                current?.preco,
              ),
              sellout: chooseBestMetric(
                findCol(row, ["SELLOUT", "SELL OUT", "SELL.OUT", "SELL_OUT"]),
                current?.sellout,
              ),
              promoc: chooseBestMetric(
                findCol(row, ["PROMOC", "PROMOCAO", "PROMOÇÃO", "PROMO"]),
                current?.promoc,
              ),
            });
          });
        }

        console.log(`[${label}] ${map.size} produtos mapeados`);
        return map;
      };

      // ── 3. Cruzamento direto por posição ──────────────────────────────────────
      const buildLivroMetrics = (
        rawRows: string[][],
        colCod: number,
        colEstoque: number,
        colDDV: number
      ): Record<string, LivroMetricRow> => {
        const header = rawRows[0] ?? [];
        const finalColCod = findHeaderIndex(header, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO"], colCod);
        const finalColEstoque = findHeaderIndex(header, ["ESTOQUE"], colEstoque);
        const finalColDDV = findHeaderIndex(header, ["DDV"], colDDV);
        const finalColPendCmp = findHeaderIndex(header, ["PEND.CMP", "PEND CMP", "PENDCMP", "PEND_COMPRA", "PENDENCIA"], -1);
        const result: Record<string, LivroMetricRow> = {};

        rawRows.slice(1).forEach((cols) => {
          const cod = normCod(cols[finalColCod] ?? "");
          if (!cod) return;
          result[cod] = {
            estoque: num(cols[finalColEstoque] ?? "0"),
            ddv: num(cols[finalColDDV] ?? "0"),
            pendCmp: finalColPendCmp >= 0 ? num(cols[finalColPendCmp] ?? "0") : 0,
          };
        });

        return result;
      };

      // livro_01 – Poços:
      //   col[1] = código (coluna 2)
      //   col[2] = descrição (coluna C)
      //   col[6] = ESTOQUE (coluna 7)
      //   col[7] = DDV (coluna 8)
      //   col[16] = CUSTO LIQ (coluna 17)
      //   col[25] = ATUAL / preço venda (coluna 26)

      const buildProducts = (
        rawRows: string[][],
        filial: Filial,
        colCod: number,
        colDesc: number,
        colEstoque: number,
        colDDV: number,
        colCustoFallback: number,
        colPrecoFallback: number,
        overrideEstoque?: Map<string, { estoque: string; custo: string; sellout: string; promoc: string }>,
        overridePrecos?: Map<string, { custo: string; preco: string; sellout: string; promoc: string }>
      ): Product[] => {
        const header = rawRows[0] ?? [];
        const finalColCod = findHeaderIndex(header, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO"], colCod);
        const finalColDesc = findHeaderIndex(header, ["DESCRICAO", "DESCRICAO PRODUTO", "DESC"], colDesc);
        const finalColEmbCmp = findHeaderIndex(header, ["EMB CMP", "EMB.CMP", "EMBCMP"], -1);
        const finalColFamilia = findHeaderIndex(header, ["FAMILIA", "FAMÍLIA"], -1);
        const finalColEstoque = findHeaderIndex(header, ["ESTOQUE"], colEstoque);
        const finalColDDV = findHeaderIndex(header, ["DDV"], colDDV);
        const finalColCusto = findHeaderIndex(header, ["CUSTO LIQ", "CUSTO LIQUIDO", "CUSTO.LIQ"], colCustoFallback);
        const finalColPreco = findHeaderIndex(header, ["ATUAL", "PRECO VENDA", "PRECO DE VENDA", "PV"], colPrecoFallback);
        const finalColSellout = findHeaderIndex(header, ["SELLOUT", "SELL OUT", "SELL.OUT", "SELL_OUT"], -1);
        const finalColPromoc = findHeaderIndex(header, ["PROMOC", "PROMOCAO", "PROMOÇÃO", "PROMO"], -1);
        const finalColPendCmp = findHeaderIndex(header, ["PEND.CMP", "PEND CMP", "PENDCMP", "PEND_COMPRA", "PENDENCIA"], -1);

        const dataRows = rawRows.slice(1);
        const result: Product[] = [];

        dataRows.forEach((cols) => {
          const rawCod = cols[finalColCod] ?? "";
          const cod = normCod(rawCod);
          if (!cod || !baseMap.has(cod)) return;

          const baseEntry = baseMap.get(cod)!;
          const desc = baseEntry.desc || cols[finalColDesc] || rawCod;
          const overridePrecosRow = overridePrecos?.get(cod);
          const overrideEstoqueRow = overrideEstoque?.get(cod);
          const estoqueStr = overrideEstoqueRow?.estoque && num(overrideEstoqueRow.estoque) !== 0
            ? overrideEstoqueRow.estoque
            : cols[finalColEstoque] ?? "0";
          // Quando há override de preços (livro_10 p/ Filial 01, livro_510 p/ Filial 502),
          // usa o valor do override SOMENTE se ele existir e for não-zero;
          // caso contrário, faz fallback para o valor do próprio livro da filial.
          const ownCusto = cols[finalColCusto] ?? "0";
          const ownPreco = cols[finalColPreco] ?? "0";
          const ownSellout = (finalColSellout >= 0 ? cols[finalColSellout] : undefined) ?? "0";
          const ownPromoc = (finalColPromoc >= 0 ? cols[finalColPromoc] : undefined) ?? "0";

          const custoStr = overridePrecos
            ? (overridePrecosRow?.custo && num(overridePrecosRow.custo) !== 0
                ? overridePrecosRow.custo
                : ownCusto)
            : ownCusto;
          const precoStr = overridePrecos
            ? (overridePrecosRow?.preco && num(overridePrecosRow.preco) !== 0
                ? overridePrecosRow.preco
                : ownPreco)
            : ownPreco;
          const selloutStr = overridePrecos
            ? (overridePrecosRow?.sellout && num(overridePrecosRow.sellout) !== 0
                ? overridePrecosRow.sellout
                : ownSellout)
            : ownSellout;
          const promocStr = overridePrecos
            ? (overridePrecosRow?.promoc && num(overridePrecosRow.promoc) !== 0
                ? overridePrecosRow.promoc
                : ownPromoc)
            : ownPromoc;


          const estoque = num(estoqueStr);
          const custoLiq = num(custoStr);
          const atual = num(precoStr);
          const sellout = num(selloutStr);
          const promoc = num(promocStr);
          const ddv = num(cols[finalColDDV] ?? "0");
          const pendCmp = finalColPendCmp >= 0 ? num(cols[finalColPendCmp] ?? "0") : 0;
          const marg = atual > 0 ? ((atual - custoLiq) / atual) * 100 : 0;

          result.push({
            familia: finalColFamilia >= 0 ? (cols[finalColFamilia] ?? "") : "",
            seqProd: baseEntry.cod,
            descricao: desc,
            embCmp: finalColEmbCmp >= 0 ? (cols[finalColEmbCmp] ?? "") : "",
            embVir: "",
            estoque,
            sellout,
            promoc,
            custoLiq,
            comis: 0,
            marg,
            mesAnt: 0,
            mesAtu: 0,
            abc: "",
            custoNf: 0,
            atual,
            sugerido: 0,
            ddv,
            pendCmp,
            filial,
            bu: baseEntry.bu,
          });
        });

        return result;
      };

      // ── 4. Lê livro_10 (custo/preço para Poços) ──
      // Filial 01: estoque vem do livro_01, custo (CUSTO LIQ) e preço (ATUAL) vêm do livro_10
      // EXCEÇÃO: produtos sem ST usam custo/preço do próprio livro_01
      const PRODUTOS_SEM_ST = new Set(["47646","58668","47645","78400","123834","78399","78401"]);
      const map10Full = await buildOverrideMap(files.livro_10, "livro_10");
      // Remove produtos sem ST do override do livro_10
      const map10 = new Map(map10Full);
      PRODUTOS_SEM_ST.forEach((cod) => map10.delete(cod));

      const newData: FilialData = {};
      const livroMetricsData: LivroMetricsData = {};

      // livro_10 – Poços (preço custo/venda) — salvamos as métricas (DDV) para
      // permitir que módulos de transferência leiam o DDV do livro_10 quando
      // a regra de negócio exigir (Filial 01 usa DDV do livro_10).
      if (files.livro_10) {
        try {
          const raw10 = await parseCSVRaw(files.livro_10);
          livroMetricsData["10"] = buildLivroMetrics(raw10, 1, 6, 7);
        } catch (_) {}
      }

      // Filial 01 – Poços (estoque = livro_01; preço custo/venda = livro_10)
      if (files.livro_01) {
        const raw01 = await parseCSVRaw(files.livro_01);
        livroMetricsData["01"] = buildLivroMetrics(raw01, 1, 6, 7);
        newData["01"] = buildProducts(raw01, "01", 1, 2, 6, 7, 16, 19, undefined, map10.size > 0 ? map10 : undefined);
      }

      if (files.livro_11) {
        const raw = await parseCSVRaw(files.livro_11);
        livroMetricsData["11"] = buildLivroMetrics(raw, 1, 6, 7);
        newData["11"] = buildProducts(raw, "11", 1, 2, 6, 7, 16, 19);
      }

      if (files.livro_12) {
        const raw = await parseCSVRaw(files.livro_12);
        livroMetricsData["12"] = buildLivroMetrics(raw, 1, 6, 7);
        newData["12"] = buildProducts(raw, "12", 1, 2, 6, 7, 16, 19);
      }

      if (files.livro_14) {
        const raw = await parseCSVRaw(files.livro_14);
        livroMetricsData["14"] = buildLivroMetrics(raw, 1, 6, 7);
        newData["14"] = buildProducts(raw, "14", 1, 2, 6, 7, 16, 19);
      }

      if (files.livro_501) {
        const raw = await parseCSVRaw(files.livro_501);
        livroMetricsData["501"] = buildLivroMetrics(raw, 1, 6, 7);
        newData["501"] = buildProducts(raw, "501", 1, 2, 6, 7, 16, 19);
      }

      const map510 = await buildOverrideMap(files.livro_510, "livro_510");

      // livro_510 – Focomix MG (preço custo/venda) — salvamos métricas (DDV)
      // para Filial 502 ler o DDV do livro_510.
      if (files.livro_510) {
        try {
          const raw510 = await parseCSVRaw(files.livro_510);
          livroMetricsData["510"] = buildLivroMetrics(raw510, 1, 6, 7);
        } catch (_) {}
      }

      if (files.livro_502) {
        const raw = await parseCSVRaw(files.livro_502);
        livroMetricsData["502"] = buildLivroMetrics(raw, 1, 6, 7);
        newData["502"] = buildProducts(raw, "502", 1, 2, 6, 7, 16, 19, undefined, map510.size > 0 ? map510 : undefined);
      }

      setData(newData);
      try {
        localStorage.setItem("vilasales_data", JSON.stringify(newData));
        localStorage.setItem(LIVRO_METRICS_STORAGE_KEY, JSON.stringify(livroMetricsData));
      } catch(_) {}
      const updateTime = new Date().toLocaleString("pt-BR");
      setLastUpdate(updateTime);
      try { localStorage.setItem("vilasales_lastUpdate", updateTime); } catch(_) {}
      notifyAppDataChanged();
      // Espelha no Supabase (em background — não bloqueia a navegação)
      saveLivrosToSupabase(newData).catch((e) =>
        console.warn("saveLivros:", e?.message || e)
      );
      setShowUpload(false);
      setActiveModule("cruzamento");

    } catch (e: any) {
      setError("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [files, baseFile]);

  const hasData = Object.values(data).some((arr) => arr.length > 0);
  const totalLoaded = Object.values(files).filter(Boolean).length;
  const csvLoaded = LIVRO_META.filter(({ key }) => !!files[key]).length;
  const canGenerate = csvLoaded > 0 && !!baseFile;

  const modules: { id: Module; label: string; icon: string }[] = [
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
        minHeight: "100vh",
        background: "#f8f9fa",
        color: "#1f2937",
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}
    >
      {/* Main content */}
      <div style={{ overflow: "auto" }}>
        {/* Header */}
        <div
          style={{
            padding: "20px 32px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#f8f9fa",
            zIndex: 10,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#1f2937" }}>
              {modules.find((m) => m.id === activeModule)?.icon}{" "}
              {modules.find((m) => m.id === activeModule)?.label}
            </h1>
            {hasData && (
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {Object.values(data).flat().length} produtos carregados · {Object.keys(data).length} filiais
              </p>
            )}
          </div>
          <button
            onClick={processFiles}
            disabled={loading || !canGenerate}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: loading || !canGenerate
                ? "#e5e7eb"
                : "#0071e3",
              color: loading || !canGenerate ? "#6b7280" : "#fff",
              cursor: loading || !canGenerate ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all .2s",
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                Processando...
              </>
            ) : (
              <>🔄 Gerar Análise</>
            )}
          </button>

          <button
            onClick={() => {
              setShowUpload(true);
              setData({});
              setFiles({});
              setBaseFile(null);
              setUnrecognizedFiles([]);
              try {
                localStorage.removeItem("vilasales_data");
                localStorage.removeItem("vilasales_lastUpdate");
                localStorage.removeItem(LIVRO_METRICS_STORAGE_KEY);
              } catch (_) {}
              notifyAppDataChanged();
              clearLivrosFromSupabase().catch((e) => console.warn("clearLivros:", e));
            }}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all .2s",
            }}
          >
            📤 Novo Upload
          </button>
        </div>

        <div style={{ padding: 32 }}>
          {/* Upload panel */}
          {showUpload && (
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
                  📂 Upload de Arquivos
                </h2>
                {hasData && (
                  <button
                    onClick={() => setShowUpload(false)}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18 }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <UploadPanel
                files={files}
                baseFile={baseFile}
                onCsvFiles={handleFiles}
                onBaseFile={handleBaseFile}
                onClear={handleClear}
                unrecognized={unrecognizedFiles}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, marginBottom: 20, color: "#dc2626", fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* No data state */}
          {!hasData && !showUpload && (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <h3 style={{ color: "#6b7280", fontWeight: 700 }}>Nenhum dado carregado</h3>
              <p style={{ fontSize: 14 }}>Faça upload dos arquivos CSV e clique em "Gerar Análise"</p>
              <button
                onClick={() => setShowUpload(true)}
                style={{
                  marginTop: 16,
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#0071e3",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                📂 Abrir Painel de Upload
              </button>
            </div>
          )}

          {/* Analysis views */}
          {hasData && (
            <>
              {activeModule === "cruzamento" && <CrossAnalysis data={data} />}
              {activeModule === "preco" && <PrecoAnalysis data={data} />}
              {activeModule === "margem" && <MargemAnalysis data={data} />}
              {activeModule === "estoque" && <EstoqueAnalysis data={data} />}
              {activeModule === "shelflife" && <ShelfLifeAnalysis data={data} />}
              {activeModule === "geral" && <GeralAnalysis data={data} />}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f8f9fa; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }
      `}</style>
    </div>
  );
}

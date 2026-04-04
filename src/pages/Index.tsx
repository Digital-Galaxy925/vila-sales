import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
type Filial = "01" | "11" | "12" | "14" | "501" | "502";
type Module = "cruzamento" | "preco" | "estoque" | "margem" | "shelflife" | "geral";

interface Product {
  familia: string;
  seqProd: string;
  descricao: string;
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
  filial: Filial;
  bu: string; // FOODS | HC
}

interface FilialData {
  [filial: string]: Product[];
}

interface UploadedFiles {
  livro_01?: File;
  livro_10?: File;
  livro_11?: File;
  livro_12?: File;
  livro_14?: File;
  livro_501?: File;
  livro_502?: File;
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
  for (const c of candidates) {
    const key = Object.keys(row).find(
      (k) => k.trim().toUpperCase() === c.toUpperCase()
    );
    if (key && row[key] !== undefined) return row[key];
  }
  return "";
}

function rowToProduct(row: Record<string, string>, filial: Filial): Product {
  const pv = num(findCol(row, ["ATUAL", "PRECO_VENDA", "PV", "SELLOUT"]));
  const pc = num(findCol(row, ["CUSTO.LIQ", "CUSTO_LIQ", "CUSTOLIQ", "PC"]));
  const margCalc = pv > 0 ? ((pv - pc) / pv) * 100 : 0;
  return {
    familia: findCol(row, ["FAMILIA"]),
    seqProd: findCol(row, ["SEQ.PROD", "SEQPROD", "SEQ_PROD", "COD"]),
    descricao: findCol(row, ["DESCRICAO", "DESCRIÇÃO", "DESC"]),
    embVir: findCol(row, ["EMB.VIR", "EMBVIR", "EMB_VIR"]),
    estoque: num(findCol(row, ["ESTOQUE"])),
    sellout: num(findCol(row, ["SELLOUT"])),
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
        background: "#0f172a",
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
      <span style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 28, fontWeight: 800, color }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "#475569" }}>{sub}</span>}
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
        background: ok ? "#052e16" : "#450a0a",
        color: ok ? "#4ade80" : "#f87171",
        border: `1px solid ${ok ? "#166534" : "#7f1d1d"}`,
      }}
    >
      {ok ? "▲" : "▼"} {marg.toFixed(1)}%
    </span>
  );
}

function ABCBadge({ abc }: { abc: string }) {
  const colors: Record<string, [string, string]> = {
    A: ["#1e3a5f", "#60a5fa"],
    B: ["#1a2e1a", "#4ade80"],
    C: ["#3b1f00", "#fb923c"],
  };
  const letter = abc?.trim().toUpperCase() || "–";
  const [bg, fg] = colors[letter] || ["#1e293b", "#94a3b8"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 800,
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
    <div style={{ background: "#1e293b", borderRadius: 99, height: 6, width: "100%", minWidth: 80 }}>
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
  { key: "livro_01",  label: "livro_01",  desc: "Filial 01 – Poços (preço/venda)"        },
  { key: "livro_10",  label: "livro_10",  desc: "Poços + Focomix MG (estoque/custo)"     },
  { key: "livro_11",  label: "livro_11",  desc: "Filial 11 – Campinas"                   },
  { key: "livro_12",  label: "livro_12",  desc: "Filial 12 – Osasco"                     },
  { key: "livro_14",  label: "livro_14",  desc: "Filial 14 – Betim"                      },
  { key: "livro_501", label: "livro_501", desc: "Filial 501 – Focomix SP"                },
  { key: "livro_502", label: "livro_502", desc: "Filial 502 – Focomix MG (preço/venda)"  },
];

// Step indicator
function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14, flexShrink: 0,
        background: done ? "#052e16" : active ? "#1e3a5f" : "#0f172a",
        color: done ? "#4ade80" : active ? "#60a5fa" : "#334155",
        border: `2px solid ${done ? "#166534" : active ? "#3B82F6" : "#1e293b"}`,
        transition: "all .3s",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: done ? "#4ade80" : active ? "#e2e8f0" : "#334155" }}>
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
        border: `2px dashed ${dragging ? color : "#1e293b"}`,
        borderRadius: 14,
        padding: "28px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? `${color}11` : "#080f1a",
        transition: "all .2s",
      }}
    >
      <input ref={inputRef} type="file" multiple={multiple} accept={accept} style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
      <div style={{ fontSize: 36, marginBottom: 8 }}>{dragging ? "📥" : icon}</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0", marginBottom: 4 }}>
        {dragging ? "Solte aqui!" : label}
      </div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>{sublabel}</div>
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
        <div style={{ flex: 1, height: 2, margin: "0 12px", background: step1Done ? "#166534" : "#1e293b", transition: "background .4s" }} />
        <StepBadge n={2} label="Base de Produtos (Excel)" active={step1Done && !step2Done} done={step2Done} />
      </div>

      {/* ── STEP 1 ── */}
      <div style={{
        border: `1px solid ${step1Done ? "#166534" : "#1e293b"}`,
        borderRadius: 16,
        padding: 20,
        background: step1Done ? "#020f08" : "#080f1a",
        transition: "all .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: step1Done ? "#4ade80" : "#e2e8f0" }}>
              {step1Done ? `✅ Passo 1 concluído — ${csvLoaded} de ${LIVRO_META.length} arquivos carregados` : "Passo 1 — Arquivos das Filiais"}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              Selecione todos os livros CSV de uma vez. O sistema identifica cada filial automaticamente pelo nome do arquivo.
            </div>
          </div>
          {step1Done && (
            <button onClick={onClear} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, textDecoration: "underline", flexShrink: 0, marginLeft: 12 }}>
              Refazer
            </button>
          )}
        </div>

        <DropZone
          onFiles={handleCsvFileList}
          multiple
          accept=".csv"
          label="Arraste ou clique para selecionar todos os CSVs"
          sublabel="livro_01, livro_10, livro_11, livro_12, livro_14, livro_501, livro_502"
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
                borderRadius: 8, background: loaded ? "#052e16" : "#0a111e",
                border: `1px solid ${loaded ? "#166534" : "#1e293b"}`, transition: "all .3s",
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{loaded ? "✅" : "⬜"}</span>
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: loaded ? "#4ade80" : "#64748b" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {loaded ? files[key]!.name : desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress */}
        <div style={{ marginTop: 12, background: "#1e293b", borderRadius: 99, height: 4 }}>
          <div style={{
            height: 4, borderRadius: 99, transition: "width .4s",
            width: `${(csvLoaded / LIVRO_META.length) * 100}%`,
            background: csvLoaded === LIVRO_META.length ? "#4ade80" : "#3B82F6",
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
        border: `1px solid ${!step1Done ? "#0f172a" : step2Done ? "#166534" : "#1e3a5f"}`,
        borderRadius: 16,
        padding: 20,
        background: !step1Done ? "#050a14" : step2Done ? "#020f08" : "#080f1a",
        opacity: step1Done ? 1 : 0.45,
        transition: "all .3s",
        pointerEvents: step1Done ? "auto" : "none",
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: step2Done ? "#4ade80" : step1Done ? "#e2e8f0" : "#334155" }}>
            {step2Done ? `✅ Passo 2 concluído — ${baseFile!.name}` : "Passo 2 — Base de Produtos"}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Planilha Excel com os produtos que serão analisados. Deve conter colunas de <strong style={{ color: "#94a3b8" }}>código</strong> e <strong style={{ color: "#94a3b8" }}>descrição</strong>.
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
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#0a0f1e", borderRadius: 8, border: "1px solid #1e293b", fontSize: 11, color: "#475569" }}>
              <strong style={{ color: "#64748b" }}>💡 Recomendado:</strong> Se o upload do .xlsx falhar, salve a planilha como <strong style={{ color: "#94a3b8" }}>.csv (separado por ponto-e-vírgula)</strong> no Excel (Arquivo → Salvar como → CSV UTF-8) e faça upload do CSV.
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "#052e16", borderRadius: 10, border: "1px solid #166534" }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>{baseFile!.name}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>{(baseFile!.size / 1024).toFixed(1)} KB · Base de produtos carregada</div>
            </div>
            <button
              onClick={() => onBaseFile(null as any)}
              style={{ background: "#7f1d1d", border: "none", borderRadius: 6, color: "#f87171", cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700 }}
            >
              Trocar
            </button>
          </div>
        )}

        <div style={{ marginTop: 14, padding: "10px 14px", background: "#0a0f1e", borderRadius: 8, border: "1px solid #1e293b", fontSize: 11, color: "#475569" }}>
          <strong style={{ color: "#64748b" }}>💡 Dica:</strong> A base de produtos funciona como <strong style={{ color: "#94a3b8" }}>filtro</strong> — somente os produtos presentes nela serão exibidos nas análises. Se quiser ver todos os produtos das filiais, pode pular este passo e clicar em Gerar Análise diretamente.
        </div>
      </div>

      {/* Ready state */}
      {step1Done && step2Done && (
        <div style={{ padding: "14px 20px", background: "#052e16", border: "1px solid #166534", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>🚀</span>
          <div>
            <div style={{ fontWeight: 800, color: "#4ade80", fontSize: 14 }}>Tudo pronto para análise!</div>
            <div style={{ fontSize: 12, color: "#475569" }}>Clique em "Gerar Análise" no topo para processar os dados.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Cross Analysis Table ────────────────────────────────────────────
function CrossAnalysis({ data }: { data: FilialData }) {
  const [selectedFilial, setSelectedFilial] = useState<Filial | "all">("all");
  const [selectedBU, setSelectedBU] = useState<"all" | "FOODS" | "HC">("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"seqProd" | "descricao" | "estoque" | "custoLiq" | "atual" | "marg">("marg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterMarg, setFilterMarg] = useState<"all" | "critico" | "ok">("all");
  const [desiredMargins, setDesiredMargins] = useState<Record<string, string>>({});

  const allProducts = Object.values(data).flat();
  const base = selectedFilial === "all" ? allProducts : (data[selectedFilial] || []);

  const filtered = base
    .filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.seqProd.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
      const matchMarg = filterMarg === "all" || (filterMarg === "critico" ? p.marg < 17 : p.marg >= 17);
      const matchBU = selectedBU === "all" || p.bu === selectedBU;
      return matchSearch && matchMarg && matchBU;
    })
    .sort((a, b) => {
      let va: string | number = a[sortCol];
      let vb: string | number = b[sortCol];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  // KPIs respeitam filtro de BU
  const buBase = selectedBU === "all" ? base : base.filter((p) => p.bu === selectedBU);
  const criticos = buBase.filter((p) => p.marg < 17).length;
  const margMedia = buBase.length ? buBase.reduce((s, p) => s + p.marg, 0) / buBase.length : 0;
  const totalEstoque = buBase.reduce((s, p) => s + p.estoque, 0);

  // Contagens por BU para os badges
  const countFoods = base.filter((p) => p.bu === "FOODS").length;
  const countHC    = base.filter((p) => p.bu === "HC").length;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) =>
    sortCol === col ? (
      <span style={{ color: "#60a5fa", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span style={{ color: "#334155", marginLeft: 4 }}>↕</span>
    );

  const ThBtn = ({ col, children }: { col: typeof sortCol; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "11px 16px", textAlign: "left", color: sortCol === col ? "#60a5fa" : "#64748b",
        fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap",
        cursor: "pointer", userSelect: "none",
        borderBottom: `2px solid ${sortCol === col ? "#1e3a5f" : "#1e293b"}`,
      }}
    >
      {children}<SortIcon col={col} />
    </th>
  );

  // Export CSV
  const exportCSV = () => {
    const header = ["BU","Filial","Código","Descrição","Estoque","Custo Liq (R$)","Preço Venda (R$)","Margem (%)","Status Margem","Margem Desejada (%)","Preço Futuro (R$)"];
    const rows = filtered.map((p) => {
      const raw = desiredMargins[`${p.filial}-${p.seqProd}`];
      const margDes = raw ? parseFloat(raw.replace(",", ".")) : NaN;
      const futuro = !isNaN(margDes) && margDes < 100 ? (p.custoLiq / (1 - margDes / 100)).toFixed(2) : "";
      return [
        p.bu,
        FILIAL_INFO[p.filial]?.nome || p.filial,
        p.seqProd,
        `"${p.descricao}"`,
        p.estoque,
        p.custoLiq.toFixed(2),
        p.atual.toFixed(2),
        p.marg.toFixed(2),
        p.marg >= 17 ? "Saudável" : "Crítico",
        raw || "",
        futuro,
      ];
    });
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "analise_cruzada.csv"; a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header + export */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>
            📋 Resultado do Cruzamento
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
            Produtos da sua base cruzados com os dados das filiais
          </p>
        </div>
        <button
          onClick={exportCSV}
          style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid #166534",
            background: "#052e16", color: "#4ade80", cursor: "pointer",
            fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ⬇️ Exportar CSV
        </button>
      </div>

      {/* BU filter — destaque visual no topo */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Categoria:</span>
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
                ? (key === "FOODS" ? "#052e16" : key === "HC" ? "#0f172a" : "#1e3a5f")
                : "#080f1a",
              color: selectedBU === key
                ? (key === "FOODS" ? "#4ade80" : key === "HC" ? "#a78bfa" : "#60a5fa")
                : "#475569",
              borderColor: selectedBU === key
                ? (key === "FOODS" ? "#166534" : key === "HC" ? "#6d28d9" : "#1d4ed8")
                : "#1e293b",
            }}
          >
            <span>{icon}</span>
            {label}
            <span style={{
              padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800,
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

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KpiCard label="Produtos Analisados" value={String(buBase.length)} sub={selectedBU === "all" ? "todas as categorias" : selectedBU} color="#60a5fa" icon="📦" />
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#4ade80" : "#f87171"} icon="📊" />
        <KpiCard label="Críticos (< 17%)" value={String(criticos)} sub={`${buBase.length ? ((criticos/buBase.length)*100).toFixed(0) : 0}% do mix`} color="#f87171" icon="🚨" />
        <KpiCard label="Estoque Total" value={totalEstoque.toLocaleString("pt-BR")} sub="unidades" color="#a78bfa" icon="🏭" />
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código ou descrição..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
              color: "#e2e8f0", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Filial filter */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", ...FILIAIS] as (Filial | "all")[]).map((f) => (
            <button key={f} onClick={() => setSelectedFilial(f)} style={{
              padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              background: selectedFilial === f ? (f === "all" ? "#1e3a5f" : FILIAL_INFO[f as Filial].cor + "33") : "#0f172a",
              color: selectedFilial === f ? (f === "all" ? "#60a5fa" : FILIAL_INFO[f as Filial].cor) : "#475569",
              borderWidth: 1, borderStyle: "solid",
              borderColor: selectedFilial === f ? (f === "all" ? "#3B82F6" : FILIAL_INFO[f as Filial].cor) : "#1e293b",
            }}>
              {f === "all" ? "Todas" : FILIAL_INFO[f as Filial].nome.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Margin filter */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {(["all","critico","ok"] as const).map((v) => (
            <button key={v} onClick={() => setFilterMarg(v)} style={{
              padding: "6px 14px", borderRadius: 99, border: "1px solid", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              background: filterMarg === v ? (v === "critico" ? "#450a0a" : v === "ok" ? "#052e16" : "#1e3a5f") : "#0f172a",
              color: filterMarg === v ? (v === "critico" ? "#f87171" : v === "ok" ? "#4ade80" : "#60a5fa") : "#475569",
              borderColor: filterMarg === v ? (v === "critico" ? "#7f1d1d" : v === "ok" ? "#166534" : "#1d4ed8") : "#1e293b",
            }}>
              {v === "all" ? "Todos" : v === "critico" ? "🚨 Críticos" : "✅ Saudáveis"}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: "#475569" }}>
        Exibindo <strong style={{ color: "#94a3b8" }}>{Math.min(filtered.length, 500)}</strong> de <strong style={{ color: "#94a3b8" }}>{filtered.length}</strong> produtos
        {search && <span> · filtrado por "<em style={{ color: "#60a5fa" }}>{search}</em>"</span>}
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", borderRadius: 14, border: "1px solid #1e293b", boxShadow: "0 4px 24px #00000040" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#080f1a" }}>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #1e293b", whiteSpace: "nowrap" }}>
                Filial
              </th>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #1e293b", whiteSpace: "nowrap" }}>
                BU
              </th>
              <ThBtn col="seqProd">Código</ThBtn>
              <ThBtn col="descricao">Descrição</ThBtn>
              <ThBtn col="estoque">Estoque</ThBtn>
              <ThBtn col="custoLiq">Custo Liq</ThBtn>
              <ThBtn col="atual">Preço Venda</ThBtn>
              <ThBtn col="marg">Margem</ThBtn>
              <th style={{ padding: "11px 16px", textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #1e293b" }}>
                Status
              </th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#fbbf24", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #1e293b", whiteSpace: "nowrap" }}>
                Margem Desejada
              </th>
              <th style={{ padding: "11px 16px", textAlign: "right", color: "#fbbf24", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid #1e293b", whiteSpace: "nowrap" }}>
                Preço Futuro
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((p, i) => {
              const ok = p.marg >= 17;
              const rowBg = p.marg < 10 ? "#0d0505" : p.marg < 17 ? "#0a0808" : i % 2 === 0 ? "#080f1a" : "#060c14";
              return (
                <tr
                  key={`${p.filial}-${p.seqProd}-${i}`}
                  style={{ borderBottom: "1px solid #111827", background: rowBg, transition: "background .15s" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#0f1929")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = rowBg)}
                >
                  {/* Filial */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#64748b", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
                        {FILIAL_INFO[p.filial]?.nome?.split(" ")[0] || p.filial}
                      </span>
                    </div>
                  </td>

                  {/* BU */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 6,
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                      background: p.bu === "FOODS" ? "#052e16" : "#1e1b4b",
                      color:      p.bu === "FOODS" ? "#4ade80"  : "#a78bfa",
                      border: `1px solid ${p.bu === "FOODS" ? "#166534" : "#4c1d95"}`,
                    }}>
                      {p.bu || "–"}
                    </span>
                  </td>

                  {/* Código */}
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: "#60a5fa", whiteSpace: "nowrap" }}>
                    {p.seqProd}
                  </td>

                  {/* Descrição */}
                  <td style={{ padding: "10px 16px", maxWidth: 260 }}>
                    <div style={{ color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.descricao}>
                      {p.descricao}
                    </div>
                  </td>

                  {/* Estoque */}
                  <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontFamily: "monospace", fontWeight: 700, fontSize: 13,
                      color: p.estoque === 0 ? "#f87171" : p.estoque < 5 ? "#fb923c" : "#e2e8f0",
                    }}>
                      {p.estoque.toLocaleString("pt-BR")}
                    </span>
                    {p.estoque === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171" }}>RUPTURA</span>}
                  </td>

                  {/* Custo Liq */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    R$ {p.custoLiq.toFixed(2)}
                  </td>

                  {/* Preço Venda */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap" }}>
                    R$ {p.atual.toFixed(2)}
                  </td>

                  {/* Margem */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontFamily: "monospace", fontWeight: 800, fontSize: 13,
                        color: p.marg < 10 ? "#f43f5e" : p.marg < 17 ? "#f87171" : p.marg < 25 ? "#fbbf24" : "#4ade80",
                      }}>
                        {p.marg.toFixed(1)}%
                      </span>
                      <div style={{ width: 48, background: "#1e293b", borderRadius: 99, height: 5, flexShrink: 0 }}>
                        <div style={{
                          height: 5, borderRadius: 99,
                          width: `${Math.min((p.marg / 40) * 100, 100)}%`,
                          background: p.marg < 10 ? "#f43f5e" : p.marg < 17 ? "#f87171" : p.marg < 25 ? "#fbbf24" : "#4ade80",
                        }} />
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 99,
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                      background: ok ? "#052e16" : "#450a0a",
                      color: ok ? "#4ade80" : "#f87171",
                      border: `1px solid ${ok ? "#166534" : "#7f1d1d"}`,
                    }}>
                      {ok ? "✓ Saudável" : "✗ Crítico"}
                    </span>
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
                        background: "#0f172a", border: "1px solid #334155", color: "#fbbf24",
                        fontSize: 13, fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                        outline: "none",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#fbbf24")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#334155")}
                    />
                  </td>

                  {/* Preço Futuro */}
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {(() => {
                      const raw = desiredMargins[`${p.filial}-${p.seqProd}`];
                      if (!raw) return <span style={{ color: "#334155" }}>—</span>;
                      const margDes = parseFloat(raw.replace(",", "."));
                      if (isNaN(margDes) || margDes >= 100) return <span style={{ color: "#f87171" }}>—</span>;
                      const futuro = p.custoLiq / (1 - margDes / 100);
                      return <span style={{ color: "#fbbf24" }}>R$ {futuro.toFixed(2)}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ fontWeight: 700, color: "#64748b" }}>Nenhum produto encontrado</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tente ajustar os filtros ou a busca</div>
          </div>
        )}

        {filtered.length > 500 && (
          <div style={{ textAlign: "center", padding: "12px 20px", color: "#475569", fontSize: 12, borderTop: "1px solid #1e293b" }}>
            Exibindo primeiros 500 resultados. Use os filtros para refinar.
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
        <span><span style={{ color: "#f43f5e" }}>●</span> Margem &lt; 10% — Crítico grave</span>
        <span><span style={{ color: "#f87171" }}>●</span> 10–17% — Abaixo da meta</span>
        <span><span style={{ color: "#fbbf24" }}>●</span> 17–25% — Aceitável</span>
        <span><span style={{ color: "#4ade80" }}>●</span> &gt; 25% — Saudável</span>
        <span><span style={{ color: "#f87171" }}>●</span> RUPTURA — Estoque zerado</span>
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
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#4ade80" : "#f87171"} icon="📊" />
        <KpiCard label="Produtos Críticos" value={String(criticos)} sub="Margem < 17%" color="#f87171" icon="🚨" />
        <KpiCard label="Produtos Saudáveis" value={String(ok)} sub="Margem ≥ 17%" color="#4ade80" icon="✅" />
        <KpiCard label="Total Analisado" value={String(products.length)} sub="produtos" color="#60a5fa" icon="📦" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#64748b", fontSize: 12 }}>Filial:</span>
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
                : "#1e293b",
              color: selectedFilial === f ? "#fff" : "#64748b",
              transition: "all .2s",
            }}
          >
            {f === "all" ? "Todas" : FILIAL_INFO[f as Filial].nome.split(" ")[0]}
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
                background: filter === v ? (v === "critico" ? "#7f1d1d" : v === "ok" ? "#052e16" : "#1e3a5f") : "#1e293b",
                color: filter === v ? (v === "critico" ? "#f87171" : v === "ok" ? "#4ade80" : "#60a5fa") : "#64748b",
              }}
            >
              {v === "all" ? "Todos" : v === "critico" ? "🚨 Críticos" : "✅ Saudáveis"}
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
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
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #1e293b" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
              {["Filial", "Cód.", "Descrição", "Emb", "ABC", "Custo Liq", "Preço Venda", "Margem", "Sellout"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    color: "#64748b",
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
                  borderBottom: "1px solid #1e293b",
                  background: i % 2 === 0 ? "#080f1a" : "#0a1221",
                  transition: "background .15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#111827")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#080f1a" : "#0a1221")}
              >
                <td style={{ padding: "8px 14px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: FILIAL_INFO[p.filial]?.cor || "#64748b",
                      marginRight: 6,
                    }}
                  />
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>
                    {FILIAL_INFO[p.filial]?.nome?.split(" ")[0] || p.filial}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", color: "#475569", fontFamily: "monospace" }}>
                  {p.seqProd}
                </td>
                <td style={{ padding: "8px 14px", color: "#e2e8f0", maxWidth: 220 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.descricao}
                  </div>
                </td>
                <td style={{ padding: "8px 14px", color: "#64748b" }}>{p.embVir}</td>
                <td style={{ padding: "8px 14px" }}><ABCBadge abc={p.abc} /></td>
                <td style={{ padding: "8px 14px", color: "#94a3b8", fontFamily: "monospace" }}>
                  R$ {p.custoLiq.toFixed(2)}
                </td>
                <td style={{ padding: "8px 14px", color: "#e2e8f0", fontFamily: "monospace", fontWeight: 700 }}>
                  R$ {p.atual.toFixed(2)}
                </td>
                <td style={{ padding: "8px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MargemBadge marg={p.marg} />
                    <ProgressBar value={p.marg} max={40} color={p.marg >= 17 ? "#4ade80" : "#f87171"} />
                  </div>
                </td>
                <td style={{ padding: "8px 14px", color: "#94a3b8", fontFamily: "monospace" }}>
                  {p.sellout.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>
            Nenhum produto encontrado com os filtros selecionados.
          </div>
        )}
        {filtered.length > 200 && (
          <div style={{ textAlign: "center", padding: 12, color: "#475569", fontSize: 12 }}>
            Exibindo 200 de {filtered.length} produtos
          </div>
        )}
      </div>

      {/* Sellout chart by filial */}
      <div style={{ background: "#0f172a", borderRadius: 16, border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ color: "#e2e8f0", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          Sellout por Filial
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FILIAIS.map((f) => {
            const prods = data[f] || [];
            const total = prods.reduce((s, p) => s + p.sellout, 0);
            const maxTotal = Math.max(...FILIAIS.map((ff) => (data[ff] || []).reduce((s, p) => s + p.sellout, 0)), 1);
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 110, fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>
                  {FILIAL_INFO[f].nome}
                </span>
                <div style={{ flex: 1, background: "#1e293b", borderRadius: 99, height: 12 }}>
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
  const semEstoque = allProducts.filter((p) => p.estoque === 0).length;
  const estoqueBaixo = allProducts.filter((p) => p.estoque > 0 && p.estoque < 5).length;
  const estoqueOk = allProducts.filter((p) => p.estoque >= 5).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KpiCard label="Sem Estoque" value={String(semEstoque)} sub="ruptura total" color="#f87171" icon="📭" />
        <KpiCard label="Estoque Baixo" value={String(estoqueBaixo)} sub="menos de 5 unid." color="#fb923c" icon="⚠️" />
        <KpiCard label="Estoque OK" value={String(estoqueOk)} sub="5 ou mais unid." color="#4ade80" icon="📦" />
      </div>
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #1e293b" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
              {["Filial", "Cód.", "Descrição", "Estoque", "DDV", "Mes Ant", "Mes Atu", "Status"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allProducts
              .sort((a, b) => a.estoque - b.estoque)
              .slice(0, 200)
              .map((p, i) => {
                const status =
                  p.estoque === 0 ? { label: "Ruptura", color: "#f87171", bg: "#450a0a" } :
                  p.estoque < 5 ? { label: "Baixo", color: "#fb923c", bg: "#431407" } :
                  { label: "OK", color: "#4ade80", bg: "#052e16" };
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #1e293b", background: i % 2 === 0 ? "#080f1a" : "#0a1221" }}>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#64748b", marginRight: 6 }} />
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome?.split(" ")[0] || p.filial}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#475569", fontFamily: "monospace" }}>{p.seqProd}</td>
                    <td style={{ padding: "8px 14px", color: "#e2e8f0", maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace" }}>{p.estoque}</td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>{p.ddv || "–"}</td>
                    <td style={{ padding: "8px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{p.mesAnt}</td>
                    <td style={{ padding: "8px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{p.mesAtu}</td>
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
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#4ade80" : "#f87171"} icon="📊" />
        <KpiCard label="Críticos" value={String(criticos.length)} sub="abaixo de 17%" color="#f87171" icon="🚨" />
        <KpiCard label="Saudáveis" value={String(saudaveis.length)} sub="acima de 17%" color="#4ade80" icon="✅" />
        <KpiCard label="Perda Est." value={`R$ ${perdaEstimada.toFixed(0)}`} sub="impacto financeiro" color="#fb923c" icon="💸" />
      </div>

      {/* Margem por filial */}
      <div style={{ background: "#0f172a", borderRadius: 16, border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ color: "#e2e8f0", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          Margem Média por Filial
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FILIAIS.map((f) => {
            const prods = data[f] || [];
            const avg = prods.length ? prods.reduce((s, p) => s + p.marg, 0) / prods.length : 0;
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 110, fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>{FILIAL_INFO[f].nome}</span>
                <div style={{ flex: 1, background: "#1e293b", borderRadius: 99, height: 14, position: "relative" }}>
                  <div style={{ height: 14, borderRadius: 99, width: `${Math.min(avg / 40 * 100, 100)}%`, background: avg >= 17 ? "#4ade80" : "#f87171", transition: "width .6s" }} />
                  {/* 17% marker */}
                  <div style={{ position: "absolute", left: `${17 / 40 * 100}%`, top: 0, bottom: 0, width: 2, background: "#f59e0b" }} />
                </div>
                <span style={{ width: 50, fontSize: 13, fontWeight: 700, color: avg >= 17 ? "#4ade80" : "#f87171", textAlign: "right" }}>
                  {avg.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>
          ▐ Linha amarela = meta mínima de 17%
        </div>
      </div>

      {/* Top críticos */}
      <div style={{ background: "#0f172a", borderRadius: 16, border: "1px solid #7f1d1d", padding: 20 }}>
        <h3 style={{ color: "#f87171", margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>
          🚨 Top 20 Produtos Mais Críticos
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {criticos
            .sort((a, b) => a.marg - b.marg)
            .slice(0, 20)
            .map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#0a0a14", borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#7f1d1d", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>
                  <div style={{ color: "#475569", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome} · {p.seqProd}</div>
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
        <KpiCard label="Total Produtos" value={String(totalProdutos)} sub={`${totalFiliais} filiais`} color="#60a5fa" icon="📦" />
        <KpiCard label="Margem Média" value={`${margMedia.toFixed(1)}%`} color={margMedia >= 17 ? "#4ade80" : "#f87171"} icon="📊" />
        <KpiCard label="Sellout Total" value={totalSellout.toFixed(0)} color="#a78bfa" icon="🛒" />
        <KpiCard label="Críticos (< 17%)" value={String(criticos)} sub={`${((criticos / totalProdutos) * 100).toFixed(0)}% do mix`} color="#f87171" icon="🚨" />
        <KpiCard label="Ruptura" value={String(ruptura)} sub="sem estoque" color="#fb923c" icon="📭" />
        <KpiCard label="Classificação A" value={String(abcDist["A"] || 0)} sub="curva A" color="#60a5fa" icon="⭐" />
      </div>

      {/* Painel por filial */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FILIAIS.map((f) => {
          const prods = data[f] || [];
          const avg = prods.length ? prods.reduce((s, p) => s + p.marg, 0) / prods.length : 0;
          const crit = prods.filter((p) => p.marg < 17).length;
          const rupt = prods.filter((p) => p.estoque === 0).length;
          return (
            <div key={f} style={{ background: "#0f172a", border: `1px solid ${FILIAL_INFO[f].cor}44`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: FILIAL_INFO[f].cor }} />
                <span style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 13 }}>{FILIAL_INFO[f].nome}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>Produtos</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{prods.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>Margem Média</span>
                  <span style={{ color: avg >= 17 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{avg.toFixed(1)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>Críticos</span>
                  <span style={{ color: "#f87171", fontWeight: 700 }}>{crit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>Rupturas</span>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KpiCard label="Vencendo em 30d" value={String(vencendo.length)} color="#f87171" icon="⏰" />
        <KpiCard label="Atenção (31–90d)" value={String(atencao.length)} color="#fb923c" icon="⚠️" />
        <KpiCard label="Shelf Life OK" value={String(ok.length)} sub="> 90 dias" color="#4ade80" icon="✅" />
      </div>
      <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid #1e293b" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
              {["Filial", "Cód.", "Descrição", "DDV (dias)", "Estoque", "Status"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allProducts
              .sort((a, b) => a.ddv - b.ddv)
              .slice(0, 200)
              .map((p, i) => {
                const status =
                  p.ddv <= 30 ? { label: "Vencendo", color: "#f87171", bg: "#450a0a" } :
                  p.ddv <= 90 ? { label: "Atenção", color: "#fb923c", bg: "#431407" } :
                  { label: "OK", color: "#4ade80", bg: "#052e16" };
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #1e293b", background: i % 2 === 0 ? "#080f1a" : "#0a1221" }}>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: FILIAL_INFO[p.filial]?.cor || "#64748b", marginRight: 6 }} />
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>{FILIAL_INFO[p.filial]?.nome?.split(" ")[0] || p.filial}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#475569", fontFamily: "monospace" }}>{p.seqProd}</td>
                    <td style={{ padding: "8px 14px", color: "#e2e8f0" }}>{p.descricao}</td>
                    <td style={{ padding: "8px 14px", color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace" }}>{p.ddv}</td>
                    <td style={{ padding: "8px 14px", color: "#94a3b8" }}>{p.estoque}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color }}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {allProducts.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>
            Nenhum produto com DDV encontrado nos dados carregados.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const [activeModule, setActiveModule] = useState<Module>("cruzamento");
  const [files, setFiles] = useState<UploadedFiles>({});
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [unrecognizedFiles, setUnrecognizedFiles] = useState<string[]>([]);
  const [data, setData] = useState<FilialData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

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

      // ── 3. Cruzamento direto por posição ──────────────────────────────────────
      // livro_01 – Poços:
      //   col[1] = código (coluna 2)
      //   col[2] = descrição (coluna C)
      //   col[6] = ESTOQUE (coluna 7)
      //   col[7] = DDV (coluna 8)
      //   col[16] = CUSTO LIQ (coluna 17)
      //   col[25] = ATUAL / preço venda (coluna 26)

      const buildProducts = (
        rawRows: string[][],        // todas as linhas incluindo header
        filial: Filial,
        colCod: number,
        colDesc: number,
        colEstoque: number,
        colDDV: number,
        colCustoFallback: number,
        colPrecoFallback: number,
        overrideEstoque?: Map<string, { estoque: string; custo: string }> // livro_10
      ): Product[] => {
        const header = rawRows[0] ?? [];
        const finalColCod = findHeaderIndex(header, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO"], colCod);
        const finalColDesc = findHeaderIndex(header, ["DESCRICAO", "DESCRICAO PRODUTO", "DESC"], colDesc);
        const finalColEstoque = findHeaderIndex(header, ["ESTOQUE"], colEstoque);
        const finalColDDV = findHeaderIndex(header, ["DDV"], colDDV);
        const finalColCusto = findHeaderIndex(header, ["CUSTO LIQ", "CUSTO LIQUIDO", "CUSTO.LIQ"], colCustoFallback);
        const finalColPreco = findHeaderIndex(header, ["ATUAL", "PRECO VENDA", "PRECO DE VENDA", "PV"], colPrecoFallback);

        const dataRows = rawRows.slice(1); // pula header
        const result: Product[] = [];

        dataRows.forEach((cols) => {
          const rawCod = cols[finalColCod] ?? "";
          const cod = normCod(rawCod);
          if (!cod || !baseMap.has(cod)) return; // só produtos da base

          const baseEntry = baseMap.get(cod)!;
          const desc = baseEntry.desc || cols[finalColDesc] || rawCod;

          // Usa override de livro_10 se fornecido (Poços e Focomix MG)
          const estoqueStr = overrideEstoque?.get(cod)?.estoque ?? cols[finalColEstoque] ?? "0";
          const custoStr   = overrideEstoque?.get(cod)?.custo   ?? cols[finalColCusto]   ?? "0";

          const estoque  = num(estoqueStr);
          const custoLiq = num(custoStr);
          const atual    = num(cols[finalColPreco] ?? "0");
          const ddv      = num(cols[finalColDDV] ?? "0");
          const marg     = atual > 0 ? ((atual - custoLiq) / atual) * 100 : 0;

          result.push({
            familia: "",
            seqProd: baseEntry.cod,
            descricao: desc,
            embVir: "",
            estoque,
            sellout: 0,
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
            filial,
            bu: baseEntry.bu,
          });
        });

        return result;
      };

      // ── 4. Lê livro_10 (estoque/custo compartilhado para Poços e Focomix MG) ──
      // col[1] = código, col[6] = estoque, col[16] = custo liq
      let map10 = new Map<string, { estoque: string; custo: string }>();
      if (files.livro_10) {
        const raw10 = await parseCSVRaw(files.livro_10);
        const header10 = raw10[0] ?? [];
        const codCol10 = findHeaderIndex(header10, ["SEQ.PROD", "SEQ PROD", "COD", "CODIGO"], 1);
        const estoqueCol10 = findHeaderIndex(header10, ["ESTOQUE"], 6);
        const custoCol10 = findHeaderIndex(header10, ["CUSTO LIQ", "CUSTO LIQUIDO", "CUSTO.LIQ"], 16);
        raw10.slice(1).forEach((cols) => {
          const cod = normCod(cols[codCol10] ?? "");
          if (cod) map10.set(cod, { estoque: cols[estoqueCol10] ?? "0", custo: cols[custoCol10] ?? "0" });
        });
      }

      const newData: FilialData = {};

      // Filial 01 – Poços (padrão, sempre primeiro)
      if (files.livro_01) {
        const raw01 = await parseCSVRaw(files.livro_01);
        newData["01"] = buildProducts(raw01, "01", 1, 2, 6, 7, 16, 19, map10.size > 0 ? map10 : undefined);
      }

      // Filial 11 – Campinas
      if (files.livro_11) {
        const raw = await parseCSVRaw(files.livro_11);
        newData["11"] = buildProducts(raw, "11", 1, 2, 6, 7, 16, 19);
      }

      // Filial 12 – Osasco
      if (files.livro_12) {
        const raw = await parseCSVRaw(files.livro_12);
        newData["12"] = buildProducts(raw, "12", 1, 2, 6, 7, 16, 19);
      }

      // Filial 14 – Betim
      if (files.livro_14) {
        const raw = await parseCSVRaw(files.livro_14);
        newData["14"] = buildProducts(raw, "14", 1, 2, 6, 7, 16, 19);
      }

      // Filial 501 – Focomix SP
      if (files.livro_501) {
        const raw = await parseCSVRaw(files.livro_501);
        newData["501"] = buildProducts(raw, "501", 1, 2, 6, 7, 16, 19);
      }

      // Filial 502 – Focomix MG (preço/venda = livro_502; estoque/custo = livro_10)
      if (files.livro_502) {
        const raw = await parseCSVRaw(files.livro_502);
        newData["502"] = buildProducts(raw, "502", 1, 2, 6, 7, 16, 19, map10.size > 0 ? map10 : undefined);
      }

      setData(newData);
      setLastUpdate(new Date().toLocaleString("pt-BR"));
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
    { id: "cruzamento", label: "Resultado do Cruzamento", icon: "🔗" },
    { id: "preco", label: "Análise de Preço", icon: "💰" },
    { id: "margem", label: "Análise de Margem", icon: "📊" },
    { id: "estoque", label: "Análise de Estoque", icon: "📦" },
    { id: "shelflife", label: "Análise de Shelf Life", icon: "⏰" },
    { id: "geral", label: "Análise Geral", icon: "🏢" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020817",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        display: "flex",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          background: "#0a0f1e",
          borderRight: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "24px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              🏬
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>Vila Nova</div>
              <div style={{ fontSize: 10, color: "#475569" }}>Gestão Comercial</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e293b" }}>
            Unilever · {new Date().getFullYear()}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 12px" }}>
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                marginBottom: 4,
                background: activeModule === m.id ? "#1e3a5f" : "transparent",
                color: activeModule === m.id ? "#60a5fa" : "#475569",
                fontWeight: activeModule === m.id ? 700 : 400,
                fontSize: 13,
                textAlign: "left",
                transition: "all .2s",
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </nav>

        {/* Upload button */}
        <div style={{ padding: 12 }}>
          <button
            onClick={() => setShowUpload(!showUpload)}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #1e293b",
              background: "#0f172a",
              color: "#60a5fa",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            📂 Gerenciar Arquivos
            {(csvLoaded + (baseFile ? 1 : 0)) > 0 && (
              <span style={{ marginLeft: "auto", background: "#1e3a5f", color: "#60a5fa", padding: "1px 8px", borderRadius: 99, fontSize: 11 }}>
                {csvLoaded + (baseFile ? 1 : 0)}
              </span>
            )}
          </button>
          {lastUpdate && (
            <div style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 8 }}>
              Atualizado: {lastUpdate}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Header */}
        <div
          style={{
            padding: "20px 32px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#020817",
            zIndex: 10,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>
              {modules.find((m) => m.id === activeModule)?.icon}{" "}
              {modules.find((m) => m.id === activeModule)?.label}
            </h1>
            {hasData && (
              <p style={{ margin: 0, fontSize: 12, color: "#475569", marginTop: 2 }}>
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
                ? "#1e293b"
                : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
              color: loading || !canGenerate ? "#475569" : "#fff",
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
            }}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              border: "1px solid #1e293b",
              background: "#0f172a",
              color: "#94a3b8",
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
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>
                  📂 Upload de Arquivos
                </h2>
                {hasData && (
                  <button
                    onClick={() => setShowUpload(false)}
                    style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}
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
            <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: 16, marginBottom: 20, color: "#f87171", fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* No data state */}
          {!hasData && !showUpload && (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#475569" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <h3 style={{ color: "#64748b", fontWeight: 700 }}>Nenhum dado carregado</h3>
              <p style={{ fontSize: 14 }}>Faça upload dos arquivos CSV e clique em "Gerar Análise"</p>
              <button
                onClick={() => setShowUpload(true)}
                style={{
                  marginTop: 16,
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#60a5fa",
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
        ::-webkit-scrollbar-track { background: #0a0f1e; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }
      `}</style>
    </div>
  );
}

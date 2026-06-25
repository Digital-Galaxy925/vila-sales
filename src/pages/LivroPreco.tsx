import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, RotateCcw, Download, AlertTriangle } from "lucide-react";

/* ---------- parsing helpers ---------- */

/** Parse pt-BR number: remove quotes, %, treat "." as thousand and "," as decimal. */
function parseBR(value: any): number {
  if (value === null || value === undefined) return 0;
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/"/g, "").replace(/%/g, "").trim();
  if (!s) return 0;
  // remove thousand separators (dots) then convert decimal comma to dot
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Split CSV line respecting double quotes. */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((x) => x.replace(/^"|"$/g, ""));
}

function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

/** Extract branch number from file name. LIVRO_11.CSV → "11" */
function filialFromName(name: string): string {
  const m = name.match(/LIVRO[_\s-]*([0-9]+)/i);
  return m ? m[1] : name.replace(/\.csv$/i, "");
}

/** Map filial code → friendly display name. */
const FILIAL_LABELS: Record<string, string> = {
  "01": "01 - Poços de Caldas",
  "1": "01 - Poços de Caldas",
  "11": "11 - Campinas",
  "12": "12 - Osasco",
  "14": "14 - Betim",
  "501": "501 - Focomix SP",
  "502": "502 - Focomix MG",
};
function filialLabel(code: string): string {
  const k = String(code ?? "").trim();
  return FILIAL_LABELS[k] ?? FILIAL_LABELS[k.replace(/^0+/, "")] ?? k;
}

/** Derive BU from Fornecedor. */
function deriveBU(fornecedor: string): "HC" | "FR" | null {
  const f = (fornecedor || "").toUpperCase();
  if (!f.includes("UNILEVER")) return null;
  if (f.includes("HC")) return "HC";
  if (f.includes("FOODS") || f.includes("ALIMENTOS") || /\bFR\b/.test(f))
    return "FR";
  return null; // exclude BW, PC, etc.
}

/* ---------- domain types ---------- */

type Trend = "up" | "down" | "flat";

interface Item {
  key: string;
  bu: "HC" | "FR";
  filial: string;
  familia: string;
  produto: string;
  descricao: string;
  unidCx: string;
  estoque: number;
  ddv: number;
  custoLiq: number;
  atual: number;
  promoc: number;
  vAtu: number;
  v1: number;
  v2: number;
  v3: number;
  inPromo: boolean;
  trend: Trend;
  sugeridoCalc: number;
}

/* ---------- core compute ---------- */

function computeSugerido(
  ref: number,
  atual: number,
  inPromo: boolean,
  trend: Trend,
  promoc: number,
  descontoPct: number,
  ddvOk: boolean,
): number {
  const piso = 0.9 * ref;
  let sug = atual;
  if (inPromo && trend === "up") sug = promoc;
  else if (inPromo && (trend === "down" || trend === "flat"))
    sug = Math.max(promoc * (1 - descontoPct), 0.9 * atual);
  else if (!inPromo && trend === "down" && ddvOk) sug = atual * (1 - descontoPct);
  else sug = atual;
  // clamp into [piso, ref] then round
  sug = Math.min(Math.max(sug, piso), ref);
  sug = Math.round(sug * 100) / 100;
  // re-apply floor after rounding
  if (sug < piso) sug = Math.round(piso * 100) / 100;
  if (sug > ref) sug = Math.round(ref * 100) / 100;
  return sug;
}

/* ---------- formatting helpers ---------- */
const fmtBRL = (n: number) =>
  isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "-";
const fmtPct = (n: number) =>
  isFinite(n) ? (n * 100).toFixed(1).replace(".", ",") + "%" : "-";
const fmtNum = (n: number, dec = 0) =>
  isFinite(n)
    ? n.toLocaleString("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : "-";

/* ---------- page ---------- */

const DDV_OPTIONS = [
  { value: "15", label: "DDV ≥ 15" },
  { value: "30", label: "DDV ≥ 30" },
  { value: "45", label: "DDV ≥ 45" },
  { value: "60", label: "DDV ≥ 60" },
  { value: "0", label: "Todos os DDVs" },
];

/** Normalize a header label: uppercase, strip accents/spaces/punctuation. */
function normHeader(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

/** Return a value from a row by trying multiple header candidates (normalized). */
function pick(row: Record<string, string>, candidates: string[]): string {
  const want = candidates.map(normHeader);
  for (const k of Object.keys(row)) {
    if (want.includes(normHeader(k))) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return "";
}

function normalizeCode(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/^0+(\d)/, "$1");
}

/** Detect the header row inside the first rows of a CSV matrix. */
function matrixToRecords(mat: string[][]): Record<string, string>[] {
  if (!Array.isArray(mat) || mat.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(mat.length, 6); i++) {
    const norm = (mat[i] || []).map(normHeader);
    if (norm.includes("VDSEMATU") || norm.includes("DESCRICAO") || norm.includes("SEQPROD")) {
      headerIdx = i;
      break;
    }
  }
  const headers = (mat[headerIdx] || []).map((h) => String(h ?? "").trim());
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < mat.length; i++) {
    const row = mat[i] || [];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(row[idx] ?? "").trim();
    });
    out.push(obj);
  }
  return out;
}

const LivroPreco = () => {
  const [ddvMin, setDdvMin] = useState<string>("15");
  const [descontoStr, setDescontoStr] = useState<string>("10");
  const [items, setItems] = useState<Item[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [filtroFilial, setFiltroFilial] = useState<string>("ALL");
  const [filtroBU, setFiltroBU] = useState<string>("ALL");

  function gerar() {
    let rawByFilial: Record<string, string[][]> = {};
    try {
      const saved = localStorage.getItem("vilasales_livros_raw");
      if (saved) rawByFilial = JSON.parse(saved);
    } catch (_) {}

    const ddvLimite = Number(ddvMin) || 0;
    let descPct = (parseBR(descontoStr) || 0) / 100;
    if (descPct < 0) descPct = 0;
    if (descPct > 0.1) descPct = 0.1;

    const out: Item[] = [];
    const hasRaw = rawByFilial && Object.keys(rawByFilial).length > 0;

    if (hasRaw) {
      // Caminho principal: usa as matrizes CSV brutas salvas no upload central.
      const byFilial: Record<string, Record<string, string>[]> = {};
      for (const fil of Object.keys(rawByFilial)) {
        byFilial[fil] = matrixToRecords(rawByFilial[fil]);
      }

      const rowKey = (r: Record<string, string>) =>
        normalizeCode(pick(r, ["SEQ.PROD", "SEQ PROD", "SEQPROD", "COD", "CODIGO", "SEQ_PROD"]));

      type Pair = { filial: string; salesRows: Record<string, string>[]; stockMap: Map<string, Record<string, string>> };
      const pairs: Pair[] = [];
      const handled = new Set<string>();

      // Mapeamento explícito filial → (estoque, vendas) conforme regras de negócio.
      const pairing: Array<[string, string, string]> = [
        ["01", "01", "10"],   // Poços de Caldas: estoque 01, vendas 10
        ["11", "11", "11"],   // Campinas
        ["12", "12", "12"],   // Osasco
        ["14", "14", "14"],   // Betim
        ["501", "501", "501"],// Focomix SP
        ["502", "502", "510"],// Focomix MG: estoque 502, vendas 510
      ];

      for (const [label, stockK, salesK] of pairing) {
        const sales = byFilial[salesK] || byFilial[stockK];
        const stock = byFilial[stockK] || byFilial[salesK];
        if (!sales && !stock) continue;
        const sm = new Map<string, Record<string, string>>();
        (stock || []).forEach((r) => sm.set(rowKey(r), r));
        pairs.push({ filial: label, salesRows: sales || [], stockMap: sm });
        handled.add(stockK);
        handled.add(salesK);
      }
      for (const fil of Object.keys(byFilial)) {
        if (handled.has(fil)) continue;
        const sm = new Map<string, Record<string, string>>();
        byFilial[fil].forEach((r) => sm.set(rowKey(r), r));
        pairs.push({ filial: fil, salesRows: byFilial[fil], stockMap: sm });
      }

      for (const { filial, salesRows, stockMap } of pairs) {
        for (const r of salesRows) {
          const fornecedor = pick(r, ["Fornecedor", "FORNECEDOR"]);
          const bu = deriveBU(fornecedor);
          if (!bu) continue;

          const stockRow = stockMap.get(rowKey(r)) || r;

          const ddv = parseBR(pick(stockRow, ["DDV"]) || pick(r, ["DDV"]));
          if (!ddv || ddv <= 0) continue;
          if (ddvLimite > 0 && ddv < ddvLimite) continue;

          const atual = parseBR(pick(r, ["ATUAL"]));
          const promoc = parseBR(pick(r, ["PROMOC", "PROMOCAO"]));
          const custoLiq = parseBR(pick(r, ["CUSTO LIQ", "CUSTO.LIQ", "CUSTOLIQ", "CUSTO LIQUIDO"]));
          const estoque = parseBR(pick(stockRow, ["ESTOQUE"]) || pick(r, ["ESTOQUE"]));
          const vAtu = parseBR(pick(r, ["VD.SEM.ATU", "VD SEM ATU", "VDSEMATU"]));
          const v1 = parseBR(pick(r, ["VD.SEM. -1", "VD.SEM.-1", "VD SEM -1", "VDSEM-1"]));
          const v2 = parseBR(pick(r, ["VD.SEM. -2", "VD.SEM.-2", "VD SEM -2", "VDSEM-2"]));
          const v3 = parseBR(pick(r, ["VD.SEM. -3", "VD.SEM.-3", "VD SEM -3", "VDSEM-3"]));

          const inPromo = promoc > 0 && promoc < atual;
          const ref = inPromo ? promoc : atual;
          if (!ref || ref <= 0) continue;

          const media3 = (v1 + v2 + v3) / 3;
          let trend: Trend = "flat";
          if (vAtu > media3) trend = "up";
          else if (vAtu < v1 && v1 < v2 && v2 < v3) trend = "down";

          const sug = computeSugerido(ref, atual, inPromo, trend, promoc, descPct, true);

          const familia = pick(r, ["FAMILIA", "FAMÍLIA", "COD FAMILIA", "COD.FAMILIA", "COD_FAMILIA"]) ||
            pick(stockRow, ["FAMILIA", "FAMÍLIA", "COD FAMILIA", "COD.FAMILIA", "COD_FAMILIA"]);
          const produto = pick(r, ["SEQ.PROD", "SEQ PROD", "SEQPROD", "COD", "CODIGO", "SEQ_PROD"]) ||
            pick(stockRow, ["SEQ.PROD", "SEQ PROD", "SEQPROD", "COD", "CODIGO", "SEQ_PROD"]);
          out.push({
            key: `${filial}__${produto}__${familia}`,
            bu,
            filial,
            familia,
            produto,
            descricao: pick(r, ["DESCRICAO", "DESCRIÇÃO"]) || pick(stockRow, ["DESCRICAO", "DESCRIÇÃO"]),
            unidCx: pick(r, ["EMB.CMP", "EMB CMP", "EMBCMP"]) || pick(stockRow, ["EMB.CMP", "EMB CMP", "EMBCMP"]),
            estoque,
            ddv,
            custoLiq,
            atual,
            promoc,
            vAtu, v1, v2, v3,
            inPromo,
            trend,
            sugeridoCalc: sug,
          });
        }
      }
    } else {
      // Fallback: usa os produtos já parseados em vilasales_data (sem vendas semanais).
      let data: Record<string, any[]> = {};
      try {
        const saved = localStorage.getItem("vilasales_data");
        if (saved) data = JSON.parse(saved) || {};
      } catch (_) {}
      const totalProds = Object.values(data).reduce(
        (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
        0,
      );
      if (totalProds === 0) {
        toast({
          title: "Nenhum livro carregado",
          description: "Vá em 'Upload de Livros' e envie os arquivos LIVRO_*.CSV.",
          variant: "destructive",
        });
        return;
      }
      const mapBU = (raw: string): "HC" | "FR" | null => {
        const b = String(raw || "").toUpperCase().trim();
        if (b === "HC") return "HC";
        if (b === "FR" || b === "FOODS" || b === "FOOD" || b === "ALIMENTOS") return "FR";
        return null;
      };
      for (const [filial, arr] of Object.entries(data)) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          const bu = mapBU(p?.bu);
          if (!bu) continue;
          const ddv = Number(p?.ddv) || 0;
          if (!ddv || ddv <= 0) continue;
          if (ddvLimite > 0 && ddv < ddvLimite) continue;
          const atual = Number(p?.atual) || 0;
          const promoc = Number(p?.promoc) || 0;
          const custoLiq = Number(p?.custoLiq) || 0;
          const estoque = Number(p?.estoque) || 0;
          const vAtu = Number(p?.vAtu) || 0;
          const v1 = Number(p?.v1) || 0;
          const v2 = Number(p?.v2) || 0;
          const v3 = Number(p?.v3) || 0;
          const inPromo = promoc > 0 && promoc < atual;
          const ref = inPromo ? promoc : atual;
          if (!ref || ref <= 0) continue;
          const media3 = (v1 + v2 + v3) / 3;
          let trend: Trend = "flat";
          if (vAtu > media3) trend = "up";
          else if (vAtu < v1 && v1 < v2 && v2 < v3) trend = "down";
          const sug = computeSugerido(ref, atual, inPromo, trend, promoc, descPct, true);
          const familia = String(p?.familia ?? "");
          const produto = String(p?.seqProd ?? "");
          out.push({
            key: `${filial}__${produto}__${familia}`,
            bu,
            filial,
            familia,
            produto,
            descricao: String(p?.descricao ?? ""),
            unidCx: String(p?.embCmp ?? ""),
            estoque,
            ddv,
            custoLiq,
            atual,
            promoc,
            vAtu,
            v1,
            v2,
            v3,
            inPromo,
            trend,
            sugeridoCalc: sug,
          });
        }
      }
    }

    out.sort((a, b) =>
      a.filial.localeCompare(b.filial) ||
      a.bu.localeCompare(b.bu) ||
      a.descricao.localeCompare(b.descricao),
    );
    setItems(out);
    setOverrides({});
    toast({
      title: "Livro Preço gerado",
      description: `${out.length} item(ns) sugeridos.${hasRaw ? "" : " (sem vendas semanais — refaça o upload em 'Upload de Livros' para tendências.)"}`,
    });
  }

  const filiais = useMemo(
    () => Array.from(new Set(items.map((i) => i.filial))).sort(),
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (filtroFilial === "ALL" || i.filial === filtroFilial) &&
          (filtroBU === "ALL" || i.bu === filtroBU),
      ),
    [items, filtroFilial, filtroBU],
  );

  function getPreco(it: Item) {
    return overrides[it.key] ?? it.sugeridoCalc;
  }

  function setPreco(key: string, v: number) {
    setOverrides((o) => ({ ...o, [key]: v }));
  }

  function restoreRow(key: string) {
    setOverrides((o) => {
      const c = { ...o };
      delete c[key];
      return c;
    });
  }

  function restoreAll() {
    setOverrides({});
  }

  function exportXLSX() {
    if (visible.length === 0) {
      toast({ title: "Nada para exportar", variant: "destructive" });
      return;
    }
    const headers = [
      "BU",
      "Filial",
      "Código Família",
      "Código Produto",
      "Descrição",
      "Unid/cx",
      "Estoque",
      "DDV",
      "VD.SEM. -3",
      "VD.SEM. -2",
      "VD.SEM. -1",
      "Venda Média",
      "Venda Atual",
      "Custo Líquido",
      "Atual",
      "PROMOC",
      "Preço Sugerido",
      "Variação",
      "Margem",
      "Margem Atual",
    ];
    const rows = visible.map((i) => {
      const p = getPreco(i);
      const variacao = i.atual > 0 ? p / i.atual - 1 : 0;
      const margem = p > 0 ? (p - i.custoLiq) / p : 0;
      const margemAtual = i.atual > 0 ? (i.atual - i.custoLiq) / i.atual : 0;
      return [
        i.bu,
        i.filial,
        i.familia,
        i.produto,
        i.descricao,
        i.unidCx,
        i.estoque,
        i.ddv,
        i.v3,
        i.v2,
        i.v1,
        (i.v1 + i.v2 + i.v3) / 3,
        i.vAtu,
        i.custoLiq,
        i.atual,
        i.promoc,
        p,
        variacao,
        margem,
        margemAtual,
      ];
    });
    const wb = XLSX.utils.book_new();
    const grupos = new Map<string, any[][]>();
    rows.forEach((r) => {
      const f = String(r[1] ?? "").trim() || "SEM_FILIAL";
      if (!grupos.has(f)) grupos.set(f, []);
      grupos.get(f)!.push(r);
    });
    const filiaisOrd = Array.from(grupos.keys()).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });
    filiaisOrd.forEach((f) => {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...grupos.get(f)!]);
      const moneyCols = ["N", "O", "P", "Q"]; // Custo Líq, Atual, PROMOC, Preço Sugerido
      const pctCols = ["R", "S", "T"]; // Variação, Margem, Margem Atual
      const intCols = ["G", "H", "I", "J", "K", "L"]; // Estoque, DDV, V-3, V-2, V-1, Venda Média
      const dataLen = grupos.get(f)!.length;
      for (let r = 2; r <= dataLen + 1; r++) {
        moneyCols.forEach((c) => {
          const cell = ws[`${c}${r}`];
          if (cell && typeof cell.v === "number") cell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
        });
        pctCols.forEach((c) => {
          const cell = ws[`${c}${r}`];
          if (cell && typeof cell.v === "number") cell.z = "0.00%";
        });
        intCols.forEach((c) => {
          const cell = ws[`${c}${r}`];
          if (cell && typeof cell.v === "number") { cell.t = "n"; cell.z = "#,##0"; }
        });
      }
      const sheetName = filialLabel(f).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    XLSX.writeFile(wb, `LivroPreco_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Livro Preço"
        description="Sugestão de preços (sáb→sex) por filial e BU para Unilever HC/FR."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={gerar}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Gerar Livro Preço
            </Button>
            <Button
              size="sm"
              onClick={exportXLSX}
              className="bg-[#107C41] hover:bg-[#0B5A2E] text-white border-0"
            >
              <Download className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
          </div>
        }
      />

      {/* control bar */}
      <div className="rounded-xl border border-[#d2e3fb] bg-[#f5f9ff] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div>
          <Label className="text-xs font-medium text-[#6e6e73]">DDV mínimo</Label>
          <Select value={ddvMin} onValueChange={setDdvMin}>
            <SelectTrigger className="h-9 mt-1 bg-white border-[#d2d2d7] rounded-lg focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DDV_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium text-[#6e6e73]">Desconto alvo (%) — máx 10</Label>
          <Input
            className="h-9 mt-1 bg-white border-[#d2d2d7] rounded-lg focus-visible:ring-2 focus-visible:ring-[#0071e3]/30 focus-visible:border-[#0071e3]"
            value={descontoStr}
            onChange={(e) => setDescontoStr(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-[#6e6e73]">Filtrar Filial</Label>
          <Select value={filtroFilial} onValueChange={setFiltroFilial}>
            <SelectTrigger className="h-9 mt-1 bg-white border-[#d2d2d7] rounded-lg focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={f}>
                  {filialLabel(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium text-[#6e6e73]">Filtrar BU</Label>
          <Select value={filtroBU} onValueChange={setFiltroBU}>
            <SelectTrigger className="h-9 mt-1 bg-white border-[#d2d2d7] rounded-lg focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="HC">HC</SelectItem>
              <SelectItem value="FR">FR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={restoreAll} className="flex-1 bg-white border-[#d2d2d7] text-[#0071e3] hover:bg-[#0071e3]/5 hover:text-[#0071e3] rounded-lg">
            <RotateCcw className="w-4 h-4 mr-1" /> Restaurar tudo
          </Button>
        </div>
      </div>


      {/* table */}
      <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-260px)]">
        <table className="w-full text-xs">
          <thead className="bg-[#eef4fb] sticky top-0 z-20 border-b border-[#d2e3fb]">
            <tr className="text-left">
              {[
                { h: "BU", sticky: 0, w: 50 },
                { h: "Filial", sticky: 50, w: 150 },
                { h: "Cód. Família", sticky: 200, w: 90 },
                { h: "Cód. Produto", sticky: 290, w: 90 },
                { h: "Descrição", sticky: 380, w: 240 },
                { h: "Unid/cx" }, { h: "Estoque" }, { h: "DDV" },
                { h: "V-3" }, { h: "V-2" }, { h: "V-1" },
                { h: "Venda Média" }, { h: "Venda Atual" },
                { h: "Custo Líq." }, { h: "Atual" }, { h: "PROMOC" },
                { h: "Preço Sugerido" }, { h: "Variação" }, { h: "Margem" }, { h: "Margem Atual" }, { h: "" },
              ].map((c, idx) => (
                <th
                  key={c.h + idx}
                  className={`px-2 py-2 font-semibold text-foreground whitespace-nowrap bg-muted/50 ${c.sticky !== undefined ? "sticky z-30" : ""}`}
                  style={c.sticky !== undefined ? { left: c.sticky, minWidth: c.w } : undefined}
                >
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={21} className="text-center text-muted-foreground py-8">
                  Faça upload dos arquivos LIVRO_*.CSV e clique em "Gerar Livro Preço".
                </td>
              </tr>
            )}
            {visible.map((i) => {
              const p = getPreco(i);
              const ref = i.inPromo ? i.promoc : i.atual;
              const piso = 0.9 * ref;
              const belowPiso = p < piso - 1e-9;
              const variacao = i.atual > 0 ? p / i.atual - 1 : 0;
              const margem = p > 0 ? (p - i.custoLiq) / p : 0;
              const margemAtual = i.atual > 0 ? (i.atual - i.custoLiq) / i.atual : 0;
              const edited = overrides[i.key] !== undefined;
              return (
                <tr key={i.key} className="border-t border-border hover:bg-muted/30 group">
                  <td className="px-2 py-1.5 font-medium sticky left-0 z-10 bg-card group-hover:bg-muted/30" style={{ minWidth: 50 }}>{i.bu}</td>
                  <td className="px-2 py-1.5 sticky z-10 bg-card group-hover:bg-muted/30 whitespace-nowrap" style={{ left: 50, minWidth: 150 }}>{filialLabel(i.filial)}</td>
                  <td className="px-2 py-1.5 sticky z-10 bg-card group-hover:bg-muted/30" style={{ left: 200, minWidth: 90 }}>{i.familia}</td>
                  <td className="px-2 py-1.5 sticky z-10 bg-card group-hover:bg-muted/30" style={{ left: 290, minWidth: 90 }}>{i.produto}</td>
                  <td className="px-2 py-1.5 max-w-[240px] truncate sticky z-10 bg-card group-hover:bg-muted/30" style={{ left: 380, minWidth: 240 }} title={i.descricao}>
                    {i.descricao}
                  </td>

                  <td className="px-2 py-1.5">{i.unidCx}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.estoque)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.ddv)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v3)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v2)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v1)}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmtNum((i.v1 + i.v2 + i.v3) / 3)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.vAtu)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtBRL(i.custoLiq)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtBRL(i.atual)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {i.promoc > 0 ? fmtBRL(i.promoc) : "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={Number.isFinite(p) ? p : ""}
                        onChange={(e) => setPreco(i.key, Number(e.target.value) || 0)}
                        className={`h-7 w-24 text-right text-xs ${
                          belowPiso
                            ? "border-amber-500 ring-1 ring-amber-500 bg-amber-50"
                            : edited
                            ? "border-primary/60"
                            : ""
                        }`}
                        title={
                          belowPiso
                            ? `Abaixo do piso (R$ ${piso.toFixed(2)} = 0,90 × ref)`
                            : ""
                        }
                      />
                      {belowPiso && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      )}
                    </div>
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${
                      variacao < 0 ? "text-red-600" : "text-foreground"
                    }`}
                  >
                    {fmtPct(variacao)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmtPct(margem)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {fmtPct(margemAtual)}
                  </td>
                  <td className="px-2 py-1.5">
                    {edited && (
                      <button
                        onClick={() => restoreRow(i.key)}
                        className="text-[11px] text-primary hover:underline whitespace-nowrap"
                        title="Restaurar sugestão"
                      >
                        <RotateCcw className="w-3 h-3 inline mr-0.5" />
                        restaurar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {visible.length} item(ns) • Piso de 10% (Sugerido ≥ 0,90 × ref). Linhas em
          âmbar indicam preço abaixo do piso (salvar é permitido).
        </div>
      )}
    </div>
  );
};

export default LivroPreco;

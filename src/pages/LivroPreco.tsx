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

const LivroPreco = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; rows: Record<string, string>[] }[]>(
    [],
  );
  const [ddvMin, setDdvMin] = useState<string>("15");
  const [descontoStr, setDescontoStr] = useState<string>("10");
  const [items, setItems] = useState<Item[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [filtroFilial, setFiltroFilial] = useState<string>("ALL");
  const [filtroBU, setFiltroBU] = useState<string>("ALL");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list).slice(0, 7);
    const out: { name: string; rows: Record<string, string>[] }[] = [];
    for (const f of arr) {
      const text = await f.text();
      out.push({ name: f.name, rows: parseCSV(text) });
    }
    setFiles(out);
    setItems([]);
    setOverrides({});
    toast({
      title: "Arquivos carregados",
      description: `${out.length} arquivo(s) prontos. Clique em "Gerar Livro Preço".`,
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function gerar() {
    if (files.length === 0) {
      toast({
        title: "Nenhum arquivo",
        description: "Faça upload de até 7 arquivos LIVRO_*.CSV.",
        variant: "destructive",
      });
      return;
    }
    const ddvLimite = Number(ddvMin) || 0;
    let descPct = (parseBR(descontoStr) || 0) / 100;
    if (descPct < 0) descPct = 0;
    if (descPct > 0.1) descPct = 0.1;

    // Build map filial -> rows. Special merge rules:
    //  - Filial 01: estoque from LIVRO_01, vendas/preços from LIVRO_10
    //  - Filial 502: estoque from LIVRO_502, vendas/preços from LIVRO_510
    const byFilial: Record<string, Record<string, string>[]> = {};
    for (const f of files) {
      const fil = filialFromName(f.name);
      byFilial[fil] = f.rows;
    }

    const rowKey = (r: Record<string, string>) =>
      `${(r["SEQ.PROD"] || r["SEQ. PROD"] || "").trim()}__${(r["FAMILIA"] || "").trim()}`;

    type Pair = { filial: string; salesRows: Record<string, string>[]; stockMap: Map<string, Record<string, string>> };
    const pairs: Pair[] = [];
    const handled = new Set<string>();

    if (byFilial["01"] || byFilial["10"]) {
      const sales = byFilial["10"] || byFilial["01"] || [];
      const stock = byFilial["01"] || byFilial["10"] || [];
      const sm = new Map<string, Record<string, string>>();
      stock.forEach((r) => sm.set(rowKey(r), r));
      pairs.push({ filial: "01", salesRows: sales, stockMap: sm });
      handled.add("01");
      handled.add("10");
    }
    if (byFilial["502"] || byFilial["510"]) {
      const sales = byFilial["510"] || byFilial["502"] || [];
      const stock = byFilial["502"] || byFilial["510"] || [];
      const sm = new Map<string, Record<string, string>>();
      stock.forEach((r) => sm.set(rowKey(r), r));
      pairs.push({ filial: "502", salesRows: sales, stockMap: sm });
      handled.add("502");
      handled.add("510");
    }
    for (const fil of Object.keys(byFilial)) {
      if (handled.has(fil)) continue;
      const sm = new Map<string, Record<string, string>>();
      byFilial[fil].forEach((r) => sm.set(rowKey(r), r));
      pairs.push({ filial: fil, salesRows: byFilial[fil], stockMap: sm });
    }

    const out: Item[] = [];
    for (const { filial, salesRows, stockMap } of pairs) {
      for (const r of salesRows) {
        const fornecedor = r["Fornecedor"] || r["FORNECEDOR"] || r["fornecedor"] || "";
        const bu = deriveBU(fornecedor);
        if (!bu) continue;

        const stockRow = stockMap.get(rowKey(r)) || r;

        const ddv = parseBR(stockRow["DDV"] ?? r["DDV"]);
        if (!ddv || ddv <= 0) continue;
        if (ddvLimite > 0 && ddv < ddvLimite) continue;

        const atual = parseBR(r["ATUAL"]);
        const promoc = parseBR(r["PROMOC"]);
        const custoLiq = parseBR(r["CUSTO LIQ"]);
        const estoque = parseBR(stockRow["ESTOQUE"] ?? r["ESTOQUE"]);
        const vAtu = parseBR(r["VD.SEM.ATU"]);
        const v1 = parseBR(r["VD.SEM. -1"] ?? r["VD.SEM.-1"]);
        const v2 = parseBR(r["VD.SEM. -2"] ?? r["VD.SEM.-2"]);
        const v3 = parseBR(r["VD.SEM. -3"] ?? r["VD.SEM.-3"]);

        const inPromo = promoc > 0 && promoc < atual;
        const ref = inPromo ? promoc : atual;
        if (!ref || ref <= 0) continue;

        const media3 = (v1 + v2 + v3) / 3;
        let trend: Trend = "flat";
        if (vAtu > media3) trend = "up";
        else if (vAtu < v1 && v1 < v2 && v2 < v3) trend = "down";

        const sug = computeSugerido(ref, atual, inPromo, trend, promoc, descPct, true);

        const familia = r["FAMILIA"] || "";
        const produto = r["SEQ.PROD"] || r["SEQ. PROD"] || "";
        out.push({
          key: `${filial}__${produto}__${familia}`,
          bu,
          filial,
          familia,
          produto,
          descricao: r["DESCRICAO"] || "",
          unidCx: r["EMB.CMP"] || "",
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

    out.sort((a, b) =>
      a.filial.localeCompare(b.filial) ||
      a.bu.localeCompare(b.bu) ||
      a.descricao.localeCompare(b.descricao),
    );
    setItems(out);
    setOverrides({});
    toast({
      title: "Livro Preço gerado",
      description: `${out.length} item(ns) sugeridos.`,
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
      "VD.SEM.ATU",
      "VD.SEM. -1",
      "VD.SEM. -2",
      "VD.SEM. -3",
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
        i.vAtu,
        i.v1,
        i.v2,
        i.v3,
        i.custoLiq,
        i.atual,
        i.promoc,
        p,
        variacao,
        margem,
        margemAtual,
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Livro Preco");
    XLSX.writeFile(wb, `LivroPreco_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Livro Preço"
        description="Sugestão de preços (sáb→sex) por filial e BU para Unilever HC/FR."
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" /> Upload LIVRO_*.CSV
            </Button>
            <Button size="sm" onClick={gerar}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Gerar Livro Preço
            </Button>
          </div>
        }
      />

      {/* control bar */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">DDV mínimo</Label>
          <Select value={ddvMin} onValueChange={setDdvMin}>
            <SelectTrigger className="h-9 mt-1">
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
          <Label className="text-xs text-muted-foreground">Desconto alvo (%) — máx 10</Label>
          <Input
            className="h-9 mt-1"
            value={descontoStr}
            onChange={(e) => setDescontoStr(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Filtrar Filial</Label>
          <Select value={filtroFilial} onValueChange={setFiltroFilial}>
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={f}>
                  Filial {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Filtrar BU</Label>
          <Select value={filtroBU} onValueChange={setFiltroBU}>
            <SelectTrigger className="h-9 mt-1">
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
          <Button variant="outline" size="sm" onClick={restoreAll} className="flex-1">
            <RotateCcw className="w-4 h-4 mr-1" /> Restaurar tudo
          </Button>
          <Button variant="outline" size="sm" onClick={exportXLSX} className="flex-1">
            <Download className="w-4 h-4 mr-1" /> Exportar
          </Button>
        </div>
      </div>

      {/* file chips */}
      {files.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Arquivos: {files.map((f) => `${f.name} → Filial ${filialFromName(f.name)}`).join(" • ")}
        </div>
      )}

      {/* table */}
      <div className="rounded-lg border border-border bg-card overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="text-left">
              {[
                "BU","Filial","Cód. Família","Cód. Produto","Descrição","Unid/cx",
                "Estoque","DDV","V.ATU","V-1","V-2","V-3",
                "Custo Líq.","Atual","PROMOC","Preço Sugerido","Variação","Margem","Margem Atual","",
              ].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold text-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={20} className="text-center text-muted-foreground py-8">
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
                <tr key={i.key} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-1.5 font-medium">{i.bu}</td>
                  <td className="px-2 py-1.5">{i.filial}</td>
                  <td className="px-2 py-1.5">{i.familia}</td>
                  <td className="px-2 py-1.5">{i.produto}</td>
                  <td className="px-2 py-1.5 max-w-[260px] truncate" title={i.descricao}>
                    {i.descricao}
                  </td>
                  <td className="px-2 py-1.5">{i.unidCx}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.estoque)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.ddv)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.vAtu)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v1)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v2)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(i.v3)}</td>
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

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, any>;

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, "março": 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

const normCode = (v: any) => String(v ?? "").trim().replace(/^0+/, "").toUpperCase();

/** Normalize month/year into "YYYY-MM" or null */
const parseMonthKey = (mesVal: any, anoVal: any): string | null => {
  if (mesVal == null && anoVal == null) return null;
  const s = String(mesVal ?? "").trim().toLowerCase();
  let month: number | null = null;
  let year: number | null = anoVal ? Number(String(anoVal).trim()) : null;

  // Try "Janeiro/2026" or "Jan/2026" or "01/2026" or "2026-01"
  if (s) {
    // ISO YYYY-MM or YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{1,2})/);
    if (iso) {
      year = year ?? Number(iso[1]);
      month = Number(iso[2]);
    } else {
      // name/year or number/year
      const parts = s.split(/[\/\-\s]+/);
      for (const p of parts) {
        if (/^\d{4}$/.test(p)) year = year ?? Number(p);
        else if (/^\d{1,2}$/.test(p)) {
          const n = Number(p);
          if (n >= 1 && n <= 12) month = month ?? n;
        } else {
          const key = p.replace(/\.$/, "");
          if (MESES[key] != null) month = month ?? MESES[key];
        }
      }
    }
  }

  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const findHeader = (headers: string[], patterns: RegExp[]): string | null => {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x.toLowerCase().trim()));
    if (h) return h;
  }
  return null;
};

const STORAGE_KEY = "controle-cotas-data-v1";

type ConsumoMeta = { volume: number; descricao: string };

export default function ControleCotas() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).headers ?? [] : [];
    } catch { return []; }
  });
  const [rows, setRows] = useState<Row[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).rows ?? [] : [];
    } catch { return []; }
  });
  const [fileName, setFileName] = useState<string>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).fileName ?? "" : "";
    } catch { return ""; }
  });
  const [search, setSearch] = useState("");
  const [consumo, setConsumo] = useState<Record<string, ConsumoMeta>>({});

  // Persist upload across screens
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ headers, rows, fileName }));
    } catch {}
  }, [headers, rows, fileName]);

  // Load propostas with cota='sim' and build (month|codigo) -> {volume, descricao}
  const loadConsumo = async () => {
    const { data, error } = await supabase
      .from("propostas_simulador")
      .select("codigo_produto, descricao_produto, volume_caixas, created_at, cota")
      .eq("cota", "sim");
    if (error) {
      console.error(error);
      return;
    }
    const map: Record<string, ConsumoMeta> = {};
    (data ?? []).forEach((r: any) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}|${normCode(r.codigo_produto)}`;
      if (!map[key]) map[key] = { volume: 0, descricao: r.descricao_produto ?? "" };
      map[key].volume += Number(r.volume_caixas ?? 0);
    });
    setConsumo(map);
  };

  useEffect(() => {
    loadConsumo();
    // Poll for new cotas so linhas se atualizam automaticamente
    const iv = setInterval(loadConsumo, 15000);
    return () => clearInterval(iv);
  }, []);

  const clearData = () => {
    if (!confirm("Limpar tabela e upload?")) return;
    setHeaders([]);
    setRows([]);
    setFileName("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
      if (!json.length) {
        toast.error("Planilha vazia");
        return;
      }
      setHeaders(Object.keys(json[0]));
      setRows(json);
      setFileName(file.name);
      await loadConsumo();
      toast.success(`${json.length} itens carregados`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + e.message);
    }
  };

  const { displayHeaders, codigoCol, mesCol, anoCol, precoCol, descCol } = useMemo(() => {
    const codigoCol = findHeader(headers, [/^c[oó]digo/, /produto/, /sku/]);
    const mesCol = findHeader(headers, [/^m[eê]s/, /periodo/, /per[ií]odo/]);
    const anoCol = findHeader(headers, [/^ano/]);
    const precoCol = findHeader(headers, [/^pre[cç]o/, /valor/]);
    const descCol = findHeader(headers, [/descri/, /produto/]);

    // Insert "Volume Consumido" after preço
    const dh = [...headers];
    if (precoCol) {
      const idx = dh.indexOf(precoCol);
      dh.splice(idx + 1, 0, "Volume Consumido");
    } else {
      dh.push("Volume Consumido");
    }
    return { displayHeaders: dh, codigoCol, mesCol, anoCol, precoCol, descCol };
  }, [headers]);

  const rowsWithConsumo = useMemo(() => {
    // Existing sheet rows with Volume Consumido
    const seenKeys = new Set<string>();
    const base = rows.map((r) => {
      const code = codigoCol ? normCode(r[codigoCol]) : "";
      const monthKey = parseMonthKey(mesCol ? r[mesCol] : null, anoCol ? r[anoCol] : null);
      const key = monthKey && code ? `${monthKey}|${code}` : null;
      if (key) seenKeys.add(key);
      const vol = key ? consumo[key]?.volume ?? 0 : 0;
      return { ...r, "Volume Consumido": vol };
    });

    // Auto-append rows for new cotas not present in the sheet
    if (codigoCol) {
      Object.entries(consumo).forEach(([key, meta]) => {
        if (seenKeys.has(key)) return;
        const [ym, code] = key.split("|");
        const [year, month] = ym.split("-");
        const monthName = Object.entries(MESES).find(([, v]) => v === Number(month))?.[0] ?? month;
        const row: Row = {};
        headers.forEach((h) => (row[h] = ""));
        row[codigoCol] = code;
        if (descCol) row[descCol] = meta.descricao;
        if (mesCol) row[mesCol] = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
        if (anoCol) row[anoCol] = year;
        row["Volume Consumido"] = meta.volume;
        base.push(row);
      });
    }
    return base;
  }, [rows, consumo, headers, codigoCol, mesCol, anoCol, descCol]);

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rowsWithConsumo, { header: displayHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotas");
    XLSX.writeFile(wb, `controle-cotas-${Date.now()}.xlsx`);
  };

  const filtered = search
    ? rowsWithConsumo.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : rowsWithConsumo;

  const fmtNum = (v: any) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? "");
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Controle de Cotas</h1>
          {fileName && (
            <p className="text-xs text-muted-foreground mt-1">
              <FileSpreadsheet className="inline w-3 h-3 mr-1" />
              {fileName} • {rows.length} itens
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Planilha
          </Button>
          {rows.length > 0 && (
            <Button
              onClick={exportXLSX}
              className="bg-[#107C41] hover:bg-[#0e6b38] text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Faça upload de uma planilha Excel (.xlsx, .xls ou .csv) para visualizar os itens.
          </p>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <Input
            placeholder="Buscar em qualquer coluna..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="overflow-auto max-h-[70vh] border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f5f7] sticky top-0 z-10">
                <tr>
                  {displayHeaders.map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-left font-semibold border-b whitespace-nowrap ${
                        h === "Volume Consumido" ? "text-[#0071e3]" : "text-[#1d1d1f]"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/40 border-b">
                    {displayHeaders.map((h) => (
                      <td
                        key={h}
                        className={`px-3 py-1.5 whitespace-nowrap ${
                          h === "Volume Consumido" ? "font-semibold text-[#0071e3]" : ""
                        }`}
                      >
                        {h === "Volume Consumido" ? fmtNum(r[h]) : String(r[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {rows.length} itens
            {!codigoCol && " • ⚠ Coluna de código não detectada"}
            {!mesCol && " • ⚠ Coluna de mês não detectada"}
          </p>
        </Card>
      )}
    </div>
  );
}

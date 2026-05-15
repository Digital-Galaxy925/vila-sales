import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAppDataKey } from "@/contexts/AppDataContext";

const FILIAIS: { code: string; label: string }[] = [
  { code: "501", label: "FOCOMIX SP - 501" },
  { code: "502", label: "FOCOMIX MG - 502" },
  { code: "01", label: "POÇOS | 01" },
  { code: "11", label: "CAMPINAS | 11" },
  { code: "12", label: "OSASCO | 12" },
  { code: "14", label: "BETIM | 14" },
];

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const normCode = (v: any) => String(v ?? "").trim().replace(/^0+/, "");

const findCol = (row: any, keys: string[]) => {
  const upper: Record<string, any> = {};
  Object.keys(row || {}).forEach((k) => (upper[k.toUpperCase().trim()] = row[k]));
  for (const k of keys) {
    const v = upper[k.toUpperCase()];
    if (v != null && v !== "") return v;
  }
  return "";
};

interface RowItem {
  codigo: string;
  descricao: string;
}

const AnaliseDDV = () => {
  const rawData = useAppDataKey<Record<string, any[]>>("vilasales_data");
  const [items, setItems] = useState<RowItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build lookup: filial -> code(normalized) -> { estoque, ddv, descricao }
  const lookup = useMemo(() => {
    const map: Record<string, Map<string, { estoque: number; ddv: number; descricao: string }>> = {};
    const data = rawData || {};
    Object.entries(data).forEach(([filial, arr]) => {
      if (!Array.isArray(arr)) return;
      const m = new Map<string, { estoque: number; ddv: number; descricao: string }>();
      arr.forEach((p: any) => {
        const code = normCode(p?.seqProd);
        if (!code) return;
        m.set(code, {
          estoque: num(p?.estoque),
          ddv: num(p?.ddv),
          descricao: String(p?.descricao || ""),
        });
      });
      map[filial] = m;
    });
    return map;
  }, [rawData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const parsed: RowItem[] = [];
    const seen = new Set<string>();
    rows.forEach((r) => {
      const codigo = String(
        findCol(r, ["CODIGO", "CÓDIGO", "COD", "SEQ.PROD", "SEQPROD", "SEQ_PROD", "PRODUTO", "SKU"]) || "",
      ).trim();
      if (!codigo) return;
      const key = normCode(codigo);
      if (seen.has(key)) return;
      seen.add(key);
      const descricao = String(findCol(r, ["DESCRIÇÃO", "DESCRICAO", "DESC", "PRODUTO_DESC", "NOME"]) || "");
      parsed.push({ codigo, descricao });
    });
    setItems(parsed);
    if (inputRef.current) inputRef.current.value = "";
  };

  const enriched = useMemo(() => {
    return items.map((it) => {
      const key = normCode(it.codigo);
      const cells: Record<string, { estoque: number; ddv: number }> = {};
      let descricao = it.descricao;
      FILIAIS.forEach(({ code }) => {
        const found = lookup[code]?.get(key);
        if (found) {
          cells[code] = { estoque: found.estoque, ddv: found.ddv };
          if (!descricao) descricao = found.descricao;
        } else {
          cells[code] = { estoque: 0, ddv: 0 };
        }
      });
      return { codigo: it.codigo, descricao, cells };
    });
  }, [items, lookup]);

  const exportExcel = () => {
    if (enriched.length === 0) return;
    const headerTop = ["CODIGO", "DESCRIÇÃO"];
    const headerSub = ["", ""];
    FILIAIS.forEach(({ label }) => {
      headerTop.push(label, "");
      headerSub.push("ESTOQUE", "DDV");
    });
    const aoa: any[][] = [headerTop, headerSub];
    enriched.forEach((p) => {
      const row: any[] = [p.codigo, p.descricao];
      FILIAIS.forEach(({ code }) => {
        row.push(p.cells[code].estoque, p.cells[code].ddv);
      });
      aoa.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Merge per-filial header
    const merges: XLSX.Range[] = [];
    FILIAIS.forEach((_, i) => {
      const c = 2 + i * 2;
      merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 1 } });
    });
    ws["!merges"] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análise DDV");
    XLSX.writeFile(wb, "analise_ddv.xlsx");
  };

  return (
    <div>
      <PageHeader
        title="Análise DDV"
        description="Faça upload de uma planilha de produtos para consultar Estoque e DDV em todos os CDs"
        actions={
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => inputRef.current?.click()}
              className="bg-primary text-primary-foreground font-semibold"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Planilha
            </Button>
            {items.length > 0 && (
              <>
                <Button onClick={exportExcel} variant="outline" className="font-semibold">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Excel
                </Button>
                <Button
                  onClick={() => setItems([])}
                  variant="outline"
                  className="font-semibold text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar
                </Button>
              </>
            )}
          </div>
        }
      />

      {items.length === 0 ? (
        <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-12 text-center">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">
            Envie uma planilha .xlsx, .xls ou .csv contendo uma coluna <strong>CODIGO</strong>
            {" "}(e opcionalmente <strong>DESCRIÇÃO</strong>).
          </p>
          <p className="text-xs text-muted-foreground">
            Os dados de Estoque e DDV serão buscados nos livros já carregados de cada CD.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Resultado · {enriched.length} produto{enriched.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-bold text-foreground border border-border sticky left-0 bg-muted/40 z-10">
                    CODIGO
                  </th>
                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-bold text-foreground border border-border min-w-[260px]">
                    DESCRIÇÃO
                  </th>
                  {FILIAIS.map((f) => (
                    <th key={f.code} colSpan={2} className="px-3 py-2 text-center text-xs font-bold text-foreground border border-border whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-muted/30">
                  {FILIAIS.map((f) => (
                    <>
                      <th key={`${f.code}-e`} className="px-3 py-1.5 text-center text-[11px] font-semibold text-muted-foreground border border-border">
                        ESTOQUE
                      </th>
                      <th key={`${f.code}-d`} className="px-3 py-1.5 text-center text-[11px] font-semibold text-muted-foreground border border-border">
                        DDV
                      </th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((p, idx) => (
                  <tr key={`${p.codigo}-${idx}`} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-foreground font-mono text-xs border border-border sticky left-0 bg-card">
                      {p.codigo}
                    </td>
                    <td className="px-3 py-2 text-foreground border border-border">
                      {p.descricao || <span className="text-muted-foreground italic">—</span>}
                    </td>
                    {FILIAIS.map((f) => {
                      const c = p.cells[f.code];
                      return (
                        <>
                          <td
                            key={`${f.code}-e`}
                            className={`px-3 py-2 text-right border border-border tabular-nums ${
                              c.estoque === 0 ? "text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {c.estoque.toLocaleString("pt-BR")}
                          </td>
                          <td
                            key={`${f.code}-d`}
                            className={`px-3 py-2 text-right border border-border tabular-nums ${
                              c.ddv === 0
                                ? "text-muted-foreground"
                                : c.ddv < 7
                                  ? "text-warning font-semibold"
                                  : c.ddv > 90
                                    ? "text-destructive font-semibold"
                                    : "text-foreground"
                            }`}
                          >
                            {c.ddv.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliseDDV;

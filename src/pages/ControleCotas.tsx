import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";

type Row = Record<string, any>;

export default function ControleCotas() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [search, setSearch] = useState("");

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
      toast.success(`${json.length} itens carregados`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + e.message);
    }
  };

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotas");
    XLSX.writeFile(wb, `controle-cotas-${Date.now()}.xlsx`);
  };

  const filtered = search
    ? rows.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows;

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
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold text-[#1d1d1f] border-b whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/40 border-b">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                        {String(r[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {rows.length} itens
          </p>
        </Card>
      )}
    </div>
  );
}

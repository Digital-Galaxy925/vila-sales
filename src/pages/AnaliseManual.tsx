import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Package, Upload, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/DataTable";
import MarginBadge from "@/components/MarginBadge";
import { useAppDataKey } from "@/contexts/AppDataContext";

const filiais = [
  { id: "01", label: "Filial 01 - Poços" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
];

const columns = [
  { key: "codigo", label: "Código" },
  { key: "produto", label: "Produto" },
  { key: "bu", label: "BU", align: "center" as const },
  { key: "custo", label: "Preço Custo", align: "right" as const },
  { key: "venda", label: "Preço Venda", align: "right" as const },
  {
    key: "margem",
    label: "Margem",
    align: "center" as const,
    render: (val: number) => <MarginBadge value={val} />,
  },
  { key: "estoque", label: "Estoque (cx)", align: "right" as const },
  { key: "ddv", label: "DDV (dias)", align: "right" as const },
  { key: "vendaSemana", label: "Venda Última Semana", align: "right" as const },
];

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const normCod = (v: any): string => {
  let s = String(v ?? "").trim();
  s = s.replace(/\.0+$/, "");
  s = s.replace(/^0+(\d)/, "$1");
  return s;
};

const AnaliseManual = () => {
  const [selectedFilial, setSelectedFilial] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rawData = useAppDataKey<Record<string, any[]>>("vilasales_data");
  const hasBaseData = rawData && Object.keys(rawData).length > 0;

  const handleFile = async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const extracted: string[] = [];
      rows.forEach((row) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell) => {
          const c = normCod(cell);
          if (c && /^\d+$/.test(c)) extracted.push(c);
        });
      });
      const unique = Array.from(new Set(extracted));
      if (unique.length === 0) {
        setError("Nenhum código de produto encontrado na planilha.");
        return;
      }
      setCodes(unique);
      setFileName(file.name);
      setSelectedFilial(null);
    } catch (e: any) {
      setError("Erro ao ler a planilha: " + (e?.message ?? "desconhecido"));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const clearFile = () => {
    setCodes([]);
    setFileName("");
    setSelectedFilial(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const { data, notFound } = useMemo(() => {
    if (!rawData || !selectedFilial || codes.length === 0) return { data: [], notFound: [] as string[] };

    // Build a map of code -> product for the selected filial across all keys in rawData
    const map = new Map<string, any>();
    Object.entries(rawData).forEach(([, arr]: [string, any]) => {
      if (Array.isArray(arr)) {
        arr.forEach((p: any) => {
          if ((p.filial || "") === selectedFilial) {
            map.set(normCod(p.seqProd), p);
          }
        });
      }
    });

    const found: any[] = [];
    const missing: string[] = [];
    codes.forEach((cod) => {
      const p = map.get(cod);
      if (!p) {
        missing.push(cod);
        return;
      }
      const custoLiq = num(p.custoLiq);
      const atual = num(p.atual);
      const margem = atual > 0 ? ((atual - custoLiq) / atual) * 100 : 0;
      const ddv = num(p.ddv);
      const estoque = num(p.estoque);
      const vendaSemana = ddv > 0 ? Math.round((estoque / ddv) * 7) : 0;
      found.push({
        codigo: p.seqProd || cod,
        produto: p.descricao || "—",
        bu: p.bu || "—",
        custo: `R$ ${custoLiq.toFixed(2)}`,
        venda: `R$ ${atual.toFixed(2)}`,
        margem: parseFloat(margem.toFixed(1)),
        estoque,
        ddv,
        vendaSemana: vendaSemana.toLocaleString("pt-BR"),
      });
    });
    return { data: found, notFound: missing };
  }, [rawData, selectedFilial, codes]);

  return (
    <div>
      <PageHeader
        title="Análise Manual"
        description="Faça upload da lista de produtos e selecione a filial para gerar a análise"
      />

      {!hasBaseData ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] p-12 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">Base de dados não carregada</h3>
          <p className="text-sm text-muted-foreground">
            Faça o upload dos arquivos de livros na tela de Upload de Dados antes de usar a Análise Manual.
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Upload Zone */}
          {codes.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`bg-card rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">
                Upload da lista de produtos
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Arraste um arquivo Excel (.xlsx) ou clique para selecionar.
                <br />A planilha deve conter os códigos dos produtos a analisar.
              </p>
              <Button type="button" variant="outline" size="sm">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Selecionar arquivo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-card-foreground">{fileName}</div>
                  <div className="text-xs text-muted-foreground">{codes.length} códigos identificados</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFile}>
                <X className="w-4 h-4 mr-1" /> Trocar arquivo
              </Button>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Filial selector */}
          {codes.length > 0 && (
            <div>
              <h3 className="text-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Selecione a Filial para Análise
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filiais.map((f) => (
                  <Button
                    key={f.id}
                    variant={selectedFilial === f.id ? "default" : "outline"}
                    className={`h-auto py-3 text-sm font-medium transition-all duration-200 ${
                      selectedFilial === f.id ? "shadow-md" : ""
                    }`}
                    onClick={() => setSelectedFilial(f.id)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results table */}
          <AnimatePresence>
            {selectedFilial && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {data.length === 0 ? (
                  <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto da lista foi encontrado nesta filial.
                    </p>
                  </div>
                ) : (
                  <DataTable
                    columns={columns}
                    data={data}
                    title={`${filiais.find((f) => f.id === selectedFilial)?.label} — ${data.length} produtos`}
                  />
                )}

                {notFound.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-900">
                        {notFound.length} código(s) não encontrado(s) nesta filial
                      </span>
                    </div>
                    <div className="text-xs text-amber-800 break-words">{notFound.join(", ")}</div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default AnaliseManual;

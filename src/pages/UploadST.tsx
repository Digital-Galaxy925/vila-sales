import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";

const UploadST = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    localStorage.setItem("st_data", JSON.stringify(rows));
    setRowCount(rows.length);
    setLoaded(true);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = Array.from(e.dataTransfer.files).find(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")
    );
    if (f) processFile(f);
  }, [processFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const removeFile = () => {
    setFile(null);
    setLoaded(false);
    setRowCount(0);
    localStorage.removeItem("st_data");
  };

  return (
    <div>
      <PageHeader
        title="Upload ST"
        description="Faça o upload da planilha com os dados de Substituição Tributária para consulta na Tabela de ST."
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50"
        }`}
        onClick={() => document.getElementById("st-file-input")?.click()}
      >
        <input
          id="st-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">
          Arraste a planilha de ST aqui
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          ou clique para selecionar · Aceita .xlsx, .xls e .csv
        </p>
        <Button variant="outline" className="pointer-events-none">
          Selecionar Arquivo
        </Button>
      </motion.div>

      {file && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-3">
          <div className="flex items-center justify-between bg-card rounded-xl p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium text-card-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loaded && (
                <span className="text-xs text-success flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  {rowCount} produtos carregados
                </span>
              )}
              <button onClick={removeFile} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default UploadST;

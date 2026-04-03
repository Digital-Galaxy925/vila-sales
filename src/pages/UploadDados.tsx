import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const UploadDados = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      <PageHeader
        title="Upload de Dados"
        description="Faça o upload da base de produtos em Excel para gerar as análises"
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
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">
          Arraste seus arquivos aqui
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          ou clique para selecionar · Aceita .xlsx, .xls e .csv
        </p>
        <Button variant="outline" className="pointer-events-none">
          Selecionar Arquivos
        </Button>
      </motion.div>

      {files.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 space-y-3"
        >
          <h3 className="text-sm font-heading font-semibold text-foreground">
            Arquivos Selecionados ({files.length})
          </h3>
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-card rounded-xl p-4 shadow-[var(--shadow-card)]"
            >
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
                <CheckCircle className="w-4 h-4 text-success" />
                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <Button className="w-full bg-primary text-primary-foreground font-semibold mt-4">
            <Upload className="w-4 h-4 mr-2" />
            Gerar Análise
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default UploadDados;

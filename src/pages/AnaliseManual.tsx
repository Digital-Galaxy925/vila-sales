import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, X, Building2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/DataTable";
import MarginBadge from "@/components/MarginBadge";

const filiais = [
  { id: "01", label: "Filial 01 - Poços" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
];

// Mock data generator per filial
const generateMockData = (filialId: string) => {
  const products = [
    { cod: "10001", desc: "Sabonete Dove Original 90g" },
    { cod: "10002", desc: "Desodorante Rexona Aerosol 150ml" },
    { cod: "10003", desc: "Shampoo TRESemmé 400ml" },
    { cod: "10004", desc: "Amaciante Comfort 2L" },
    { cod: "10005", desc: "Detergente Ypê 500ml" },
    { cod: "10006", desc: "Sabão em Pó OMO 1.6kg" },
    { cod: "10007", desc: "Creme Dental Close Up 90g" },
    { cod: "10008", desc: "Maionese Hellmanns 500g" },
    { cod: "10009", desc: "Suco Del Valle 1L" },
    { cod: "10010", desc: "Sorvete Kibon 1.5L" },
  ];

  const seed = parseInt(filialId) || 1;
  return products.map((p, i) => {
    const custo = +(5 + (seed * (i + 1) * 1.3) % 20).toFixed(2);
    const venda = +(custo * (1.1 + ((seed + i) % 5) * 0.06)).toFixed(2);
    const margem = +((venda - custo) / venda * 100).toFixed(1);
    const estoque = Math.floor(50 + (seed * (i + 2) * 7) % 500);
    const vendaSemana = Math.floor(10 + (seed * (i + 3) * 3) % 150);
    return {
      codigo: p.cod,
      produto: p.desc,
      custo: `R$ ${custo.toFixed(2)}`,
      venda: `R$ ${venda.toFixed(2)}`,
      margem,
      estoque,
      vendaSemana,
    };
  });
};

const columns = [
  { key: "codigo", label: "Código" },
  { key: "produto", label: "Produto" },
  { key: "custo", label: "Preço Custo", align: "right" as const },
  { key: "venda", label: "Preço Venda", align: "right" as const },
  {
    key: "margem",
    label: "Margem",
    align: "center" as const,
    render: (val: number) => <MarginBadge value={val} />,
  },
  { key: "estoque", label: "Estoque", align: "right" as const },
  { key: "vendaSemana", label: "Venda Última Semana", align: "right" as const },
];

const AnaliseManual = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFilial, setSelectedFilial] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).find(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")
    );
    if (dropped) {
      setFile(dropped);
      setSelectedFilial(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setSelectedFilial(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setSelectedFilial(null);
  };

  const data = selectedFilial ? generateMockData(selectedFilial) : [];

  return (
    <div>
      <PageHeader
        title="Análise Manual"
        description="Faça upload da base de produtos e selecione a filial para gerar a análise detalhada"
      />

      {/* Upload area */}
      {!file ? (
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
          onClick={() => document.getElementById("manual-file-input")?.click()}
        >
          <input
            id="manual-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">
            Faça upload da base de produtos
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Arraste ou clique para selecionar · Aceita .xlsx, .xls e .csv
          </p>
          <Button variant="outline" className="pointer-events-none">
            Selecionar Arquivo
          </Button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* File indicator */}
          <div className="flex items-center justify-between bg-card rounded-xl p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium text-card-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={removeFile} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filial buttons */}
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

          {/* Results table */}
          <AnimatePresence>
            {selectedFilial && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DataTable
                  columns={columns}
                  data={data}
                  title={`Análise — ${filiais.find((f) => f.id === selectedFilial)?.label}`}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default AnaliseManual;

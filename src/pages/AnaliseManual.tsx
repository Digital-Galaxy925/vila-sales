import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Package } from "lucide-react";
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
];

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const AnaliseManual = () => {
  const [selectedFilial, setSelectedFilial] = useState<string | null>(null);

  const rawData = useAppDataKey<Record<string, any[]>>("vilasales_data");
  const hasData = rawData && Object.keys(rawData).length > 0;

  const data = useMemo(() => {
    if (!rawData || !selectedFilial) return [];

    // Collect products for the selected filial from all keys in rawData
    const products: any[] = [];
    Object.entries(rawData).forEach(([, arr]: [string, any]) => {
      if (Array.isArray(arr)) {
        arr.forEach((p: any) => {
          if ((p.filial || "") === selectedFilial) {
            products.push(p);
          }
        });
      }
    });

    return products.map((p) => {
      const custoLiq = num(p.custoLiq);
      const atual = num(p.atual);
      const margem = atual > 0 ? ((atual - custoLiq) / atual) * 100 : 0;
      return {
        codigo: p.seqProd || "—",
        produto: p.descricao || "—",
        bu: p.bu || "—",
        custo: `R$ ${custoLiq.toFixed(2)}`,
        venda: `R$ ${atual.toFixed(2)}`,
        margem: parseFloat(margem.toFixed(1)),
        estoque: num(p.estoque),
        ddv: num(p.ddv),
      };
    });
  }, [rawData, selectedFilial]);

  return (
    <div>
      <PageHeader title="Análise Manual" description="Selecione a filial para visualizar os dados carregados" />

      {!hasData ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] p-12 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-card-foreground mb-2">Nenhum dado carregado</h3>
          <p className="text-sm text-muted-foreground">
            Faça o upload dos arquivos na tela de Upload de Dados para gerar a análise.
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Filial selector */}
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
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {data.length === 0 ? (
                  <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto encontrado para esta filial nos dados carregados.
                    </p>
                  </div>
                ) : (
                  <DataTable
                    columns={columns}
                    data={data}
                    title={`${filiais.find((f) => f.id === selectedFilial)?.label} — ${data.length} produtos`}
                  />
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

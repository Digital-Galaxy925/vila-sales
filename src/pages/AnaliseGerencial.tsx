import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, TrendingUp, DollarSign, Package, Search, LayoutGrid, FileSpreadsheet, FileText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { exportToExcel, exportToPDF } from "@/utils/exportGerencial";

interface Product {
  seqProd: string;
  descricao: string;
  custoLiq: number;
  atual: number;
  estoque: number;
  filial: string;
}

type DataMap = Record<string, Product[]>;

const FILIAL_NAMES: Record<string, string> = {
  "01": "Filial 01 - Poços",
  "11": "Filial 11 - Campinas",
  "12": "Filial 12 - Osasco",
  "14": "Filial 14 - Betim",
  "501": "Filial 501 - Focomix SP",
  "502": "Filial 502 - Focomix MG",
};

const FILIAL_ORDER = ["01", "11", "12", "14", "501", "502"];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (v: number) => v.toLocaleString("pt-BR");

const AnaliseGerencial = () => {
  const [searchCode, setSearchCode] = useState("");
  const [activeCode, setActiveCode] = useState("");

  const data: DataMap = useMemo(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const hasData = Object.keys(data).length > 0;

  const handleSearch = () => {
    const code = searchCode.trim();
    if (code) setActiveCode(code);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // Find product across all filiais
  const results = useMemo(() => {
    if (!activeCode) return [];
    const found: { filial: string; filialName: string; custoLiq: number; atual: number; estoque: number; descricao: string }[] = [];

    FILIAL_ORDER.forEach((filialId) => {
      const products = data[filialId];
      if (!products) return;
      const match = products.find(
        (p) => p.seqProd === activeCode || p.seqProd?.padStart(6, "0") === activeCode.padStart(6, "0")
      );
      if (match) {
        found.push({
          filial: filialId,
          filialName: FILIAL_NAMES[filialId] || `Filial ${filialId}`,
          custoLiq: match.custoLiq ?? 0,
          atual: match.atual ?? 0,
          estoque: match.estoque ?? 0,
          descricao: match.descricao ?? "",
        });
      }
    });

    return found;
  }, [activeCode, data]);

  const productName = results.length > 0 ? results[0].descricao : "";

  const tableHeaderStyle =
    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const tableCellStyle = "px-4 py-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Análise Gerencial"
        description="Visão executiva consolidada dos principais indicadores comerciais"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <KpiCard title="Faturamento Total" value="R$ 2.450.000" icon={DollarSign} trend="up" />
        <KpiCard title="Margem Média" value="18,4%" icon={TrendingUp} trend="down" />
        <KpiCard title="Itens em Estoque" value="12.384" icon={Package} trend="up" />
        <KpiCard title="SKUs Ativos" value="1.856" icon={BarChart3} trend="up" />
      </motion.div>

      {/* Product search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6"
      >
        <h3 className="font-heading text-base font-semibold text-card-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Consulta por Produto
        </h3>

        {!hasData ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Carregue os dados na página de Análise de Custos para consultar produtos.
          </p>
        ) : (
          <div className="flex gap-3 items-center">
            <Input
              placeholder="Digite o código do produto..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={handleKeyDown}
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={!searchCode.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        )}
      </motion.div>

      {/* Results */}
      <AnimatePresence>
        {activeCode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {results.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 shadow-[var(--shadow-card)] text-center">
                <p className="text-muted-foreground text-sm">
                  Produto <span className="font-semibold text-card-foreground">{activeCode}</span> não encontrado em nenhuma filial.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
                  <p className="text-sm text-muted-foreground">
                    Produto: <span className="font-semibold text-card-foreground">{activeCode}</span>
                    {productName && (
                      <span className="ml-2 text-card-foreground">— {productName}</span>
                    )}
                  </p>
                </div>

                {/* Table 1: Preço de Custo */}
                <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h4 className="font-heading text-sm font-semibold text-card-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Preço de Custo por Filial
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className={tableHeaderStyle}>Filial</th>
                          <th className={`${tableHeaderStyle} text-right`}>Preço de Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.filial} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className={`${tableCellStyle} font-medium text-card-foreground`}>{r.filialName}</td>
                            <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.custoLiq)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Table 2: Preço de Venda */}
                <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h4 className="font-heading text-sm font-semibold text-card-foreground flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Preço de Venda por Filial
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className={tableHeaderStyle}>Filial</th>
                          <th className={`${tableHeaderStyle} text-right`}>Preço de Venda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.filial} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className={`${tableCellStyle} font-medium text-card-foreground`}>{r.filialName}</td>
                            <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.atual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Table 3: Estoque */}
                <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h4 className="font-heading text-sm font-semibold text-card-foreground flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      Estoque por Filial
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className={tableHeaderStyle}>Filial</th>
                          <th className={`${tableHeaderStyle} text-right`}>Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.filial} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className={`${tableCellStyle} font-medium text-card-foreground`}>{r.filialName}</td>
                            <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmtNum(r.estoque)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Table 4: Visão Consolidada */}
                <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h4 className="font-heading text-sm font-semibold text-card-foreground flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      Visão Consolidada por Filial
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th rowSpan={2} className={`${tableHeaderStyle} border-r border-border`}>Produto</th>
                          {results.map((r) => (
                            <th
                              key={r.filial}
                              colSpan={3}
                              className={`${tableHeaderStyle} text-center border-r border-border last:border-r-0`}
                            >
                              {FILIAL_NAMES[r.filial]?.split(" - ")[1] || r.filial} | {r.filial}
                            </th>
                          ))}
                        </tr>
                        <tr className="border-b border-border bg-muted/20">
                          {results.map((r) => (
                            <React.Fragment key={r.filial}>
                              <th className={`${tableHeaderStyle} text-right`}>Estoque</th>
                              <th className={`${tableHeaderStyle} text-right`}>Custo</th>
                              <th className={`${tableHeaderStyle} text-right border-r border-border last:border-r-0`}>Venda</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className={`${tableCellStyle} font-medium text-card-foreground border-r border-border`}>
                            {productName || activeCode}
                          </td>
                          {results.map((r) => (
                            <React.Fragment key={r.filial}>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmtNum(r.estoque)}</td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.custoLiq)}</td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground border-r border-border last:border-r-0`}>{fmt(r.atual)}</td>
                            </React.Fragment>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnaliseGerencial;

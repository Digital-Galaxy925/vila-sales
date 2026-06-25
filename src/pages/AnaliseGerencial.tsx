import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, TrendingUp, DollarSign, Package, Search, LayoutGrid, FileSpreadsheet, FileText, ShoppingCart, BoxesIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { exportToExcel, exportToPDF } from "@/utils/exportGerencial";
import NoDataNotice from "@/components/NoDataNotice";

interface Product {
  seqProd: string;
  descricao: string;
  custoLiq: number;
  atual: number;
  estoque: number;
  sellout: number;
  promoc: number;
  filial: string;
  embCmp?: string | number;
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


const findProductInData = (code: string, data: DataMap) => {
  const found: { filial: string; filialName: string; custoLiq: number; atual: number; estoque: number; sellout: number; promoc: number; descricao: string; embCmp: number }[] = [];
  FILIAL_ORDER.forEach((filialId) => {
    const products = data[filialId];
    if (!products) return;
    const match = products.find(
      (p) => p.seqProd === code || p.seqProd?.padStart(6, "0") === code.padStart(6, "0")
    );
    if (match) {
      found.push({
        filial: filialId,
        filialName: FILIAL_NAMES[filialId] || `Filial ${filialId}`,
        custoLiq: match.custoLiq ?? 0,
        atual: match.atual ?? 0,
        estoque: match.estoque ?? 0,
        sellout: (match as any).sellout ?? 0,
        promoc: (match as any).promoc ?? 0,
        descricao: match.descricao ?? "",
        embCmp: parseFloat(String((match as any).embCmp ?? "")) || 0,
      });
    }
  });
  return found;
};

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

  const handleBulkUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result;
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as Record<string, unknown>[];

        const codes: string[] = [];
        rows.forEach((row: unknown) => {
          const arr = row as unknown[];
          if (arr && arr.length > 0) {
            const val = String(arr[0]).trim();
            if (val && val !== "" && !/^(codigo|code|cod|produto|seq)/i.test(val)) {
              codes.push(val);
            }
          }
        });

        const results: BulkProductResult[] = [];
        codes.forEach((code) => {
          const found = findProductInData(code, data);
          if (found.length > 0) {
            const filiais: Record<string, { estoque: number; custoLiq: number; atual: number; sellout: number; promoc: number }> = {};
            found.forEach((f) => {
              filiais[f.filial] = { estoque: f.estoque, custoLiq: f.custoLiq, atual: f.atual, sellout: f.sellout, promoc: f.promoc };
            });
            results.push({ code, descricao: found[0].descricao, filiais });
          } else {
            results.push({ code, descricao: "Não encontrado", filiais: {} });
          }
        });

        setBulkResults(results);
        setBulkFileName(file.name);
      } catch {
        console.error("Erro ao processar arquivo");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleBulkUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearBulk = () => {
    setBulkResults([]);
    setBulkFileName("");
  };

  const exportBulkToExcel = () => {
    const headerRow1 = ["CÓDIGO", "PRODUTO"];
    const headerRow2 = ["", ""];
    const availableFiliais = FILIAL_ORDER.filter((f) =>
      bulkResults.some((r) => r.filiais[f])
    );
    availableFiliais.forEach((f) => {
      const name = FILIAL_NAMES[f]?.split(" - ")[1] || f;
      headerRow1.push(`${name} | ${f}`, "", "", "", "");
      headerRow2.push("ESTOQUE", "CUSTO", "VENDA", "PROMOÇÃO", "SELLOUT");
    });

    const rows = bulkResults.map((r) => {
      const row: (string | number)[] = [r.code, r.descricao || r.code];
      availableFiliais.forEach((f) => {
        const d = r.filiais[f];
        row.push(d ? d.estoque : 0, d ? d.custoLiq : 0, d ? d.atual : 0, d ? d.promoc : 0, d ? d.sellout : 0);
      });
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...rows]);
    // Merge filial header cells
    const merges: XLSX.Range[] = [];
    let col = 2;
    availableFiliais.forEach(() => {
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 4 } });
      col += 5;
    });
    ws["!merges"] = merges;
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, ...availableFiliais.flatMap(() => [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }])];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visão Consolidada");
    XLSX.writeFile(wb, `analise_gerencial_massa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Find product across all filiais
  const results = useMemo(() => {
    if (!activeCode) return [];
    return findProductInData(activeCode, data);
  }, [activeCode, data]);

  const productName = results.length > 0 ? results[0].descricao : "";

  // KPI calculations based on search results
  const kpis = useMemo(() => {
    if (results.length === 0) {
      return { custoMedio: "—", vendaMedia: "—", estoqueTotal: "—", filiaisPresentes: "—", valorEstoqueVenda: "—", estoqueCaixas: "—", unidPorCaixa: "—" };
    }
    const custoMedio = results.reduce((s, r) => s + r.custoLiq, 0) / results.length;
    const vendaMedia = results.reduce((s, r) => s + r.atual, 0) / results.length;
    const estoqueTotal = results.reduce((s, r) => s + r.estoque, 0);
    // Unidade por caixa: vem do livro 01 (filial 01)
    const filial01 = results.find((r) => r.filial === "01");
    const unidCaixa = filial01?.embCmp || results.find((r) => r.embCmp > 0)?.embCmp || 0;
    // Valor Total Venda = venda média × estoque total × unidade por caixa
    const valorEstoqueVenda = vendaMedia * estoqueTotal * (unidCaixa || 1);
    return {
      custoMedio: fmt(custoMedio),
      vendaMedia: fmt(vendaMedia),
      estoqueTotal: fmtNum(estoqueTotal),
      filiaisPresentes: `${results.length} de ${FILIAL_ORDER.length}`,
      valorEstoqueVenda: fmt(valorEstoqueVenda),
      estoqueCaixas: `${fmtNum(estoqueTotal)} cx`,
      unidPorCaixa: unidCaixa > 0 ? fmtNum(unidCaixa) : "—",
    };
  }, [results]);

  const bulkAvailableFiliais = useMemo(() =>
    FILIAL_ORDER.filter((f) => bulkResults.some((r) => r.filiais[f])),
    [bulkResults]
  );

  const tableHeaderStyle =
    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const tableCellStyle = "px-4 py-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Análise Gerencial"
        description="Visão executiva consolidada dos principais indicadores comerciais"
      />

      {/* Product search + bulk upload */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
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
          <div className="space-y-4">
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

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">Consulta em massa:</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Planilha de Códigos
                </Button>
                {bulkFileName && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    {bulkFileName} — {bulkResults.length} produtos
                    <button onClick={clearBulk} className="hover:text-destructive transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Envie um arquivo Excel ou CSV com os códigos dos produtos na primeira coluna.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6"
      >
        <KpiCard title="Custo Médio" value={kpis.custoMedio} icon={DollarSign} />
        <KpiCard title="Venda Média" value={kpis.vendaMedia} icon={TrendingUp} />
        <KpiCard title="Estoque Total" value={kpis.estoqueTotal} icon={Package} />
        <KpiCard title="Unidade por Caixa" value={kpis.unidPorCaixa} icon={BoxesIcon} />
        <KpiCard title="Filiais c/ Produto" value={kpis.filiaisPresentes} icon={BarChart3} />
        <KpiCard title="Valor Total Venda" value={kpis.valorEstoqueVenda} icon={ShoppingCart} />
      </motion.div>

      {/* Bulk results */}
      <AnimatePresence>
        {bulkResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4 mb-8"
          >
            <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-card-foreground">{bulkResults.length}</span> produtos consultados
                {" · "}<span className="font-semibold text-card-foreground">{bulkResults.filter((r) => Object.keys(r.filiais).length > 0).length}</span> encontrados
              </p>
              <Button variant="outline" size="sm" onClick={exportBulkToExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                Exportar Excel
              </Button>
            </div>

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
                      <th rowSpan={2} className={`${tableHeaderStyle} border-r border-border sticky left-0 bg-muted/30 z-10 min-w-[90px]`}>Código</th>
                      <th rowSpan={2} className={`${tableHeaderStyle} border-r border-border sticky left-[90px] bg-muted/30 z-10`}>Produto</th>
                      {bulkAvailableFiliais.map((f) => (
                        <th
                          key={f}
                          colSpan={5}
                          className={`${tableHeaderStyle} text-center border-r border-border last:border-r-0`}
                        >
                          {FILIAL_NAMES[f]?.split(" - ")[1] || f} | {f}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-muted/20">
                      {bulkAvailableFiliais.map((f) => (
                        <React.Fragment key={f}>
                          <th className={`${tableHeaderStyle} text-right`}>Estoque</th>
                          <th className={`${tableHeaderStyle} text-right`}>Custo</th>
                          <th className={`${tableHeaderStyle} text-right`}>Venda</th>
                          <th className={`${tableHeaderStyle} text-right`}>Promoção</th>
                          <th className={`${tableHeaderStyle} text-right border-r border-border last:border-r-0`}>Sellout</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className={`${tableCellStyle} font-mono text-card-foreground border-r border-border sticky left-0 bg-card z-10 min-w-[90px]`}>
                          {r.code}
                        </td>
                        <td className={`${tableCellStyle} font-medium text-card-foreground border-r border-border sticky left-[90px] bg-card z-10 max-w-[200px] truncate`}>
                          {r.descricao !== "Não encontrado" ? r.descricao : (
                            <span className="text-muted-foreground italic">não encontrado</span>
                          )}
                        </td>
                        {bulkAvailableFiliais.map((f) => {
                          const d = r.filiais[f];
                          return (
                            <React.Fragment key={f}>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>
                                {d ? fmtNum(d.estoque) : "—"}
                              </td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>
                                {d ? fmt(d.custoLiq) : "—"}
                              </td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>
                                {d ? fmt(d.atual) : "—"}
                              </td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>
                                {d ? fmt(d.promoc) : "—"}
                              </td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground border-r border-border last:border-r-0`}>
                                {d ? fmtNum(d.sellout) : "—"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single product results */}
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
                <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-muted-foreground">
                    Produto: <span className="font-semibold text-card-foreground">{activeCode}</span>
                    {productName && (
                      <span className="ml-2 text-card-foreground">— {productName}</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToExcel(results, activeCode, productName)}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToPDF(results, activeCode, productName)}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                  </div>
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
                          <th className={`${tableHeaderStyle} text-right`}>Promoção</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.filial} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className={`${tableCellStyle} font-medium text-card-foreground`}>{r.filialName}</td>
                            <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.atual)}</td>
                            <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.promoc)}</td>
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
                              colSpan={5}
                              className={`${tableHeaderStyle} text-center border-r border-border`}
                            >
                              {FILIAL_NAMES[r.filial]?.split(" - ")[1] || r.filial} | {r.filial}
                            </th>
                          ))}
                          <th rowSpan={2} className={`${tableHeaderStyle} text-right bg-primary/10 text-primary`}>
                            TOTAL (Cx)
                          </th>
                        </tr>
                        <tr className="border-b border-border bg-muted/20">
                          {results.map((r) => (
                            <React.Fragment key={r.filial}>
                              <th className={`${tableHeaderStyle} text-right`}>Estoque</th>
                              <th className={`${tableHeaderStyle} text-right`}>Custo</th>
                              <th className={`${tableHeaderStyle} text-right`}>Venda</th>
                              <th className={`${tableHeaderStyle} text-right`}>Promoção</th>
                              <th className={`${tableHeaderStyle} text-right border-r border-border`}>Sellout</th>
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
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.atual)}</td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground`}>{fmt(r.promoc)}</td>
                              <td className={`${tableCellStyle} text-right font-mono text-card-foreground border-r border-border`}>{fmtNum(r.sellout)}</td>
                            </React.Fragment>
                          ))}
                          <td className={`${tableCellStyle} text-right font-mono font-bold text-primary bg-primary/5`}>
                            {fmtNum(results.reduce((s, r) => s + (Number(r.estoque) || 0), 0))}
                          </td>
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

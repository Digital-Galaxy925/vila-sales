import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ResultRow {
  filial: string;
  filialName: string;
  custoLiq: number;
  atual: number;
  estoque: number;
  descricao: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (v: number) => v.toLocaleString("pt-BR");

export function exportToExcel(results: ResultRow[], activeCode: string, productName: string) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Consolidado
  const consolidado = results.map((r) => ({
    Filial: r.filialName,
    "Preço de Custo": r.custoLiq,
    "Preço de Venda": r.atual,
    Estoque: r.estoque,
  }));
  const ws1 = XLSX.utils.json_to_sheet(consolidado);
  ws1["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Consolidado");

  // Sheet 2: Custo
  const custo = results.map((r) => ({ Filial: r.filialName, "Preço de Custo": r.custoLiq }));
  const ws2 = XLSX.utils.json_to_sheet(custo);
  ws2["!cols"] = [{ wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Preço de Custo");

  // Sheet 3: Venda
  const venda = results.map((r) => ({ Filial: r.filialName, "Preço de Venda": r.atual }));
  const ws3 = XLSX.utils.json_to_sheet(venda);
  ws3["!cols"] = [{ wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Preço de Venda");

  // Sheet 4: Estoque
  const estoque = results.map((r) => ({ Filial: r.filialName, Estoque: r.estoque }));
  const ws4 = XLSX.utils.json_to_sheet(estoque);
  ws4["!cols"] = [{ wch: 28 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Estoque");

  const fileName = `Analise_Gerencial_${activeCode}_${productName?.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30) || "produto"}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportToPDF(results: ResultRow[], activeCode: string, productName: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Análise Gerencial - Comparativo por Filial", 14, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Produto: ${activeCode} — ${productName}`, 14, 26);
  doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32);

  let startY = 40;

  // Table 1: Custo
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Preço de Custo por Filial", 14, startY);
  autoTable(doc, {
    startY: startY + 4,
    head: [["Filial", "Preço de Custo"]],
    body: results.map((r) => [r.filialName, fmt(r.custoLiq)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // Table 2: Venda
  doc.setFont("helvetica", "bold");
  doc.text("Preço de Venda por Filial", 14, startY);
  autoTable(doc, {
    startY: startY + 4,
    head: [["Filial", "Preço de Venda"]],
    body: results.map((r) => [r.filialName, fmt(r.atual)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // Table 3: Estoque
  doc.setFont("helvetica", "bold");
  doc.text("Estoque por Filial", 14, startY);
  autoTable(doc, {
    startY: startY + 4,
    head: [["Filial", "Estoque"]],
    body: results.map((r) => [r.filialName, fmtNum(r.estoque)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // Check if need new page for consolidated
  if (startY > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    startY = 20;
  }

  // Table 4: Consolidado
  doc.setFont("helvetica", "bold");
  doc.text("Visão Consolidada por Filial", 14, startY);
  autoTable(doc, {
    startY: startY + 4,
    head: [["Filial", "Estoque", "Preço de Custo", "Preço de Venda"]],
    body: results.map((r) => [r.filialName, fmtNum(r.estoque), fmt(r.custoLiq), fmt(r.atual)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  const fileName = `Analise_Gerencial_${activeCode}.pdf`;
  doc.save(fileName);
}

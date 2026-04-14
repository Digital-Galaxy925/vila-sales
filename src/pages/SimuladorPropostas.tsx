import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Product {
  familia: string;
  seqProd: string;
  descricao: string;
  embCmp: string;
  estoque: number;
  custoLiq: number;
  sellout: number;
  atual: number;
  filial: string;
  bu: string;
  promoc: number;
}

type DataMap = Record<string, Product[]>;

const FILIAIS = [
  { id: "01", nome: "Poços de Caldas" },
  { id: "11", nome: "Campinas" },
  { id: "12", nome: "Osasco" },
  { id: "14", nome: "Betim" },
  { id: "501", nome: "Focomix SP" },
  { id: "502", nome: "Focomix MG" },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) => (v * 100).toFixed(2) + "%";

const parseBR = (s: string) => {
  const clean = s.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};

const fmtInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface ProdutoItem {
  id: number;
  codigo: string;
  filial: string;
  precoVenda: string;
  volumeCaixas: string;
}

interface PedidoRow {
  label: string;
  valor: string;
  margem: string;
}

export default function SimuladorPropostas() {
  const navigate = useNavigate();

  const data: DataMap = useMemo(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const hasData = Object.keys(data).length > 0;

  const [nomeGerente, setNomeGerente] = useState("");
  const [dataAnalise, setDataAnalise] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusProposta, setStatusProposta] = useState<"" | "aprovada" | "rejeitada">("");
  const [observacao, setObservacao] = useState("");

  const [produtos, setProdutos] = useState<ProdutoItem[]>([
    { id: 1, codigo: "", filial: "01", precoVenda: "", volumeCaixas: "" },
  ]);

  const updateProduto = (id: number, field: keyof Omit<ProdutoItem, "id">, val: string) => {
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const addProduto = () => {
    setProdutos((prev) => [
      ...prev,
      { id: Date.now(), codigo: "", filial: "01", precoVenda: "", volumeCaixas: "" },
    ]);
  };

  const removeProduto = (id: number) => {
    if (produtos.length > 1) {
      setProdutos((prev) => prev.filter((p) => p.id !== id));
    } else {
      setProdutos([{ id: Date.now(), codigo: "", filial: "01", precoVenda: "", volumeCaixas: "" }]);
    }
  };

  const normCod = (v: string): string => {
    let s = v.trim();
    s = s.replace(/\.0+$/, "");
    s = s.replace(/^0+(\d)/, "$1");
    return s;
  };

  const findProduct = (codigo: string, filialId: string) => {
    const cod = normCod(codigo);
    if (!cod) return null;
    const arr = data[filialId];
    if (!Array.isArray(arr)) return null;
    return arr.find((p) => normCod(p.seqProd) === cod) ?? null;
  };

  const produtosCalc = produtos.map((item) => {
    const found = item.codigo.trim() ? findProduct(item.codigo, item.filial) : null;
    const custoUnit = found?.custoLiq ?? 0;
    const qtdCaixa = found ? parseFloat(found.embCmp) || 1 : 1;
    const precoVD = parseBR(item.precoVenda);
    const volCx = parseBR(item.volumeCaixas);
    const margem = precoVD > 0 ? (precoVD - custoUnit) / precoVD : 0;
    const valorTotal = volCx * qtdCaixa * precoVD;
    const totalUnidades = volCx * qtdCaixa;
    return { ...item, found, custoUnit, qtdCaixa, precoVD, volCx, margem, valorTotal, totalUnidades };
  });

  const [pedidos, setPedidos] = useState<PedidoRow[]>([
    { label: "Pedido Promocional", valor: "", margem: "" },
    { label: "Pedido Sortimento", valor: "", margem: "" },
    { label: "Pedido Adicional", valor: "", margem: "" },
  ]);

  const updatePedido = (i: number, field: "valor" | "margem", val: string) => {
    setPedidos((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));
  };

  const calcRows = pedidos.map((p) => {
    const valor = parseBR(p.valor);
    const margem = parseBR(p.margem) / 100;
    const margemRS = valor * margem;
    return { ...p, valorNum: valor, margemNum: margem, margemRS };
  });

  const totalValor = calcRows.reduce((s, r) => s + r.valorNum, 0);
  const totalMargemRS = calcRows.reduce((s, r) => s + r.margemRS, 0);
  const margemPonderada = totalValor > 0 ? totalMargemRS / totalValor : 0;
  const participacoes = calcRows.map((r) => (totalValor > 0 ? r.valorNum / totalValor : 0));
  const maiorPedidoIdx = calcRows.reduce((best, r, i) => (r.valorNum > (calcRows[best]?.valorNum ?? 0) ? i : best), 0);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF();
    const status = statusProposta === "aprovada" ? "APROVADA" : statusProposta === "rejeitada" ? "REJEITADA" : "PENDENTE";
    const dataFmt = dataAnalise.split("-").reverse().join("/");

    // Header
    doc.setFillColor(10, 15, 30);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Vila Sales - Simulador de Propostas", 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerente: ${nomeGerente || "N/A"}    |    Data: ${dataFmt}    |    Status: ${status}`, 14, 30);

    let y = 50;

    // Produtos
    produtosCalc.forEach((pc, idx) => {
      if (!pc.found) return;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Produto ${idx + 1}: ${pc.found.descricao}`, 14, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        theme: "grid",
        headStyles: { fillColor: [30, 58, 95], textColor: [226, 232, 240], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        head: [["Código", "Filial", "Custo", "Preço Venda Atual", "Estoque", "Unid/CX", "Preço Desejado", "Margem Sim.", "Valor Total"]],
        body: [[
          pc.found.seqProd,
          pc.filial,
          fmt(pc.found.custoLiq),
          fmt(pc.found.atual),
          pc.found.estoque.toLocaleString("pt-BR"),
          pc.found.embCmp,
          pc.precoVD > 0 ? fmt(pc.precoVD) : "-",
          pc.precoVD > 0 ? fmtPct(pc.margem) : "-",
          pc.valorTotal > 0 ? fmt(pc.valorTotal) : "-",
        ]],
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    });

    // Pedidos
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Entrada de Dados dos Pedidos", 14, y);
    y += 6;

    const pedidoBody = calcRows.map((r, i) => [
      r.label,
      fmt(r.valorNum),
      fmtPct(r.margemNum),
      fmt(r.margemRS),
      fmtPct(participacoes[i]),
    ]);
    pedidoBody.push(["TOTAL CONSOLIDADO", fmt(totalValor), fmtPct(margemPonderada), fmt(totalMargemRS), "100,00%"]);

    autoTable(doc, {
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [30, 58, 95], textColor: [226, 232, 240], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      head: [["Pedido", "Valor Total (R$)", "Margem (%)", "Margem (R$)", "Participação"]],
      body: pedidoBody,
      didParseCell: (data: any) => {
        if (data.row.index === pedidoBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [15, 23, 42];
          data.cell.styles.textColor = [96, 165, 250];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // Results summary
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Resultado da Análise", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Margem Ponderada Real: ${fmtPct(margemPonderada)}`, 14, y); y += 6;
    doc.text(`Margem R$ Total: ${fmt(totalMargemRS)}`, 14, y); y += 6;
    doc.text(`Volume Total de Vendas: ${fmt(totalValor)}`, 14, y); y += 6;
    doc.text(`Maior Pedido: ${calcRows[maiorPedidoIdx]?.label ?? "-"} (${fmtPct(participacoes[maiorPedidoIdx] ?? 0)})`, 14, y); y += 12;

    // Status stamp
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    if (statusProposta === "aprovada") {
      doc.setTextColor(52, 211, 153);
      doc.text("STATUS: APROVADA", 14, y);
    } else if (statusProposta === "rejeitada") {
      doc.setTextColor(248, 113, 113);
      doc.text("STATUS: REJEITADA", 14, y);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text("STATUS: PENDENTE", 14, y);
    }

    // File name
    const nomeArq = `${(nomeGerente || "proposta").replace(/\s+/g, "_")}_${dataAnalise}_${status}.pdf`;
    doc.save(nomeArq);
  }, [nomeGerente, dataAnalise, statusProposta, produtosCalc, calcRows, totalValor, totalMargemRS, margemPonderada, participacoes, maiorPedidoIdx]);

  const generatePDFBlob = useCallback((): Blob => {
    const doc = new jsPDF();
    const status = "APROVADA";
    const dataFmt = dataAnalise.split("-").reverse().join("/");

    doc.setFillColor(10, 15, 30);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Vila Sales - Simulador de Propostas", 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerente: ${nomeGerente || "N/A"}    |    Data: ${dataFmt}    |    Status: ${status}`, 14, 30);

    let y = 50;
    produtosCalc.forEach((pc, idx) => {
      if (!pc.found) return;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Produto ${idx + 1}: ${pc.found.descricao}`, 14, y);
      y += 8;
      autoTable(doc, {
        startY: y, theme: "grid",
        headStyles: { fillColor: [30, 58, 95], textColor: [226, 232, 240], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        head: [["Código", "Filial", "Custo", "Preço Venda Atual", "Estoque", "Unid/CX", "Preço Desejado", "Margem Sim.", "Valor Total"]],
        body: [[pc.found.seqProd, pc.filial, fmt(pc.found.custoLiq), fmt(pc.found.atual), pc.found.estoque.toLocaleString("pt-BR"), pc.found.embCmp, pc.precoVD > 0 ? fmt(pc.precoVD) : "-", pc.precoVD > 0 ? fmtPct(pc.margem) : "-", pc.valorTotal > 0 ? fmt(pc.valorTotal) : "-"]],
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    });

    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Entrada de Dados dos Pedidos", 14, y);
    y += 6;
    const pedidoBody = calcRows.map((r, i) => [r.label, fmt(r.valorNum), fmtPct(r.margemNum), fmt(r.margemRS), fmtPct(participacoes[i])]);
    pedidoBody.push(["TOTAL CONSOLIDADO", fmt(totalValor), fmtPct(margemPonderada), fmt(totalMargemRS), "100,00%"]);
    autoTable(doc, {
      startY: y, theme: "grid",
      headStyles: { fillColor: [30, 58, 95], textColor: [226, 232, 240], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      head: [["Pedido", "Valor Total (R$)", "Margem (%)", "Margem (R$)", "Participação"]],
      body: pedidoBody,
      didParseCell: (data: any) => {
        if (data.row.index === pedidoBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [15, 23, 42];
          data.cell.styles.textColor = [96, 165, 250];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Resultado da Análise", 14, y); y += 8;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Margem Ponderada Real: ${fmtPct(margemPonderada)}`, 14, y); y += 6;
    doc.text(`Margem R$ Total: ${fmt(totalMargemRS)}`, 14, y); y += 6;
    doc.text(`Volume Total de Vendas: ${fmt(totalValor)}`, 14, y); y += 6;
    doc.text(`Maior Pedido: ${calcRows[maiorPedidoIdx]?.label ?? "-"} (${fmtPct(participacoes[maiorPedidoIdx] ?? 0)})`, 14, y); y += 12;
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.setTextColor(52, 211, 153);
    doc.text("STATUS: APROVADA", 14, y);

    return doc.output("blob");
  }, [nomeGerente, dataAnalise, produtosCalc, calcRows, totalValor, totalMargemRS, margemPonderada, participacoes, maiorPedidoIdx]);

  const salvarPropostaAprovada = useCallback(async () => {
    try {
      // Generate PDF blob
      const pdfBlob = generatePDFBlob();
      const fileName = `${(nomeGerente || "proposta").replace(/\s+/g, "_")}_${dataAnalise}_APROVADA.pdf`;
      const filePath = `${Date.now()}_${fileName}`;

      // Upload PDF to storage
      const { error: uploadError } = await supabase.storage
        .from("propostas-pdfs")
        .upload(filePath, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      // Collect BU from products
      const busUsed = [...new Set(produtosCalc.filter(p => p.found).map(p => p.found!.bu))];
      const buStr = busUsed.join(", ");

      // Save proposal data
      const produtosData = produtosCalc.filter(p => p.found).map(pc => ({
        codigo: pc.found!.seqProd,
        descricao: pc.found!.descricao,
        filial: pc.filial,
        custo: pc.found!.custoLiq,
        precoAtual: pc.found!.atual,
        precoDesejado: pc.precoVD,
        margem: pc.margem,
        valorTotal: pc.valorTotal,
        totalUnidades: pc.totalUnidades,
      }));

      const pedidosData = calcRows.map((r, i) => ({
        label: r.label,
        valor: r.valorNum,
        margem: r.margemNum,
        margemRS: r.margemRS,
        participacao: participacoes[i],
      }));

      const { error: insertError } = await supabase.from("propostas_aprovadas").insert({
        nome_gerente: nomeGerente.toUpperCase(),
        data_analise: dataAnalise,
        bu: buStr.toUpperCase(),
        observacao: observacao.toUpperCase(),
        margem_ponderada: margemPonderada,
        margem_total_rs: totalMargemRS,
        volume_total_vendas: totalValor,
        maior_pedido: calcRows[maiorPedidoIdx]?.label ?? "",
        produtos: produtosData as any,
        pedidos: pedidosData as any,
        pdf_path: filePath,
      });

      if (insertError) throw insertError;

      toast({ title: "Proposta aprovada salva com sucesso!", description: "Os dados e o PDF foram armazenados." });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao salvar proposta", description: err.message, variant: "destructive" });
    }
  }, [generatePDFBlob, nomeGerente, dataAnalise, observacao, produtosCalc, calcRows, totalValor, totalMargemRS, margemPonderada, participacoes, maiorPedidoIdx]);

  // Sidebar
  const sidebarModules = [
    { id: "cruzamento", label: "Análise de Custos", icon: "🔗" },
    { id: "estoque", label: "Análise de Estoque", icon: "📦" },
    { id: "margem", label: "Análise de Margem", icon: "📊" },
    { id: "preco", label: "Análise de Preço", icon: "💰" },
    { id: "shelflife", label: "Análise de Shelf Life", icon: "⏰" },
    { id: "geral", label: "Análise Geral", icon: "🏢" },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid #d1d5db", background: "#fafafa", color: "#1f2937",
    fontSize: 14, outline: "none", transition: "border-color 0.15s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 6, display: "block",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ padding: "28px 36px", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#1f2937" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.02em", color: "#0f172a" }}>
          Simulador de Propostas
        </h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 28 }}>
          Simule a margem combinada de pedidos para um ou mais produtos.
        </p>

        {!hasData ? (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
              Nenhum dado carregado. Faça o upload dos arquivos na tela principal primeiro.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer",
              }}
            >
              Ir para Upload
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Gerente e Data */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1f2937" }}>
                Informações da Proposta
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Nome do Gerente</label>
                  <input
                    style={inputStyle}
                    placeholder="Ex: João Silva"
                    value={nomeGerente}
                    onChange={(e) => setNomeGerente(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data da Análise</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={dataAnalise}
                    onChange={(e) => setDataAnalise(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {/* Products */}
            {produtosCalc.map((pc, idx) => (
              <div key={pc.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1f2937" }}>
                    Produto {idx + 1}
                  </h2>
                  <button
                    onClick={() => removeProduto(pc.id)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid #ef4444",
                      background: "transparent", color: "#ef4444", fontSize: 11, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✕ Remover
                  </button>
                </div>

                {/* Inputs: código, filial */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Código do Produto</label>
                    <input
                      style={inputStyle}
                      placeholder="Ex: 123456"
                      value={pc.codigo}
                      onChange={(e) => updateProduto(pc.id, "codigo", e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Filial</label>
                    <select
                      style={inputStyle}
                      value={pc.filial}
                      onChange={(e) => updateProduto(pc.id, "filial", e.target.value)}
                    >
                      {FILIAIS.map((f) => (
                        <option key={f.id} value={f.id}>{f.id} – {f.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Product info */}
                {pc.found && (
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <InfoCard label="Descrição" value={pc.found.descricao} span={2} />
                    <InfoCard label="Preço de Custo" value={fmt(pc.found.custoLiq)} />
                    <InfoCard label="Preço de Venda Atual" value={fmt(pc.found.atual)} />
                    <InfoCard label="Promocional" value={pc.found.promoc ? fmt(pc.found.promoc) : "—"} color="#7c3aed" />
                    <InfoCard label="Sell Out" value={pc.found.sellout ? fmt(pc.found.sellout) : "—"} color="#0284c7" />
                    <InfoCard label="Estoque (CX)" value={pc.found.estoque.toLocaleString("pt-BR")} />
                    <InfoCard label="Unid/CX" value={pc.found.embCmp} />
                  </div>
                )}

                {pc.codigo.trim() && !pc.found && (
                  <p style={{ marginTop: 12, color: "#dc2626", fontSize: 13 }}>
                    Produto não encontrado na filial selecionada.
                  </p>
                )}

                {/* Simulation inputs */}
                {pc.found && (
                  <>
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <label style={labelStyle}>Preço de Venda Desejado (R$)</label>
                        <input
                          style={inputStyle}
                          placeholder="0,00"
                          value={pc.precoVenda}
                          onChange={(e) => updateProduto(pc.id, "precoVenda", e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Volume em Caixas</label>
                        <input
                          style={inputStyle}
                          placeholder="0"
                          value={pc.volumeCaixas}
                          onChange={(e) => updateProduto(pc.id, "volumeCaixas", e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <InfoCard
                        label="Margem Simulada"
                        value={fmtPct(pc.margem)}
                        color={pc.margem >= 0.15 ? "#16a34a" : "#dc2626"}
                      />
                      <InfoCard label="Valor Total" value={fmt(pc.valorTotal)} />
                      <InfoCard label="Total Unidades" value={pc.totalUnidades.toLocaleString("pt-BR")} />
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add product button */}
            <button
              onClick={addProduto}
              style={{
                padding: "12px 24px", borderRadius: 10, border: "2px dashed #d1d5db",
                background: "transparent", color: "#0071e3", fontSize: 14, fontWeight: 500,
                cursor: "pointer", transition: "all .15s",
              }}
            >
              + Adicionar Produto à Proposta
            </button>

            {/* Orders Table */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1f2937" }}>
                Entrada de Dados dos Pedidos
              </h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      {["Pedido", "Valor Total (R$)", "Margem (%)", "Margem (R$)", "Participação", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 12px", textAlign: "left", fontSize: 11,
                            fontWeight: 600, color: "#6b7280", textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calcRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500, color: "#374151" }}>
                          {row.label}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 13 }}>R$</span>
                            <input
                              style={{ ...inputStyle, width: 180, paddingLeft: 40 }}
                              placeholder="0,00"
                              value={pedidos[i].valor}
                              onChange={(e) => updatePedido(i, "valor", fmtInput(e.target.value))}
                            />
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <input
                            style={{ ...inputStyle, width: 100 }}
                            placeholder="0,00"
                            value={pedidos[i].margem}
                            onChange={(e) => updatePedido(i, "margem", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "10px 12px", color: row.margemRS > 0 ? "#16a34a" : "#9ca3af" }}>
                          {fmt(row.margemRS)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#9ca3af" }}>
                          {fmtPct(participacoes[i])}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          {pedidos.length > 1 && (
                            <button
                              onClick={() => setPedidos((prev) => prev.filter((_, idx) => idx !== i))}
                              style={{
                                padding: "4px 10px", borderRadius: 6, border: "1px solid #ef4444",
                                background: "transparent", color: "#ef4444", fontSize: 11,
                                fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}>
                      <td style={{ padding: "12px", fontWeight: 700, color: "#0071e3" }}>
                        TOTAL CONSOLIDADO
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: "#1f2937" }}>
                        {fmt(totalValor)}
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: margemPonderada >= 0.15 ? "#16a34a" : "#dc2626" }}>
                        {fmtPct(margemPonderada)}
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: totalMargemRS > 0 ? "#16a34a" : "#9ca3af" }}>
                        {fmt(totalMargemRS)}
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: "#9ca3af" }}>
                        100,00%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <button
                onClick={() =>
                  setPedidos((prev) => [
                    ...prev,
                    { label: `Pedido ${prev.length + 1}`, valor: "", margem: "" },
                  ])
                }
                style={{
                  marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "transparent", color: "#0071e3", fontSize: 12, fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                + Adicionar Pedido
              </button>
            </div>

            {/* Results */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <ResultCard
                label="Margem Ponderada Real"
                value={fmtPct(margemPonderada)}
                color={margemPonderada >= 0.15 ? "#34d399" : "#f87171"}
                subtitle="Margem combinada de todos os pedidos"
              />
              <ResultCard
                label="Margem R$ Total"
                value={fmt(totalMargemRS)}
                color="#60a5fa"
                subtitle="Soma das margens em reais"
              />
              <ResultCard
                label="Volume Total de Vendas"
                value={fmt(totalValor)}
                color="#a78bfa"
                subtitle="Soma dos valores de pedidos"
              />
              <ResultCard
                label="Maior Pedido"
                value={calcRows[maiorPedidoIdx]?.label ?? "-"}
                color="#fbbf24"
                subtitle={`Participação: ${fmtPct(participacoes[maiorPedidoIdx] ?? 0)}`}
              />
            </div>

            {/* Status da Proposta */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1f2937" }}>
                Status da Proposta
              </h2>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={async () => {
                    setStatusProposta("aprovada");
                    await salvarPropostaAprovada();
                  }}
                  style={{
                    flex: 1, padding: "12px 24px", borderRadius: 10, border: "2px solid",
                    borderColor: statusProposta === "aprovada" ? "#16a34a" : "#d1d5db",
                    background: statusProposta === "aprovada" ? "#f0fdf4" : "transparent",
                    color: statusProposta === "aprovada" ? "#16a34a" : "#9ca3af",
                    fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                  }}
                >
                  ✓ Aprovada
                </button>
                <button
                  onClick={() => setStatusProposta("rejeitada")}
                  style={{
                    flex: 1, padding: "12px 24px", borderRadius: 10, border: "2px solid",
                    borderColor: statusProposta === "rejeitada" ? "#dc2626" : "#d1d5db",
                    background: statusProposta === "rejeitada" ? "#fef2f2" : "transparent",
                    color: statusProposta === "rejeitada" ? "#dc2626" : "#9ca3af",
                    fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                  }}
                >
                  ✕ Rejeitada
                </button>
              </div>
              {statusProposta && (
                <p style={{ marginTop: 12, fontSize: 13, color: statusProposta === "aprovada" ? "#16a34a" : "#dc2626", fontWeight: 500 }}>
                  Proposta marcada como: {statusProposta === "aprovada" ? "APROVADA" : "REJEITADA"}
                </p>
              )}
            </div>

            {/* Observação */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1f2937" }}>
                Observação
              </h2>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Digite aqui suas observações sobre a proposta..."
                rows={4}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 8,
                  border: "1px solid #d1d5db", background: "#fafafa", color: "#1f2937",
                  fontSize: 13, fontFamily: "inherit", resize: "vertical",
                  outline: "none",
                }}
              />
            </div>

            {/* Export PDF */}
            <button
              onClick={exportPDF}
              style={{
                width: "100%", padding: "14px 24px", borderRadius: 10, border: "none",
                background: "#0071e3", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}
            >
              Exportar Proposta em PDF
            </button>
          </div>
        )}
    </div>
  );
}

function InfoCard({ label, value, span, color }: { label: string; value: string; span?: number; color?: string }) {
  return (
    <div
      style={{
        background: "#f9fafb", borderRadius: 10, padding: "12px 16px",
        border: "1px solid #e5e7eb",
        gridColumn: span ? `span ${span}` : undefined,
      }}
    >
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 500, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#1f2937" }}>{value}</div>
    </div>
  );
}

function ResultCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle: string }) {
  return (
    <div
      style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb",
        padding: 20, display: "flex", flexDirection: "column", gap: 4,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{subtitle}</div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, AlertCircle, Package, Calculator } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface STRow {
  [key: string]: string;
}

const normalize = (str: string) =>
  str?.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() || "";

const findCol = (row: STRow, candidates: string[]) => {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => normalize(k).includes(normalize(c)));
    if (found) return row[found];
  }
  return "";
};

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) =>
  (v * 100).toFixed(2).replace(".", ",") + "%";

// Alíquotas padrão
const ICMS_MG = 0.18;      // ICMS interno MG
const ICMS_SP = 0.18;      // ICMS interno SP
const ICMS_INTER = 0.12;   // ICMS interestadual SP → MG

export default function TabelaST() {
  const [codigo, setCodigo] = useState("");
  const [searched, setSearched] = useState(false);
  const [precoSemST, setPrecoSemST] = useState("");

  const stData: STRow[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("st_data") || "[]");
    } catch {
      return [];
    }
  }, []);

  const livrosData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("vilasales_data") || "[]") as Array<{ seqProd: string; promoc: number; custoLiq: number; atual: number; descricao: string }>;
    } catch {
      return [];
    }
  }, []);

  const result = useMemo(() => {
    if (!searched || !codigo.trim()) return null;
    const query = codigo.trim();
    const match = stData.find((row) => {
      const cod = findCol(row, ["CODIGO", "COD", "CODE", "SKU", "EAN"]);
      return cod === query || cod.replace(/^0+/, "") === query.replace(/^0+/, "");
    });
    if (!match) return null;

    const nome = findCol(match, ["PRODUTO", "DESCRICAO", "NOME", "DESC", "ITEM"]);
    const descricao = findCol(match, ["DESCRICAO", "DESC", "NOME_PRODUTO", "NOME PRODUTO", "DESCRIPTION"]);
    const categoria = findCol(match, ["CATEGORIA", "CAT", "GRUPO"]);
    const familia = findCol(match, ["FAMILIA", "FAM", "COD_FAMILIA", "CODIGO FAMILIA"]);
    const stMG = findCol(match, ["ST_MG", "ST MG", "STMG", "MVA MG", "MVA_MG", "MVA ORIGINAL MG", "MVA INTERNA", "ALIQUOTA MG", "% MG", "%MG"]);
    const stSP = findCol(match, ["ST_SP", "ST SP", "STSP", "MVA SP", "MVA_SP", "MVA AJUSTADA SP", "MVA AJUSTADA", "MVA INTERESTADUAL", "ALIQUOTA SP", "% SP", "%SP"]);

    const stMGNum = parseFloat(stMG.replace(",", ".").replace("%", "")) || 0;
    const stSPNum = parseFloat(stSP.replace(",", ".").replace("%", "")) || 0;

    let compensacao = "—";
    if (stMGNum && stSPNum) {
      compensacao = stSPNum < stMGNum ? "Compensa comprar por SP" : stMGNum < stSPNum ? "Compensa comprar por MG" : "Valores iguais";
    }

    return { nome, descricao, categoria, familia, stMG, stSP, stMGNum, stSPNum, compensacao };
  }, [searched, codigo, stData]);

  // Simulador de ST
  const simulacao = useMemo(() => {
    if (!result) return null;
    const preco = parseFloat(precoSemST.replace(",", "."));
    if (!preco || preco <= 0) return null;

    const mvaMG = result.stMGNum / 100;
    const mvaSP = result.stSPNum / 100;

    // --- Compra interna MG (operação interna) ---
    // Base de cálculo ST = Preço × (1 + MVA)
    const baseSTMG = preco * (1 + mvaMG);
    // ICMS próprio = Preço × alíquota interna MG
    const icmsPropMG = preco * ICMS_MG;
    // ICMS ST = (Base ST × alíquota destino) - ICMS próprio
    const icmsSTMG = Math.max(0, baseSTMG * ICMS_MG - icmsPropMG);
    // Preço final = Preço + ICMS ST
    const precoFinalMG = preco + icmsSTMG;

    // --- Compra interestadual SP → MG ---
    // Base de cálculo ST = Preço × (1 + MVA ajustada SP)
    const baseSTSP = preco * (1 + mvaSP);
    // ICMS próprio interestadual = Preço × alíquota interestadual (12%)
    const icmsPropSP = preco * ICMS_INTER;
    // ICMS ST = (Base ST × alíquota destino MG 18%) - ICMS próprio interestadual
    const icmsSTSP = Math.max(0, baseSTSP * ICMS_MG - icmsPropSP);
    // Preço final = Preço + ICMS ST
    const precoFinalSP = preco + icmsSTSP;

    const melhorOpcao = precoFinalSP < precoFinalMG
      ? "Compensa comprar por SP"
      : precoFinalMG < precoFinalSP
        ? "Compensa comprar por MG"
        : "Valores iguais";

    return {
      preco,
      mg: { baseST: baseSTMG, icmsProp: icmsPropMG, icmsST: icmsSTMG, precoFinal: precoFinalMG },
      sp: { baseST: baseSTSP, icmsProp: icmsPropSP, icmsST: icmsSTSP, precoFinal: precoFinalSP },
      melhorOpcao,
    };
  }, [result, precoSemST]);

  const handleSearch = () => {
    if (codigo.trim()) setSearched(true);
  };

  const hasData = stData.length > 0;

  return (
    <div>
      <PageHeader
        title="Tabela de ST"
        description="Consulte os dados de Substituição Tributária por produto e filial."
      />

      {!hasData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6"
        >
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-200">
            Nenhuma base de ST carregada. Faça o upload no menu <strong>Upload ST</strong> antes de consultar.
          </p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl shadow-[var(--shadow-card)] p-6 mb-6"
      >
        <h3 className="text-sm font-heading font-semibold text-card-foreground mb-4">
          Consulta por Código do Produto
        </h3>
        <div className="flex gap-3">
          <Input
            placeholder="Digite o código do produto..."
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              setSearched(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-md"
          />
          <Button onClick={handleSearch} disabled={!codigo.trim() || !hasData}>
            <Search className="w-4 h-4 mr-2" />
            Consultar
          </Button>
        </div>
      </motion.div>

      {searched && result && (
        <>
          {/* Resultado da Consulta */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden mb-6"
          >
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-heading font-semibold text-card-foreground">
                Resultado da Consulta
              </h3>
            </div>
            <div className="border-b border-border bg-card px-5 py-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Descrição do Produto
              </p>
              <p className="text-sm font-medium text-card-foreground">
                {result.descricao || "—"}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
              {[
                { label: "Categoria", value: result.categoria },
                { label: "Produto", value: result.nome },
                { label: "Código Família", value: result.familia },
                { label: "ST MG (MVA)", value: result.stMG || "—" },
                { label: "ST SP (MVA)", value: result.stSP || "—" },
                { label: "Compensação", value: result.compensacao, highlight: true },
              ].map((item) => (
                <div key={item.label} className="bg-card p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {item.label}
                  </p>
                  <p className={`text-sm font-medium ${item.highlight ? "text-primary" : "text-card-foreground"}`}>
                    {item.value || "—"}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Simulador de ST */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-heading font-semibold text-card-foreground">
                Simulador de ST
              </h3>
            </div>

            <div className="p-5 border-b border-border">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">
                Preço sem ST (R$)
              </label>
              <Input
                placeholder="Ex: 25,90"
                value={precoSemST}
                onChange={(e) => setPrecoSemST(e.target.value)}
                className="max-w-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Alíquotas: ICMS interno MG/SP = 18% · ICMS interestadual SP→MG = 12%
              </p>
            </div>

            {simulacao ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
                {/* Coluna MG */}
                <div className="bg-card p-5 space-y-3">
                  <h4 className="text-xs font-heading font-bold text-card-foreground uppercase tracking-wider">
                    🔵 Compra por MG (Interna)
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Preço s/ ST", value: fmt(simulacao.preco) },
                      { label: "MVA", value: fmtPct(result.stMGNum / 100) },
                      { label: "Base de Cálculo ST", value: fmt(simulacao.mg.baseST) },
                      { label: "ICMS Próprio (18%)", value: fmt(simulacao.mg.icmsProp) },
                      { label: "ICMS ST", value: fmt(simulacao.mg.icmsST) },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="text-card-foreground font-medium">{r.value}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                      <span className="text-card-foreground">Preço Final c/ ST</span>
                      <span className="text-primary">{fmt(simulacao.mg.precoFinal)}</span>
                    </div>
                  </div>
                </div>

                {/* Coluna SP */}
                <div className="bg-card p-5 space-y-3">
                  <h4 className="text-xs font-heading font-bold text-card-foreground uppercase tracking-wider">
                    🟡 Compra por SP (Interestadual)
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Preço s/ ST", value: fmt(simulacao.preco) },
                      { label: "MVA Ajustada", value: fmtPct(result.stSPNum / 100) },
                      { label: "Base de Cálculo ST", value: fmt(simulacao.sp.baseST) },
                      { label: "ICMS Próprio (12%)", value: fmt(simulacao.sp.icmsProp) },
                      { label: "ICMS ST", value: fmt(simulacao.sp.icmsST) },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="text-card-foreground font-medium">{r.value}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                      <span className="text-card-foreground">Preço Final c/ ST</span>
                      <span className="text-primary">{fmt(simulacao.sp.precoFinal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Digite um preço acima para simular o cálculo de ST.
              </div>
            )}

            {simulacao && (
              <div className="border-t border-border bg-muted/30 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Resultado da Simulação
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {simulacao.melhorOpcao}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Economia
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {fmt(Math.abs(simulacao.mg.precoFinal - simulacao.sp.precoFinal))}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}

      {searched && !result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] p-8 text-center"
        >
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum produto encontrado com o código <strong>"{codigo}"</strong>.
          </p>
        </motion.div>
      )}
    </div>
  );
}

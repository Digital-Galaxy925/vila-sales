import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, AlertCircle, Package } from "lucide-react";
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

export default function TabelaST() {
  const [codigo, setCodigo] = useState("");
  const [searched, setSearched] = useState(false);

  const stData: STRow[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("st_data") || "[]");
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
    const stMG = findCol(match, ["ST_MG", "ST MG", "STMG", "MVA MG", "MVA_MG"]);
    const stSP = findCol(match, ["ST_SP", "ST SP", "STSP", "MVA SP", "MVA_SP"]);

    const stMGNum = parseFloat(stMG.replace(",", ".").replace("%", "")) || 0;
    const stSPNum = parseFloat(stSP.replace(",", ".").replace("%", "")) || 0;

    let compensacao = "—";
    if (stMGNum && stSPNum) {
      compensacao = stSPNum < stMGNum ? "Compensa comprar por SP" : stMGNum < stSPNum ? "Compensa comprar por MG" : "Valores iguais";
    }

    return { nome, descricao, categoria, familia, stMG, stSP, compensacao };
  }, [searched, codigo, stData]);

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden"
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
              { label: "Produto", value: result.nome },
              { label: "Categoria", value: result.categoria },
              { label: "Código Família", value: result.familia },
              { label: "ST MG", value: result.stMG || "—" },
              { label: "ST SP", value: result.stSP || "—" },
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

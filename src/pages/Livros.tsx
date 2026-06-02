import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, RefreshCw, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { loadLivrosFromSupabase, type FilialDataMap } from "@/lib/livrosSync";
import { toast } from "@/hooks/use-toast";

const FILIAIS: { code: string; label: string }[] = [
  { code: "501", label: "Focomix SP" },
  { code: "502", label: "Focomix MG" },
  { code: "11", label: "Campinas" },
  { code: "12", label: "Osasco" },
  { code: "01", label: "Poços" },
  { code: "14", label: "Betim" },
];

const num = (v: any): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/^R\$\s*/i, "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let n = s;
  if (lastComma >= 0 && lastDot >= 0) {
    n = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    n = s.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normCode = (v: any) => String(v ?? "").trim().replace(/^0+/, "");
const fmt = (v: number) =>
  v > 0 ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

interface LinhaLivro {
  bu: string;
  familia: string;
  seqProd: string;
  descricao: string;
  cmp: number; // unidades por caixa (embalagem CMP)
  precos: Record<string, number>; // por filial
}

const Livros = () => {
  const [data, setData] = useState<FilialDataMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroBu, setFiltroBu] = useState<string>("todas");

  const fetch = async () => {
    setLoading(true);
    try {
      const remote = await loadLivrosFromSupabase();
      setData(remote || {});
    } catch (e: any) {
      toast({ title: "Erro ao carregar livros", description: e?.message ?? String(e), variant: "destructive" });
      setData({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const linhas = useMemo<LinhaLivro[]>(() => {
    const map = new Map<string, LinhaLivro>();
    const d = data || {};
    Object.entries(d).forEach(([filial, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((p: any) => {
        const cod = normCode(p?.seqProd);
        if (!cod) return;
        let row = map.get(cod);
        if (!row) {
          row = {
            bu: String(p?.bu ?? "").toUpperCase().trim(),
            familia: String(p?.familia ?? "").trim(),
            seqProd: String(p?.seqProd ?? cod).trim(),
            descricao: String(p?.descricao ?? "").trim(),
            cmp: num(p?.custoLiq ?? p?.custoNf ?? p?.custo),
            precos: {},
          };
          map.set(cod, row);
        } else {
          if (!row.bu) row.bu = String(p?.bu ?? "").toUpperCase().trim();
          if (!row.familia) row.familia = String(p?.familia ?? "").trim();
          if (!row.descricao) row.descricao = String(p?.descricao ?? "").trim();
          if (!row.cmp) row.cmp = num(p?.custoLiq ?? p?.custoNf ?? p?.custo);
        }
        const promoc = num(p?.promoc ?? p?.promocional);
        const atual = num(p?.atual ?? p?.preco);
        const preco = promoc > 0 ? promoc : atual;
        if (preco > 0) row.precos[filial] = preco;
      });
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.familia || "").localeCompare(b.familia || "") || a.seqProd.localeCompare(b.seqProd),
    );
  }, [data]);

  const busDisponiveis = useMemo(() => {
    const s = new Set<string>();
    linhas.forEach((l) => l.bu && s.add(l.bu));
    return Array.from(s).sort();
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtroBu !== "todas" && l.bu !== filtroBu) return false;
      if (!q) return true;
      return (
        l.seqProd.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q) ||
        l.familia.toLowerCase().includes(q)
      );
    });
  }, [linhas, search, filtroBu]);

  const exportar = () => {
    if (filtradas.length === 0) {
      toast({ title: "Nada para exportar" });
      return;
    }
    const rows = filtradas.map((l) => {
      const r: Record<string, any> = {
        BU: l.bu,
        FAM: l.familia,
        PROD: l.seqProd,
        DESCRICAO: l.descricao,
        CMP: l.cmp,
      };
      FILIAIS.forEach((f) => (r[f.label] = l.precos[f.code] ?? 0));
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Livros");
    XLSX.writeFile(wb, `Livros_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Livros"
        description="Visão consolidada dos livros por filial"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportar}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
            <button
              onClick={fetch}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por código, descrição ou família..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background"
          />
        </div>
        <select
          value={filtroBu}
          onChange={(e) => setFiltroBu(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        >
          <option value="todas">Todas as BUs</option>
          {busDisponiveis.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtradas.length.toLocaleString("pt-BR")} produto(s)
        </span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <Th>BU</Th>
                <Th>FAM</Th>
                <Th>PROD</Th>
                <Th>DESCRICAO</Th>
                <Th right>CMP</Th>
                {FILIAIS.map((f) => (
                  <Th key={f.code} right>{f.label}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5 + FILIAIS.length} className="text-center py-10 text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={5 + FILIAIS.length} className="text-center py-10 text-muted-foreground">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                filtradas.map((l) => (
                  <tr key={l.seqProd} className="border-t border-border hover:bg-muted/30">
                    <Td>
                      {l.bu ? (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            background: l.bu === "HC" ? "#ede9fe" : l.bu === "FR" ? "#dcfce7" : "#f1f5f9",
                            color: l.bu === "HC" ? "#6d28d9" : l.bu === "FR" ? "#16a34a" : "#475569",
                          }}
                        >
                          {l.bu}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </Td>
                    <Td>{l.familia}</Td>
                    <Td className="font-mono">{l.seqProd}</Td>
                    <Td className="max-w-[280px] truncate" title={l.descricao}>{l.descricao}</Td>
                    <Td right>{fmt(l.cmp)}</Td>
                    {FILIAIS.map((f) => (
                      <Td key={f.code} right>{fmt(l.precos[f.code] ?? 0)}</Td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] uppercase tracking-wider font-semibold border-b border-border ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className = "",
  title,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${className}`} title={title}>
      {children}
    </td>
  );
}

export default Livros;

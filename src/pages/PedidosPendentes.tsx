import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Package } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";

interface Product {
  seqProd?: string;
  descricao?: string;
  pendCmp?: number | string;
  bu?: string;
}

interface FilialData {
  [filial: string]: Product[];
}

interface LivroMetricRow {
  estoque?: number;
  ddv?: number;
  pendCmp?: number | string;
}
interface LivroMetricsData {
  [filial: string]: Record<string, LivroMetricRow>;
}

const FILIAL_COLS: { id: string; label: string }[] = [
  { id: "501", label: "focomix sp" },
  { id: "502", label: "focomix mg" },
  { id: "11", label: "campinas 11" },
  { id: "12", label: "osasco 12" },
  { id: "01", label: "poços caldas" },
  { id: "14", label: "betim 14" },
];

interface Row {
  bu: string;
  codigo: string;
  descricao: string;
  pend: Record<string, number>;
  total: number;
}

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const PedidosPendentes = () => {
  const [data, setData] = useState<FilialData>({});
  const [metrics, setMetrics] = useState<LivroMetricsData>({});
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<"ALL" | "HC" | "FR">("ALL");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setData(parsed);
      }
    } catch {
      setData({});
    }
    try {
      const m = localStorage.getItem("vilasales_livro_metrics");
      if (m) {
        const parsed = JSON.parse(m);
        if (parsed && typeof parsed === "object") setMetrics(parsed);
      }
    } catch {
      setMetrics({});
    }
  }, []);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();

    // Usa como base apenas os produtos cruzados pela Análise de Custos, que já
    // vêm filtrados pela planilha de produtos enviada no upload.
    for (const fid of FILIAL_COLS.map((f) => f.id)) {
      const list = Array.isArray(data?.[fid]) ? data[fid] : [];
      for (const p of list) {
        const codigo = String(p?.seqProd ?? "").trim();
        if (!codigo) continue;
        const row = map.get(codigo) ?? {
          bu: "",
          codigo,
          descricao: "",
          pend: {},
          total: 0,
        };

        row.bu ||= String(p?.bu ?? "").trim().toUpperCase();
        row.descricao ||= String(p?.descricao ?? "").trim();
        row.pend[fid] = toNum(metrics?.[fid]?.[codigo]?.pendCmp ?? p?.pendCmp);
        map.set(codigo, row);
      }
    }

    // Calcula total e mantém só os produtos da base que têm alguma pendência > 0
    const out: Row[] = [];
    for (const r of map.values()) {
      const total = FILIAL_COLS.reduce((s, f) => s + (r.pend[f.id] || 0), 0);
      if (total <= 0) continue;
      r.total = total;
      out.push(r);
    }
    return out.sort((a, b) => b.total - a.total);
  }, [data, metrics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (buFilter !== "ALL" && r.bu.toUpperCase() !== buFilter) return false;
      if (!q) return true;
      return (
        r.codigo.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q) ||
        r.bu.toLowerCase().includes(q)
      );
    });
  }, [rows, search, buFilter]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    FILIAL_COLS.forEach((f) => (t[f.id] = 0));
    filtered.forEach((r) => {
      FILIAL_COLS.forEach((f) => {
        t[f.id] += r.pend[f.id] || 0;
      });
    });
    return t;
  }, [filtered]);

  const fmt = (n: number) =>
    n ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "";

  const hasAnyData =
    Object.keys(data || {}).length > 0 || Object.keys(metrics || {}).length > 0;

  return (
    <div>
      <PageHeader
        title="Pedidos Pendentes"
        description="Pendência de compra (PEND.CMP) por produto e filial"
      />

      {!hasAnyData ? (
        <div className="bg-card rounded-xl p-10 text-center shadow-[var(--shadow-card)]">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado encontrado. Faça o upload dos livros na tela de Análise
            Manual primeiro.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center shadow-[var(--shadow-card)]">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Os livros foram carregados, mas nenhum produto possui pendência de
            compra (PEND.CMP) maior que zero.
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-[var(--shadow-card)]">
            <Search className="w-4 h-4 text-muted-foreground ml-2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, descrição ou BU..."
              className="border-0 focus-visible:ring-0 shadow-none"
            />
            <span className="text-xs text-muted-foreground pr-2 whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? "item" : "itens"}
            </span>
          </div>

          <div className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="max-h-[calc(100vh-240px)] overflow-auto">
              <table className="w-full min-w-[1180px] table-fixed text-sm">
                <colgroup>
                  <col className="w-20" />
                  <col className="w-32" />
                  <col className="w-[520px]" />
                  {FILIAL_COLS.map((f) => (
                    <col key={f.id} className="w-36" />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      BU
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Código
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Descrição
                    </th>
                    {FILIAL_COLS.map((f) => (
                      <th
                        key={f.id}
                        className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                      >
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.codigo} className="h-12 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-semibold text-card-foreground whitespace-nowrap">
                        {r.bu || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-card-foreground whitespace-nowrap">
                        {r.codigo}
                      </td>
                      <td className="px-3 py-2 text-card-foreground align-middle">
                        <div className="line-clamp-2 leading-snug break-words" title={r.descricao}>
                          {r.descricao || "—"}
                        </div>
                      </td>
                      {FILIAL_COLS.map((f) => (
                        <td
                          key={f.id}
                          className="px-3 py-2 text-right tabular-nums text-card-foreground whitespace-nowrap"
                        >
                          {fmt(r.pend[f.id] || 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-muted/90 font-semibold backdrop-blur">
                  <tr>
                    <td className="px-3 py-2 text-card-foreground" colSpan={3}>
                      Total
                    </td>
                    {FILIAL_COLS.map((f) => (
                      <td
                        key={f.id}
                        className="px-3 py-2 text-right tabular-nums text-card-foreground whitespace-nowrap"
                      >
                        {fmt(totals[f.id])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default PedidosPendentes;

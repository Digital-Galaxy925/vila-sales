import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Package } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";

interface Product {
  seqProd: string;
  descricao: string;
  pendCmp: number;
  bu: string;
}

interface FilialData {
  [filial: string]: Product[];
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
}

const PedidosPendentes = () => {
  const [data, setData] = useState<FilialData>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vilasales_data");
      if (raw) setData(JSON.parse(raw) || {});
    } catch (_) {}
  }, []);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const fid of FILIAL_COLS.map((f) => f.id)) {
      const list = Array.isArray(data?.[fid]) ? data[fid] : [];
      for (const p of list) {
        const codigo = String(p?.seqProd ?? "").trim();
        if (!codigo) continue;
        const pend = Number(p?.pendCmp) || 0;
        if (pend === 0) continue;
        let row = map.get(codigo);
        if (!row) {
          row = {
            bu: String(p?.bu ?? "").trim(),
            codigo,
            descricao: String(p?.descricao ?? "").trim(),
            pend: {},
          };
          map.set(codigo, row);
        }
        row.pend[fid] = pend;
        if (!row.descricao && p?.descricao) row.descricao = String(p.descricao);
        if (!row.bu && p?.bu) row.bu = String(p.bu);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.descricao.localeCompare(b.descricao, "pt-BR")
    );
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.codigo.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q) ||
        r.bu.toLowerCase().includes(q)
    );
  }, [rows, search]);

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

  return (
    <div>
      <PageHeader
        title="Pedidos Pendentes"
        description="Pendência de compra (PEND.CMP) por produto e filial"
      />

      {rows.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center shadow-[var(--shadow-card)]">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado de pedidos pendentes encontrado. Faça o upload dos livros na
            tela de Análise Manual.
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
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
                    <tr key={r.codigo} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-card-foreground">{r.bu}</td>
                      <td className="px-3 py-2 font-mono text-xs text-card-foreground">
                        {r.codigo}
                      </td>
                      <td className="px-3 py-2 text-card-foreground">
                        {r.descricao}
                      </td>
                      {FILIAL_COLS.map((f) => (
                        <td
                          key={f.id}
                          className="px-3 py-2 text-right tabular-nums text-card-foreground"
                        >
                          {fmt(r.pend[f.id] || 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-semibold">
                  <tr>
                    <td className="px-3 py-2 text-card-foreground" colSpan={3}>
                      Total
                    </td>
                    {FILIAL_COLS.map((f) => (
                      <td
                        key={f.id}
                        className="px-3 py-2 text-right tabular-nums text-card-foreground"
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

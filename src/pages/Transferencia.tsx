import { useMemo, useState } from "react";
import { ArrowLeftRight, Search, Package, TrendingDown, TrendingUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const filialNames: Record<string, string> = {
  "01": "Filial 01 - Poços",
  "11": "Filial 11 - Campinas",
  "12": "Filial 12 - Osasco",
  "14": "Filial 14 - Betim",
  "501": "Filial 501 - Focomix SP",
  "502": "Filial 502 - Focomix MG",
};

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

interface ProdRow {
  filial: string;
  filialNome: string;
  bu: string;
  seqProd: string;
  descricao: string;
  estoque: number;
  ddv: number;
  pendCmp: number;
}

const ddvColor = (v: number) => {
  if (v <= 0) return "text-destructive";
  if (v < 15) return "text-warning";
  if (v > 90) return "text-destructive";
  return "text-foreground";
};

const ddvBadge = (v: number) => {
  if (v > 90) return "Excesso";
  if (v > 0 && v < 15) return "Ruptura";
  if (v <= 0) return "Sem est.";
  return "OK";
};

const Transferencia = () => {
  const [origem, setOrigem] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<"all" | "HC" | "FR">("all");

  const { rowsByFilial, filiaisDisponiveis } = useMemo(() => {
    const map: Record<string, ProdRow[]> = {};
    try {
      const raw = JSON.parse(localStorage.getItem("vilasales_data") || "{}");
      if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([filialKey, arr]: [string, any]) => {
          if (!Array.isArray(arr)) return;
          const list: ProdRow[] = arr.map((p: any) => ({
            filial: p.filial || filialKey,
            filialNome:
              filialNames[p.filial || filialKey] || p.filial || filialKey,
            bu: (p.bu || "").toUpperCase(),
            seqProd: String(p.seqProd ?? p.codigo ?? "").trim(),
            descricao: p.descricao || "",
            estoque: num(p.estoque),
            ddv: num(p.ddv),
            pendCmp: num(p.pendCmp ?? p.pendcmp ?? p.pend_cmp ?? p.pendencia ?? 0),
          }));
          map[filialKey] = list;
        });
      }
    } catch {
      // ignore
    }
    return {
      rowsByFilial: map,
      filiaisDisponiveis: Object.keys(map).sort(),
    };
  }, []);

  // Auto-pick first two CDs as default suggestion
  const effectiveOrigem = origem || filiaisDisponiveis[0] || "";
  const effectiveDestino =
    destino || filiaisDisponiveis.find((f) => f !== effectiveOrigem) || "";

  const applyFilter = (rows: ProdRow[]) => {
    let list = rows;
    if (buFilter !== "all") list = list.filter((p) => p.bu === buFilter);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.seqProd.toLowerCase().includes(term) ||
          p.descricao.toLowerCase().includes(term)
      );
    }
    return list;
  };

  const origemRows = useMemo(
    () => applyFilter(rowsByFilial[effectiveOrigem] || []),
    [rowsByFilial, effectiveOrigem, search, buFilter]
  );
  const destinoRows = useMemo(
    () => applyFilter(rowsByFilial[effectiveDestino] || []),
    [rowsByFilial, effectiveDestino, search, buFilter]
  );

  // Index destino by SKU for cross-reference
  const destinoIndex = useMemo(() => {
    const idx = new Map<string, ProdRow>();
    destinoRows.forEach((p) => idx.set(p.seqProd, p));
    return idx;
  }, [destinoRows]);

  const sugestoes = useMemo(() => {
    // origem com excesso (DDV>90) e destino com ruptura/baixo (DDV<15)
    return origemRows.filter((p) => {
      if (p.ddv <= 90) return false;
      const d = destinoIndex.get(p.seqProd);
      if (!d) return false;
      return d.ddv >= 0 && d.ddv < 15;
    }).length;
  }, [origemRows, destinoIndex]);

  const totalProdutosOrigem = origemRows.length;
  const estoqueOrigem = origemRows.reduce((s, p) => s + p.estoque, 0);
  const estoqueDestino = destinoRows.reduce((s, p) => s + p.estoque, 0);

  const renderTable = (
    title: string,
    rows: ProdRow[],
    counterpart: Map<string, ProdRow>,
    tone: "origem" | "destino"
  ) => (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
      <div
        className={`px-4 py-3 border-b border-border flex items-center justify-between ${
          tone === "origem" ? "bg-primary/5" : "bg-success/5"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              tone === "origem" ? "bg-primary" : "bg-success"
            }`}
          />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} produtos
        </span>
      </div>
      <div className="overflow-auto max-h-[560px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="text-xs">BU</TableHead>
              <TableHead className="text-xs">Código</TableHead>
              <TableHead className="text-xs">Descrição</TableHead>
              <TableHead className="text-xs text-right">Estoque</TableHead>
              <TableHead className="text-xs text-center">DDV</TableHead>
              <TableHead className="text-xs text-right">Pend.Cmp</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8 text-sm"
                >
                  Nenhum produto neste CD com os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => {
                const cp = counterpart.get(p.seqProd);
                const isSugestao =
                  tone === "origem"
                    ? p.ddv > 90 && cp && cp.ddv > 0 && cp.ddv < 15
                    : false;
                return (
                  <TableRow
                    key={`${p.filial}-${p.seqProd}`}
                    className={isSugestao ? "bg-warning/10" : ""}
                  >
                    <TableCell className="text-xs font-medium">
                      {p.bu || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {p.seqProd}
                    </TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate">
                      {p.descricao}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {p.estoque.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell
                      className={`text-xs text-center font-semibold ${ddvColor(
                        p.ddv
                      )}`}
                    >
                      {p.ddv}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {p.pendCmp ? p.pendCmp.toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          ddvBadge(p.ddv) === "Excesso"
                            ? "bg-destructive/10 text-destructive"
                            : ddvBadge(p.ddv) === "Ruptura"
                            ? "bg-warning/10 text-warning"
                            : ddvBadge(p.ddv) === "Sem est."
                            ? "bg-muted text-muted-foreground"
                            : "bg-success/10 text-success"
                        }`}
                      >
                        {ddvBadge(p.ddv)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  // Index origem by SKU for destination cross-reference
  const origemIndex = useMemo(() => {
    const idx = new Map<string, ProdRow>();
    origemRows.forEach((p) => idx.set(p.seqProd, p));
    return idx;
  }, [origemRows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transferência entre CDs"
        description="Compare estoques entre Centros de Distribuição e identifique oportunidades de transferência"
      />

      {filiaisDisponiveis.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ArrowLeftRight className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">
            Nenhum dado de estoque carregado
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Faça o upload dos arquivos em "Upload de Dados" para visualizar a
            análise de transferência entre CDs.
          </p>
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="lg:col-span-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  CD Origem
                </label>
                <Select value={effectiveOrigem} onValueChange={setOrigem}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filiaisDisponiveis.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {filialNames[f] || f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="hidden lg:flex items-end justify-center pb-1">
                <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
              </div>

              <div className="lg:col-span-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  CD Destino
                </label>
                <Select value={effectiveDestino} onValueChange={setDestino}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filiaisDisponiveis.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {filialNames[f] || f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  BU
                </label>
                <Select
                  value={buFilter}
                  onValueChange={(v) => setBuFilter(v as any)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      Todas
                    </SelectItem>
                    <SelectItem value="HC" className="text-xs">
                      HC
                    </SelectItem>
                    <SelectItem value="FR" className="text-xs">
                      FR
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Buscar produto
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Código ou descrição"
                    className="h-9 text-xs pl-8"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="Produtos no CD Origem"
              value={totalProdutosOrigem.toLocaleString("pt-BR")}
              icon={Package}
              variant="primary"
            />
            <KpiCard
              title="Estoque Origem (cx)"
              value={estoqueOrigem.toLocaleString("pt-BR")}
              icon={TrendingUp}
              variant="info"
            />
            <KpiCard
              title="Estoque Destino (cx)"
              value={estoqueDestino.toLocaleString("pt-BR")}
              icon={TrendingDown}
              variant="success"
            />
            <KpiCard
              title="Sugestões de Transferência"
              value={sugestoes.toLocaleString("pt-BR")}
              icon={ArrowLeftRight}
              variant="warning"
            />
          </div>

          {/* Tabelas lado a lado */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {renderTable(
              `CD Origem — ${filialNames[effectiveOrigem] || effectiveOrigem}`,
              origemRows,
              destinoIndex,
              "origem"
            )}
            {renderTable(
              `CD Destino — ${filialNames[effectiveDestino] || effectiveDestino}`,
              destinoRows,
              origemIndex,
              "destino"
            )}
          </div>

          <p className="text-[11px] text-muted-foreground px-1">
            Linhas destacadas em <span className="text-warning font-medium">amarelo</span> no CD Origem
            indicam produtos com excesso de estoque (DDV &gt; 90) que existem no CD Destino com
            risco de ruptura (DDV &lt; 15) — candidatos naturais a transferência.
          </p>
        </>
      )}
    </div>
  );
};

export default Transferencia;

import { useMemo, useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  ArrowLeftRight,
  Search,
  Package,
  TrendingDown,
  TrendingUp,
  Upload,
  CheckCircle2,
  Layers,
  Boxes,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";

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

const normCod = (v: any): string =>
  String(v ?? "").trim().replace(/^0+/, "").toUpperCase();

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

interface PalletInfo {
  cxPorCamada: number;
  camadasPorPallet: number;
  cxPorPallet: number;
}

const PALLET_STORAGE_KEY = "vilasales_palletizacao";

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

// Tenta achar coluna por candidatos (case-insensitive, ignora acentos/espaços)
const normalizeKey = (s: string): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const pickField = (row: any, candidates: string[]): any => {
  const keys = Object.keys(row);
  const normMap: Record<string, string> = {};
  keys.forEach((k) => (normMap[normalizeKey(k)] = k));
  for (const c of candidates) {
    const nk = normalizeKey(c);
    if (normMap[nk] !== undefined) return row[normMap[nk]];
  }
  // partial match
  for (const c of candidates) {
    const nk = normalizeKey(c);
    const found = Object.keys(normMap).find((k) => k.includes(nk));
    if (found) return row[normMap[found]];
  }
  return undefined;
};

const Transferencia = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [origem, setOrigem] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<"all" | "HC" | "FR">("all");

  // Palletização: { codigoNormalizado: { cxPorCamada, camadasPorPallet, cxPorPallet } }
  const [palletMap, setPalletMap] = useState<Record<string, PalletInfo>>({});
  const [palletFileName, setPalletFileName] = useState<string>("");
  const [palletCount, setPalletCount] = useState<number>(0);

  // Quantidades digitadas pelo usuário por SKU
  // { sku: { cx: number, camada: number, pallet: number } }
  const [transferQty, setTransferQty] = useState<
    Record<string, { cx: number; camada: number; pallet: number }>
  >({});

  // Carrega palletização do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PALLET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setPalletMap(parsed.map || {});
          setPalletFileName(parsed.fileName || "");
          setPalletCount(Object.keys(parsed.map || {}).length);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handlePalletUpload = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const map: Record<string, PalletInfo> = {};
      rows.forEach((r) => {
        const cod = pickField(r, [
          "codigo",
          "cod",
          "sku",
          "seqprod",
          "produto",
          "item",
        ]);
        if (!cod) return;
        const cxPorCamada = num(
          pickField(r, [
            "cxporcamada",
            "caixasporcamada",
            "cxcamada",
            "cx/camada",
            "caixascamada",
          ])
        );
        const camadasPorPallet = num(
          pickField(r, [
            "camadasporpallet",
            "camadaspallet",
            "camadas/pallet",
            "camadas",
          ])
        );
        const cxPorPalletDireto = num(
          pickField(r, [
            "cxporpallet",
            "caixasporpallet",
            "cxpallet",
            "cx/pallet",
            "caixaspallet",
            "totalcaixas",
            "totalcx",
          ])
        );
        const cxPorPallet =
          cxPorPalletDireto || cxPorCamada * camadasPorPallet;
        if (!cxPorCamada && !camadasPorPallet && !cxPorPallet) return;
        map[normCod(cod)] = {
          cxPorCamada,
          camadasPorPallet,
          cxPorPallet,
        };
      });

      if (Object.keys(map).length === 0) {
        toast({
          title: "Nenhum dado válido encontrado",
          description:
            "Verifique se a planilha contém colunas como Código, Cx/Camada, Camadas/Pallet.",
          variant: "destructive",
        });
        return;
      }

      setPalletMap(map);
      setPalletFileName(file.name);
      setPalletCount(Object.keys(map).length);
      localStorage.setItem(
        PALLET_STORAGE_KEY,
        JSON.stringify({ map, fileName: file.name })
      );
      toast({
        title: "Palletização carregada",
        description: `${Object.keys(map).length} produtos importados de ${file.name}`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao processar planilha",
        description: "Confira o formato do arquivo e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePalletUpload(file);
    e.target.value = "";
  };

  const limparPalletizacao = () => {
    setPalletMap({});
    setPalletFileName("");
    setPalletCount(0);
    localStorage.removeItem(PALLET_STORAGE_KEY);
    toast({ title: "Palletização removida" });
  };

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

  const destinoIndex = useMemo(() => {
    const idx = new Map<string, ProdRow>();
    destinoRows.forEach((p) => idx.set(p.seqProd, p));
    return idx;
  }, [destinoRows]);

  const origemIndex = useMemo(() => {
    const idx = new Map<string, ProdRow>();
    origemRows.forEach((p) => idx.set(p.seqProd, p));
    return idx;
  }, [origemRows]);

  const sugestoes = useMemo(() => {
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

  // Helpers para lookup de palletização (tenta normalizado + bruto)
  const getPallet = (sku: string): PalletInfo | undefined => {
    return palletMap[normCod(sku)] || palletMap[sku];
  };

  const calcCaixasTransferencia = (sku: string): number => {
    const q = transferQty[sku];
    if (!q) return 0;
    const p = getPallet(sku);
    const cxPorCamada = p?.cxPorCamada || 0;
    const cxPorPallet = p?.cxPorPallet || 0;
    return (
      (q.cx || 0) +
      (q.camada || 0) * cxPorCamada +
      (q.pallet || 0) * cxPorPallet
    );
  };

  const updateQty = (
    sku: string,
    field: "cx" | "camada" | "pallet",
    value: string
  ) => {
    const n = parseInt(value, 10);
    setTransferQty((prev) => ({
      ...prev,
      [sku]: {
        cx: prev[sku]?.cx || 0,
        camada: prev[sku]?.camada || 0,
        pallet: prev[sku]?.pallet || 0,
        [field]: isNaN(n) ? 0 : n,
      },
    }));
  };

  const totalCxTransferencia = useMemo(
    () =>
      destinoRows.reduce(
        (s, p) => s + calcCaixasTransferencia(p.seqProd),
        0
      ),
    [destinoRows, transferQty, palletMap]
  );

  const renderOrigemTable = () => {
    const rows = origemRows;
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              CD Origem — {filialNames[effectiveOrigem] || effectiveOrigem}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {rows.length} produtos
          </span>
        </div>
        <div className="overflow-auto max-h-[620px]">
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                    Nenhum produto neste CD com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const cp = destinoIndex.get(p.seqProd);
                  const isSugestao = p.ddv > 90 && cp && cp.ddv > 0 && cp.ddv < 15;
                  return (
                    <TableRow
                      key={`${p.filial}-${p.seqProd}`}
                      className={isSugestao ? "bg-warning/10" : ""}
                    >
                      <TableCell className="text-xs font-medium">{p.bu || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{p.seqProd}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={p.descricao}>
                        {p.descricao}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {p.estoque.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className={`text-xs text-center font-semibold ${ddvColor(p.ddv)}`}>
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
  };

  const renderDestinoTable = () => {
    const rows = destinoRows;
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-success/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success" />
            <h3 className="text-sm font-semibold text-foreground">
              CD Destino — {filialNames[effectiveDestino] || effectiveDestino}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} produtos</span>
        </div>
        <div className="overflow-auto max-h-[620px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="text-xs">BU</TableHead>
                <TableHead className="text-xs">Código</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="text-xs text-right">Estoque</TableHead>
                <TableHead className="text-xs text-center">DDV</TableHead>
                <TableHead className="text-xs text-right">Pend.Cmp</TableHead>
                <TableHead className="text-xs text-center bg-primary/5">CD Origem</TableHead>
                <TableHead className="text-xs text-center bg-warning/10">CX</TableHead>
                <TableHead className="text-xs text-center bg-warning/10">Camada</TableHead>
                <TableHead className="text-xs text-center bg-warning/10">Pallet</TableHead>
                <TableHead className="text-xs text-right bg-success/10">Total CX</TableHead>
                <TableHead className="text-xs text-right bg-success/10">Est. Futuro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8 text-sm">
                    Nenhum produto neste CD com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const q = transferQty[p.seqProd] || { cx: 0, camada: 0, pallet: 0 };
                  const totalCx = calcCaixasTransferencia(p.seqProd);
                  const estoqueFuturo = p.estoque + totalCx;
                  const pal = getPallet(p.seqProd);
                  const semPallet = !pal && (q.camada > 0 || q.pallet > 0);

                  return (
                    <TableRow key={`${p.filial}-${p.seqProd}`}>
                      <TableCell className="text-xs font-medium">{p.bu || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{p.seqProd}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={p.descricao}>
                        {p.descricao}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {p.estoque.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className={`text-xs text-center font-semibold ${ddvColor(p.ddv)}`}>
                        {p.ddv}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {p.pendCmp ? p.pendCmp.toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-center p-1">
                        <Input
                          type="number"
                          min={0}
                          value={q.cx || ""}
                          onChange={(e) => updateQty(p.seqProd, "cx", e.target.value)}
                          className="h-7 w-16 text-xs text-center px-1"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="text-center p-1">
                        <Input
                          type="number"
                          min={0}
                          value={q.camada || ""}
                          onChange={(e) => updateQty(p.seqProd, "camada", e.target.value)}
                          className="h-7 w-16 text-xs text-center px-1"
                          placeholder="0"
                          title={pal ? `${pal.cxPorCamada} cx/camada` : "Sem palletização"}
                        />
                      </TableCell>
                      <TableCell className="text-center p-1">
                        <Input
                          type="number"
                          min={0}
                          value={q.pallet || ""}
                          onChange={(e) => updateQty(p.seqProd, "pallet", e.target.value)}
                          className="h-7 w-16 text-xs text-center px-1"
                          placeholder="0"
                          title={pal ? `${pal.cxPorPallet} cx/pallet` : "Sem palletização"}
                        />
                      </TableCell>
                      <TableCell className={`text-xs text-right font-semibold ${totalCx > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {totalCx > 0 ? totalCx.toLocaleString("pt-BR") : "—"}
                        {semPallet && (
                          <span className="text-[9px] text-destructive block">sem pallet.</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        <span className={totalCx > 0 ? "text-primary" : "text-foreground"}>
                          {estoqueFuturo.toLocaleString("pt-BR")}
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
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transferência entre CDs"
        description="Compare estoques entre Centros de Distribuição e identifique oportunidades de transferência"
      />

      {/* Barra de Palletização */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Palletização dos Produtos
            </p>
            {palletCount > 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                {palletCount.toLocaleString("pt-BR")} produtos carregados
                {palletFileName && (
                  <span className="text-muted-foreground/70">· {palletFileName}</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma planilha de palletização carregada — necessária para conversão de Camada/Pallet em caixas.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            {palletCount > 0 ? "Atualizar Palletização" : "Upload Palletização"}
          </Button>
          {palletCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={limparPalletizacao}
              className="text-xs text-muted-foreground"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

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
                <label className="text-xs text-muted-foreground mb-1 block">CD Origem</label>
                <Select value={effectiveOrigem} onValueChange={setOrigem}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
                <label className="text-xs text-muted-foreground mb-1 block">CD Destino</label>
                <Select value={effectiveDestino} onValueChange={setDestino}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
                <label className="text-xs text-muted-foreground mb-1 block">BU</label>
                <Select value={buFilter} onValueChange={(v) => setBuFilter(v as any)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Todas</SelectItem>
                    <SelectItem value="HC" className="text-xs">HC</SelectItem>
                    <SelectItem value="FR" className="text-xs">FR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Buscar produto</label>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard title="Produtos no CD Origem" value={totalProdutosOrigem.toLocaleString("pt-BR")} icon={Package} variant="primary" />
            <KpiCard title="Estoque Origem (cx)" value={estoqueOrigem.toLocaleString("pt-BR")} icon={TrendingUp} variant="info" />
            <KpiCard title="Estoque Destino (cx)" value={estoqueDestino.toLocaleString("pt-BR")} icon={TrendingDown} variant="success" />
            <KpiCard title="Sugestões de Transferência" value={sugestoes.toLocaleString("pt-BR")} icon={ArrowLeftRight} variant="warning" />
            <KpiCard title="Total a Transferir (cx)" value={totalCxTransferencia.toLocaleString("pt-BR")} icon={Boxes} variant="primary" />
          </div>

          {/* Tabelas lado a lado */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {renderOrigemTable()}
            {renderDestinoTable()}
          </div>

          <p className="text-[11px] text-muted-foreground px-1">
            Linhas destacadas em <span className="text-warning font-medium">amarelo</span> no CD Origem
            indicam produtos com excesso de estoque (DDV &gt; 90) que existem no CD Destino com
            risco de ruptura (DDV &lt; 15). Digite quantidades em <strong>CX</strong>, <strong>Camada</strong> ou <strong>Pallet</strong> —
            a coluna <strong>Total CX</strong> soma a conversão e <strong>Est. Futuro Destino</strong> projeta o estoque resultante.
          </p>
        </>
      )}
    </div>
  );
};

export default Transferencia;

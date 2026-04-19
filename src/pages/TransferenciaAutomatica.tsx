import { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Zap,
  Search,
  Package,
  Download,
  ArrowLeftRight,
  Sparkles,
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
  String(v ?? "").trim().replace(/\.0+$/, "").replace(/^0+/, "").toUpperCase();

interface ProdRow {
  filial: string;
  bu: string;
  seqProd: string;
  descricao: string;
  estoque: number;
  ddv: number;
  pendCmp: number;
}

interface PalletInfo {
  unPorCx: number;
  cxPorPallet: number;
  cxPorCamada: number;
}

interface LivroMetricRow {
  estoque: number;
  ddv: number;
  pendCmp: number;
}

const PALLET_STORAGE_KEY = "vilasales_palletizacao";
const LIVRO_METRICS_STORAGE_KEY = "vilasales_livro_metrics";

const ddvColor = (v: number) => {
  if (v <= 0) return "text-destructive";
  if (v < 15) return "text-warning";
  if (v > 90) return "text-destructive";
  return "text-foreground";
};

const TransferenciaAutomatica = () => {
  const { toast } = useToast();
  const [origem, setOrigem] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<"all" | "HC" | "FR">("all");

  // Parâmetros configuráveis
  const [ddvMinDestino, setDdvMinDestino] = useState<string>("15");
  const [ddvMaxOrigem, setDdvMaxOrigem] = useState<string>("0"); // 0 = sem mínimo de excesso na origem
  const [ddvSeguroOrigem, setDdvSeguroOrigem] = useState<string>("30"); // origem não pode ficar abaixo disso após transferir

  const [palletMap, setPalletMap] = useState<Record<string, PalletInfo>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PALLET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setPalletMap(parsed.map || {});
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const { rowsByFilial, filiaisDisponiveis } = useMemo(() => {
    const map: Record<string, ProdRow[]> = {};
    try {
      const raw = JSON.parse(localStorage.getItem("vilasales_data") || "{}");
      if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([filialKey, arr]: [string, any]) => {
          if (!Array.isArray(arr)) return;
          const list: ProdRow[] = arr.map((p: any) => ({
            filial: p.filial || filialKey,
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

  // Constrói índice de métricas (estoque, ddv, pendCmp) lendo PRIMEIRO do livro
  // específico da filial (vilasales_livro_metrics[filial]) e caindo para o
  // dataset geral apenas quando o SKU não existe no livro. Assim Est. Origem
  // e DDV Origem sempre vêm da coluna correta do livro_<filial>.
  const buildMetricIndex = (filial: string) => {
    const idx = new Map<string, LivroMetricRow>();
    if (!filial) return idx;

    // 1) Dataset geral por filial como fallback inicial
    (rowsByFilial[filial] || []).forEach((p) => {
      idx.set(normCod(p.seqProd), {
        estoque: num(p.estoque),
        ddv: num(p.ddv),
        pendCmp: num(p.pendCmp),
      });
    });

    // 2) Livro da filial sobrescreve com os valores oficiais (Estoque / DDV)
    try {
      const raw = JSON.parse(
        localStorage.getItem(LIVRO_METRICS_STORAGE_KEY) || "{}"
      );
      const filialMetrics = raw?.[filial] || {};
      Object.entries(filialMetrics).forEach(([sku, values]: [string, any]) => {
        idx.set(normCod(sku), {
          estoque: num(values?.estoque),
          ddv: num(values?.ddv),
          pendCmp: num(values?.pendCmp),
        });
      });
    } catch {
      // ignore
    }

    return idx;
  };

  const origemMetricasIndex = useMemo(
    () => buildMetricIndex(effectiveOrigem),
    [effectiveOrigem, rowsByFilial]
  );

  const destinoMetricasIndex = useMemo(
    () => buildMetricIndex(effectiveDestino),
    [effectiveDestino, rowsByFilial]
  );

  const getPallet = (sku: string): PalletInfo | undefined =>
    palletMap[normCod(sku)] || palletMap[sku];

  // Cálculo automático
  const sugestoes = useMemo(() => {
    const minDest = parseFloat(ddvMinDestino.replace(",", ".")) || 15;
    const maxOrig = parseFloat(ddvMaxOrigem.replace(",", ".")) || 0;
    const seguroOrig = parseFloat(ddvSeguroOrigem.replace(",", ".")) || 30;

    const destinoList = rowsByFilial[effectiveDestino] || [];
    const result: Array<{
      sku: string;
      bu: string;
      descricao: string;
      // origem
      estOrig: number;
      ddvOrig: number;
      pendOrig: number;
      // destino
      estDest: number;
      ddvDest: number;
      pendDest: number;
      // sugestão
      ddvDiarioDest: number;
      cxNecessarias: number;
      cxDisponiveisOrig: number;
      cxSugeridas: number;
      pallets: number;
      camadas: number;
      cxAvulsas: number;
      ddvDestinoFuturo: number;
      ddvOrigemFuturo: number;
    }> = [];

    destinoList.forEach((d) => {
      const key = normCod(d.seqProd);

      // Métricas oficiais lidas do livro da filial correspondente
      const oMetric = origemMetricasIndex.get(key);
      const dMetric = destinoMetricasIndex.get(key) || {
        estoque: d.estoque,
        ddv: d.ddv,
        pendCmp: d.pendCmp,
      };
      if (!oMetric) return;

      const o = {
        estoque: oMetric.estoque,
        ddv: oMetric.ddv,
        pendCmp: oMetric.pendCmp,
      };
      const dEstoque = dMetric.estoque;
      const dDdv = dMetric.ddv;
      const dPend = dMetric.pendCmp;

      // Filtros base
      if (buFilter !== "all" && d.bu !== buFilter) return;
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        if (
          !d.seqProd.toLowerCase().includes(term) &&
          !d.descricao.toLowerCase().includes(term)
        )
          return;
      }

      // Destino precisa estar abaixo do DDV mínimo (ruptura)
      if (dDdv >= minDest) return;

      // Origem deve ter folga (DDV acima do limite seguro)
      if (o.ddv <= seguroOrig) return;
      if (maxOrig > 0 && o.ddv < maxOrig) return;

      // Consumo diário do destino (cx/dia) — deriva do estoque atual e DDV
      let consumoDiarioDest = 0;
      if (dDdv > 0 && dEstoque > 0) {
        consumoDiarioDest = dEstoque / dDdv;
      } else if (o.ddv > 0 && o.estoque > 0) {
        // fallback: assume mesmo giro proporcional da origem
        consumoDiarioDest = o.estoque / o.ddv / 2;
      }

      if (consumoDiarioDest <= 0) return;

      // Quantidade necessária para destino atingir o DDV mínimo
      const estoqueAlvoDest = consumoDiarioDest * minDest;
      const cxNecessarias = Math.max(0, Math.ceil(estoqueAlvoDest - d.estoque));

      // Quantidade que origem pode liberar mantendo o DDV de segurança
      const consumoDiarioOrig = o.ddv > 0 ? o.estoque / o.ddv : 0;
      const estoqueMinOrig = consumoDiarioOrig * seguroOrig;
      const cxDisponiveisOrig = Math.max(0, Math.floor(o.estoque - estoqueMinOrig));

      let cxSugeridas = Math.min(cxNecessarias, cxDisponiveisOrig);
      if (cxSugeridas <= 0) return;

      // Arredonda para múltiplos de pallet (preferencial) ou camada.
      // Regra: nunca exceder cxDisponiveisOrig. Pode ficar abaixo do necessário,
      // mas sempre em múltiplo exato de pallet ou camada.
      const pal = getPallet(d.seqProd);
      let pallets = 0;
      let camadas = 0;
      let cxAvulsas = 0;

      const cxPallet = pal?.cxPorPallet && pal.cxPorPallet > 0 ? pal.cxPorPallet : 0;
      const cxCamada = pal?.cxPorCamada && pal.cxPorCamada > 0 ? pal.cxPorCamada : 0;

      if (cxPallet > 0 || cxCamada > 0) {
        // Tenta encaixar o máximo em pallets cheios sem ultrapassar disponível
        if (cxPallet > 0) {
          pallets = Math.floor(cxSugeridas / cxPallet);
          // Se arredondar para cima ainda cabe na disponibilidade da origem
          // e fica mais próximo do necessário, prioriza arredondar para cima.
          const upPallets = pallets + 1;
          const upTotal = upPallets * cxPallet;
          const downTotal = pallets * cxPallet;
          const distDown = cxSugeridas - downTotal;
          const distUp = upTotal - cxSugeridas;
          if (
            upTotal <= cxDisponiveisOrig &&
            distUp <= distDown
          ) {
            pallets = upPallets;
          }
        }

        const restoAposPallets = cxSugeridas - pallets * cxPallet;

        if (cxCamada > 0 && restoAposPallets > 0) {
          // Arredonda o resto para múltiplo de camada (mais próximo, sem ultrapassar disp.)
          camadas = Math.round(restoAposPallets / cxCamada);
          // Garante não ultrapassar disponibilidade total
          while (
            pallets * cxPallet + camadas * cxCamada > cxDisponiveisOrig &&
            camadas > 0
          ) {
            camadas -= 1;
          }
        }

        cxSugeridas = pallets * cxPallet + camadas * cxCamada;

        // Se zerou (necessidade muito pequena), sugere ao menos 1 camada se couber
        if (cxSugeridas === 0 && cxCamada > 0 && cxCamada <= cxDisponiveisOrig) {
          camadas = 1;
          cxSugeridas = cxCamada;
        } else if (cxSugeridas === 0 && cxPallet > 0 && cxPallet <= cxDisponiveisOrig) {
          pallets = 1;
          cxSugeridas = cxPallet;
        }
      } else {
        // Sem dados de palletização cadastrados: mantém comportamento atual
        cxAvulsas = cxSugeridas;
      }

      if (cxSugeridas <= 0) return;

      const ddvDestinoFuturo = consumoDiarioDest > 0
        ? Math.round((d.estoque + cxSugeridas) / consumoDiarioDest)
        : 0;
      const ddvOrigemFuturo = consumoDiarioOrig > 0
        ? Math.round((o.estoque - cxSugeridas) / consumoDiarioOrig)
        : 0;

      result.push({
        sku: d.seqProd,
        bu: d.bu,
        descricao: d.descricao,
        estOrig: o.estoque,
        ddvOrig: o.ddv,
        pendOrig: o.pendCmp,
        estDest: d.estoque,
        ddvDest: d.ddv,
        pendDest: d.pendCmp,
        ddvDiarioDest: Math.round(consumoDiarioDest * 10) / 10,
        cxNecessarias,
        cxDisponiveisOrig,
        cxSugeridas,
        pallets,
        camadas,
        cxAvulsas,
        ddvDestinoFuturo,
        ddvOrigemFuturo,
      });
    });

    // Ordena por maior necessidade (cx sugeridas desc)
    result.sort((a, b) => b.cxSugeridas - a.cxSugeridas);
    return result;
  }, [
    rowsByFilial,
    effectiveDestino,
    origemIndex,
    ddvMinDestino,
    ddvMaxOrigem,
    ddvSeguroOrigem,
    buFilter,
    search,
    palletMap,
  ]);

  const totalCxSugeridas = sugestoes.reduce((s, r) => s + r.cxSugeridas, 0);
  const totalProdutos = sugestoes.length;
  const totalPallets = sugestoes.reduce((s, r) => s + r.pallets, 0);

  const exportarExcel = () => {
    if (sugestoes.length === 0) {
      toast({
        title: "Nada para exportar",
        description: "Ajuste os parâmetros para gerar sugestões.",
        variant: "destructive",
      });
      return;
    }

    const data = sugestoes.map((r) => ({
      BU: r.bu,
      Código: r.sku,
      Descrição: r.descricao,
      "CD Origem": filialNames[effectiveOrigem] || effectiveOrigem,
      "CD Destino": filialNames[effectiveDestino] || effectiveDestino,
      "Estoque Origem": r.estOrig,
      "DDV Origem": r.ddvOrig,
      "Pend. Origem": r.pendOrig,
      "Estoque Destino": r.estDest,
      "DDV Destino": r.ddvDest,
      "Pend. Destino": r.pendDest,
      "Consumo Diário Dest. (cx)": r.ddvDiarioDest,
      "CX Necessárias": r.cxNecessarias,
      "CX Disp. Origem": r.cxDisponiveisOrig,
      "CX Sugeridas": r.cxSugeridas,
      Pallets: r.pallets,
      Camadas: r.camadas,
      "CX Avulsas": r.cxAvulsas,
      "DDV Destino Futuro": r.ddvDestinoFuturo,
      "DDV Origem Futuro": r.ddvOrigemFuturo,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 40 }, { wch: 22 }, { wch: 22 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 18 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TransferenciaAutomatica");
    const fileName = `transferencia_automatica_${effectiveOrigem}_para_${effectiveDestino}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({
      title: "Excel exportado",
      description: `${data.length} sugestões em ${fileName}`,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transferência Automática"
        description="Sugestões automáticas para suprir rupturas no destino com base no DDV"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportarExcel}
            className="text-xs"
            disabled={sugestoes.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar Excel
          </Button>
        }
      />

      {filiaisDisponiveis.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">
            Nenhum dado de estoque carregado
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Faça o upload dos arquivos em "Upload de Dados" para gerar sugestões
            automáticas de transferência.
          </p>
        </div>
      ) : (
        <>
          {/* Filtros principais */}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
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

              <div>
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
                <label className="text-xs text-muted-foreground mb-1 block">BU</label>
                <Select value={buFilter} onValueChange={(v) => setBuFilter(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Todas</SelectItem>
                    <SelectItem value="HC" className="text-xs">HC</SelectItem>
                    <SelectItem value="FR" className="text-xs">FR</SelectItem>
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

          {/* Parâmetros de cálculo */}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Parâmetros do cálculo automático
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  DDV mínimo desejado no Destino (dias)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={ddvMinDestino}
                  onChange={(e) => setDdvMinDestino(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="15"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Apenas produtos com DDV destino abaixo deste valor recebem sugestão.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  DDV mínimo na Origem para liberar excesso (dias)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={ddvMaxOrigem}
                  onChange={(e) => setDdvMaxOrigem(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Origem deve ter ao menos este DDV para ser elegível (0 = sem filtro).
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  DDV de segurança na Origem (dias)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={ddvSeguroOrigem}
                  onChange={(e) => setDdvSeguroOrigem(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="30"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Origem nunca ficará abaixo deste DDV após a transferência.
                </p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard
              title="Produtos sugeridos"
              value={totalProdutos.toLocaleString("pt-BR")}
              icon={Package}
              variant="primary"
            />
            <KpiCard
              title="Total CXs sugeridas"
              value={totalCxSugeridas.toLocaleString("pt-BR")}
              icon={ArrowLeftRight}
              variant="success"
            />
            <KpiCard
              title="Total Pallets"
              value={totalPallets.toLocaleString("pt-BR")}
              icon={Zap}
              variant="info"
            />
          </div>

          {/* Tabela de sugestões */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Sugestões automáticas — {filialNames[effectiveOrigem] || effectiveOrigem}
                  {" → "}
                  {filialNames[effectiveDestino] || effectiveDestino}
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {sugestoes.length} {sugestoes.length === 1 ? "sugestão" : "sugestões"}
              </span>
            </div>
            <div className="overflow-auto max-h-[640px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-xs">BU</TableHead>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs text-right bg-primary/5">Est. Origem</TableHead>
                    <TableHead className="text-xs text-center bg-primary/5">DDV Origem</TableHead>
                    <TableHead className="text-xs text-right">Est. Destino</TableHead>
                    <TableHead className="text-xs text-center">DDV Destino</TableHead>
                    <TableHead className="text-xs text-right">CX Necessárias</TableHead>
                    <TableHead className="text-xs text-right">CX Disp. Origem</TableHead>
                    <TableHead className="text-xs text-right bg-success/10">CX Sugeridas</TableHead>
                    <TableHead className="text-xs text-center bg-success/10">Pallets</TableHead>
                    <TableHead className="text-xs text-center bg-success/10">Camadas</TableHead>
                    <TableHead className="text-xs text-center bg-success/10">CX Avulsas</TableHead>
                    <TableHead className="text-xs text-center">DDV Dest. Futuro</TableHead>
                    <TableHead className="text-xs text-center">DDV Orig. Futuro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sugestoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground py-8 text-sm">
                        Nenhuma sugestão encontrada com os parâmetros atuais.
                        <br />
                        <span className="text-xs">
                          Tente aumentar o DDV mínimo do destino ou reduzir o DDV de segurança da origem.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sugestoes.map((r) => (
                      <TableRow key={r.sku}>
                        <TableCell className="text-xs font-medium">{r.bu || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{r.sku}</TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate" title={r.descricao}>
                          {r.descricao}
                        </TableCell>
                        <TableCell className="text-xs text-right bg-primary/5 font-semibold text-primary">
                          {r.estOrig.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className={`text-xs text-center bg-primary/5 font-semibold ${ddvColor(r.ddvOrig)}`}>
                          {r.ddvOrig}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {r.estDest.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className={`text-xs text-center font-semibold ${ddvColor(r.ddvDest)}`}>
                          {r.ddvDest}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {r.cxNecessarias.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {r.cxDisponiveisOrig.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-right bg-success/10 font-bold text-success">
                          {r.cxSugeridas.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-center bg-success/10 font-semibold">
                          {r.pallets || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-center bg-success/10">
                          {r.camadas || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-center bg-success/10">
                          {r.cxAvulsas || "—"}
                        </TableCell>
                        <TableCell className={`text-xs text-center font-semibold ${ddvColor(r.ddvDestinoFuturo)}`}>
                          {r.ddvDestinoFuturo}
                        </TableCell>
                        <TableCell className={`text-xs text-center ${ddvColor(r.ddvOrigemFuturo)}`}>
                          {r.ddvOrigemFuturo}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TransferenciaAutomatica;

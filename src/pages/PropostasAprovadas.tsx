import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";

interface PropostaRow {
  id: string;
  nome_gerente: string;
  data_analise: string;
  bu: string;
  observacao: string | null;
  margem_ponderada: number | null;
  margem_total_rs: number | null;
  volume_total_vendas: number | null;
  maior_pedido: string | null;
  produtos: any[];
  pedidos: any[];
  pdf_path: string | null;
  created_at: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) => (v * 100).toFixed(2) + "%";

export default function PropostasAprovadas() {
  const [propostas, setPropostas] = useState<PropostaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroBU, setFiltroBU] = useState("");

  const fetchPropostas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("propostas_aprovadas")
      .select("*")
      .order("data_analise", { ascending: false });

    if (filtroDataInicio) {
      query = query.gte("data_analise", filtroDataInicio);
    }
    if (filtroDataFim) {
      query = query.lte("data_analise", filtroDataFim);
    }
    if (filtroBU.trim()) {
      query = query.ilike("bu", `%${filtroBU.trim()}%`);
    }

    const { data, error } = await query;
    if (!error) {
      setPropostas((data || []).map((r: any) => ({
        ...r,
        produtos: Array.isArray(r.produtos) ? r.produtos : [],
        pedidos: Array.isArray(r.pedidos) ? r.pedidos : [],
      })));
    }
    setLoading(false);
  }, [filtroDataInicio, filtroDataFim, filtroBU]);

  useEffect(() => {
    fetchPropostas();
  }, [fetchPropostas]);

  const downloadPDF = async (pdfPath: string, nomeGerente: string) => {
    const { data } = supabase.storage.from("propostas-pdfs").getPublicUrl(pdfPath);
    if (data?.publicUrl) {
      window.open(data.publicUrl, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Propostas Aprovadas" description="Visualize todas as propostas aprovadas e baixe os PDFs." />

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Início</label>
            <Input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Fim</label>
            <Input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">BU</label>
            <Input
              placeholder="Ex: SORVETES"
              value={filtroBU}
              onChange={(e) => setFiltroBU(e.target.value.toUpperCase())}
            />
          </div>
          <Button onClick={fetchPropostas} className="gap-2">
            <Search className="w-4 h-4" /> Filtrar
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Data", "Gerente", "BU", "Margem Ponderada", "Margem R$", "Volume Vendas", "Maior Pedido", "Observação", "PDF"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : propostas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma proposta aprovada encontrada.
                  </td>
                </tr>
              ) : (
                propostas.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {p.data_analise ? new Date(p.data_analise + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3">{p.nome_gerente}</td>
                    <td className="px-4 py-3">
                      <span className="bg-primary/15 text-primary text-xs font-semibold px-2 py-1 rounded">
                        {p.bu || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: (p.margem_ponderada ?? 0) >= 0.15 ? "#34d399" : "#f87171" }}>
                      {p.margem_ponderada != null ? fmtPct(p.margem_ponderada) : "-"}
                    </td>
                    <td className="px-4 py-3">{p.margem_total_rs != null ? fmt(p.margem_total_rs) : "-"}</td>
                    <td className="px-4 py-3">{p.volume_total_vendas != null ? fmt(p.volume_total_vendas) : "-"}</td>
                    <td className="px-4 py-3">{p.maior_pedido || "-"}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={p.observacao || ""}>
                      {p.observacao || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {p.pdf_path ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => downloadPDF(p.pdf_path!, p.nome_gerente)}
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

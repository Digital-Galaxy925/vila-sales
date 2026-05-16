import { useState } from "react";
import { Search, Image as ImageIcon, Loader2, Plus, X, Tag, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────
interface TabloideProduto {
  id: string;
  codigo: string;
  nome: string;
  marca?: string;
  imagem?: string | null;
  precoDe?: number;
  precoPor?: number;
  selo?: string; // ex: "OFERTA", "EXCLUSIVO", "NOVO"
}

interface TabloideSecao {
  id: string;
  nome: string;
  cor: string; // tailwind bg utility for header accent
  produtos: TabloideProduto[];
}

const STORAGE_KEY = "vilasales_tabloide_secoes";

const SECOES_INICIAIS: TabloideSecao[] = [
  { id: "higiene", nome: "Higiene & Beleza", cor: "bg-pink-500", produtos: [] },
  { id: "limpeza", nome: "Limpeza", cor: "bg-blue-500", produtos: [] },
  { id: "alimentos", nome: "Alimentos", cor: "bg-amber-500", produtos: [] },
  { id: "bebidas", nome: "Bebidas", cor: "bg-emerald-500", produtos: [] },
];

const brl = (v?: number) =>
  typeof v === "number"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

// ─── Card de produto ─────────────────────────────────────────────────────────
const ProdutoCard = ({
  produto,
  onRemove,
}: {
  produto: TabloideProduto;
  onRemove: () => void;
}) => {
  const temDesconto =
    produto.precoDe && produto.precoPor && produto.precoPor < produto.precoDe;
  const pctOff = temDesconto
    ? Math.round(((produto.precoDe! - produto.precoPor!) / produto.precoDe!) * 100)
    : 0;

  return (
    <div className="group relative bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden hover:shadow-lg transition-all">
      {produto.selo && (
        <span className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md">
          {produto.selo}
        </span>
      )}
      {temDesconto && (
        <span className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded-md shadow-md">
          -{pctOff}%
        </span>
      )}
      <button
        onClick={onRemove}
        className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 border border-border rounded-md p-1.5 hover:bg-destructive hover:text-destructive-foreground"
        title="Remover"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {produto.imagem ? (
          <img
            src={produto.imagem}
            alt={produto.nome}
            className="w-full h-full object-contain p-3"
          />
        ) : (
          <ImageIcon className="w-10 h-10 text-muted-foreground" />
        )}
      </div>

      <div className="p-3 space-y-1">
        {produto.marca && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {produto.marca}
          </p>
        )}
        <h4 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
          {produto.nome}
        </h4>
        <p className="text-[10px] text-muted-foreground">Cód. {produto.codigo}</p>

        <div className="pt-2 mt-1 border-t border-border">
          {temDesconto && (
            <p className="text-xs text-muted-foreground line-through">
              {brl(produto.precoDe)}
            </p>
          )}
          <p className="text-lg font-bold text-primary leading-tight">
            {brl(produto.precoPor ?? produto.precoDe)}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Página ──────────────────────────────────────────────────────────────────
const Tabloide = () => {
  const [secoes, setSecoes] = useState<TabloideSecao[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {/* ignore */}
    return SECOES_INICIAIS;
  });

  const persist = (next: TabloideSecao[]) => {
    setSecoes(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {/* ignore */}
  };

  // ─── Modal de adição ───────────────────────────────────────────────────────
  const [modalSecao, setModalSecao] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [precoDe, setPrecoDe] = useState("");
  const [precoPor, setPrecoPor] = useState("");
  const [selo, setSelo] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrirModal = (secaoId: string) => {
    setModalSecao(secaoId);
    setCodigo(""); setPrecoDe(""); setPrecoPor(""); setSelo(""); setErro(null);
  };

  const fecharModal = () => setModalSecao(null);

  const handleAdicionar = async () => {
    if (!codigo.trim() || !modalSecao) return;
    setLoading(true); setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("vtex-product-image", {
        body: { code: codigo.trim() },
      });
      if (error) throw error;
      if (!data?.found) {
        setErro(`Produto "${codigo}" não encontrado na VTEX.`);
        setLoading(false);
        return;
      }
      const novo: TabloideProduto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        codigo: codigo.trim(),
        nome: data.productName || "Sem nome",
        marca: data.brand || undefined,
        imagem: data.image || null,
        precoDe: precoDe ? parseFloat(precoDe.replace(",", ".")) : undefined,
        precoPor: precoPor ? parseFloat(precoPor.replace(",", ".")) : undefined,
        selo: selo.trim() || undefined,
      };
      persist(
        secoes.map((s) =>
          s.id === modalSecao ? { ...s, produtos: [...s.produtos, novo] } : s
        )
      );
      fecharModal();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao buscar produto.");
    } finally {
      setLoading(false);
    }
  };

  const removerProduto = (secaoId: string, prodId: string) => {
    persist(
      secoes.map((s) =>
        s.id === secaoId ? { ...s, produtos: s.produtos.filter((p) => p.id !== prodId) } : s
      )
    );
  };

  const totalProdutos = secoes.reduce((acc, s) => acc + s.produtos.length, 0);

  return (
    <div>
      <PageHeader
        title="Tablóide"
        description="Monte o tablóide promocional com cards visuais por produto e seções por categoria"
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            {totalProdutos} produto{totalProdutos !== 1 ? "s" : ""}
          </div>
        }
      />

      <div className="space-y-8">
        {secoes.map((secao) => (
          <section key={secao.id} className="bg-card rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
            {/* Header da seção */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <span className={`w-1.5 h-8 rounded-full ${secao.cor}`} />
                <div>
                  <h3 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    {secao.nome}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {secao.produtos.length} item{secao.produtos.length !== 1 ? "ns" : ""}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => abrirModal(secao.id)}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar produto
              </Button>
            </div>

            {/* Grid de produtos */}
            <div className="p-4">
              {secao.produtos.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg py-10 text-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum produto nesta seção. Clique em <span className="font-medium text-foreground">Adicionar produto</span>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {secao.produtos.map((p) => (
                    <ProdutoCard
                      key={p.id}
                      produto={p}
                      onRemove={() => removerProduto(secao.id, p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Modal de adição */}
      {modalSecao && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={fecharModal}>
          <div
            className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-bold text-foreground">
                Adicionar produto
              </h3>
              <button onClick={fecharModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Código do produto *
                </label>
                <Input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ex.: 123456"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Preço "De"
                  </label>
                  <Input
                    value={precoDe}
                    onChange={(e) => setPrecoDe(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Preço "Por"
                  </label>
                  <Input
                    value={precoPor}
                    onChange={(e) => setPrecoPor(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Selo (opcional)
                </label>
                <Input
                  value={selo}
                  onChange={(e) => setSelo(e.target.value)}
                  placeholder="Ex.: OFERTA, EXCLUSIVO, NOVO"
                />
              </div>

              {erro && (
                <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                  {erro}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={fecharModal}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleAdicionar} disabled={loading || !codigo.trim()}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Buscar e adicionar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tabloide;

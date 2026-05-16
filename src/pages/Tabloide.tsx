import { useState } from "react";
import { Search, Image as ImageIcon, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface ProductInfo {
  found: boolean;
  productId?: string;
  productName?: string;
  brand?: string;
  link?: string;
  image?: string | null;
}

const Tabloide = () => {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<ProductInfo | null>(null);

  const handleBuscar = async () => {
    const code = codigo.trim();
    if (!code) return;
    setLoading(true);
    setErro(null);
    setInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("vtex-product-image", {
        body: { code },
      });
      if (error) throw error;
      if (!data?.found) {
        setErro(`Nenhum produto encontrado para o código "${code}".`);
      } else {
        setInfo(data as ProductInfo);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar o produto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Tablóide"
        description="Consulte a imagem do produto pelo código (VTEX)"
      />

      <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-6 max-w-3xl">
        <label className="text-sm font-medium text-foreground mb-2 block">
          Código do produto
        </label>
        <div className="flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
            placeholder="Ex.: 123456"
            className="flex-1"
          />
          <Button onClick={handleBuscar} disabled={loading || !codigo.trim()}>
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Buscar
          </Button>
        </div>

        {erro && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {erro}
          </div>
        )}

        {info?.found && (
          <div className="mt-6 flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
              {info.image ? (
                <img
                  src={info.image}
                  alt={info.productName || "Produto"}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-muted-foreground flex flex-col items-center text-xs">
                  <ImageIcon className="w-8 h-8 mb-2" />
                  Sem imagem disponível
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {info.productName}
              </h3>
              {info.brand && (
                <p className="text-sm text-muted-foreground">
                  Marca: <span className="text-foreground">{info.brand}</span>
                </p>
              )}
              {info.productId && (
                <p className="text-xs text-muted-foreground">
                  ID VTEX: {info.productId}
                </p>
              )}
              {info.link && (
                <a
                  href={info.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline inline-block"
                >
                  Abrir no site →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tabloide;

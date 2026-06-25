import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, CheckCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import NoDataNotice from "@/components/NoDataNotice";
import { supabase } from "@/integrations/supabase/client";

const UploadST = () => {
  const [info, setInfo] = useState<{ name: string; rows: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("st_data")
          .select("file_name, row_count, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (data) setInfo({ name: data.file_name, rows: data.row_count });
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Tabela ST"
        description="Os dados de Substituição Tributária são carregados na tela Upload de Livros e disponibilizados aqui para consulta."
      />

      {loading ? null : !info ? (
        <NoDataNotice
          description="Nenhum dado de ST encontrado. Faça o upload dos arquivos em Upload de Livros para visualizar a Tabela de ST."
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-6 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-success" />
            <div className="flex-1">
              <p className="text-sm font-medium text-card-foreground">{info.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <CheckCircle className="w-3.5 h-3.5 text-success" />
                {info.rows.toLocaleString("pt-BR")} produtos carregados
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default UploadST;

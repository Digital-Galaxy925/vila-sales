import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UploadCloud, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface NoDataNoticeProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
}

/**
 * Aviso padrão exibido quando uma análise é aberta sem dados carregados.
 * Direciona o usuário para a tela "Upload de Livros", fonte única de dados.
 */
export const NoDataNotice = ({
  title = "Nenhum dado encontrado",
  description = "Faça o upload dos arquivos em Upload de Livros para visualizar esta análise.",
  buttonLabel = "Ir para Upload de Livros",
}: NoDataNoticeProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center text-center bg-[#f5f9ff] border border-[#d2e3fb] rounded-2xl p-10 my-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="w-14 h-14 rounded-full bg-white border border-[#d2e3fb] flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-[#0071e3]" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-[#1d1d1f] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[#6e6e73] max-w-md mb-6">{description}</p>
      <Button
        onClick={() => navigate("/upload-livros")}
        className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-5"
      >
        <UploadCloud className="w-4 h-4 mr-2" />
        {buttonLabel}
      </Button>
    </motion.div>
  );
};

export default NoDataNotice;

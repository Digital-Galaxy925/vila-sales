import PageHeader from "@/components/PageHeader";
import { ArrowLeftRight } from "lucide-react";

const Transferencia = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transferência"
        description="Gestão de transferências entre filiais"
      />
      <div className="bg-card rounded-xl border border-border p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <ArrowLeftRight className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Módulo em construção
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Em breve você poderá gerenciar as transferências de produtos entre os centros de distribuição por aqui.
        </p>
      </div>
    </div>
  );
};

export default Transferencia;

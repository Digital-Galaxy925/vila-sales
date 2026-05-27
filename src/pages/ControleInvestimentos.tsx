import PageHeader from "@/components/PageHeader";
import { Wallet } from "lucide-react";

export default function ControleInvestimentos() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Controle de Investimentos"
        description="Acompanhamento e gestão dos investimentos comerciais"
      />
      <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Wallet className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Em construção</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Este módulo está em desenvolvimento. Em breve você poderá controlar e acompanhar todos os investimentos comerciais por aqui.
        </p>
      </div>
    </div>
  );
}

import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { SlidersHorizontal } from "lucide-react";

const Simulador = () => {
  return (
    <AppLayout>
      <PageHeader title="Simulador" icon={SlidersHorizontal} />
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Módulo em construção.</p>
      </div>
    </AppLayout>
  );
};

export default Simulador;

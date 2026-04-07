import AppSidebar from "@/components/AppSidebar";
import PageHeader from "@/components/PageHeader";

const Simulador = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-8">
        <PageHeader title="Simulador" description="Simulação de cenários e preços." />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground text-sm">Módulo em construção.</p>
        </div>
      </main>
    </div>
  );
};

export default Simulador;

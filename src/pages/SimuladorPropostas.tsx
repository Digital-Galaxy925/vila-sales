import AppSidebar from "@/components/AppSidebar";

const SimuladorPropostas = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 p-8">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6">
          Simulador de Propostas
        </h1>
        <p className="text-muted-foreground">Em construção...</p>
      </main>
    </div>
  );
};

export default SimuladorPropostas;

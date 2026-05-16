import PageHeader from "@/components/PageHeader";

const Tabloide = () => {
  return (
    <div>
      <PageHeader
        title="Tablóide"
        description="Módulo de tablóide em construção"
      />
      <div className="bg-card rounded-xl shadow-[var(--shadow-card)] p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Em breve: gestão e visualização do tablóide promocional.
        </p>
      </div>
    </div>
  );
};

export default Tabloide;

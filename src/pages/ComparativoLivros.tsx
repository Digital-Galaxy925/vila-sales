import { useState } from "react";
import PageHeader from "@/components/PageHeader";

export default function ComparativoLivros() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comparativo de Livros"
        description="Compare dados entre os livros de diferentes filiais lado a lado."
      />

      <div className="bg-card rounded-xl border border-border p-12 text-center">
        <span className="text-4xl mb-4 block">📚</span>
        <h2 className="text-lg font-bold text-card-foreground mb-2">
          Comparativo de Livros
        </h2>
        <p className="text-sm text-muted-foreground">
          Em breve: ferramenta para comparar dados entre livros de diferentes filiais.
        </p>
      </div>
    </div>
  );
}

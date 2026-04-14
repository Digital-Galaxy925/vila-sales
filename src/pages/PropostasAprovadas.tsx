import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";

const PropostasAprovadas = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Propostas Aprovadas" />
      <div className="text-muted-foreground text-sm">
        Nenhuma proposta aprovada encontrada.
      </div>
    </div>
  );
};

export default PropostasAprovadas;

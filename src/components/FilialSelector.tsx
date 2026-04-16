import { useState } from "react";

const filiais = [
  { id: "all", label: "Todas as Filiais" },
  { id: "01", label: "Filial 01 - Poços" },
  { id: "11", label: "Filial 11 - Campinas" },
  { id: "12", label: "Filial 12 - Osasco" },
  { id: "14", label: "Filial 14 - Betim" },
  { id: "501", label: "Filial 501 - Focomix SP" },
  { id: "502", label: "Filial 502 - Focomix MG" },
];

interface FilialSelectorProps {
  selected: string;
  onChange: (filial: string) => void;
}

const FilialSelector = ({ selected, onChange }: FilialSelectorProps) => {
  return (
    <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-1 -mx-1 px-1">
      {filiais.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            selected === f.id
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-card text-muted-foreground hover:bg-secondary border border-border"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
};

export default FilialSelector;

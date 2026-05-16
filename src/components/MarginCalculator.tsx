import { useState, useMemo } from "react";

interface Line {
  id: string;
  value: string;
  margin: string;
}

export default function MarginCalculator() {
  const [lines, setLines] = useState<Line[]>([
    { id: crypto.randomUUID(), value: "", margin: "" },
  ]);

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), value: "", margin: "" },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleChange = (id: string, field: "value" | "margin", raw: string) => {
    // allow only digits and one comma
    const cleaned = raw.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "");
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: cleaned } : l))
    );
  };

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        value: parseFloat(l.value.replace(",", ".")) || 0,
        margin: parseFloat(l.margin.replace(",", ".")) || 0,
      })),
    [lines]
  );

  const totalValue = useMemo(
    () => parsed.reduce((sum, l) => sum + l.value, 0),
    [parsed]
  );

  const weightedMargin = useMemo(() => {
    if (totalValue <= 0) return 0;
    const numerator = parsed.reduce((sum, l) => sum + l.value * (l.margin / 100), 0);
    return numerator / totalValue;
  }, [parsed, totalValue]);

  const fmtBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fafafa",
    color: "#1f2937",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        padding: "22px 24px",
      }}
    >
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#0f172a",
          margin: "0 0 18px 0",
          letterSpacing: "-0.01em",
        }}
      >
        Calculadora de Margem Ponderada
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.map((line, idx) => {
          const val = parsed[idx].value;
          const mar = parsed[idx].margin;
          const contrib = val * (mar / 100);
          return (
            <div
              key={line.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr auto",
                gap: 12,
                alignItems: "end",
                background: idx % 2 === 0 ? "#fafafa" : "#fff",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div>
                <label style={labelStyle}>Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.value}
                  onChange={(e) => handleChange(line.id, "value", e.target.value)}
                  placeholder="0,00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Margem (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.margin}
                  onChange={(e) => handleChange(line.id, "margin", e.target.value)}
                  placeholder="0,00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Contribuição</label>
                <div
                  style={{
                    padding: "10px 0",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1f2937",
                  }}
                >
                  {fmtBRL(contrib)}
                </div>
              </div>
              <button
                onClick={() => handleRemoveLine(line.id)}
                disabled={lines.length === 1}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: lines.length === 1 ? "#cbd5e1" : "#dc2626",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: lines.length === 1 ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Remover
              </button>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
        }}
      >
        <button
          onClick={handleAddLine}
          style={{
            height: 38,
            padding: "0 18px",
            borderRadius: 8,
            border: "none",
            background: "#0071e3",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + Adicionar Linha
        </button>
      </div>

      <div
        style={{
          marginTop: 22,
          padding: "18px 20px",
          background: "#f8fafc",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            Valor Total do Pedido
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            {fmtBRL(totalValue)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            Margem Ponderada Real
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color:
                weightedMargin >= 0.17
                  ? "#16a34a"
                  : weightedMargin >= 0.1
                    ? "#d97706"
                    : "#dc2626",
              letterSpacing: "-0.02em",
            }}
          >
            {(weightedMargin * 100).toFixed(2).replace(".", ",")}%
          </div>
        </div>
      </div>
    </div>
  );
}

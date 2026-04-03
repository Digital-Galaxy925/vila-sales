interface MarginBadgeProps {
  value: number;
  threshold?: number;
}

const MarginBadge = ({ value, threshold = 17 }: MarginBadgeProps) => {
  const isLow = value < threshold;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
        isLow
          ? "bg-destructive/10 text-destructive"
          : "bg-success/10 text-success"
      }`}
    >
      {value.toFixed(1)}%
    </span>
  );
};

export default MarginBadge;

import { motion } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "destructive";
  onClick?: () => void;
  active?: boolean;
}

const variantStyles = {
  default: "border-border",
  success: "border-l-[3px] border-l-success border-t-0 border-r-0 border-b-0",
  warning: "border-l-[3px] border-l-warning border-t-0 border-r-0 border-b-0",
  destructive: "border-l-[3px] border-l-destructive border-t-0 border-r-0 border-b-0",
};

const iconBgStyles = {
  default: "bg-primary/8 text-primary",
  success: "bg-success/8 text-success",
  warning: "bg-warning/8 text-warning",
  destructive: "bg-destructive/8 text-destructive",
};

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = "default",
  onClick,
  active,
}: KpiCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={onClick}
      className={`bg-card rounded-xl p-4 shadow-card hover:shadow-card-hover transition-all duration-200 border ${variantStyles[variant]} ${onClick ? "cursor-pointer" : ""} ${active ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBgStyles[variant]}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        {trend && trendValue && (
          <div
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              trend === "up"
                ? "bg-success/8 text-success"
                : trend === "down"
                ? "bg-destructive/8 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {trend === "up" ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trendValue}
          </div>
        )}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {title}
      </p>
      <p className="text-xl font-semibold text-card-foreground tracking-[-0.02em]">
        {value}
      </p>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
      )}
    </motion.div>
  );
};

export default KpiCard;

import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { motion } from "framer-motion";

interface AlertCardProps {
  type: "critical" | "warning" | "success" | "info";
  title: string;
  description: string;
  count?: number;
}

const styles = {
  critical: {
    bg: "bg-destructive/5 border-destructive/20",
    icon: AlertTriangle,
    iconColor: "text-destructive",
    badge: "bg-destructive text-destructive-foreground",
  },
  warning: {
    bg: "bg-warning/5 border-warning/20",
    icon: AlertTriangle,
    iconColor: "text-warning",
    badge: "bg-warning text-warning-foreground",
  },
  success: {
    bg: "bg-success/5 border-success/20",
    icon: CheckCircle,
    iconColor: "text-success",
    badge: "bg-success text-success-foreground",
  },
  info: {
    bg: "bg-info/5 border-info/20",
    icon: Info,
    iconColor: "text-info",
    badge: "bg-info text-info-foreground",
  },
};

const AlertCard = ({ type, title, description, count }: AlertCardProps) => {
  const s = styles[type];
  const Icon = s.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-start gap-3 p-4 rounded-xl border ${s.bg}`}
    >
      <Icon className={`w-5 h-5 mt-0.5 ${s.iconColor}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-card-foreground">{title}</p>
          {count !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
              {count}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </motion.div>
  );
};

export default AlertCard;

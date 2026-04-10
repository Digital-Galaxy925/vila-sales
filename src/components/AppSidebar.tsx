import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Package,
  DollarSign,
  TrendingUp,
  Clock,
  LayoutDashboard,
  Upload,
  SlidersHorizontal,
  FileText,
  BriefcaseBusiness,
  Table,
} from "lucide-react";

const navItems = [
  { to: "/manual", label: "Análise de Custos", icon: BarChart3 },
  { to: "/gerencial", label: "Análise Gerencial", icon: BriefcaseBusiness },
  { to: "/simulador", label: "Simulador de Ofertas", icon: SlidersHorizontal },
  { to: "/propostas", label: "Simulador de Propostas", icon: FileText },
  { to: "/tabela-st", label: "Tabela de ST", icon: Table },
  { to: "/upload-st", label: "Upload ST", icon: Upload },
  { to: "/estoque", label: "Análise de Estoque", icon: Package },
  { to: "/margem", label: "Análise de Margem", icon: TrendingUp },
  { to: "/preco", label: "Análise de Preço", icon: DollarSign },
  { to: "/shelf-life", label: "Análise de Shelf Life", icon: Clock },
  { to: "/", label: "Análise Geral", icon: LayoutDashboard },
  { to: "/upload", label: "Upload de Dados", icon: Upload },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar-bg flex flex-col z-50">
      <div className="p-6 border-b border-sidebar-hover">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-sm font-bold text-white tracking-tight">
              Vila Sales
            </h1>
            <p className="text-xs text-sidebar-fg opacity-60">
              Gestão Comercial
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary/15 text-sidebar-active"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-white hover:translate-x-1"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 ${isActive ? "text-sidebar-active" : ""}`} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-hover">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-hover flex items-center justify-center text-xs font-bold text-sidebar-fg">
            FP
          </div>
          <div>
            <p className="text-xs font-medium text-white">Fábio</p>
            <p className="text-[10px] text-sidebar-fg opacity-60">Compras</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;

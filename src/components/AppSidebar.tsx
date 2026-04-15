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
  GitCompareArrows,
} from "lucide-react";

const navItems = [
  { to: "/manual", label: "Análise de Custos", icon: BarChart3 },
  { to: "/gerencial", label: "Análise Gerencial", icon: BriefcaseBusiness },
  { to: "/margem", label: "Análise de Margem", icon: TrendingUp },
  { to: "/estoque", label: "Análise de Estoque", icon: Package },
  { to: "/simulador", label: "Simulador de Ofertas", icon: SlidersHorizontal },
  { to: "/propostas", label: "Simulador de Propostas", icon: FileText },
  { to: "/propostas-aprovadas", label: "Propostas Aprovadas", icon: FileText },
  { to: "/comparativo-livros", label: "Comparativo de Livros", icon: GitCompareArrows },
  { to: "/conta-corrente", label: "Conta Corrente", icon: FileText },
  { to: "/tabela-st", label: "Tabela de ST", icon: Table },
  { to: "/upload-st", label: "Upload ST", icon: Upload },
  { to: "/preco", label: "Análise de Preço", icon: DollarSign },
  { to: "/shelf-life", label: "Análise de Shelf Life", icon: Clock },
  { to: "/", label: "Análise Geral", icon: LayoutDashboard },
  { to: "/upload", label: "Upload de Dados", icon: Upload },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar-bg flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-[18px] h-[18px] text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-[13px] font-semibold text-white tracking-[-0.01em]">
              Vila Sales
            </h1>
            <p className="text-[11px] text-white/40">
              Gestão Comercial
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-primary/15 text-white font-medium"
                  : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
              }`}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : "text-white/40"}`} />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary">
            FP
          </div>
          <div>
            <p className="text-[12px] font-medium text-white/80">Fábio</p>
            <p className="text-[10px] text-white/30">Compras</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;

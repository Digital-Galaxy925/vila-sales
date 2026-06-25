import { useState } from "react";
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
  ArrowLeftRight,
  Zap,
  Wallet,
  Menu,
  X,
  UploadCloud,
} from "lucide-react";

const navItems = [
  { to: "/upload-livros", label: "Upload de Livros", icon: UploadCloud },
  { to: "/gerencial", label: "Análise Gerencial", icon: BriefcaseBusiness },
  { to: "/", label: "Análise Geral", icon: LayoutDashboard },
  { to: "/dashboard-unilever", label: "Dashboard Unilever", icon: BarChart3 },
  { to: "/manual", label: "Análise de Custos", icon: BarChart3 },
  { to: "/margem", label: "Análise de Margem", icon: TrendingUp },
  { to: "/estoque", label: "Análise de Estoque", icon: Package },
  { to: "/analise-ddv", label: "Análise DDV", icon: Clock },
  { to: "/livro-preco", label: "Livro Preço", icon: FileText },
  { to: "/simulador", label: "Simulador de Ofertas", icon: SlidersHorizontal },
  { to: "/simulador-massivo", label: "Simulador de Ofertas Massivas", icon: SlidersHorizontal },
  { to: "/propostas", label: "Simulador de Propostas", icon: FileText },
  { to: "/propostas-aprovadas", label: "Propostas Aprovadas", icon: FileText },
  { to: "/livros", label: "Livros", icon: FileText },
  { to: "/controle-investimentos", label: "Controle de Investimentos", icon: Wallet },
  { to: "/pedidos-pendentes", label: "Pedidos Pendentes", icon: FileText },
  { to: "/comparativo-livros", label: "Comparativo de Livros", icon: GitCompareArrows },
  
  { to: "/transferencia", label: "Transferência", icon: ArrowLeftRight },
  { to: "/transferencia-automatica", label: "Transferência Automática", icon: Zap },
  { to: "/conta-corrente", label: "Conta Corrente", icon: FileText },
  { to: "/tabela-st", label: "Tabela de ST", icon: Table },
  { to: "/upload-st", label: "Upload ST", icon: Upload },
  { to: "/preco", label: "Análise de Preço", icon: DollarSign },
  { to: "/shelf-life", label: "Análise de Shelf Life", icon: Clock },
  { to: "/upload", label: "Upload de Dados", icon: Upload },
];

const AppSidebar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
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
          {/* Close button on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden text-white/60 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
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
              onClick={() => setMobileOpen(false)}
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
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar-bg z-50 flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/80 hover:text-white p-1"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-[13px] font-semibold text-white">Vila Sales</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop: fixed, mobile: slide-in drawer */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-sidebar-bg flex flex-col z-50 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;

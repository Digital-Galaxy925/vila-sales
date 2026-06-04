import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
  LayoutGrid,
  Search,
  Users,
  Building2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#6366f1", "#ec4899"];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (v: number) => v.toLocaleString("pt-BR");

const DashboardUnilever = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Simulated data based on the DIUNILEVER file structure
  const stats = useMemo(() => ({
    totalVendas: 1425678.90,
    totalVendasMesAnterior: 1350000.00,
    totalPedidos: 1245,
    ticketMedio: 1145.12,
    totalClientes: 856,
    totalItens: 45678,
  }), []);

  const topProdutos = useMemo(() => [
    { name: "DES DOVE ROLL-ON 50ML", value: 45600, qty: 1200 },
    { name: "DES AXE AERO 150ML", value: 38900, qty: 1050 },
    { name: "DES REXONA AERO 150ML", value: 32400, qty: 980 },
    { name: "COND SEDA 325ML", value: 28500, qty: 1500 },
    { name: "SH CLEAR 200ML", value: 24500, qty: 850 },
  ], []);

  const vendasPorFilial = useMemo(() => [
    { name: "Focomix SP", value: 545000 },
    { name: "Focomix MG", value: 324000 },
    { name: "Campinas", value: 215000 },
    { name: "Osasco", value: 185000 },
    { name: "Betim", value: 156678 },
  ], []);

  const evolucaoMensal = useMemo(() => [
    { name: "Jan", vendas: 1100000 },
    { name: "Fev", vendas: 1250000 },
    { name: "Mar", vendas: 1180000 },
    { name: "Abr", vendas: 1350000 },
    { name: "Mai", vendas: 1425678 },
  ], []);

  const filteredProdutos = topProdutos.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Unilever"
        description="Indicadores de performance baseados em movimentações DI Unilever"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Faturamento Total"
          value={fmt(stats.totalVendas)}
          icon={DollarSign}
          trend={stats.totalVendas > stats.totalVendasMesAnterior ? "up" : "down"}
          trendValue={`${(((stats.totalVendas / stats.totalVendasMesAnterior) - 1) * 100).toFixed(1)}%`}
        />
        <KpiCard
          title="Total de Pedidos"
          value={fmtNum(stats.totalPedidos)}
          icon={ShoppingCart}
        />
        <KpiCard
          title="Ticket Médio"
          value={fmt(stats.ticketMedio)}
          icon={TrendingUp}
        />
        <KpiCard
          title="Clientes Ativos"
          value={fmtNum(stats.totalClientes)}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução de Vendas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-6 shadow-card border border-border"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-heading text-base font-semibold text-card-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Evolução Mensal de Vendas
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v/1000}k`} />
                <Tooltip 
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px" }}
                />
                <Bar dataKey="vendas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Vendas por Filial */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl p-6 shadow-card border border-border"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-heading text-base font-semibold text-card-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Participação por Filial
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vendasPorFilial}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {vendasPorFilial.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Top Produtos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-6 shadow-card border border-border"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="font-heading text-base font-semibold text-card-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Top Produtos (Curva A)
            </h3>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar produto..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Qtd. Vendida</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Valor Total</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredProdutos.map((p, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-card-foreground">{p.name}</td>
                    <td className="px-4 py-4 text-sm text-right text-card-foreground">{fmtNum(p.qty)}</td>
                    <td className="px-4 py-4 text-sm text-right font-semibold text-card-foreground">{fmt(p.value)}</td>
                    <td className="px-4 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${(p.value / stats.totalVendas * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground w-8">
                          {((p.value / stats.totalVendas) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardUnilever;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Index from "./pages/Index";
import Simulador from "./pages/Simulador";
import SimuladorPropostas from "./pages/SimuladorPropostas";
import AnaliseGerencial from "./pages/AnaliseGerencial";

import AnaliseEstoque from "./pages/AnaliseEstoque";
import AnaliseMargem from "./pages/AnaliseMargem";
import AnalisePreco from "./pages/AnalisePreco";
import AnaliseShelfLife from "./pages/AnaliseShelfLife";
import UploadDados from "./pages/UploadDados";
import TabelaST from "./pages/TabelaST";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/manual" element={<Index />} />
          <Route element={<AppLayout />}>
            <Route path="/gerencial" element={<AnaliseGerencial />} />
            <Route path="/simulador" element={<Simulador />} />
            <Route path="/propostas" element={<SimuladorPropostas />} />
            <Route path="/tabela-st" element={<TabelaST />} />
            <Route path="/estoque" element={<AnaliseEstoque />} />
            <Route path="/margem" element={<AnaliseMargem />} />
            <Route path="/preco" element={<AnalisePreco />} />
            <Route path="/shelf-life" element={<AnaliseShelfLife />} />
            <Route path="/upload" element={<UploadDados />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

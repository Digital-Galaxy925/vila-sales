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
import ComparativoLivros from "./pages/ComparativoLivros";
import Transferencia from "./pages/Transferencia";
import ContaCorrente from "./pages/ContaCorrente";

import AnaliseEstoque from "./pages/AnaliseEstoque";
import AnaliseMargem from "./pages/AnaliseMargem";
import AnalisePreco from "./pages/AnalisePreco";
import AnaliseShelfLife from "./pages/AnaliseShelfLife";
import UploadDados from "./pages/UploadDados";
import TabelaST from "./pages/TabelaST";
import UploadST from "./pages/UploadST";
import PropostasAprovadas from "./pages/PropostasAprovadas";
import AnaliseGeral from "./pages/AnaliseGeral";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<AnaliseGeral />} />
            <Route path="/manual" element={<Index />} />
            <Route path="/gerencial" element={<AnaliseGerencial />} />
            <Route path="/simulador" element={<Simulador />} />
            <Route path="/propostas" element={<SimuladorPropostas />} />
            <Route path="/propostas-aprovadas" element={<PropostasAprovadas />} />
            <Route path="/tabela-st" element={<TabelaST />} />
            <Route path="/comparativo-livros" element={<ComparativoLivros />} />
            <Route path="/transferencia" element={<Transferencia />} />
            <Route path="/conta-corrente" element={<ContaCorrente />} />
            <Route path="/upload-st" element={<UploadST />} />
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

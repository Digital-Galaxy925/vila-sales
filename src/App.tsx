import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import AnaliseGeral from "./pages/AnaliseGeral";
import AnalisePreco from "./pages/AnalisePreco";
import AnaliseMargem from "./pages/AnaliseMargem";
import AnaliseEstoque from "./pages/AnaliseEstoque";
import AnaliseShelfLife from "./pages/AnaliseShelfLife";
import UploadDados from "./pages/UploadDados";
import AnaliseManual from "./pages/AnaliseManual";
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
            <Route path="/preco" element={<AnalisePreco />} />
            <Route path="/margem" element={<AnaliseMargem />} />
            <Route path="/estoque" element={<AnaliseEstoque />} />
            <Route path="/shelf-life" element={<AnaliseShelfLife />} />
            <Route path="/manual" element={<AnaliseManual />} />
            <Route path="/upload" element={<UploadDados />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

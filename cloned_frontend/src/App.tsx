import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppNav } from "@/components/AppNav";
import { BottomNav } from "@/components/BottomNav";
import { EtiquetasProvider } from "@/contexts/EtiquetasContext";
import { LogoProvider } from "@/contexts/LogoContext";
import ChatPage from "./pages/ChatPage";
import KanbanPage from "./pages/KanbanPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import FollowUpPage from "./pages/FollowUpPage";
import BroadcastPage from "./pages/BroadcastPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const isAuth = !!localStorage.getItem("fbs_token");

  if (!isAuth) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <EtiquetasProvider>
        <LogoProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <div className="flex h-dvh w-full overflow-hidden bg-background">
                <div className="hidden lg:flex shrink-0">
                  <AppNav />
                </div>
                {/* Conteúdo: no mobile, padding-bottom reserva espaço do BottomNav (60px) */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden pb-[60px] lg:pb-0">
                  <Routes>
                    <Route path="/" element={<ChatPage />} />
                    <Route path="/kanban" element={<KanbanPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/followup" element={<FollowUpPage />} />
                    <Route path="/broadcast" element={<BroadcastPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
                <BottomNav />
              </div>
            </BrowserRouter>
          </TooltipProvider>
        </LogoProvider>
      </EtiquetasProvider>
    </QueryClientProvider>
  );
};

export default App;

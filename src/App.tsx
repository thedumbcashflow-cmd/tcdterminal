import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AuthGuard from "./components/AuthGuard";
import Pricing from "./pages/Pricing";
import WhaleFlows from "./pages/WhaleFlows";
import Liquidations from "./pages/Liquidations";
import DataRoom from "./pages/DataRoom";
import Admin from "./pages/Admin";
import NetworkHealth from "./pages/NetworkHealth";
import DePINTracker from "./pages/DePINTracker";
import Checkout from "./pages/Checkout";
import Settings from "./pages/Settings";
import ChatBubble from "./components/ChatBubble";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ChatBubble />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/pricing" element={<AuthGuard><Pricing /></AuthGuard>} />
          <Route path="/checkout" element={<AuthGuard><Checkout /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route path="/whale-flows" element={<AuthGuard><WhaleFlows /></AuthGuard>} />
          <Route path="/liquidations" element={<AuthGuard><Liquidations /></AuthGuard>} />
          <Route path="/data-room" element={<AuthGuard><DataRoom /></AuthGuard>} />
          <Route path="/network-health" element={<AuthGuard><NetworkHealth /></AuthGuard>} />
          <Route path="/depin-tracker" element={<AuthGuard><DePINTracker /></AuthGuard>} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

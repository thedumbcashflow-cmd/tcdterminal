import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
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
import WorldMonitor from "./pages/WorldMonitor";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout" element={<AuthGuard><Checkout /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <Index />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/whale-flows"
            element={
              <AuthGuard>
                <WhaleFlows />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/liquidations"
            element={
              <AuthGuard>
                <Liquidations />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/data-room"
            element={
              <AuthGuard>
                <DataRoom />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/network-health"
            element={
              <AuthGuard>
                <NetworkHealth />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/depin-tracker"
            element={
              <AuthGuard>
                <DePINTracker />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/world-monitor"
            element={
              <AuthGuard>
                <WorldMonitor />
                <ChatBubble />
              </AuthGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGuard>
                <Admin />
              </AuthGuard>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

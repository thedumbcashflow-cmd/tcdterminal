import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AuthGuard from "./components/AuthGuard";

// Lazy-loaded routes — split out of the main bundle to reduce unused JS on first load
const Index = lazy(() => import("./pages/Index"));
const Pricing = lazy(() => import("./pages/Pricing"));
const WhaleFlows = lazy(() => import("./pages/WhaleFlows"));
const Liquidations = lazy(() => import("./pages/Liquidations"));
const DataRoom = lazy(() => import("./pages/DataRoom"));
const Admin = lazy(() => import("./pages/Admin"));
const NetworkHealth = lazy(() => import("./pages/NetworkHealth"));
const DePINTracker = lazy(() => import("./pages/DePINTracker"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Settings = lazy(() => import("./pages/Settings"));
const WorldMonitor = lazy(() => import("./pages/WorldMonitor"));
const TokenCatalyst = lazy(() => import("./pages/TokenCatalyst"));
const ChatBubble = lazy(() => import("./components/ChatBubble"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={null}>
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
              path="/token-catalyst"
              element={
                <AuthGuard>
                  <TokenCatalyst />
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
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

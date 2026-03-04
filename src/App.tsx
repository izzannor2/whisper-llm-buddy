import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load heavy pages
const IDE = lazy(() => import("./pages/IDE"));
const IDESettings = lazy(() => import("./pages/IDESettings"));
const Models = lazy(() => import("./pages/Models"));
const IoTWorkspace = lazy(() => import("./pages/IoTWorkspace"));
const SandboxWorkspace = lazy(() => import("./pages/SandboxWorkspace"));
const ImproveWorkspace = lazy(() => import("./pages/ImproveWorkspace"));

const queryClient = new QueryClient();

// Loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/models" element={<Models />} />
            <Route path="/ide" element={<IDE />} />
            <Route path="/iot" element={<IoTWorkspace />} />
            <Route path="/sandbox" element={<SandboxWorkspace />} />
            <Route path="/improve" element={<ImproveWorkspace />} />
            <Route path="/settings" element={<IDESettings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
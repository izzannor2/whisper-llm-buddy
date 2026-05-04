import React, { Suspense, lazy, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/components/AuthProvider";
import { FirstRunSetup } from "@/components/FirstRunSetup";
import { loadSettings, type ChatSettings } from "@/lib/chat-api";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load heavy pages
const IDE = lazy(() => import("./pages/IDE"));
const IDESettings = lazy(() => import("./pages/IDESettings"));
const Models = lazy(() => import("./pages/Models"));
const IoTWorkspace = lazy(() => import("./pages/IoTWorkspace"));
const SandboxWorkspace = lazy(() => import("./pages/SandboxWorkspace"));
const ImproveWorkspace = lazy(() => import("./pages/ImproveWorkspace"));
const Auth = lazy(() => import("./pages/Auth"));
const ThreeDWorkspace = lazy(() => import("./pages/ThreeDWorkspace"));

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

function AppInner() {
  const [showFirstRun, setShowFirstRun] = useState(false);

  useEffect(() => {
    const isFirstRunDone = localStorage.getItem('localdev-first-run-complete');
    const hasSettings = localStorage.getItem('localdev-settings') || localStorage.getItem('arachat-settings');
    if (!isFirstRunDone && !hasSettings) {
      setShowFirstRun(true);
    }

    // Auto-apply bundled updates from public/updates/manifest.json
    // Tracking lives in BOTH localStorage AND config/applied-updates.json (via local agent),
    // so a browser-storage wipe does not re-apply already-applied updates.
    (async () => {
      try {
        const { scanBundledUpdates, applyLocalUpdate, getCurrentVersion, compareVersions } =
          await import('@/lib/update-system');
        const APPLIED_KEY = 'localdev-bundled-applied';
        const localApplied: string[] = JSON.parse(localStorage.getItem(APPLIED_KEY) || '[]');

        // Merge with disk record (best-effort, agent may be down).
        let diskApplied: string[] = [];
        try {
          const r = await fetch('http://127.0.0.1:3847/updates/applied', { signal: AbortSignal.timeout(1500) });
          if (r.ok) diskApplied = (await r.json()).applied || [];
        } catch {/* agent offline */}
        const applied = Array.from(new Set([...localApplied, ...diskApplied]));

        const updates = await scanBundledUpdates();
        let changed = false;
        for (const u of updates) {
          if (applied.includes(u.version)) continue;
          if (compareVersions(u.version, getCurrentVersion()) > 0) {
            const r = applyLocalUpdate(u);
            if (r.success) { applied.push(u.version); changed = true; }
          } else {
            applied.push(u.version); changed = true;
          }
          // Mirror to disk so a browser wipe doesn't replay updates.
          try {
            await fetch('http://127.0.0.1:3847/updates/applied', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ version: u.version }),
            });
          } catch {/* ignore */}
        }
        if (changed) localStorage.setItem(APPLIED_KEY, JSON.stringify(applied));
      } catch (err) {
        console.warn('Bundled update auto-apply skipped:', err);
      }
    })();
  }, []);

  return (
    <>
      {showFirstRun && (
        <FirstRunSetup
          open={showFirstRun}
          onComplete={() => setShowFirstRun(false)}
        />
      )}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/models" element={<Models />} />
          <Route path="/ide" element={<IDE />} />
          <Route path="/iot" element={<IoTWorkspace />} />
          <Route path="/sandbox" element={<SandboxWorkspace />} />
          <Route path="/improve" element={<ImproveWorkspace />} />
          <Route path="/3d" element={<ThreeDWorkspace />} />
          <Route path="/settings" element={<IDESettings />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <AppInner />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

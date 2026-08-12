import React, { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import NewVersionPrompt from "@/components/NewVersionPrompt";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { syncSessionRecording } from "@/lib/monitoring";
// Health banner is non-critical for first paint → deferred out of the main chunk.
const BackendStatusBanner = lazy(() => import("@/components/BackendStatusBanner"));


// ── Eager (tiny, needed immediately on every route) ──────────────────────────
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// ── Lazy — Admin ─────────────────────────────────────────────────────────────
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/AdminDashboard"), "AdminDashboard");
const AdminInspections = lazyWithRetry(() => import("./pages/admin/AdminInspections"), "AdminInspections");
const AdminUsers = lazyWithRetry(() => import("./pages/admin/AdminUsers"), "AdminUsers");
const AdminSettings = lazyWithRetry(() => import("./pages/admin/AdminSettings"), "AdminSettings");
const AdminSchedule = lazyWithRetry(() => import("./pages/admin/AdminSchedule"), "AdminSchedule");
const AdminInspectionDetail = lazyWithRetry(() => import("./pages/admin/AdminInspectionDetail"), "AdminInspectionDetail");
const AdminRepairCatalog = lazyWithRetry(() => import("./pages/admin/AdminRepairCatalog"), "AdminRepairCatalog");
const AdminIntegrations = lazyWithRetry(() => import("./pages/admin/AdminIntegrations"), "AdminIntegrations");
const AdminIntegrationHubSpot = lazyWithRetry(() => import("./pages/admin/AdminIntegrationHubSpot"), "AdminIntegrationHubSpot");
const AdminIntegrationHubSpotLogs = lazyWithRetry(() => import("./pages/admin/AdminIntegrationHubSpotLogs"), "AdminIntegrationHubSpotLogs");
const AdminIntegrationHubSpotOutboundLogs = lazyWithRetry(() => import("./pages/admin/AdminIntegrationHubSpotOutboundLogs"), "AdminIntegrationHubSpotOutboundLogs");
const AdminMonitoring = lazyWithRetry(() => import("./pages/admin/AdminMonitoring"), "AdminMonitoring");

// ── Lazy — Inspector ──────────────────────────────────────────────────────────
const InspectorDashboard = lazyWithRetry(() => import("./pages/inspector/InspectorDashboard"), "InspectorDashboard");
const InspectorPastInspections = lazyWithRetry(() => import("./pages/inspector/InspectorPastInspections"), "InspectorPastInspections");
const InspectorAllInspections = lazyWithRetry(() => import("./pages/inspector/InspectorAllInspections"), "InspectorAllInspections");
const InspectorProfile = lazyWithRetry(() => import("./pages/inspector/InspectorProfile"), "InspectorProfile");
const InspectorInspectionDetail = lazyWithRetry(() => import("./pages/inspector/InspectorInspectionDetail"), "InspectorInspectionDetail");
const InspectorSectionComplete = lazyWithRetry(() => import("./pages/inspector/InspectorSectionComplete"), "InspectorSectionComplete");
const InspectorCalendar = lazyWithRetry(() => import("./pages/inspector/InspectorCalendar"), "InspectorCalendar");

// ── Lazy — Executive ──────────────────────────────────────────────────────────
const ExecutiveReviewQueue = lazyWithRetry(() => import("./pages/executive/ExecutiveReviewQueue"), "ExecutiveReviewQueue");
const ExecutiveReviewDetail = lazyWithRetry(() => import("./pages/executive/ExecutiveReviewDetail"), "ExecutiveReviewDetail");
const ExecutiveSchedule = lazyWithRetry(() => import("./pages/executive/ExecutiveSchedule"), "ExecutiveSchedule");
const ExecutiveRepairCatalog = lazyWithRetry(() => import("./pages/executive/ExecutiveRepairCatalog"), "ExecutiveRepairCatalog");

// ── Lazy — Public ─────────────────────────────────────────────────────────────
const OwnerReport = lazyWithRetry(() => import("./pages/public/OwnerReport"), "OwnerReport");

// ── Lazy — Comercial (solo lectura) ───────────────────────────────────────────
const ComercialCheckOutList = lazyWithRetry(() => import("./pages/comercial/ComercialCheckOutList"), "ComercialCheckOutList");
const ComercialCheckOutDetail = lazyWithRetry(() => import("./pages/comercial/ComercialCheckOutDetail"), "ComercialCheckOutDetail");

// ── Lazy — Shared ─────────────────────────────────────────────────────────────
const InspectionRoleRedirect = lazyWithRetry(() => import("./pages/InspectionRoleRedirect"), "InspectionRoleRedirect");

// ── QueryClient with sensible cache defaults ──────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min — avoids refetch on tab-focus for fresh data
      gcTime: 10 * 60 * 1000,     // 10 min — keep inactive data in memory
      retry: 1,
      // Tab-focus refetches were re-running the heavy detail bundles (photos,
      // field values) on every window switch. Data is refreshed explicitly
      // after mutations via granular invalidation instead.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});


// ── Route-level loading fallback ──────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/** Stops session replay on routes that render tenant personal data. */
function SessionRecordingGate() {
  const { pathname } = useLocation();
  useEffect(() => {
    syncSessionRecording(pathname);
  }, [pathname]);
  return null;
}

/** Resets the per-route boundary whenever the user navigates. */
function RouteBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <RouteErrorBoundary resetKey={pathname}>{children}</RouteErrorBoundary>;
}

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Suspense fallback={null}><BackendStatusBanner /></Suspense>
        <BrowserRouter>
          <SessionRecordingGate />
          <NewVersionPrompt />

          <RouteBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />

              {/* Admin routes */}
              <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/inspections" element={<ProtectedRoute allowedRoles={['admin']}><AdminInspections /></ProtectedRoute>} />
              <Route path="/admin/inspections/:id" element={<ProtectedRoute allowedRoles={['admin']}><AdminInspectionDetail /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
              <Route path="/admin/schedule" element={<ProtectedRoute allowedRoles={['admin']}><AdminSchedule /></ProtectedRoute>} />
              <Route path="/admin/catalog" element={<ProtectedRoute allowedRoles={['admin']}><AdminRepairCatalog /></ProtectedRoute>} />
              <Route path="/admin/monitoring" element={<ProtectedRoute allowedRoles={['admin']}><AdminMonitoring /></ProtectedRoute>} />
              <Route path="/admin/integrations" element={<ProtectedRoute allowedRoles={['admin']}><AdminIntegrations /></ProtectedRoute>} />
              <Route path="/admin/integrations/hubspot" element={<ProtectedRoute allowedRoles={['admin']}><AdminIntegrationHubSpot /></ProtectedRoute>} />
              <Route path="/admin/integrations/hubspot/logs" element={<ProtectedRoute allowedRoles={['admin']}><AdminIntegrationHubSpotLogs /></ProtectedRoute>} />
              <Route path="/admin/integrations/hubspot/outbound-logs" element={<ProtectedRoute allowedRoles={['admin']}><AdminIntegrationHubSpotOutboundLogs /></ProtectedRoute>} />

              {/* Inspector routes */}
              <Route path="/inspector" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorDashboard /></ProtectedRoute>} />
              <Route path="/inspector/agenda" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorCalendar /></ProtectedRoute>} />
              <Route path="/inspector/calendar" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorCalendar /></ProtectedRoute>} />
              <Route path="/inspector/past" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorPastInspections /></ProtectedRoute>} />
              <Route path="/inspector/all" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorAllInspections /></ProtectedRoute>} />
              <Route path="/inspector/profile" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorProfile /></ProtectedRoute>} />
              <Route path="/inspector/inspection/:id" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorInspectionDetail /></ProtectedRoute>} />
              <Route path="/inspector/inspection/:id/section/:sectionId" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorSectionComplete /></ProtectedRoute>} />

              {/* Executive routes */}
              <Route path="/executive" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveReviewQueue /></ProtectedRoute>} />
              <Route path="/executive/schedule" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveSchedule /></ProtectedRoute>} />
              <Route path="/executive/inspection/:id" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveReviewDetail /></ProtectedRoute>} />
              <Route path="/executive/catalog" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveRepairCatalog /></ProtectedRoute>} />

              {/* Comercial (solo lectura) routes */}
              <Route path="/comercial" element={<ProtectedRoute allowedRoles={['comercial']}><ComercialCheckOutList /></ProtectedRoute>} />
              <Route path="/comercial/check-out/:id" element={<ProtectedRoute allowedRoles={['comercial']}><ComercialCheckOutDetail /></ProtectedRoute>} />

              {/* Shared role-aware entry point (used by Slack links, etc.) */}
              <Route path="/inspections/:id" element={<ProtectedRoute allowedRoles={['admin','executive','inspector','comercial']}><InspectionRoleRedirect /></ProtectedRoute>} />

              {/* Public routes */}
              <Route path="/reportes/:propertyId/:token" element={<OwnerReport />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </RouteBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

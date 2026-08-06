import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
// Health banner is non-critical for first paint → deferred out of the main chunk.
const BackendStatusBanner = lazy(() => import("@/components/BackendStatusBanner"));


// ── Eager (tiny, needed immediately on every route) ──────────────────────────
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// ── Lazy — Admin ─────────────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminInspections = lazy(() => import("./pages/admin/AdminInspections"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminSchedule = lazy(() => import("./pages/admin/AdminSchedule"));
const AdminInspectionDetail = lazy(() => import("./pages/admin/AdminInspectionDetail"));
const AdminRepairCatalog = lazy(() => import("./pages/admin/AdminRepairCatalog"));
const AdminIntegrations = lazy(() => import("./pages/admin/AdminIntegrations"));
const AdminIntegrationHubSpot = lazy(() => import("./pages/admin/AdminIntegrationHubSpot"));
const AdminIntegrationHubSpotLogs = lazy(() => import("./pages/admin/AdminIntegrationHubSpotLogs"));
const AdminIntegrationHubSpotOutboundLogs = lazy(() => import("./pages/admin/AdminIntegrationHubSpotOutboundLogs"));

// ── Lazy — Inspector ──────────────────────────────────────────────────────────
const InspectorDashboard = lazy(() => import("./pages/inspector/InspectorDashboard"));
const InspectorPastInspections = lazy(() => import("./pages/inspector/InspectorPastInspections"));
const InspectorAllInspections = lazy(() => import("./pages/inspector/InspectorAllInspections"));
const InspectorProfile = lazy(() => import("./pages/inspector/InspectorProfile"));
const InspectorInspectionDetail = lazy(() => import("./pages/inspector/InspectorInspectionDetail"));
const InspectorSectionComplete = lazy(() => import("./pages/inspector/InspectorSectionComplete"));
const InspectorCalendar = lazy(() => import("./pages/inspector/InspectorCalendar"));

// ── Lazy — Executive ──────────────────────────────────────────────────────────
const ExecutiveReviewQueue = lazy(() => import("./pages/executive/ExecutiveReviewQueue"));
const ExecutiveReviewDetail = lazy(() => import("./pages/executive/ExecutiveReviewDetail"));
const ExecutiveSchedule = lazy(() => import("./pages/executive/ExecutiveSchedule"));
const ExecutiveRepairCatalog = lazy(() => import("./pages/executive/ExecutiveRepairCatalog"));

// ── Lazy — Public ─────────────────────────────────────────────────────────────
const OwnerReport = lazy(() => import("./pages/public/OwnerReport"));

// ── Lazy — Comercial (solo lectura) ───────────────────────────────────────────
const ComercialCheckOutList = lazy(() => import("./pages/comercial/ComercialCheckOutList"));
const ComercialCheckOutDetail = lazy(() => import("./pages/comercial/ComercialCheckOutDetail"));

// ── Lazy — Shared ─────────────────────────────────────────────────────────────
const InspectionRoleRedirect = lazy(() => import("./pages/InspectionRoleRedirect"));

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Suspense fallback={null}><BackendStatusBanner /></Suspense>
        <BrowserRouter>

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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

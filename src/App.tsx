import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminInspections from "./pages/admin/AdminInspections";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminInspectionDetail from "./pages/admin/AdminInspectionDetail";
import AdminRepairCatalog from "./pages/admin/AdminRepairCatalog";
import AdminIntegrations from "./pages/admin/AdminIntegrations";
import AdminIntegrationHubSpot from "./pages/admin/AdminIntegrationHubSpot";
import AdminIntegrationHubSpotLogs from "./pages/admin/AdminIntegrationHubSpotLogs";
import AdminIntegrationHubSpotOutboundLogs from "./pages/admin/AdminIntegrationHubSpotOutboundLogs";
import InspectorDashboard from "./pages/inspector/InspectorDashboard";
import InspectorPastInspections from "./pages/inspector/InspectorPastInspections";
import InspectorAllInspections from "./pages/inspector/InspectorAllInspections";
import InspectorProfile from "./pages/inspector/InspectorProfile";
import InspectorInspectionDetail from "./pages/inspector/InspectorInspectionDetail";
import InspectorSectionComplete from "./pages/inspector/InspectorSectionComplete";
import InspectorCalendar from "./pages/inspector/InspectorCalendar";
import ExecutiveReviewQueue from "./pages/executive/ExecutiveReviewQueue";
import ExecutiveReviewDetail from "./pages/executive/ExecutiveReviewDetail";
import ExecutiveSchedule from "./pages/executive/ExecutiveSchedule";
import ExecutiveRepairCatalog from "./pages/executive/ExecutiveRepairCatalog";
import OwnerReport from "./pages/public/OwnerReport";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            
            {/* Public routes */}
            <Route path="/reportes/:propertyId/:token" element={<OwnerReport />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

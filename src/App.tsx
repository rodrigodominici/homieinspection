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
import InspectorDashboard from "./pages/inspector/InspectorDashboard";
import InspectorInspectionDetail from "./pages/inspector/InspectorInspectionDetail";
import InspectorSectionComplete from "./pages/inspector/InspectorSectionComplete";
import ExecutiveReviewQueue from "./pages/executive/ExecutiveReviewQueue";
import ExecutiveReviewDetail from "./pages/executive/ExecutiveReviewDetail";

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
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
            
            {/* Inspector routes */}
            <Route path="/inspector" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorDashboard /></ProtectedRoute>} />
            <Route path="/inspector/inspection/:id" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorInspectionDetail /></ProtectedRoute>} />
            <Route path="/inspector/inspection/:id/section/:sectionId" element={<ProtectedRoute allowedRoles={['inspector']}><InspectorSectionComplete /></ProtectedRoute>} />
            
            {/* Executive routes */}
            <Route path="/executive" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveReviewQueue /></ProtectedRoute>} />
            <Route path="/executive/inspection/:id" element={<ProtectedRoute allowedRoles={['executive']}><ExecutiveReviewDetail /></ProtectedRoute>} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

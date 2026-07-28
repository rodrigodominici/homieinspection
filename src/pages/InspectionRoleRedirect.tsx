import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shared entry point for links (e.g. Slack notifications) that need to open
 * an inspection without knowing the viewer's role. Redirects to the
 * role-specific detail route once the profile is loaded.
 */
export default function InspectionRoleRedirect() {
  const { id } = useParams<{ id: string }>();
  const { role, loading, profileLoading } = useAuth();

  if (loading || profileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!id) return <Navigate to="/" replace />;

  if (role === "admin") return <Navigate to={`/admin/inspections/${id}`} replace />;
  if (role === "executive") return <Navigate to={`/executive/inspection/${id}`} replace />;
  if (role === "inspector") return <Navigate to={`/inspector/inspection/${id}`} replace />;
  if (role === "comercial") return <Navigate to={`/comercial/check-out/${id}`} replace />;

  return <Navigate to="/" replace />;
}

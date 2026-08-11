import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import BackendUnavailable from '@/components/BackendUnavailable';
import type { UserRole } from '@/lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading, profileLoading, profileError } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  // Backend unreachable: show an actionable screen instead of hanging forever.
  if (profileError && !profile) return <BackendUnavailable />;

  if (!profile && profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }



  // Block users pending approval
  if (profile && (profile.role === 'pending' || profile.approval_status !== 'approved')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border-0 ring-1 ring-border/50 shadow-lg bg-card p-8 flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-status-regular-bg">
            <span className="text-xl">⏳</span>
          </div>
          <h2 className="text-h3">Cuenta pendiente</h2>
          <p className="text-caption text-muted-foreground">
            Tu cuenta está pendiente de aprobación por un administrador. Recibirás acceso una vez que sea aprobada.
          </p>
        </div>
      </div>
    );
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

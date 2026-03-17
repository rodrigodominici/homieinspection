import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();

  // Initial auth check
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!session) return <Navigate to="/auth" replace />;

  // Profile is still being fetched after auth resolved
  if (profileLoading || (!profile && !profileLoading && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-sm border-0 ring-1 ring-border/50 shadow-lg">
          <CardContent className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Preparando tu cuenta…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Profile is missing or has no role
  if (!profile || !profile.role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm border-0 ring-1 ring-border/50 shadow-lg">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-status-regular" />
            <p className="font-medium">Tu cuenta existe pero aún no tiene un rol asignado.</p>
            <p className="text-sm text-muted-foreground">
              Contacta al administrador para que te asigne un rol.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Redirect by role
  switch (profile.role) {
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'inspector':
      return <Navigate to="/inspector" replace />;
    case 'executive':
      return <Navigate to="/executive" replace />;
    default:
      return <Navigate to="/auth" replace />;
  }
}

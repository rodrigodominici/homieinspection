import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Auth screen — login only.
 *
 * Internal app: admin-created users are the primary supported path.
 * Self-signup has been removed from this UI. The backend `signUp` capability
 * in AuthContext and the `handle_new_user` DB trigger remain available as a
 * safety net for direct Cloud-panel creation or future flows.
 */
export default function Auth() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (message.includes('API key')) {
        console.error('[Auth] API key error — env check:', {
          hasUrl: !!import.meta.env.VITE_SUPABASE_URL,
          hasKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        });
      }
      toast({
        title: 'Error',
        description: message.includes('API key')
          ? 'Error de conexión con el servidor. Intenta de nuevo.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop: branded right panel */}
      <div className="hidden md:flex md:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="relative max-w-md text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/20 mx-auto shadow-lg backdrop-blur-sm">
            <span className="text-2xl font-bold text-primary-foreground">H</span>
          </div>
          <h2 className="text-h1 text-primary-foreground">Homie Inspection</h2>
          <p className="text-body-lg text-primary-foreground/80">
            Gestiona inspecciones inmobiliarias de forma eficiente y profesional
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="md:hidden bg-primary px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/20">
              <span className="text-lg font-bold text-primary-foreground">H</span>
            </div>
            <span className="text-body-lg font-semibold text-primary-foreground">Homie Inspection</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h1 className="text-h2">Iniciar sesión</h1>
              <p className="text-caption text-muted-foreground">
                Accede a tu cuenta de Homie Inspection
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@homie.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? 'Espera...' : 'Iniciar Sesión'}
              </Button>
            </form>

            <p className="text-center text-tiny text-muted-foreground">
              ¿No tienes cuenta? Solicita acceso a un administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2 } from 'lucide-react';

export default function Auth() {
  const { session, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpComplete, setSignUpComplete] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();
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
      if (isSignUp) {
        await signUp(email, password, fullName);
        setSignUpComplete(true);
      } else {
        await signIn(email, password);
      }
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Post-signup confirmation
  if (signUpComplete) {
    return (
      <div className="flex min-h-screen bg-background">
        {/* Desktop branded panel */}
        <div className="hidden md:flex md:w-1/2 bg-[hsl(var(--sidebar-background))] items-center justify-center p-12">
          <div className="max-w-md text-center space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary mx-auto">
              <span className="text-2xl font-bold text-primary-foreground">H</span>
            </div>
            <h2 className="text-h2 text-white">Homie Inspection</h2>
            <p className="text-body text-white/60">
              Plataforma de gestión de inspecciones inmobiliarias
            </p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-card rounded-2xl ring-1 ring-border/50 shadow-lg p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-status-good" />
            <h2 className="text-h3">Cuenta creada</h2>
            <p className="text-caption text-muted-foreground">
              Tu cuenta está pendiente de aprobación por un administrador.
              Revisa tu correo para confirmar tu email.
            </p>
            <Button variant="outline" onClick={() => { setSignUpComplete(false); setIsSignUp(false); }}>
              Ir a Iniciar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop: branded right panel */}
      <div className="hidden md:flex md:w-1/2 bg-[hsl(var(--sidebar-background))] items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
        <div className="relative max-w-md text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary mx-auto shadow-lg">
            <span className="text-2xl font-bold text-primary-foreground">H</span>
          </div>
          <h2 className="text-h1 text-white">Homie Inspection</h2>
          <p className="text-body-lg text-white/60">
            Gestiona inspecciones inmobiliarias de forma eficiente y profesional
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="md:hidden bg-[hsl(var(--sidebar-background))] px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <span className="text-lg font-bold text-primary-foreground">H</span>
            </div>
            <span className="text-body-lg font-semibold text-white">Homie Inspection</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h1 className="text-h2">{isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
              <p className="text-caption text-muted-foreground">
                {isSignUp ? 'Completa los datos para crear tu cuenta' : 'Accede a tu cuenta de Homie Inspection'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre Completo</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@homie.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? 'Espera...' : isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
              </Button>
            </form>

            <div className="text-center text-caption text-muted-foreground">
              {isSignUp ? (
                <>¿Ya tienes cuenta?{' '}
                  <button onClick={() => setIsSignUp(false)} className="text-primary font-medium hover:underline">Inicia sesión</button>
                </>
              ) : (
                <>¿Necesitas una cuenta?{' '}
                  <button onClick={() => setIsSignUp(true)} className="text-primary font-medium hover:underline">Crear una</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

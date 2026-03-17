import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2 } from 'lucide-react';
import type { UserRole } from '@/lib/types';

export default function Auth() {
  const { session, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpComplete, setSignUpComplete] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('inspector');
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

  // Only redirect if already authenticated — avoids the blank page race
  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password, fullName, role);
        // Show confirmation instead of redirecting immediately
        setSignUpComplete(true);
      } else {
        await signIn(email, password);
        // signIn triggers onAuthStateChange → session set → redirect via `if (session)`
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

  // Post-signup confirmation screen
  if (signUpComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-border/50">
          <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-status-good" />
            <h2 className="text-xl font-semibold">Cuenta creada</h2>
            <p className="text-muted-foreground">
              Revisa tu correo electrónico para confirmar tu cuenta.
              Una vez confirmado, podrás iniciar sesión.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSignUpComplete(false);
                setIsSignUp(false);
              }}
            >
              Ir a Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-xl font-bold text-primary-foreground">H</span>
          </div>
          <CardTitle className="text-2xl font-semibold">Homie Inspection</CardTitle>
          <CardDescription>
            {isSignUp ? 'Crea tu cuenta' : 'Inicia sesión en tu cuenta'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre Completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="inspector">Inspector</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Espera...' : isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => setIsSignUp(false)} className="text-primary font-medium hover:underline">
                  Inicia sesión
                </button>
              </>
            ) : (
              <>
                ¿Necesitas una cuenta?{' '}
                <button onClick={() => setIsSignUp(true)} className="text-primary font-medium hover:underline">
                  Crear una
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

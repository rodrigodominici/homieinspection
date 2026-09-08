import AdminLayout from '@/components/AdminLayout';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Envoltura de layout según el rol: la sección Inmuebles la comparten
 * administradores y ejecutivos, cada uno con su propia navegación.
 */
export function RoleLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role === 'executive') return <ExecutiveLayout>{children}</ExecutiveLayout>;
  return <AdminLayout>{children}</AdminLayout>;
}

export default RoleLayout;

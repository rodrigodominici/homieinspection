import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ContractorBottomNav from '@/components/ContractorBottomNav';

interface Props {
  title: string;
  subtitle?: string;
  /** Muestra la flecha de volver en lugar del logo. */
  backTo?: string;
  children: React.ReactNode;
}

/** Shell mobile-first del contratista, alineado con el patrón del inspector. */
export default function ContractorLayout({ title, subtitle, backTo, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          {backTo && (
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={() => navigate(backTo)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="px-4 py-4 space-y-4">{children}</main>
      <ContractorBottomNav />
    </div>
  );
}

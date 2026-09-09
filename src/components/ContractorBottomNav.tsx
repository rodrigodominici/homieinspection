import { useLocation, useNavigate } from 'react-router-dom';
import { Hammer, CheckCircle2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'work', label: 'Trabajos', icon: Hammer, path: '/contratista' },
  { key: 'done', label: 'Terminados', icon: CheckCircle2, path: '/contratista/terminados' },
  { key: 'profile', label: 'Perfil', icon: User, path: '/contratista/perfil' },
];

export default function ContractorBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey = (() => {
    const p = location.pathname;
    if (p === '/contratista' || p === '/contratista/') return 'work';
    if (p.startsWith('/contratista/terminados')) return 'done';
    if (p.startsWith('/contratista/perfil')) return 'profile';
    return 'work';
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-sm safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ key, label, icon: Icon, path }) => {
          const active = activeKey === key;
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              <span className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium')}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

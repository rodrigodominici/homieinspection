import { useLocation, useNavigate } from 'react-router-dom';
import { Home, CalendarDays, ClipboardList, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'home', label: 'Hoy', icon: Home, path: '/inspector' },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays, path: '/inspector/agenda' },
  { key: 'inspections', label: 'Inspecciones', icon: ClipboardList, path: '/inspector/all' },
  { key: 'profile', label: 'Perfil', icon: User, path: '/inspector/profile' },
];

export default function InspectorBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey = (() => {
    const p = location.pathname;
    if (p === '/inspector' || p === '/inspector/') return 'home';
    if (p === '/inspector/agenda') return 'agenda';
    if (p === '/inspector/all') return 'inspections';
    if (p === '/inspector/profile') return 'profile';
    // Sub-routes like /inspector/inspection/:id stay on home
    if (p.startsWith('/inspector/inspection')) return 'home';
    return '';
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
                active ? 'text-primary' : 'text-muted-foreground'
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

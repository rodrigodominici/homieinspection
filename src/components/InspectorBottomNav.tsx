import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, History, ClipboardList, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'calendar', label: 'Calendario', icon: CalendarDays, path: '/inspector/calendar' },
  { key: 'past', label: 'Pasadas', icon: History, path: '/inspector/past' },
  { key: 'inspections', label: 'Inspecciones', icon: ClipboardList, path: '/inspector/all' },
  { key: 'profile', label: 'Perfil', icon: User, path: '/inspector/profile' },
];

export default function InspectorBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey = (() => {
    if (location.pathname === '/inspector/past') return 'past';
    if (location.pathname === '/inspector/all') return 'inspections';
    if (location.pathname === '/inspector/profile') return 'profile';
    if (location.pathname === '/inspector') return 'upcoming';
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

import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { MessageSquare, Columns3, BarChart3, Settings, CalendarClock, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: MessageSquare, label: 'Inbox' },
  { to: '/kanban', icon: Columns3, label: 'Funil' },
  { to: '/followup', icon: CalendarClock, label: 'Follow' },
  { to: '/broadcast', icon: Send, label: 'Disparo' },
  { to: '/dashboard', icon: BarChart3, label: 'Dash' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card/95 border-t border-border/40 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-1 h-[60px]">
        {navItems.map((item) => (
          <RouterNavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full py-2 transition-all duration-200 active:scale-90 select-none',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  'flex items-center justify-center w-10 h-[26px] rounded-full transition-all duration-200',
                  isActive && 'bg-primary/15'
                )}>
                  <item.icon size={isActive ? 21 : 20} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={cn(
                  'text-[10px] leading-none tracking-tight',
                  isActive ? 'font-bold text-primary' : 'font-medium'
                )}>{item.label}</span>
              </>
            )}
          </RouterNavLink>
        ))}
      </div>
    </nav>
  );
}

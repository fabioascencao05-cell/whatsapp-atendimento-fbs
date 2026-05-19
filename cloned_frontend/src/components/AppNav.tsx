import { NavLink as RouterNavLink } from 'react-router-dom';
import { MessageSquare, Columns3, BarChart3, Settings, CalendarClock, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLogo } from '@/contexts/LogoContext';

const navItems = [
  { to: '/', icon: MessageSquare, label: 'Inbox' },
  { to: '/kanban', icon: Columns3, label: 'Pipeline' },
  { to: '/followup', icon: CalendarClock, label: 'Follow' },
  { to: '/broadcast', icon: Send, label: 'Disparo' },
  { to: '/dashboard', icon: BarChart3, label: 'Dash' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

export function AppNav() {
  const { logoUrl } = useLogo();

  return (
    <nav className="flex flex-col items-center w-[60px] bg-nav py-4 gap-1 shrink-0 border-r border-white/10">
      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-6 overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-extrabold text-[11px] tracking-tight">FBS</span>
        )}
      </div>
      {navItems.map((item) => (
        <RouterNavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200',
              isActive
                ? 'bg-white/15 text-white'
                : 'text-white/55 hover:bg-white/10 hover:text-white/80'
            )
          }
        >
          <item.icon size={19} strokeWidth={1.8} />
          <span className="text-[8px] font-semibold leading-tight">{item.label}</span>
        </RouterNavLink>
      ))}
    </nav>
  );
}

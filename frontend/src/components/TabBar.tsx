import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Layers, BarChart3, BookOpen } from 'lucide-react';

const TABS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/cards', icon: Layers, label: 'Cards' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/guides', icon: BookOpen, label: 'Guides' },
] as const;

export default function TabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(14,16,23,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around h-[60px]">
        {TABS.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className="relative flex flex-col items-center justify-center flex-1 gap-1 no-underline min-w-0"
              style={{ color: active ? '#5ea4f7' : '#6b7289' }}
            >
              {/* Active indicator pill */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="tab-active-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      width: 32,
                      height: 3,
                      background: '#5ea4f7',
                      borderRadius: '0 0 4px 4px',
                    }}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </AnimatePresence>

              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.7}
                aria-hidden="true"
              />
              <span
                className="text-[11px] font-semibold leading-none tracking-wide"
                style={{ color: active ? '#5ea4f7' : '#6b7289' }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

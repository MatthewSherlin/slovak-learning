import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, History, BarChart3, BookOpen, Trophy, Sun, Moon } from 'lucide-react';
import { useUser } from './UserPicker';
import { useTheme } from './ThemeProvider';

const links = [
  { to: '/', icon: Home, label: 'Practice' },
  { to: '/guides', icon: BookOpen, label: 'Guides' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/dashboard', icon: BarChart3, label: 'Stats' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
];

interface NavbarProps {
  onUserClick: () => void;
}

export default function Navbar({ onUserClick }: NavbarProps) {
  const location = useLocation();
  const { user } = useUser();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border-subtle pt-[env(safe-area-inset-top)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline group">
          <motion.div
            whileHover={{ rotate: 8 }}
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-sky-400 flex items-center justify-center shadow-lg shadow-accent/20"
          >
            <svg width="15" height="15" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="14.25" y="2" width="3.5" height="28" rx="1" fill="white"/>
              <rect x="10" y="7" width="12" height="3.2" rx="1" fill="white"/>
              <rect x="8" y="14" width="16" height="3.2" rx="1" fill="white"/>
            </svg>
          </motion.div>
          <span className="text-text-primary font-semibold text-[15px] tracking-tight group-hover:text-accent transition-colors duration-200">
            SlovakPrep
          </span>
        </Link>

        <div className="flex items-center gap-0.5">
          {links.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-[13px] font-medium no-underline transition-all duration-200 ${
                  active
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border-none text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-all duration-200"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ scale: 0, rotate: -90, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </motion.span>
            </AnimatePresence>
          </button>

          {/* User Avatar */}
          <button
            onClick={onUserClick}
            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white cursor-pointer border-none transition-transform hover:scale-110"
            style={{
              background: user
                ? `linear-gradient(135deg, ${user.color}, ${user.color}88)`
                : 'var(--color-surface-3)',
            }}
            title={user ? `Signed in as ${user.name}` : 'Pick user'}
          >
            {user ? user.avatar : '?'}
          </button>
        </div>
      </div>
    </nav>
  );
}

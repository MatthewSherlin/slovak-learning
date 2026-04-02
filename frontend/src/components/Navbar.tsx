import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, History, BarChart3, BookOpen, Trophy, Languages } from 'lucide-react';
import { useUser } from './UserPicker';

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border-subtle">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline group">
          <motion.div
            whileHover={{ rotate: 8 }}
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-sky-400 flex items-center justify-center shadow-lg shadow-accent/20"
          >
            <Languages size={15} className="text-white" />
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium no-underline transition-all duration-200 ${
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

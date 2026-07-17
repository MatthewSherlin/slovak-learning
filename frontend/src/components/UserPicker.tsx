import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X, WifiOff, RefreshCw } from 'lucide-react';
import type { User } from '../lib/types';
import { getUsers } from '../lib/api';

const STORAGE_KEY = 'slovak-learning-user';

interface UserContextValue {
  user: User | null;
  setUser: (u: User | null) => void;
  users: User[];
  refreshUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  setUser: () => {},
  users: [],
  refreshUsers: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as User;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [users, setUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(async () => {
    try {
      const fetched = await getUsers();
      setUsers(fetched);
    } catch {
      // Silently fail — keep existing list
    }
  }, []);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => {
      // Leave users empty — UserPicker will show "Server unreachable" state
      setUsers([]);
    });
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, users, refreshUsers }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

interface UserPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (user: User) => void;
}

export default function UserPicker({ open, onClose, onSelect }: UserPickerProps) {
  const { users, refreshUsers } = useUser();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const handleRetry = async () => {
    setLoading(true);
    try {
      await refreshUsers();
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const serverUnreachable = users.length === 0;

  return (
    <AnimatePresence onExitComplete={() => setMounted(false)}>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-surface border border-border rounded-2xl max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight">
                  Who's learning today?
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  Pick your profile to track progress
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-text-faint hover:text-text-primary hover:bg-surface-2 bg-transparent border-none cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 pb-6">
              {serverUnreachable ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 py-10 text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center">
                    <WifiOff size={22} className="text-text-faint" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary mb-1">Server unreachable</p>
                    <p className="text-xs text-text-muted">Could not load user profiles. Check your connection.</p>
                  </div>
                  <button
                    onClick={handleRetry}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Retrying…' : 'Retry'}
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {users.map((u, i) => (
                    <motion.button
                      key={u.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onSelect(u)}
                      className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-border bg-surface-2 hover:border-border-focus cursor-pointer transition-all duration-200"
                      style={{ '--glow-color': u.color } as React.CSSProperties}
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${u.color}, ${u.color}88)` }}
                      >
                        {u.avatar}
                      </div>
                      <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                        {u.name}
                        {u.has_pin && <Lock size={12} className="text-text-muted" />}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { User } from '../lib/types';

const USERS: User[] = [
  { id: 'matt', name: 'Matt', avatar: 'M', color: '#5ea4f7' },
  { id: 'zuki', name: 'Zuki', avatar: 'Z', color: '#f0a8d0' },
];

const STORAGE_KEY = 'slovak-learning-user';

export function useUser() {
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

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return { user, setUser, users: USERS };
}

interface UserPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (user: User) => void;
}

export default function UserPicker({ open, onClose, onSelect }: UserPickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  if (!mounted) return null;

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
            className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
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

            <div className="grid grid-cols-2 gap-4">
              {USERS.map((u, i) => (
                <motion.button
                  key={u.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(u)}
                  className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-surface-2 hover:border-border-focus cursor-pointer transition-all duration-200"
                  style={{ '--glow-color': u.color } as React.CSSProperties}
                >
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${u.color}, ${u.color}88)` }}
                  >
                    {u.avatar}
                  </div>
                  <span className="text-lg font-semibold text-text-primary">{u.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

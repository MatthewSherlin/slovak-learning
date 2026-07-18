import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Shield, X, Check, AlertCircle, Sun, Moon } from 'lucide-react';
import { useUser } from './UserPicker';
import { useTheme } from './ThemeProvider';
import { setPin, verifyPin, removePin } from '../lib/api';
import PinInput from './PinInput';

type PinView = 'idle' | 'set' | 'change-verify' | 'change-new' | 'remove-verify';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Toast notification ───────────────────────────────────────────────

function ToastMessage({ toast }: { toast: Toast }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
        toast.type === 'success'
          ? 'bg-success-muted text-success'
          : 'bg-danger-muted text-danger'
      }`}
    >
      {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      {toast.message}
    </motion.div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { user, setUser, refreshUsers } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<PinView>('idle');
  const [pin, setPin_] = useState('');
  const [newPin, setNewPin] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setView('idle');
      setPin_('');
      setNewPin('');
      setToast(null);
    }
  }, [open]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  if (!user) return null;
  if (!mounted) return null;

  const hasPin = user.has_pin;

  const handleSetPin = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      await setPin(user.id, pin);
      await refreshUsers();
      // Update context object so UI reflects the new pin state immediately
      setUser({ ...user, has_pin: true });
      showToast('PIN set successfully', 'success');
      setView('idle');
      setPin_('');
    } catch {
      showToast('Failed to set PIN', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyForChange = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      const valid = await verifyPin(user.id, pin);
      if (valid) {
        setView('change-new');
        setPin_('');
      } else {
        triggerShake();
        setPin_('');
        showToast('Incorrect PIN', 'error');
      }
    } catch {
      showToast('Verification failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin.length !== 4) return;
    setLoading(true);
    try {
      await setPin(user.id, newPin);
      await refreshUsers();
      showToast('PIN changed successfully', 'success');
      setView('idle');
      setNewPin('');
    } catch {
      showToast('Failed to change PIN', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyForRemove = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      await removePin(user.id, pin);
      await refreshUsers();
      // Update context object so UI reflects the removed pin state immediately
      setUser({ ...user, has_pin: false });
      showToast('PIN removed', 'success');
      setView('idle');
      setPin_('');
    } catch {
      triggerShake();
      setPin_('');
      showToast('Incorrect PIN', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = () => {
    switch (view) {
      case 'set':
        return handleSetPin();
      case 'change-verify':
        return handleVerifyForChange();
      case 'change-new':
        return handleChangePin();
      case 'remove-verify':
        return handleVerifyForRemove();
    }
  };

  const actionLabel = () => {
    switch (view) {
      case 'set': return 'Set PIN';
      case 'change-verify': return 'Verify';
      case 'change-new': return 'Save New PIN';
      case 'remove-verify': return 'Remove PIN';
      default: return '';
    }
  };

  const pinValue = view === 'change-new' ? newPin : pin;
  const pinReady = view === 'change-new' ? newPin.length === 4 : pin.length === 4;

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
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight">
                  Settings
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  Manage your account
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-text-faint hover:text-text-primary hover:bg-surface-2 bg-transparent border-none cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Toast */}
            <AnimatePresence>
              {toast && (
                <div className="mb-4">
                  <ToastMessage toast={toast} />
                </div>
              )}
            </AnimatePresence>

            {/* Theme Section */}
            <div className="rounded-xl border border-border bg-surface-2 p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center">
                    {theme === 'dark' ? (
                      <Moon size={18} className="text-accent" />
                    ) : (
                      <Sun size={18} className="text-accent" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Appearance</h3>
                    <p className="text-xs text-text-muted">
                      {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="relative w-12 h-6 rounded-full transition-colors border-none cursor-pointer"
                  style={{
                    background: theme === 'light' ? 'var(--color-accent)' : 'var(--color-surface-3)',
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{
                      left: theme === 'light' ? '26px' : '2px',
                    }}
                  />
                </button>
              </div>
            </div>

            {/* PIN Section */}
            <div className="rounded-xl border border-border bg-surface-2 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center">
                  <Shield size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">PIN Protection</h3>
                  <p className="text-xs text-text-muted">
                    {hasPin ? 'Your account is PIN-protected' : 'Add a PIN to protect your account'}
                  </p>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {view === 'idle' ? (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-2"
                  >
                    {!hasPin ? (
                      <button
                        onClick={() => { setView('set'); setPin_(''); }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors"
                      >
                        <Lock size={15} />
                        Set a PIN
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setView('change-verify'); setPin_(''); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-3 text-text-primary text-sm font-medium border-none cursor-pointer hover:bg-surface-hover transition-colors"
                        >
                          Change PIN
                        </button>
                        <button
                          onClick={() => { setView('remove-verify'); setPin_(''); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-danger-muted text-danger text-sm font-medium border-none cursor-pointer hover:bg-danger/20 transition-colors"
                        >
                          Remove PIN
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-sm text-text-secondary text-center">
                      {view === 'set' && 'Enter a 4-digit PIN'}
                      {view === 'change-verify' && 'Enter your current PIN'}
                      {view === 'change-new' && 'Enter your new PIN'}
                      {view === 'remove-verify' && 'Enter your PIN to confirm removal'}
                    </p>

                    <PinInput
                      value={pinValue}
                      onChange={view === 'change-new' ? setNewPin : setPin_}
                      disabled={loading}
                      shake={shake}
                      autoFocus
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setView('idle'); setPin_(''); setNewPin(''); }}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-surface-3 text-text-secondary text-sm font-medium border-none cursor-pointer hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAction}
                        disabled={!pinReady || loading}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Working...' : actionLabel()}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

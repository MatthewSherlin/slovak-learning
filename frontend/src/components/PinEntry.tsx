import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import type { User } from '../lib/types';
import { verifyPin } from '../lib/api';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

interface PinEntryProps {
  user: User;
  onSuccess: () => void;
  onCancel: () => void;
}

// ── 4-digit PIN input (same pattern as SettingsModal) ────────────────

function PinInput({
  value,
  onChange,
  disabled,
  shake,
  autoFocus,
}: {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  shake?: boolean;
  autoFocus?: boolean;
}) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const digits = value.padEnd(4, ' ');

  useEffect(() => {
    if (autoFocus) refs[0].current?.focus();
  }, [autoFocus]);

  const setDigit = (index: number, digit: string) => {
    const arr = [...digits];
    arr[index] = digit || ' ';
    const next = arr.join('').replace(/ /g, '');
    onChange(next);
    if (digit && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]?.trim()) {
        setDigit(index, '');
      } else if (index > 0) {
        refs[index - 1].current?.focus();
        setDigit(index - 1, '');
      }
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      setDigit(index, e.key);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted) {
      onChange(pasted);
      const focusIndex = Math.min(pasted.length, 3);
      refs[focusIndex].current?.focus();
    }
  };

  return (
    <motion.div
      animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="flex gap-3 justify-center"
    >
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={refs[i]}
          type="password"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={digits[i]?.trim() ? '\u2022' : ''}
          onChange={() => {/* Handled by onKeyDown */}}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="w-12 h-14 rounded-xl border-2 border-border bg-surface-2 text-center text-xl font-bold text-text-primary focus:border-accent focus:outline-none transition-colors disabled:opacity-50 appearance-none"
          style={{ caretColor: 'transparent' }}
        />
      ))}
    </motion.div>
  );
}

// ── PIN entry modal ──────────────────────────────────────────────────

export default function PinEntry({ user, onSuccess, onCancel }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const locked = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer during lockout
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setLockCountdown(0);
        setAttempts(0);
        setError('');
      } else {
        setLockCountdown(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const handleSubmit = async () => {
    if (pin.length !== 4 || loading || locked) return;

    setLoading(true);
    setError('');
    try {
      const valid = await verifyPin(user.id, pin);
      if (valid) {
        onSuccess();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        triggerShake();
        setPin('');

        if (newAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s`);
        } else {
          setError(`Incorrect PIN (${MAX_ATTEMPTS - newAttempts} attempts left)`);
        }
      }
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && !loading && !locked) {
      handleSubmit();
    }
  }, [pin]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${user.color}, ${user.color}88)` }}
          >
            {user.avatar}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Enter PIN for {user.name}
            </h2>
            <p className="text-sm text-text-muted mt-1 flex items-center justify-center gap-1.5">
              <Lock size={13} />
              This account is PIN-protected
            </p>
          </div>
        </div>

        {/* PIN boxes */}
        <div className="mb-4">
          <PinInput
            value={pin}
            onChange={setPin}
            disabled={loading || locked}
            shake={shake}
            autoFocus
          />
        </div>

        {/* Error / lockout message */}
        <AnimatePresence>
          {(error || locked) && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-sm text-danger text-center mb-4"
            >
              {locked ? `Locked out. Try again in ${lockCountdown}s` : error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-2 text-text-secondary text-sm font-medium border-none cursor-pointer hover:bg-surface-3 transition-colors"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

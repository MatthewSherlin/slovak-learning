import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PinInputProps {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: () => void;
  disabled?: boolean;
  shake?: boolean;
  autoFocus?: boolean;
}

/**
 * Shared 4-digit PIN input component.
 * Uses four individually named refs (ref0–ref3) to avoid the Rules-of-Hooks
 * violation that occurs when useRef is called inside an array literal.
 */
export default function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  shake,
  autoFocus,
}: PinInputProps) {
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3];

  // Pad value to 4 chars for safe indexing
  const digits = value.padEnd(4, ' ');

  useEffect(() => {
    if (autoFocus) refs[0].current?.focus();
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDigit = (index: number, digit: string) => {
    const arr = [...digits];
    arr[index] = digit || ' ';
    const next = arr.join('').replace(/ /g, '');
    onChange(next);
    if (digit && index < 3) {
      refs[index + 1].current?.focus();
    }
    // Fire onComplete when all 4 digits are filled
    if (digit && next.replace(/ /g, '').length === 4) {
      onComplete?.();
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
      if (pasted.length === 4) {
        onComplete?.();
      }
    }
  };

  return (
    <motion.div
      animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="flex gap-3 justify-center"
    >
      {([ref0, ref1, ref2, ref3] as React.RefObject<HTMLInputElement | null>[]).map((ref, i) => (
        <input
          key={i}
          ref={ref}
          type="password"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={digits[i]?.trim() ? '•' : ''}
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

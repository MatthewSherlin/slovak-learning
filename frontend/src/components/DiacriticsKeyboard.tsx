import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

const LOWER = ['š', 'č', 'ž', 'ť', 'ď', 'ň', 'ľ', 'á', 'é', 'í', 'ó', 'ú', 'ý', 'ô', 'ä'];
const UPPER = LOWER.map((c) => c.toUpperCase());

interface DiacriticsKeyboardProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}

export default function DiacriticsKeyboard({ inputRef, value, onChange }: DiacriticsKeyboardProps) {
  const [upper, setUpper] = useState(false);
  const chars = upper ? UPPER : LOWER;

  const insert = useCallback(
    (ch: string) => {
      const el = inputRef.current;
      if (!el) {
        onChange(value + ch);
        return;
      }

      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      const next = value.slice(0, start) + ch + value.slice(end);
      onChange(next);

      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + ch.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [inputRef, value, onChange],
  );

  return (
    <>
      {/* Mobile: compact single-row scrollable strip */}
      <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto flex-nowrap pb-1">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setUpper((u) => !u)}
          className={`shrink-0 px-2 py-1 rounded-md text-xs font-semibold border cursor-pointer transition-colors select-none ${
            upper
              ? 'bg-accent/15 border-accent/30 text-accent'
              : 'bg-surface-3 border-border-subtle text-text-faint hover:text-text-muted'
          }`}
          title="Toggle uppercase"
        >
          ⇧
        </button>

        {chars.map((ch) => (
          <motion.button
            key={ch}
            whileTap={{ scale: 0.88 }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(ch)}
            className="shrink-0 min-w-[26px] h-[28px] rounded-md bg-surface-3 border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border text-xs font-medium cursor-pointer transition-colors select-none"
          >
            {ch}
          </motion.button>
        ))}
      </div>

      {/* Desktop: multi-row wrapped layout */}
      <div className="hidden md:flex items-center gap-1.5 flex-wrap mt-2">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setUpper((u) => !u)}
          className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors select-none ${
            upper
              ? 'bg-accent/15 border-accent/30 text-accent'
              : 'bg-surface-3 border-border-subtle text-text-faint hover:text-text-muted'
          }`}
          title="Toggle uppercase"
        >
          ⇧
        </button>

        {chars.map((ch) => (
          <motion.button
            key={ch}
            whileTap={{ scale: 0.88 }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(ch)}
            className="min-w-[28px] h-[30px] rounded-lg bg-surface-3 border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border text-[13px] font-medium cursor-pointer transition-colors select-none"
          >
            {ch}
          </motion.button>
        ))}
      </div>
    </>
  );
}

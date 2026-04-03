import { motion } from 'framer-motion';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  color?: string;
}

export default function ProgressBar({ current, total, label = 'Question', color = 'bg-accent' }: ProgressBarProps) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-text-secondary">
          {label} {Math.min(current + 1, total)} of {total}
        </span>
        <span className="text-[11px] text-text-faint tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="w-full bg-surface-3 rounded-full h-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`h-1.5 rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { BookText, Puzzle, MessageCircle, Languages } from 'lucide-react';
import type { LearningMode } from '../lib/types';

interface ModeCardProps {
  mode: LearningMode;
  label: string;
  description: string;
  questionCount: number;
  onClick: () => void;
  index: number;
}

const icons: Record<LearningMode, typeof BookText> = {
  vocab: BookText,
  grammar: Puzzle,
  conversation: MessageCircle,
  translation: Languages,
};

const styles: Record<LearningMode, { gradient: string; iconBg: string; iconColor: string; borderHover: string }> = {
  vocab: {
    gradient: 'from-emerald-500/8 via-transparent to-teal-500/5',
    iconBg: 'bg-emerald-500/12',
    iconColor: 'text-mode-vocab',
    borderHover: 'hover:border-emerald-500/30',
  },
  grammar: {
    gradient: 'from-violet-500/8 via-transparent to-purple-500/5',
    iconBg: 'bg-violet-500/12',
    iconColor: 'text-mode-grammar',
    borderHover: 'hover:border-violet-500/30',
  },
  conversation: {
    gradient: 'from-amber-500/8 via-transparent to-orange-500/5',
    iconBg: 'bg-amber-500/12',
    iconColor: 'text-mode-conversation',
    borderHover: 'hover:border-amber-500/30',
  },
  translation: {
    gradient: 'from-pink-500/8 via-transparent to-rose-500/5',
    iconBg: 'bg-pink-500/12',
    iconColor: 'text-mode-translation',
    borderHover: 'hover:border-pink-500/30',
  },
};

export default function ModeCard({ mode, label, description, questionCount, onClick, index }: ModeCardProps) {
  const Icon = icons[mode];
  const style = styles[mode];

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onClick}
      className={`group relative w-full text-left p-6 rounded-2xl border border-border bg-gradient-to-br ${style.gradient} bg-surface transition-all duration-300 ${style.borderHover} hover:shadow-lg hover:shadow-black/20 cursor-pointer`}
    >
      {/* Icon */}
      <div className={`${style.iconBg} ${style.iconColor} w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}>
        <Icon size={20} strokeWidth={1.8} />
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-text-primary mb-1.5 tracking-tight">
        {label}
      </h3>
      <p className="text-[13px] text-text-muted leading-relaxed mb-4">
        {description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-faint">
          {questionCount} questions
        </span>
        <span className={`text-xs font-medium ${style.iconColor} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
          Start learning &rarr;
        </span>
      </div>
    </motion.button>
  );
}

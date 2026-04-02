import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { User, GraduationCap, Lightbulb } from 'lucide-react';
import type { Message } from '../lib/types';

interface ChatMessageProps {
  message: Message;
  index: number;
}

export default function ChatMessage({ message, index }: ChatMessageProps) {
  const isTutor = message.role === 'tutor';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex justify-center my-4"
      >
        <div className="flex items-start gap-2.5 bg-warning-muted border border-warning/15 rounded-xl px-4 py-3 max-w-2xl">
          <Lightbulb size={15} className="text-warning shrink-0 mt-0.5" />
          <div className="text-[13px] text-text-secondary markdown-content leading-relaxed">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      </motion.div>
    );
  }

  void index;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className={`flex gap-3 my-5 ${isTutor ? '' : 'flex-row-reverse'}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-1 ${
          isTutor
            ? 'bg-accent-muted text-accent'
            : 'bg-emerald-500/12 text-mode-vocab'
        }`}
      >
        {isTutor ? <GraduationCap size={15} /> : <User size={15} />}
      </div>

      {/* Message */}
      <div
        className={`flex-1 max-w-[80%] rounded-2xl px-5 py-4 ${
          isTutor
            ? 'bg-surface-2 border border-border-subtle'
            : 'bg-accent-muted border border-accent/10'
        }`}
      >
        {/* Role label */}
        <div className={`text-[11px] font-medium mb-2 ${
          isTutor ? 'text-text-faint' : 'text-accent/60'
        }`}>
          {isTutor ? 'Tutor' : 'You'}
        </div>
        <div className="text-[13.5px] leading-relaxed markdown-content">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}

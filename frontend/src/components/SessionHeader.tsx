import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session } from '../lib/types';

interface SessionHeaderProps {
  session: Session;
  onEnd: () => void;
  ending: boolean;
  canEnd?: boolean;
  children?: React.ReactNode;
}

export default function SessionHeader({ session, onEnd, ending, canEnd = true, children }: SessionHeaderProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);
  const topicDisplay = session.focus_areas?.length
    ? session.focus_areas.join(', ')
    : session.topic.replace(/_/g, ' ');

  return (
    <div className="border-b border-border-subtle glass px-6 py-2.5 relative">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Back button — opens inline confirm popover instead of window.confirm */}
          <div className="relative">
            <button
              onClick={() => setConfirmOpen(true)}
              className="text-text-faint hover:text-text-primary bg-transparent border-none cursor-pointer p-1 transition-colors"
              title="Leave session"
            >
              <ArrowLeft size={16} />
            </button>

            <AnimatePresence>
              {confirmOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute top-full left-0 mt-2 z-50 bg-surface border border-border rounded-xl shadow-xl p-4 w-56"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[13px] font-semibold text-text-primary mb-1">Leave this session?</p>
                  <p className="text-[11px] text-text-muted mb-3">Progress will be saved.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmOpen(false)}
                      className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-text-secondary text-[12px] font-medium border-none cursor-pointer hover:bg-surface-3 transition-colors"
                    >
                      Stay
                    </button>
                    <button
                      onClick={() => navigate('/')}
                      className="flex-1 px-3 py-2 rounded-lg bg-danger-muted text-danger text-[12px] font-medium border-none cursor-pointer hover:bg-danger/20 transition-colors"
                    >
                      Leave
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text-primary">{modeLabel}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-3 text-text-faint capitalize font-medium">
                {session.difficulty}
              </span>
            </div>
            <div className="text-[11px] text-text-faint mt-0.5">
              {topicDisplay}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {children}
          {!ending && (
            <button
              onClick={onEnd}
              disabled={!canEnd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary border border-border hover:bg-danger-muted hover:text-danger hover:border-danger/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Square size={10} />
              End & Get Feedback
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

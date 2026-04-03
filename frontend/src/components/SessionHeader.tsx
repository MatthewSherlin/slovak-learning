import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Square } from 'lucide-react';
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
  const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);

  return (
    <div className="border-b border-border-subtle glass px-6 py-2.5">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-text-faint hover:text-text-primary bg-transparent border-none cursor-pointer p-1 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text-primary">{modeLabel}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-3 text-text-faint capitalize font-medium">
                {session.difficulty}
              </span>
            </div>
            <div className="text-[11px] text-text-faint mt-0.5">
              {session.topic.replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {children}
          <button
            onClick={onEnd}
            disabled={ending || !canEnd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary border border-border hover:bg-danger-muted hover:text-danger hover:border-danger/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Square size={10} />
            End & Get Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

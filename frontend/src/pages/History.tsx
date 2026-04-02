import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Trash2, ArrowRight, History as HistoryIcon } from 'lucide-react';
import ScoreBadge from '../components/ScoreBadge';
import LoadingDots from '../components/LoadingDots';
import { useUser } from '../components/UserPicker';
import { listSessions, deleteSession } from '../lib/api';
import type { SessionSummary } from '../lib/types';

const modeColors: Record<string, string> = {
  vocabulary: 'text-mode-vocab',
  grammar: 'text-mode-grammar',
  conversation: 'text-mode-conversation',
  translation: 'text-mode-translation',
};

export default function History() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      listSessions(user.id)
        .then(setSessions)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session?')) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingDots text="Loading history" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 pt-22 pb-16">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-2">
          <HistoryIcon size={20} className="text-accent" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">History</h1>
        </div>
        <p className="text-text-muted text-sm mb-8">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
          {user && <span className="ml-1">for {user.name}</span>}
        </p>
      </motion.div>

      {sessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <Clock size={24} className="text-text-faint" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No sessions yet</h3>
          <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
            Start your first practice session -- it only takes a few minutes.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-medium bg-gradient-to-r from-accent to-sky-400 text-white cursor-pointer border-none shadow-md shadow-accent/20"
          >
            Start Learning
            <ArrowRight size={14} />
          </motion.button>
        </motion.div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((session, i) => {
            const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);
            const timeAgo = getTimeAgo(new Date(session.created_at));
            const color = modeColors[session.mode] || 'text-accent';

            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/session/${session.id}`)}
                className="group flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:border-border-focus cursor-pointer transition-all duration-200"
              >
                {session.overall_score !== null ? (
                  <ScoreBadge score={session.overall_score} size="sm" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-[11px] text-text-faint font-medium">
                    --
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[13px] font-medium ${color}`}>{modeLabel}</span>
                    <span className="text-[11px] text-text-faint">&middot;</span>
                    <span className="text-[11px] text-text-faint">
                      {session.topic.replace(/_/g, ' ')}
                    </span>
                    {!session.completed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-warning-muted text-warning border border-warning/15 font-medium">
                        In Progress
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-text-muted truncate">
                    {session.question_preview}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-text-faint">{timeAgo}</span>
                  <button
                    onClick={(e) => handleDelete(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-danger-muted cursor-pointer bg-transparent border-none transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

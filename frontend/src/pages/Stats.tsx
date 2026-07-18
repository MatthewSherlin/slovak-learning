import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Trophy,
  Target,
  ArrowRight,
  BookText,
  Clock,
  Trash2,
  Zap,
  Crown,
  Flame,
  ChevronDown,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import ScoreBadge from '../components/ScoreBadge';
import LoadingDots from '../components/LoadingDots';
import { useUser } from '../components/UserPicker';
import { getDashboard, getLeaderboard, listSessions, deleteSession } from '../lib/api';
import type { DashboardStats, LeaderboardEntry, SessionSummary } from '../lib/types';

// ── Types ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'history' | 'friends';

function resolveTab(raw: string | null): Tab {
  if (raw === 'history') return 'history';
  if (raw === 'friends' || raw === 'leaderboard') return 'friends';
  return 'overview';
}

// ── Shared constants ─────────────────────────────────────────────────

const modeLabels: Record<string, { label: string; color: string; barColor: string }> = {
  vocabulary: { label: 'Vocabulary', color: 'text-success', barColor: '#5de4a5' },
  grammar: { label: 'Grammar', color: 'text-mode-grammar', barColor: '#a78bfa' },
  conversation: { label: 'Conversation', color: 'text-warning', barColor: '#f5c45e' },
  translation: { label: 'Translation', color: 'text-mode-translation', barColor: '#f0a8d0' },
};

const modeTextColors: Record<string, string> = {
  vocabulary: 'text-mode-vocab',
  grammar: 'text-mode-grammar',
  conversation: 'text-mode-conversation',
  translation: 'text-mode-translation',
};

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

// ── Error / Retry UI ─────────────────────────────────────────────────

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-16"
    >
      <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
        <AlertCircle size={22} className="text-danger" />
      </div>
      <p className="text-text-muted text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium bg-surface border border-border hover:border-accent/50 text-text-primary cursor-pointer transition-colors"
        aria-label="Retry"
      >
        <RefreshCw size={13} />
        Retry
      </button>
    </motion.div>
  );
}

// ── Segmented Tab Bar ────────────────────────────────────────────────

function TabSegments({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'History' },
    { id: 'friends', label: 'Friends' },
  ];

  return (
    <div
      className="flex rounded-[14px] p-1 gap-1 mb-6"
      style={{ background: '#151926' }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-label={t.label}
          className={`flex-1 text-center py-[9px] rounded-[11px] text-[13px] font-medium cursor-pointer border-none transition-all ${
            active === t.id
              ? 'bg-accent text-white font-bold'
              : 'bg-transparent text-text-faint hover:text-text-muted'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Overview Panel ───────────────────────────────────────────────────

function OverviewPanel() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    Promise.all([getDashboard(user.id), getLeaderboard()])
      .then(([dashData, lbData]) => {
        setStats(dashData);
        setLeaderboard(lbData);
      })
      .catch(() => {
        setError("Couldn't load your overview. Check your connection.");
      })
      .finally(() => setLoading(false));
  }, [user, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingDots text="Loading stats" />
      </div>
    );
  }

  if (error) {
    return <ErrorRetry message={error} onRetry={() => setRetryKey((k) => k + 1)} />;
  }

  if (!stats || stats.total_sessions === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <BarChart3 size={24} className="text-text-faint" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">No data yet</h2>
        <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
          Complete a few sessions to see your performance trends and insights.
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
    );
  }

  // XP race — sort by XP descending
  const sortedLb = [...leaderboard].sort((a, b) => b.xp - a.xp);
  const maxXP = Math.max(...sortedLb.map((e) => e.xp), 1);

  // Stat card values from current user's leaderboard entry + dashboard
  const userLbEntry = leaderboard.find((e) => e.user_id === user?.id);
  const streakDays = userLbEntry?.streak_days ?? 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* XP Race */}
      {sortedLb.length > 0 && (
        <div
          className="rounded-[22px] p-[18px] mb-4"
          style={{
            background: 'linear-gradient(120deg, rgba(245,196,94,0.1), transparent 60%), #151926',
            border: '1px solid rgba(245,196,94,0.18)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-[12px] font-bold uppercase tracking-[0.08em]"
              style={{ color: '#f5c45e' }}
            >
              XP race
            </span>
            <span className="text-[11px] text-text-faint">this month</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {sortedLb.map((entry) => (
              <div key={entry.user_id} className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-[10px] flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                  style={{ background: entry.color }}
                >
                  {entry.avatar}
                </div>
                <div
                  className="flex-1 h-3 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(entry.xp / maxXP) * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-3 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${entry.color}, ${entry.color}cc)`,
                    }}
                  />
                </div>
                <span className="text-[12px] font-extrabold tabular-nums w-10 text-right text-text-primary">
                  {entry.xp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          {
            label: 'Day streak',
            value: streakDays.toString(),
            unit: 'days',
            valueColor: '#f5c45e',
          },
          {
            label: 'Avg score',
            value: stats.avg_score !== null ? stats.avg_score.toFixed(1) : '--',
            unit: '/10',
            valueColor: '#5ea4f7',
          },
          {
            label: 'Words learned',
            value: stats.vocab_count.toString(),
            unit: null,
            valueColor: '#5de4a5',
          },
          {
            label: 'Sessions',
            value: stats.completed_sessions.toString(),
            unit: 'done',
            valueColor: '#eef1f8',
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[18px] p-4"
            style={{ background: '#151926', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[11px] font-semibold text-text-faint mb-1.5">{card.label}</p>
            <div className="flex items-baseline gap-1">
              <span
                className="text-[26px] font-extrabold tabular-nums"
                style={{ color: card.valueColor }}
              >
                {card.value}
              </span>
              {card.unit && (
                <span className="text-[12px] text-text-faint">{card.unit}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* By category */}
      {Object.keys(stats.scores_by_mode).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[22px] p-5"
          style={{ background: '#151926', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h3 className="text-[14px] font-bold text-text-primary mb-4">By category</h3>
          <div className="flex flex-col gap-3.5">
            {Object.entries(stats.scores_by_mode).map(([mode, score]) => {
              const info = modeLabels[mode] || { label: mode, barColor: '#5ea4f7', color: 'text-accent' };
              return (
                <div key={mode}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[13px] text-text-secondary">{info.label}</span>
                    <span
                      className="text-[13px] font-extrabold tabular-nums"
                      style={{ color: info.barColor }}
                    >
                      {score.toFixed(1)}
                    </span>
                  </div>
                  <div
                    className="h-[7px] rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score * 10}%` }}
                      transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                      className="h-[7px] rounded-full"
                      style={{ background: info.barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Recent sessions */}
      {stats.recent_sessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface border border-border rounded-2xl p-5 mt-4"
        >
          <h3 className="text-[13px] font-semibold text-text-primary mb-4">Recent</h3>
          <div className="space-y-2">
            {stats.recent_sessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/session/${s.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors"
              >
                {s.overall_score !== null ? (
                  <ScoreBadge score={s.overall_score} size="sm" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-[11px] text-text-faint">
                    --
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] text-text-primary font-medium">
                    {(modeLabels[s.mode] || { label: s.mode }).label}
                  </span>
                  <p className="text-[11px] text-text-faint truncate">{s.question_preview}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── History Panel ────────────────────────────────────────────────────

function HistoryPanel() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listSessions(user?.id)
      .then(setSessions)
      .catch(() => {
        setError("Couldn't load your session history. Check your connection.");
      })
      .finally(() => setLoading(false));
  }, [user, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteRequest = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeleteError(null);
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setDeleteError('Failed to delete session. Please try again.');
    }
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingDots text="Loading history" />
      </div>
    );
  }

  if (error) {
    return <ErrorRetry message={error} onRetry={() => setRetryKey((k) => k + 1)} />;
  }

  if (sessions.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <Clock size={24} className="text-text-faint" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">No sessions yet</h3>
        <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
          Start your first practice session — it only takes a few minutes.
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
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-text-faint text-[12px] mb-4">
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
        {user && <span className="ml-1">for {user.name}</span>}
      </p>

      {deleteError && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 mb-4 text-[13px] text-danger"
        >
          <AlertCircle size={14} />
          {deleteError}
        </motion.div>
      )}

      <div className="space-y-2.5">
        {sessions.map((session, i) => {
          const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);
          const timeAgo = getTimeAgo(new Date(session.created_at));
          const color = modeTextColors[session.mode] || 'text-accent';

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
                <p className="text-[12px] text-text-muted truncate">{session.question_preview}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-text-faint">{timeAgo}</span>
                {pendingDeleteId === session.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={handleDeleteConfirm}
                      aria-label="Confirm delete"
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-danger text-white border-none cursor-pointer transition-colors hover:bg-danger/80"
                    >
                      Delete
                    </button>
                    <button
                      onClick={handleDeleteCancel}
                      aria-label="Cancel delete"
                      className="px-2 py-1 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary border border-border cursor-pointer transition-colors hover:bg-surface-3"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => handleDeleteRequest(session.id, e)}
                    aria-label="Delete session"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-danger-muted cursor-pointer bg-transparent border-none transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Friends (Leaderboard + H2H) Panel ───────────────────────────────

function UserSelect({
  entries,
  value,
  onChange,
  excludeId,
}: {
  entries: LeaderboardEntry[];
  value: string | null;
  onChange: (id: string) => void;
  excludeId: string | null;
}) {
  const selected = entries.find((e) => e.user_id === value);

  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-surface-2 border border-border-subtle rounded-lg pl-3 pr-7 py-1.5 text-[13px] font-medium text-text-primary cursor-pointer hover:border-border focus:outline-none focus:ring-1 focus:ring-accent/50"
        style={selected ? { borderColor: `${selected.color}44` } : undefined}
      >
        {entries.map((entry) => (
          <option
            key={entry.user_id}
            value={entry.user_id}
            disabled={entry.user_id === excludeId}
          >
            {entry.avatar} {entry.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
      />
    </div>
  );
}

function ComparisonBar({
  label,
  leftName,
  leftValue,
  leftColor,
  rightName,
  rightValue,
  rightColor,
  max,
  delay,
  format,
}: {
  label: string;
  leftName: string;
  leftValue: number;
  leftColor: string;
  rightName: string;
  rightValue: number;
  rightColor: string;
  max: number;
  delay: number;
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => v.toString());

  return (
    <div>
      <div className="text-[12px] text-text-muted font-medium mb-2.5">{label}</div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-secondary font-medium w-12 shrink-0">{leftName}</span>
          <div className="flex-1 bg-surface-3 rounded-full h-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(leftValue / max) * 100}%` }}
              transition={{ delay, duration: 0.6, ease: 'easeOut' }}
              className="h-2.5 rounded-full"
              style={{ background: leftColor }}
            />
          </div>
          <span className="text-[12px] text-text-primary font-bold tabular-nums w-10 text-right">
            {fmt(leftValue)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-secondary font-medium w-12 shrink-0">{rightName}</span>
          <div className="flex-1 bg-surface-3 rounded-full h-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(rightValue / max) * 100}%` }}
              transition={{ delay: delay + 0.1, duration: 0.6, ease: 'easeOut' }}
              className="h-2.5 rounded-full"
              style={{ background: rightColor }}
            />
          </div>
          <span className="text-[12px] text-text-primary font-bold tabular-nums w-10 text-right">
            {fmt(rightValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FriendsPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftUserId, setLeftUserId] = useState<string | null>(null);
  const [rightUserId, setRightUserId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getLeaderboard()
      .then((data) => {
        setEntries(data);
        const sorted = [...data].sort((a, b) => b.xp - a.xp);
        if (sorted[0]) setLeftUserId(sorted[0].user_id);
        if (sorted[1]) setRightUserId(sorted[1].user_id);
      })
      .catch(() => {
        setError("Couldn't load the leaderboard. Check your connection.");
      })
      .finally(() => setLoading(false));
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  // Bug fix #22: when both pickers select the same user, clear the stale one
  const handleLeftChange = (id: string) => {
    setLeftUserId(id);
    if (id === rightUserId) {
      // Find a different user to put on the right
      const other = entries.find((e) => e.user_id !== id);
      setRightUserId(other ? other.user_id : null);
    }
  };

  const handleRightChange = (id: string) => {
    setRightUserId(id);
    if (id === leftUserId) {
      // Find a different user to put on the left
      const other = entries.find((e) => e.user_id !== id);
      setLeftUserId(other ? other.user_id : null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingDots text="Loading leaderboard" />
      </div>
    );
  }

  if (error) {
    return <ErrorRetry message={error} onRetry={() => setRetryKey((k) => k + 1)} />;
  }

  const sorted = [...entries].sort((a, b) => b.xp - a.xp);
  const leader = sorted[0];

  if (entries.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <Trophy size={24} className="text-text-faint" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">No data yet</h3>
        <p className="text-text-muted text-sm max-w-xs mx-auto">
          Complete some sessions to start the competition!
        </p>
      </motion.div>
    );
  }

  const maxXP = Math.max(...sorted.map((e) => e.xp), 1);
  const leftUser = entries.find((e) => e.user_id === leftUserId);
  const rightUser = entries.find((e) => e.user_id === rightUserId);
  const h2hMaxXP = leftUser && rightUser ? Math.max(leftUser.xp, rightUser.xp, 1) : 1;
  const h2hMaxVocab =
    leftUser && rightUser ? Math.max(leftUser.total_vocab, rightUser.total_vocab, 1) : 1;
  const h2hMaxSessions =
    leftUser && rightUser
      ? Math.max(leftUser.completed_sessions, rightUser.completed_sessions, 1)
      : 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Player cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {sorted.map((entry, i) => {
          const isLeader = entry === leader;
          return (
            <motion.div
              key={entry.user_id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.15, type: 'spring', damping: 20 }}
              className={`relative bg-surface border rounded-2xl p-6 ${
                isLeader ? 'border-warning/30 shadow-lg shadow-warning/10' : 'border-border'
              }`}
            >
              {isLeader && (
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.4, type: 'spring', damping: 12 }}
                  className="absolute -top-3 -right-2"
                >
                  <div className="w-8 h-8 rounded-full bg-warning-muted flex items-center justify-center border border-warning/20">
                    <Crown size={16} className="text-warning" />
                  </div>
                </motion.div>
              )}

              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${entry.color}, ${entry.color}88)` }}
                >
                  {entry.avatar}
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">{entry.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Zap size={13} className="text-warning" />
                    <span className="text-lg font-bold text-warning tabular-nums">{entry.xp} XP</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle">
                  <div className="flex items-center gap-1.5 text-text-faint mb-1">
                    <Flame size={12} />
                    <span className="text-[11px] font-medium">Streak</span>
                  </div>
                  <div className="text-lg font-bold text-text-primary tabular-nums">
                    {entry.streak_days} day{entry.streak_days !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle">
                  <div className="flex items-center gap-1.5 text-text-faint mb-1">
                    <BookText size={12} />
                    <span className="text-[11px] font-medium">Words</span>
                  </div>
                  <div className="text-lg font-bold text-mode-vocab tabular-nums">
                    {entry.total_vocab}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle">
                  <div className="flex items-center gap-1.5 text-text-faint mb-1">
                    <Target size={12} />
                    <span className="text-[11px] font-medium">Sessions</span>
                  </div>
                  <div className="text-lg font-bold text-text-primary tabular-nums">
                    {entry.completed_sessions}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle">
                  <div className="flex items-center gap-1.5 text-text-faint mb-1">
                    <BarChart3 size={12} />
                    <span className="text-[11px] font-medium">Avg Score</span>
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums ${
                      entry.avg_score !== null && entry.avg_score >= 8
                        ? 'text-success'
                        : entry.avg_score !== null && entry.avg_score >= 6
                        ? 'text-accent'
                        : entry.avg_score !== null && entry.avg_score >= 4
                        ? 'text-warning'
                        : 'text-text-muted'
                    }`}
                  >
                    {entry.avg_score !== null ? entry.avg_score.toFixed(1) : '--'}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-text-faint font-medium">XP Progress</span>
                  <span className="text-[11px] text-warning font-bold tabular-nums">{entry.xp}</span>
                </div>
                <div className="w-full bg-surface-3 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(entry.xp / maxXP) * 100}%` }}
                    transition={{ delay: 0.5 + i * 0.15, duration: 0.8, ease: 'easeOut' }}
                    className="h-2 rounded-full bg-gradient-to-r from-warning to-amber-400"
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Head-to-Head comparison */}
      {sorted.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-surface border border-border rounded-2xl p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h3 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
              <Trophy size={16} className="text-warning" />
              Head-to-Head
            </h3>
            <div className="flex items-center gap-2">
              <UserSelect
                entries={sorted}
                value={leftUserId}
                onChange={handleLeftChange}
                excludeId={rightUserId}
              />
              <span className="text-[11px] font-bold text-text-faint">VS</span>
              <UserSelect
                entries={sorted}
                value={rightUserId}
                onChange={handleRightChange}
                excludeId={leftUserId}
              />
            </div>
          </div>

          {leftUser && rightUser ? (
            <div className="space-y-6">
              <ComparisonBar
                label="Total XP"
                leftName={leftUser.name}
                leftValue={leftUser.xp}
                leftColor={leftUser.color}
                rightName={rightUser.name}
                rightValue={rightUser.xp}
                rightColor={rightUser.color}
                max={h2hMaxXP}
                delay={0.7}
              />
              <ComparisonBar
                label="Words Learned"
                leftName={leftUser.name}
                leftValue={leftUser.total_vocab}
                leftColor={leftUser.color}
                rightName={rightUser.name}
                rightValue={rightUser.total_vocab}
                rightColor={rightUser.color}
                max={h2hMaxVocab}
                delay={0.8}
              />
              <ComparisonBar
                label="Sessions Completed"
                leftName={leftUser.name}
                leftValue={leftUser.completed_sessions}
                leftColor={leftUser.color}
                rightName={rightUser.name}
                rightValue={rightUser.completed_sessions}
                rightColor={rightUser.color}
                max={h2hMaxSessions}
                delay={0.9}
              />
              <ComparisonBar
                label="Average Score"
                leftName={leftUser.name}
                leftValue={leftUser.avg_score ?? 0}
                leftColor={leftUser.color}
                rightName={rightUser.name}
                rightValue={rightUser.avg_score ?? 0}
                rightColor={rightUser.color}
                max={10}
                delay={1.0}
                format={(v) => v.toFixed(1)}
              />
            </div>
          ) : (
            <p className="text-text-muted text-sm text-center py-4">
              Select two users to compare.
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Main Stats page ──────────────────────────────────────────────────

export default function Stats() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(location.search);
  const rawTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(resolveTab(rawTab));

  // Keep URL in sync when tab changes
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    navigate(`/stats?tab=${tab}`, { replace: true });
  };

  // Sync activeTab when query param changes externally
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = resolveTab(params.get('tab'));
    setActiveTab(t);
  }, [location.search]);

  return (
    <div className="max-w-4xl mx-auto px-5 pb-24" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1
          className="font-extrabold tracking-tight text-text-primary"
          style={{ fontSize: '26px', letterSpacing: '-0.02em', marginBottom: '18px' }}
        >
          Stats
        </h1>
        <TabSegments active={activeTab} onChange={handleTabChange} />
      </motion.div>

      {activeTab === 'overview' && <OverviewPanel />}
      {activeTab === 'history' && <HistoryPanel />}
      {activeTab === 'friends' && <FriendsPanel />}
    </div>
  );
}

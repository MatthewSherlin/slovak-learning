import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { WifiOff, RefreshCw, Play } from 'lucide-react';
import HomeSkeleton from '../components/HomeSkeleton';
import { useUser } from '../components/UserPicker';
import {
  getRecommendations,
  getDashboard,
  getLeaderboard,
  createSession,
  getSession,
} from '../lib/api';
import type {
  ExerciseData,
  LearningMode,
  Recommendations,
  DashboardStats,
  Session,
} from '../lib/types';

// ── Slovak date header ────────────────────────────────────────────────

function getSlovakDate(): string {
  const fmt = new Intl.DateTimeFormat('sk-SK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const parts = fmt.formatToParts(new Date());
  // e.g. "streda · 16. júla"  →  capitalise first letter
  const raw = parts.map((p) => p.value).join('');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Mode metadata ─────────────────────────────────────────────────────

interface ModeConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  statFn: (stats: DashboardStats | null) => string;
}

const VOCAB_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    <path d="M8 11h8" /><path d="M8 7h6" />
  </svg>
);

const GRAMMAR_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
  </svg>
);

const CONVO_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const TRANSLATION_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
  </svg>
);

const MODES: Record<LearningMode, ModeConfig> = {
  vocabulary: {
    label: 'Vocabulary',
    color: '#5de4a5',
    bgColor: 'rgba(93,228,165,0.12)',
    icon: VOCAB_ICON,
    statFn: (s) => (s ? `${s.vocab_count} words learned` : 'Build your word bank'),
  },
  grammar: {
    label: 'Grammar',
    color: '#a78bfa',
    bgColor: 'rgba(167,139,250,0.12)',
    icon: GRAMMAR_ICON,
    statFn: (s) => {
      const avg = s?.scores_by_mode?.['grammar'];
      return avg != null ? `Avg ${avg.toFixed(1)}` : 'Master the cases';
    },
  },
  conversation: {
    label: 'Conversation',
    color: '#f5c45e',
    bgColor: 'rgba(245,196,94,0.12)',
    icon: CONVO_ICON,
    statFn: () => 'Talk with the tutor',
  },
  translation: {
    label: 'Translation',
    color: '#f0a8d0',
    bgColor: 'rgba(240,168,208,0.12)',
    icon: TRANSLATION_ICON,
    statFn: () => 'SK ⇄ EN',
  },
};

const MODE_ORDER: LearningMode[] = ['vocabulary', 'grammar', 'conversation', 'translation'];

// ── Progress computation ───────────────────────────────────────────────

interface SessionProgress {
  answered: number;
  total: number;
}

function computeProgress(exercises: ExerciseData): SessionProgress | null {
  switch (exercises.type) {
    case 'vocabulary': {
      const answered = exercises.answers.filter((a) => a !== null && a !== undefined).length;
      const total = (exercises.questions ?? exercises.answers).length;
      return total > 0 ? { answered, total } : null;
    }
    case 'grammar': {
      const answered = exercises.answers.filter((a) => a !== null && a !== undefined).length;
      const total = exercises.exercises.length;
      return total > 0 ? { answered, total } : null;
    }
    case 'translation': {
      const answered = exercises.answers.filter((a) => a !== null && a !== undefined).length;
      const total = exercises.exercises.length;
      return total > 0 ? { answered, total } : null;
    }
    case 'conversation': {
      return exercises.maxExchanges > 0
        ? { answered: exercises.exchangeCount, total: exercises.maxExchanges }
        : null;
    }
    default:
      return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [recs, setRecs] = useState<Recommendations | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [startingMode, setStartingMode] = useState<LearningMode | null>(null);
  const [inProgressSession, setInProgressSession] = useState<Session | null>(null);

  const loadData = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(false);

    Promise.all([
      getRecommendations(user.id),
      getDashboard(user.id),
      getLeaderboard(),
    ])
      .then(([recsData, statsData, lb]) => {
        setRecs(recsData);
        setStats(statsData);
        const entry = lb.find((e) => e.user_id === user.id);
        setStreak(entry?.streak_days ?? 0);
        setLoading(false);

        // Fetch the full in-progress session for real progress data.
        // Errors fall back gracefully — the card renders without the ring.
        if (recsData.in_progress_session) {
          getSession(recsData.in_progress_session.id)
            .then((sess) => setInProgressSession(sess))
            .catch(() => setInProgressSession(null));
        } else {
          setInProgressSession(null);
        }
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleModeClick = async (mode: LearningMode) => {
    if (!user) return;
    setStartingMode(mode);
    try {
      const session = await createSession({
        user_id: user.id,
        mode,
        difficulty: 'beginner',
      });
      navigate(`/session/${session.id}`);
    } catch {
      setStartingMode(null);
    }
  };

  const handleContinue = () => {
    if (recs?.in_progress_session) {
      navigate(`/session/${recs.in_progress_session.id}`);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return <HomeSkeleton />;
  }

  // ── Error state ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-20 pb-6 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-danger/5 border border-danger/20 rounded-2xl p-8 w-full"
        >
          <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
            <WifiOff size={24} className="text-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Couldn't load your home screen
          </h3>
          <p className="text-sm text-text-muted mb-5">
            Check your connection and try again.
          </p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  const inProgress = recs?.in_progress_session ?? null;

  // Compute real progress from the fetched session (null = no ring shown)
  const sessionProgress: SessionProgress | null =
    inProgressSession?.exercises != null
      ? computeProgress(inProgressSession.exercises)
      : null;

  // Progress ring geometry
  const circumference = 2 * Math.PI * 24; // r=24
  const progressRingProps = sessionProgress
    ? (() => {
        const ratio = sessionProgress.total > 0 ? sessionProgress.answered / sessionProgress.total : 0;
        const dashOffset = circumference * (1 - ratio);
        return { circumference, dashOffset, label: `${sessionProgress.answered}/${sessionProgress.total}` };
      })()
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-lg mx-auto px-5 pt-6 pb-6"
    >
      {/* ── Header: date + greeting + streak + avatar ── */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <p className="text-[13px] text-text-muted mb-0.5">{getSlovakDate()}</p>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none text-text-primary">
            Ahoj, {user?.name ?? '…'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Streak chip */}
          {streak > 0 && (
            <div
              className="flex items-center gap-[5px] px-[11px] py-[7px] rounded-full border"
              style={{
                background: 'rgba(245,196,94,0.10)',
                borderColor: 'rgba(245,196,94,0.18)',
              }}
            >
              {/* Flame icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f5c45e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
              <span
                className="text-[13px] font-bold tabular-nums"
                style={{ color: '#f5c45e' }}
              >
                {streak}
              </span>
            </div>
          )}
          {/* Avatar */}
          {user && (
            <div
              className="w-10 h-10 rounded-[14px] flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${user.color}, ${user.color}88)`,
              }}
            >
              {user.avatar}
            </div>
          )}
        </div>
      </div>

      {/* ── Continue card (only when in_progress_session exists) ── */}
      {inProgress && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          onClick={handleContinue}
          className="w-full text-left rounded-[22px] p-5 mb-7 border cursor-pointer transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
          style={{
            background: 'linear-gradient(120deg, rgba(94,164,247,0.16), rgba(56,189,248,0.06) 70%), #151926',
            borderColor: 'rgba(94,164,247,0.22)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Progress ring — only shown when real progress data is available */}
            {progressRingProps && (
              <div className="relative w-14 h-14 flex-shrink-0">
                <svg viewBox="0 0 56 56" className="w-14 h-14" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                  <circle
                    cx="28" cy="28" r="24" fill="none"
                    stroke="#a78bfa" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={progressRingProps.circumference}
                    strokeDashoffset={progressRingProps.dashOffset}
                  />
                </svg>
                <div
                  className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums"
                  style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {progressRingProps.label}
                </div>
              </div>
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-[3px]" style={{ color: '#5ea4f7' }}>
                Continue session
              </p>
              <p className="text-[15px] font-bold text-text-primary leading-tight mb-0.5">
                {inProgress.mode.charAt(0).toUpperCase() + inProgress.mode.slice(1)}
                {inProgress.topic ? ` · ${inProgress.topic}` : ''}
              </p>
              <p className="text-[12px]" style={{ color: '#6b7289' }}>
                {sessionProgress
                  ? `${sessionProgress.total - sessionProgress.answered} exercise${sessionProgress.total - sessionProgress.answered !== 1 ? 's' : ''} left`
                  : 'Tap to resume'}
              </p>
            </div>

            {/* Play button */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: '#5ea4f7',
                boxShadow: '0 8px 20px rgba(94,164,247,0.35)',
              }}
            >
              <Play size={18} fill="#ffffff" color="#ffffff" />
            </div>
          </div>
        </motion.button>
      )}

      {/* ── Practice header ── */}
      <div className="flex items-baseline justify-between mb-[14px]">
        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-text-primary">Practice</h2>
        <span className="text-[12px] text-text-muted">Pick a mode</span>
      </div>

      {/* ── Mode grid 2×2 ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {MODE_ORDER.map((mode) => {
          const cfg = MODES[mode];
          const isStarting = startingMode === mode;
          return (
            <motion.button
              key={mode}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleModeClick(mode)}
              disabled={isStarting || !user}
              className="text-left rounded-[20px] p-4 border cursor-pointer transition-all duration-200 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: '#151926',
                borderColor: 'rgba(255,255,255,0.06)',
                minHeight: '118px',
                boxSizing: 'border-box',
              }}
            >
              {/* Mode icon */}
              <div
                className="w-10 h-10 rounded-[13px] flex items-center justify-center mb-3"
                style={{ background: cfg.bgColor, color: cfg.color }}
              >
                {cfg.icon}
              </div>
              <p className="text-[15px] font-bold text-text-primary mb-0.5">{cfg.label}</p>
              <p className="text-[12px]" style={{ color: '#6b7289' }}>
                {isStarting ? 'Starting…' : cfg.statFn(stats)}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* ── Recommended chips (review_vocab / practice_concept) ── */}
      {recs && recs.recommended.filter((r) => r.kind !== 'continue').length > 0 && (
        <div className="mb-6">
          <p className="text-[12px] text-text-muted mb-2">Recommended</p>
          <div className="flex flex-wrap gap-2">
            {recs.recommended
              .filter((r) => r.kind !== 'continue')
              .map((rec, i) => (
                <button
                  key={i}
                  onClick={() => handleModeClick(rec.mode)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-semibold border cursor-pointer transition-all duration-200 hover:brightness-110"
                  style={{
                    background: 'rgba(94,164,247,0.08)',
                    borderColor: 'rgba(94,164,247,0.18)',
                    color: '#5ea4f7',
                  }}
                >
                  {/* Sparkle icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  </svg>
                  {rec.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Encouragement strip ── */}
      <div
        className="rounded-[18px] px-4 py-3.5 flex items-center gap-[10px] border"
        style={{
          background: 'rgba(245,196,94,0.06)',
          borderColor: 'rgba(245,196,94,0.12)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5c45e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
        <p className="text-[12.5px] leading-relaxed" style={{ color: '#a3aabe', margin: 0 }}>
          <em>"Pomaly, ale isto."</em> — Slowly but surely.
        </p>
      </div>
    </motion.div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Trophy, Target, ArrowRight, BookText } from 'lucide-react';
import ScoreBadge from '../components/ScoreBadge';
import LoadingDots from '../components/LoadingDots';
import { useUser } from '../components/UserPicker';
import { getDashboard } from '../lib/api';
import type { DashboardStats } from '../lib/types';

const modeLabels: Record<string, { label: string; color: string }> = {
  vocabulary: { label: 'Vocabulary', color: 'bg-mode-vocab' },
  grammar: { label: 'Grammar', color: 'bg-mode-grammar' },
  conversation: { label: 'Conversation', color: 'bg-mode-conversation' },
  translation: { label: 'Translation', color: 'bg-mode-translation' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      getDashboard(user.id)
        .then(setStats)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingDots text="Loading stats" />
      </div>
    );
  }

  if (!stats || stats.total_sessions === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-22 pb-16 text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 pt-22 pb-16">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-2">
          <BarChart3 size={20} className="text-accent" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Performance</h1>
        </div>
        <p className="text-text-muted text-sm mb-8">
          {user ? `${user.name}'s` : 'Your'} learning progress over time.
        </p>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Sessions', value: stats.total_sessions.toString(), icon: <BarChart3 size={15} /> },
          { label: 'Completed', value: stats.completed_sessions.toString(), icon: <Target size={15} /> },
          { label: 'Avg Score', value: stats.avg_score !== null ? stats.avg_score.toFixed(1) : '--', icon: <TrendingUp size={15} />, accent: true },
          { label: 'Words Learned', value: stats.vocab_count.toString(), icon: <BookText size={15} /> },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-surface border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-1.5 text-text-faint mb-2">
              {card.icon}
              <span className="text-[11px] font-medium">{card.label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${card.accent ? 'text-accent' : 'text-text-primary'}`}>
              {card.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Scores by Mode */}
      {Object.keys(stats.scores_by_mode).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface border border-border rounded-2xl p-6 mb-5"
        >
          <h3 className="text-[13px] font-semibold text-text-primary mb-5">By Category</h3>
          <div className="space-y-5">
            {Object.entries(stats.scores_by_mode).map(([mode, score]) => {
              const info = modeLabels[mode] || { label: mode, color: 'bg-accent' };
              return (
                <div key={mode}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${info.color}`} />
                      <span className="text-[13px] text-text-secondary">{info.label}</span>
                    </div>
                    <span className={`text-[13px] font-bold tabular-nums ${
                      score >= 8 ? 'text-success' :
                      score >= 6 ? 'text-accent' :
                      score >= 4 ? 'text-warning' :
                      'text-danger'
                    }`}>
                      {score.toFixed(1)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-3 rounded-full h-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score * 10}%` }}
                      transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                      className={`h-1.5 rounded-full ${
                        score >= 8 ? 'bg-success' :
                        score >= 6 ? 'bg-accent' :
                        score >= 4 ? 'bg-warning' :
                        'bg-danger'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Strengths & Weak Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {stats.strong_areas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-surface border border-border rounded-2xl p-5"
          >
            <h3 className="text-[13px] font-semibold text-success mb-3 flex items-center gap-2">
              <Trophy size={14} />
              Consistent Strengths
            </h3>
            <ul className="space-y-2">
              {stats.strong_areas.map((s, i) => (
                <li key={i} className="text-[12.5px] text-text-secondary flex items-start gap-2">
                  <span className="text-success mt-0.5 shrink-0 text-xs">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {stats.weak_areas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-surface border border-border rounded-2xl p-5"
          >
            <h3 className="text-[13px] font-semibold text-warning mb-3 flex items-center gap-2">
              <Target size={14} />
              Focus Areas
            </h3>
            <ul className="space-y-2">
              {stats.weak_areas.map((s, i) => (
                <li key={i} className="text-[12.5px] text-text-secondary flex items-start gap-2">
                  <span className="text-warning mt-0.5 shrink-0 text-xs">*</span>
                  {s}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>

      {/* Recent Sessions */}
      {stats.recent_sessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-surface border border-border rounded-2xl p-5"
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
    </div>
  );
}

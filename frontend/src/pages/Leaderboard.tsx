import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, BookText, Target, Zap, Crown, BarChart3 } from 'lucide-react';
import LoadingDots from '../components/LoadingDots';
import { getLeaderboard } from '../lib/api';
import type { LeaderboardEntry } from '../lib/types';

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingDots text="Loading leaderboard" />
      </div>
    );
  }

  // Sort by XP descending
  const sorted = [...entries].sort((a, b) => b.xp - a.xp);
  const leader = sorted[0];
  const challenger = sorted[1];

  // Calculate max values for relative bars
  const maxXP = Math.max(...sorted.map((e) => e.xp), 1);
  const maxVocab = Math.max(...sorted.map((e) => e.total_vocab), 1);
  const maxSessions = Math.max(...sorted.map((e) => e.completed_sessions), 1);

  return (
    <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-2">
          <Trophy size={20} className="text-warning" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Leaderboard</h1>
        </div>
        <p className="text-text-muted text-sm mb-10">
          Who's winning the Slovak learning race?
        </p>
      </motion.div>

      {entries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <Trophy size={24} className="text-text-faint" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No data yet</h3>
          <p className="text-text-muted text-sm max-w-xs mx-auto">
            Complete some sessions to start the competition!
          </p>
        </motion.div>
      ) : (
        <>
          {/* Head-to-Head Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
            {sorted.map((entry, i) => {
              const isLeader = entry === leader;
              return (
                <motion.div
                  key={entry.user_id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.15, type: 'spring', damping: 20 }}
                  className={`relative bg-surface border rounded-2xl p-6 ${
                    isLeader
                      ? 'border-warning/30 shadow-lg shadow-warning/10'
                      : 'border-border'
                  }`}
                >
                  {/* Crown for leader */}
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

                  {/* Avatar & Name */}
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

                  {/* Stats Grid */}
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
                      <div className={`text-lg font-bold tabular-nums ${
                        entry.avg_score !== null && entry.avg_score >= 8 ? 'text-success' :
                        entry.avg_score !== null && entry.avg_score >= 6 ? 'text-accent' :
                        entry.avg_score !== null && entry.avg_score >= 4 ? 'text-warning' :
                        'text-text-muted'
                      }`}>
                        {entry.avg_score !== null ? entry.avg_score.toFixed(1) : '--'}
                      </div>
                    </div>
                  </div>

                  {/* XP Bar */}
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

          {/* Comparison Bars */}
          {leader && challenger && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-surface border border-border rounded-2xl p-6"
            >
              <h3 className="text-[15px] font-semibold text-text-primary mb-6 flex items-center gap-2">
                <Trophy size={16} className="text-warning" />
                Head-to-Head
              </h3>

              <div className="space-y-6">
                {/* XP Comparison */}
                <ComparisonBar
                  label="Total XP"
                  leftName={sorted[0].name}
                  leftValue={sorted[0].xp}
                  leftColor={sorted[0].color}
                  rightName={sorted[1].name}
                  rightValue={sorted[1].xp}
                  rightColor={sorted[1].color}
                  max={maxXP}
                  delay={0.7}
                />

                {/* Vocab Comparison */}
                <ComparisonBar
                  label="Words Learned"
                  leftName={sorted[0].name}
                  leftValue={sorted[0].total_vocab}
                  leftColor={sorted[0].color}
                  rightName={sorted[1].name}
                  rightValue={sorted[1].total_vocab}
                  rightColor={sorted[1].color}
                  max={maxVocab}
                  delay={0.8}
                />

                {/* Sessions Comparison */}
                <ComparisonBar
                  label="Sessions Completed"
                  leftName={sorted[0].name}
                  leftValue={sorted[0].completed_sessions}
                  leftColor={sorted[0].color}
                  rightName={sorted[1].name}
                  rightValue={sorted[1].completed_sessions}
                  rightColor={sorted[1].color}
                  max={maxSessions}
                  delay={0.9}
                />

                {/* Avg Score Comparison */}
                <ComparisonBar
                  label="Average Score"
                  leftName={sorted[0].name}
                  leftValue={sorted[0].avg_score ?? 0}
                  leftColor={sorted[0].color}
                  rightName={sorted[1].name}
                  rightValue={sorted[1].avg_score ?? 0}
                  rightColor={sorted[1].color}
                  max={10}
                  delay={1.0}
                  format={(v) => v.toFixed(1)}
                />
              </div>
            </motion.div>
          )}
        </>
      )}
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
  const fmt = format || ((v: number) => v.toString());

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
          <span className="text-[12px] text-text-primary font-bold tabular-nums w-10 text-right">{fmt(leftValue)}</span>
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
          <span className="text-[12px] text-text-primary font-bold tabular-nums w-10 text-right">{fmt(rightValue)}</span>
        </div>
      </div>
    </div>
  );
}

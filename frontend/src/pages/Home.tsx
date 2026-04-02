import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Zap,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import ModeCard from '../components/ModeCard';
import LoadingDots from '../components/LoadingDots';
import { useUser } from '../components/UserPicker';
import { createSession, getTopics, getModes, getDashboard } from '../lib/api';
import type { LearningMode, Difficulty, Topic, Mode, DashboardStats } from '../lib/types';

const modeDescriptions: Record<LearningMode, string> = {
  vocabulary:
    'Build your Slovak word bank. Learn new words with context, examples, and usage patterns.',
  grammar:
    'Master Slovak grammar rules. Cases, conjugation, verb aspects, and sentence structure.',
  conversation:
    'Practice real conversations. Greetings, ordering food, asking directions, and more.',
  translation:
    'Translate between Slovak and English. Build fluency through active translation practice.',
};

const defaultQuestionCounts: Record<LearningMode, number> = {
  vocabulary: 20,
  grammar: 20,
  conversation: 15,
  translation: 20,
};

const encouragements = [
  "Každý deň je nová príležitosť. — Every day is a new opportunity.",
  "Kto sa pýta, ten sa učiť nechce prestať.",
  "Pomaly, ale isto. — Slowly but surely.",
  "Learning Slovak opens doors to a beautiful culture.",
  "Chyby sú dôkaz, že sa snažíš. — Mistakes are proof that you're trying.",
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [step, setStep] = useState<'mode' | 'config'>('mode');
  const [selectedMode, setSelectedMode] = useState<LearningMode | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [loading, setLoading] = useState(false);
  const [modes, setModes] = useState<Mode[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [encouragement] = useState(() =>
    encouragements[Math.floor(Math.random() * encouragements.length)]
  );

  useEffect(() => {
    getModes().then(setModes).catch(() => {});
    if (user) {
      getDashboard(user.id).then(setStats).catch(() => {});
    }
  }, [user]);

  const handleModeSelect = async (mode: LearningMode) => {
    setSelectedMode(mode);
    try {
      const t = await getTopics(mode);
      setTopics(t);
    } catch {
      setTopics([]);
    }
    setSelectedTopic('');
    setStep('config');
  };

  const handleStart = async () => {
    if (!selectedMode || !user) return;
    setLoading(true);
    try {
      const session = await createSession({
        user_id: user.id,
        mode: selectedMode,
        difficulty,
        topic: selectedTopic || undefined,
      });
      navigate(`/session/${session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setLoading(false);
    }
  };

  const getQuestionCount = (mode: LearningMode) => {
    const found = modes.find((m) => m.id === mode);
    return found ? found.question_count : defaultQuestionCounts[mode];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-6">
            <Zap size={28} className="text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">
            Preparing your session
          </h2>
          <LoadingDots text="Your tutor is getting ready" />
          <p className="text-xs text-text-faint mt-4 max-w-xs mx-auto">
            This takes a few seconds while we set up a personalized lesson.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 pt-22 pb-16">
      <AnimatePresence mode="wait">
        {step === 'mode' ? (
          <motion.div
            key="mode-select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Hero */}
            <div className="text-center mb-14">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                {user && (
                  <p className="text-text-muted text-sm mb-3 flex items-center justify-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: user.color }}
                    >
                      {user.avatar}
                    </span>
                    Ahoj, {user.name}!
                  </p>
                )}

                <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4 tracking-tight leading-tight">
                  Let's learn{' '}
                  <span className="bg-gradient-to-r from-accent to-sky-400 bg-clip-text text-transparent">
                    Slovak
                  </span>
                </h1>

                <p className="text-text-secondary text-base max-w-lg mx-auto leading-relaxed mb-3">
                  Practice with an AI tutor that adapts to your level and
                  gives you honest, actionable feedback.
                </p>

                <p className="text-text-muted text-sm italic max-w-md mx-auto">
                  "{encouragement}"
                </p>
              </motion.div>

              {/* Quick stats strip */}
              {stats && stats.completed_sessions > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-center gap-6 mt-6 text-xs text-text-muted"
                >
                  <span>{stats.completed_sessions} sessions completed</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  {stats.avg_score !== null && (
                    <>
                      <span>Avg score: {stats.avg_score.toFixed(1)}/10</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                    </>
                  )}
                  <span>{stats.vocab_count} words learned</span>
                </motion.div>
              )}
            </div>

            {/* Mode Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              {(Object.keys(modeDescriptions) as LearningMode[]).map((mode, i) => (
                <ModeCard
                  key={mode}
                  mode={mode}
                  label={mode.charAt(0).toUpperCase() + mode.slice(1)}
                  description={modeDescriptions[mode]}
                  questionCount={getQuestionCount(mode)}
                  onClick={() => handleModeSelect(mode)}
                  index={i}
                />
              ))}
            </div>

            {/* Quick tip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <Sparkles size={12} />
                <span>Tip: Check out the Guides page for pronunciation tips and case system overviews</span>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Back */}
            <button
              onClick={() => setStep('mode')}
              className="text-text-muted hover:text-text-primary text-[13px] mb-8 flex items-center gap-1.5 cursor-pointer bg-transparent border-none transition-colors"
            >
              <ArrowLeft size={14} />
              Back to modes
            </button>

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">
                Configure your session
              </h2>
              <p className="text-sm text-text-muted">
                <span className="capitalize">{selectedMode}</span> practice
              </p>
            </div>

            <div className="max-w-lg space-y-7">
              {/* Topic */}
              {topics.length > 0 && (
                <div>
                  <label className="block text-[13px] font-medium text-text-secondary mb-2.5">
                    Focus Area
                    <span className="text-text-faint ml-1.5 font-normal">optional</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTopic(selectedTopic === t.id ? '' : t.id)}
                        className={`px-3.5 py-2 rounded-lg text-[13px] font-medium border cursor-pointer transition-all duration-200 ${
                          selectedTopic === t.id
                            ? 'bg-accent-muted border-accent/30 text-accent shadow-sm shadow-accent/10'
                            : 'bg-surface-2 border-border text-text-muted hover:text-text-secondary hover:border-border-focus'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Difficulty */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2.5">
                  Difficulty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'beginner' as Difficulty, label: 'Beginner', desc: 'Basic phrases & words' },
                    { key: 'intermediate' as Difficulty, label: 'Intermediate', desc: 'Conversation level' },
                    { key: 'advanced' as Difficulty, label: 'Advanced', desc: 'Native-like fluency' },
                  ]).map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDifficulty(d.key)}
                      className={`px-4 py-3.5 rounded-xl text-left border cursor-pointer transition-all duration-200 ${
                        difficulty === d.key
                          ? 'bg-accent-muted border-accent/30 shadow-sm shadow-accent/10'
                          : 'bg-surface-2 border-border hover:border-border-focus'
                      }`}
                    >
                      <div className={`text-sm font-medium mb-0.5 ${difficulty === d.key ? 'text-accent' : 'text-text-primary'}`}>
                        {d.label}
                      </div>
                      <div className="text-[11px] text-text-faint">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStart}
                disabled={!user}
                className="w-full mt-2 flex items-center justify-center gap-2.5 bg-gradient-to-r from-accent to-sky-400 hover:from-accent-hover hover:to-sky-300 text-white font-semibold py-4 px-6 rounded-xl cursor-pointer border-none text-[15px] shadow-lg shadow-accent/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Begin Learning
                <ArrowRight size={17} />
              </motion.button>

              <p className="text-xs text-text-faint text-center">
                You'll have a natural conversation with an AI tutor.
                End anytime to get detailed feedback and vocabulary review.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

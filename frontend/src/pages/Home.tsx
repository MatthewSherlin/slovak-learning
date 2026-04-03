import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Zap,
  ArrowLeft,
  Sparkles,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import ModeCard from '../components/ModeCard';
import { useUser } from '../components/UserPicker';
import { createSession, getTopics, getModes, getDashboard, getUserPreferences, updateUserPreferences } from '../lib/api';
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
  "Kazdy den je nova prilezitost. — Every day is a new opportunity.",
  "Kto sa pyta, ten sa ucit nechce prestat.",
  "Pomaly, ale isto. — Slowly but surely.",
  "Learning Slovak opens doors to a beautiful culture.",
  "Chyby su dokaz, ze sa snazis. — Mistakes are proof that you're trying.",
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
  const [error, setError] = useState('');
  const [modes, setModes] = useState<Mode[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [modesLoading, setModesLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [focusInput, setFocusInput] = useState('');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [encouragement] = useState(() =>
    encouragements[Math.floor(Math.random() * encouragements.length)]
  );

  const loadData = () => {
    setModesLoading(true);
    setBackendError(false);
    getModes()
      .then((m) => {
        setModes(m);
        setModesLoading(false);
      })
      .catch(() => {
        setBackendError(true);
        setModesLoading(false);
      });

    if (user) {
      getDashboard(user.id).then(setStats).catch(() => {});
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user && step === 'config' && !prefsLoaded) {
      getUserPreferences(user.id)
        .then((prefs) => {
          setFocusAreas(prefs.custom_focus_areas);
          setPrefsLoaded(true);
        })
        .catch(() => setPrefsLoaded(true));
    }
  }, [user, step, prefsLoaded]);

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
    setError('');
    try {
      // Persist focus areas and pass them directly to session creation
      if (focusAreas.length > 0) {
        updateUserPreferences(user.id, { custom_focus_areas: focusAreas }).catch(() => {});
      }
      const session = await createSession({
        user_id: user.id,
        mode: selectedMode,
        difficulty,
        topic: selectedTopic || undefined,
        focus_areas: focusAreas.length > 0 ? focusAreas : undefined,
      });
      navigate(`/session/${session.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start session';
      console.error('Failed to create session:', err);
      setError(msg);
      setLoading(false);
    }
  };

  const getQuestionCount = (mode: LearningMode) => {
    const found = modes.find((m) => m.id === mode);
    return found ? found.question_count : defaultQuestionCounts[mode];
  };

  if (loading) {
    const modeLabel = selectedMode ? selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1) : 'Session';

    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center max-w-sm"
        >
          {/* Animated icon */}
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-18 h-18 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/15 flex items-center justify-center mx-auto mb-8"
          >
            <Zap size={32} className="text-accent" />
          </motion.div>

          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Building your {modeLabel.toLowerCase()} lesson
          </h2>
          <p className="text-sm text-text-muted mb-6">
            Crafting exercises for your level — just a moment.
          </p>

          {/* Progress bar animation */}
          <div className="w-full h-1 bg-surface-3 rounded-full overflow-hidden mb-4">
            <motion.div
              className="h-full bg-gradient-to-r from-accent to-accent/60 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: '85%' }}
              transition={{ duration: 8, ease: 'easeOut' }}
            />
          </div>

          <p className="text-[11px] text-text-faint">
            This usually takes 5–10 seconds
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

            {/* Backend error state */}
            {backendError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md mx-auto mb-10 text-center"
              >
                <div className="bg-danger/5 border border-danger/20 rounded-2xl p-8">
                  <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
                    <WifiOff size={24} className="text-danger" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">Backend unavailable</h3>
                  <p className="text-sm text-text-muted mb-5">
                    Can't connect to the server. Make sure the backend is running on port 8888.
                  </p>
                  <button
                    onClick={loadData}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              </motion.div>
            )}

            {/* Loading skeleton */}
            {modesLoading && !backendError && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-surface-2 border border-border rounded-2xl p-6 h-36 animate-pulse"
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-3 mb-4" />
                    <div className="h-4 w-24 bg-surface-3 rounded mb-2" />
                    <div className="h-3 w-48 bg-surface-3 rounded" />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Mode Cards */}
            {!modesLoading && !backendError && (
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
            )}

            {/* Quick tip */}
            {!backendError && (
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
            )}
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

              {/* Custom Focus Areas */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2.5">
                  Your Focus Areas
                  <span className="text-text-faint ml-1.5 font-normal">optional</span>
                </label>
                <p className="text-[11px] text-text-faint mb-2">
                  Tell the AI what you want to practice — e.g. "restaurant vocabulary", "verb conjugation", "accusative case"
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={focusInput}
                    onChange={(e) => setFocusInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && focusInput.trim()) {
                        e.preventDefault();
                        const updated = [...focusAreas, focusInput.trim()];
                        setFocusAreas(updated);
                        setFocusInput('');
                        if (user) {
                          try {
                            await updateUserPreferences(user.id, { custom_focus_areas: updated });
                          } catch {
                            // Revert on failure
                            setFocusAreas(focusAreas);
                          }
                        }
                      }
                    }}
                    placeholder="Type and press Enter..."
                    className="flex-1 px-3 py-2 rounded-lg text-[13px] bg-surface-2 border border-border text-text-primary placeholder:text-text-faint focus:border-accent/50 focus:outline-none"
                  />
                </div>
                {focusAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {focusAreas.map((area, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] bg-accent-muted text-accent border border-accent/20"
                      >
                        {area}
                        <button
                          onClick={async () => {
                            const prev = focusAreas;
                            const updated = focusAreas.filter((_, j) => j !== i);
                            setFocusAreas(updated);
                            if (user) {
                              try {
                                await updateUserPreferences(user.id, { custom_focus_areas: updated });
                              } catch {
                                setFocusAreas(prev);
                              }
                            }
                          }}
                          className="ml-0.5 text-accent/60 hover:text-accent cursor-pointer bg-transparent border-none text-[11px] leading-none"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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

              {error && (
                <div className="text-center">
                  <span className="text-[13px] text-danger bg-danger-muted px-4 py-2.5 rounded-lg inline-block">
                    {error}
                  </span>
                </div>
              )}

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

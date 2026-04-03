import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Trophy, Languages, Check, Sparkles } from 'lucide-react';
import SessionHeader from './SessionHeader';
import ProgressBar from './ProgressBar';
import LoadingDots from './LoadingDots';
import FeedbackView from './FeedbackView';
import DiacriticsKeyboard from './DiacriticsKeyboard';
import { submitTranslation, endSession, getSession } from '../lib/api';
import { playCorrect, playIncorrect } from '../lib/sounds';
import type { Session, SessionFeedback, TranslationExerciseData, TranslationAnswer } from '../lib/types';

interface TranslationModeProps {
  session: Session;
  setSession: (s: Session) => void;
  onEnd: () => void;
}

export default function TranslationMode({ session, setSession }: TranslationModeProps) {
  const ex = session.exercises as TranslationExerciseData;
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<TranslationAnswer | null>(null);
  const [ending, setEnding] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [streak, setStreak] = useState(0);
  const [shakeInput, setShakeInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [error, setError] = useState('');
  const [endError, setEndError] = useState('');

  const handleSubmit = async () => {
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await submitTranslation(session.id, input.trim());
      const updatedEx = updated.exercises as TranslationExerciseData;
      const prevIndex = updatedEx.currentIndex - 1;
      const answer = updatedEx.answers[prevIndex] ?? null;
      setLastAnswer(answer);
      setShowResult(true);
      setSession(updated);

      if (answer) {
        if (answer.score >= 7) {
          setStreak(s => s + 1);
          playCorrect();
        } else {
          setStreak(0);
          if (answer.score < 5) {
            setShakeInput(true);
            playIncorrect();
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to evaluate translation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = useCallback(() => {
    setInput('');
    setShowResult(false);
    setLastAnswer(null);
    setShakeInput(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // Auto-advance after high scores (>= 8)
  useEffect(() => {
    if (showResult && lastAnswer && lastAnswer.score >= 8) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastAnswer, handleNext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showResult) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Enter' && showResult) {
      e.preventDefault();
      handleNext();
    }
  };

  const handleEnd = useCallback(async () => {
    if (ending || feedback) return;
    setEnding(true);
    setEndError('');
    try {
      const fb = await endSession(session.id);
      setFeedback(fb);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch {
      setEnding(false);
      setEndError('Failed to get feedback. Please try again.');
    }
  }, [ending, feedback, session.id, setSession]);

  // Auto-end when exercises complete
  useEffect(() => {
    if (ex.phase === 'complete' && !ending && !feedback) {
      handleEnd();
    }
  }, [ex.phase, ending, feedback, handleEnd]);

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  // Complete phase
  if (ex.phase === 'complete') {
    const answered = ex.answers.filter(Boolean) as TranslationAnswer[];
    const avgScore = answered.length > 0
      ? answered.reduce((s, a) => s + a.score, 0) / answered.length
      : 0;

    return (
      <div className="flex flex-col h-screen pt-14">
        <SessionHeader session={session} onEnd={handleEnd} ending={ending} />
        <div className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-lg mx-auto text-center">
            {ending ? (
              <div className="py-12">
                <LoadingDots text="Analyzing your translations" />
                <p className="text-[11px] text-text-faint mt-3">Generating detailed feedback...</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="w-20 h-20 rounded-2xl bg-mode-translation/12 flex items-center justify-center mx-auto mb-6">
                  <Trophy size={36} className="text-mode-translation" />
                </div>
                <h2 className="text-2xl font-bold text-text-primary mb-1">Translations Complete!</h2>

                {/* Animated score ring */}
                {(() => {
                  const pct = avgScore * 10;
                  return (
                    <div className="relative w-32 h-32 mx-auto my-6">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
                        <motion.circle
                          cx="60" cy="60" r="52" fill="none"
                          stroke={avgScore >= 7 ? 'var(--color-success)' : avgScore >= 5 ? 'var(--color-warning)' : 'var(--color-danger)'}
                          strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 52}`}
                          initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100) }}
                          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.span
                          className={`text-3xl font-bold tabular-nums ${avgScore >= 7 ? 'text-success' : avgScore >= 5 ? 'text-warning' : 'text-danger'}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                        >
                          {avgScore.toFixed(1)}
                        </motion.span>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-sm text-text-muted mb-8">Average score across {answered.length} sentences</p>

                {/* Sentence review */}
                <div className="text-left space-y-3 mb-8">
                  {ex.exercises.map((exercise, i) => {
                    const answer = ex.answers[i];
                    if (!answer) return null;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className="bg-surface border border-border rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface-3 text-text-faint uppercase">
                            {exercise.direction === 'en-sk' ? 'EN → SK' : 'SK → EN'}
                          </span>
                          <span className={`text-[12px] font-bold tabular-nums ${answer.score >= 7 ? 'text-success' : answer.score >= 5 ? 'text-warning' : 'text-danger'}`}>
                            {answer.score}/10
                          </span>
                        </div>
                        <p className="text-[13px] text-text-secondary mb-1">
                          <span className="text-text-faint">Source:</span> {exercise.source}
                        </p>
                        <p className="text-[13px] text-text-primary mb-1">
                          <span className="text-text-faint">You:</span> {answer.userAnswer}
                        </p>
                        <p className="text-[13px] text-success">
                          <span className="text-text-faint">Model:</span> {exercise.modelAnswer}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>

                {endError && (
                  <p className="text-red-400 text-[13px] text-center mb-2">{endError}</p>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEnd}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-sky-400 text-white font-semibold py-3.5 px-6 rounded-xl cursor-pointer border-none text-[14px] shadow-lg shadow-accent/20 transition-all"
                >
                  Get Detailed Feedback
                  <ArrowRight size={15} />
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active exercise phase
  const exerciseIndex = showResult ? ex.currentIndex - 1 : ex.currentIndex;
  const currentExercise = ex.exercises[exerciseIndex];
  if (!currentExercise) return null;

  const directionLabel = currentExercise.direction === 'en-sk'
    ? 'Translate to Slovak'
    : 'Translate to English';

  return (
    <div className="flex flex-col h-screen pt-14">
      <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={ex.currentIndex > 0 || showResult}>
        {streak >= 3 && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 text-[11px] text-warning font-semibold bg-warning/10 px-2 py-0.5 rounded-full"
          >
            <Sparkles size={10} />
            {streak} streak!
          </motion.div>
        )}
      </SessionHeader>
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-lg mx-auto">
          <ProgressBar
            current={showResult ? ex.currentIndex - 1 : ex.currentIndex}
            total={ex.exercises.length}
            label="Sentence"
            color="bg-mode-translation"
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={showResult ? `result-${exerciseIndex}` : `input-${exerciseIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Direction badge */}
              <div className="flex items-center gap-1.5 mb-3">
                <Languages size={13} className="text-mode-translation" />
                <span className="text-[12px] font-medium text-mode-translation">{directionLabel}</span>
              </div>

              {/* Source sentence */}
              <motion.div
                className="bg-surface-2 border border-border rounded-2xl px-6 py-6 text-center mb-5"
                animate={shakeInput && showResult ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                transition={shakeInput && showResult ? { duration: 0.4 } : {}}
              >
                <p className="text-[18px] font-medium text-text-primary leading-relaxed">
                  {currentExercise.source}
                </p>
              </motion.div>

              {showResult && lastAnswer ? (
                /* Side-by-side result */
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="text-[11px] font-medium text-text-faint mb-2">Your answer</div>
                      <p className="text-[13px] text-text-primary">{lastAnswer.userAnswer}</p>
                    </div>
                    <div className="bg-success/5 border border-success/15 rounded-xl p-4">
                      <div className="text-[11px] font-medium text-success mb-2 flex items-center gap-1">
                        <Check size={10} />
                        Model answer
                      </div>
                      <p className="text-[13px] text-text-primary">{currentExercise.modelAnswer}</p>
                    </div>
                  </div>

                  {/* Score + feedback */}
                  <div className={`rounded-xl p-4 border mb-4 ${lastAnswer.score >= 7 ? 'bg-success/5 border-success/20' : lastAnswer.score >= 5 ? 'bg-warning/5 border-warning/20' : 'bg-danger/5 border-danger/20'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[16px] font-bold tabular-nums ${lastAnswer.score >= 7 ? 'text-success' : lastAnswer.score >= 5 ? 'text-warning' : 'text-danger'}`}>
                        {lastAnswer.score}/10
                      </span>
                      <div className="flex-1 h-1.5 bg-surface-3 rounded-full">
                        <div
                          className={`h-1.5 rounded-full transition-all ${lastAnswer.score >= 7 ? 'bg-success' : lastAnswer.score >= 5 ? 'bg-warning' : 'bg-danger'}`}
                          style={{ width: `${lastAnswer.score * 10}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-[12px] text-text-secondary leading-relaxed">{lastAnswer.feedback}</p>
                  </div>

                  {/* Key points */}
                  {currentExercise.keyPoints.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {currentExercise.keyPoints.map((kp, i) => (
                        <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-surface-3 text-text-muted border border-border-subtle">
                          {kp}
                        </span>
                      ))}
                    </div>
                  )}

                  {lastAnswer.score < 8 && (
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                    >
                      {ex.currentIndex >= ex.exercises.length ? 'See Results' : 'Next Sentence'} <ArrowRight size={11} />
                    </button>
                  )}
                </motion.div>
              ) : (
                /* Translation input */
                <div>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your translation..."
                    rows={2}
                    autoFocus
                    className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-[14px] text-text-primary placeholder:text-text-faint resize-none focus:border-border-focus transition-colors"
                  />
                  <DiacriticsKeyboard inputRef={textareaRef} value={input} onChange={setInput} />
                  <div className="mb-3" />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    disabled={!input.trim() || submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-mode-translation hover:bg-mode-translation/80 text-white font-medium text-[13px] cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? (
                      <LoadingDots text="Evaluating" />
                    ) : (
                      <>Check Translation <ArrowRight size={13} /></>
                    )}
                  </motion.button>
                  {error && (
                    <p className="text-[12px] text-danger mt-2">{error}</p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

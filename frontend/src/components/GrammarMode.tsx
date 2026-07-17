import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, Trophy, BookOpen, Lightbulb, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SessionHeader from './SessionHeader';
import ProgressBar from './ProgressBar';
import LoadingDots from './LoadingDots';
import FeedbackView from './FeedbackView';
import DiacriticsKeyboard from './DiacriticsKeyboard';
import { advanceGrammarPhase, submitGrammarAnswer, endSession, getSession } from '../lib/api';
import { playCorrect, playIncorrect } from '../lib/sounds';
import type { Session, SessionFeedback } from '../lib/types';

interface GrammarModeProps {
  session: Session;
  setSession: (s: Session) => void;
  onEnd: () => void;
}

/** Render a sentence string that contains "____" as JSX — no innerHTML. */
function SentenceWithBlank({
  sentence,
  blankContent,
  blankClassName,
}: {
  sentence: string;
  blankContent: React.ReactNode;
  blankClassName?: string;
}) {
  const parts = sentence.split('____');
  return (
    <p className="text-[16px] text-text-primary leading-relaxed">
      {parts[0]}
      <span
        className={`inline-block mx-1 px-3 py-1 rounded-lg border-2 border-dashed min-w-[80px] font-semibold ${blankClassName ?? 'border-mode-grammar/40 bg-mode-grammar/5 text-mode-grammar'}`}
      >
        {blankContent}
      </span>
      {parts[1] ?? ''}
    </p>
  );
}

export default function GrammarMode({ session, setSession }: GrammarModeProps) {
  // Discriminant narrowing — no bare `as` cast
  if (session.exercises?.type !== 'grammar') return null;
  const ex = session.exercises;

  const [input, setInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  // Tier from latest answer: "exact" | "accent" | "wrong" | null
  const [lastTier, setLastTier] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [startError, setStartError] = useState('');
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [streak, setStreak] = useState(0);
  const [shakeInput, setShakeInput] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [shakeCards, setShakeCards] = useState<Set<number>>(new Set());
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Sync ref guard so end-session can't double-fire
  const endingRef = useRef(false);

  // Derive currentExercise early so handlers can use it
  const exerciseIndex = ex.phase === 'exercises'
    ? ex.currentIndex - (showResult ? 1 : 0)
    : 0;
  const currentExercise = ex.exercises[exerciseIndex] ?? null;
  const isMultipleChoice = !!(currentExercise?.choices && currentExercise.choices.length > 0);

  const handleStartExercises = async () => {
    setStartError('');
    try {
      const updated = await advanceGrammarPhase(session.id);
      setSession(updated);
    } catch {
      setStartError('Failed to load exercises. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;
    const updated = await submitGrammarAnswer(session.id, input.trim());
    if (updated.exercises?.type !== 'grammar') return;
    const updatedEx = updated.exercises;
    const prevIndex = updatedEx.currentIndex - 1;
    const wasCorrect = updatedEx.correct[prevIndex] ?? false;
    const tier = updatedEx.tiers?.[prevIndex] ?? null;
    setLastCorrect(wasCorrect);
    setLastTier(tier);
    setShowResult(true);

    if (wasCorrect) {
      setStreak(s => s + 1);
      playCorrect();
    } else {
      setStreak(0);
      setShakeInput(true);
      playIncorrect();
    }

    setSession(updated);
  };

  const handleSelect = async (idx: number) => {
    if (showResult || !currentExercise?.choices) return;
    setSelected(idx);
    try {
      const choiceText = currentExercise.choices[idx];
      const updated = await submitGrammarAnswer(session.id, choiceText);
      if (updated.exercises?.type !== 'grammar') return;
      const updatedEx = updated.exercises;
      const prevIndex = updatedEx.currentIndex - 1;
      const wasCorrect = updatedEx.correct[prevIndex] ?? false;
      const tier = updatedEx.tiers?.[prevIndex] ?? null;
      setLastCorrect(wasCorrect);
      setLastTier(tier);
      setShowResult(true);

      if (wasCorrect) {
        setStreak(s => s + 1);
        playCorrect();
      } else {
        setStreak(0);
        setShakeCards(new Set([idx]));
        playIncorrect();
      }

      setSession(updated);
    } catch {
      // Reset selection on error so user can retry
      setSelected(null);
    }
  };

  const handleNext = useCallback(() => {
    setInput('');
    setShowResult(false);
    setLastCorrect(null);
    setLastTier(null);
    setShakeInput(false);
    setSelected(null);
    setShakeCards(new Set());
    setShowHint(false);
    if (!isMultipleChoice) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMultipleChoice]);

  // Auto-advance after correct answer
  useEffect(() => {
    if (showResult && lastCorrect) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastCorrect, handleNext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showResult) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Enter' && showResult) {
      e.preventDefault();
      handleNext();
    }
  };

  const handleEnd = useCallback(async () => {
    if (endingRef.current || feedback) return;
    endingRef.current = true;
    setEnding(true);
    setEndError('');
    try {
      const fb = await endSession(session.id);
      setFeedback(fb);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch {
      setEnding(false);
      endingRef.current = false;
      setEndError('Failed to get feedback. Please try again.');
    }
  }, [feedback, session.id, setSession]);

  // Auto-end when exercises complete
  useEffect(() => {
    if (ex.phase === 'complete' && !endingRef.current && !feedback) {
      handleEnd();
    }
  }, [ex.phase, feedback, handleEnd]);

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  // ── Lesson phase ─────────────────────────────────────────────────────────
  if (ex.phase === 'lesson') {
    return (
      <div className="flex flex-col h-screen pt-18">
        <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={false} />
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface border border-border rounded-2xl overflow-hidden"
            >
              {/* Lesson header */}
              <div className="bg-mode-grammar/8 border-b border-mode-grammar/15 px-6 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={16} className="text-mode-grammar" />
                  <span className="text-[11px] font-medium text-mode-grammar uppercase tracking-wide">Lesson</span>
                </div>
                <h2 className="text-xl font-bold text-text-primary">{ex.lesson.concept}</h2>
              </div>

              {/* Lesson body */}
              <div className="px-6 py-5 space-y-5">
                <div className="text-[13.5px] text-text-secondary leading-relaxed markdown-content">
                  <ReactMarkdown>{ex.lesson.explanation}</ReactMarkdown>
                </div>

                {ex.lesson.table && (
                  <div className="bg-surface-2 rounded-xl p-4 border border-border-subtle overflow-x-auto text-[13px] markdown-content">
                    <ReactMarkdown>{ex.lesson.table}</ReactMarkdown>
                  </div>
                )}

                {ex.lesson.examples.length > 0 && (
                  <div>
                    <h4 className="text-[12px] font-semibold text-text-faint uppercase tracking-wide mb-2">Examples</h4>
                    <div className="space-y-2">
                      {ex.lesson.examples.map((example, i) => (
                        <div key={i} className="bg-surface-2 rounded-lg px-4 py-2.5 border border-border-subtle text-[13px] text-text-secondary">
                          {example}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Start exercises */}
              <div className="px-6 py-4 border-t border-border-subtle">
                {startError && (
                  <div className="flex items-center gap-2 text-[12px] text-danger mb-3">
                    <AlertCircle size={13} />
                    <span>{startError}</span>
                  </div>
                )}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartExercises}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-mode-grammar to-violet-400 text-white font-semibold py-3.5 px-6 rounded-xl cursor-pointer border-none text-[14px] shadow-lg shadow-mode-grammar/20 transition-all"
                >
                  Start Exercises ({ex.exercises.length} questions)
                  <ArrowRight size={15} />
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ── Complete phase ────────────────────────────────────────────────────────
  if (ex.phase === 'complete') {
    const correctCount = ex.correct.filter(Boolean).length;
    const total = ex.exercises.length;
    const pct = Math.round((correctCount / total) * 100);

    return (
      <div className="flex flex-col h-screen pt-18">
        <SessionHeader session={session} onEnd={handleEnd} ending={ending} />
        <div className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-lg mx-auto text-center">
            {ending ? (
              <div className="flex flex-col items-center justify-center py-24">
                <LoadingDots text="Analyzing your results" />
                <p className="text-[11px] text-text-faint mt-3">Generating detailed feedback...</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="w-20 h-20 rounded-2xl bg-mode-grammar/12 flex items-center justify-center mx-auto mb-6">
                  <Trophy size={36} className="text-mode-grammar" />
                </div>
                <h2 className="text-2xl font-bold text-text-primary mb-1">Exercises Complete!</h2>

                {/* Animated score ring */}
                <div className="relative w-32 h-32 mx-auto my-6">
                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
                    <motion.circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={pct >= 80 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 52}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100) }}
                      transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.span
                      className={`text-3xl font-bold tabular-nums ${pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      {correctCount}/{total}
                    </motion.span>
                  </div>
                </div>

                <p className="text-sm text-text-muted mb-8">
                  {correctCount === total ? 'Perfect!' :
                   correctCount >= total * 0.8 ? 'Excellent work!' :
                   correctCount >= total * 0.5 ? 'Good effort!' :
                   'Review the lesson and try again!'}
                </p>

                {/* Exercise review — XSS safe: sentence rendered via JSX split */}
                <div className="text-left space-y-2 mb-8">
                  {ex.exercises.map((exercise, i) => {
                    const parts = exercise.sentence.split('____');
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className={`p-3 rounded-xl border ${ex.correct[i] ? 'bg-success/5 border-success/15' : 'bg-danger/5 border-danger/15'}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ex.correct[i] ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                            {ex.correct[i] ? <Check size={11} /> : <X size={11} />}
                          </div>
                          <div className="flex-1">
                            <p className="text-[13px] text-text-primary">
                              {parts[0]}
                              <strong className="text-mode-grammar">{exercise.blank}</strong>
                              {parts[1] ?? ''}
                            </p>
                            {!ex.correct[i] && ex.answers[i] && (
                              <p className="text-[12px] text-danger mt-1">Your answer: {ex.answers[i]}</p>
                            )}
                          </div>
                        </div>
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

  // ── Exercise phase ────────────────────────────────────────────────────────
  if (!currentExercise) return null;

  const correctChoiceIndex = isMultipleChoice
    ? currentExercise.choices!.findIndex(c => c.toLowerCase() === currentExercise.blank.toLowerCase())
    : -1;

  // Determine blank display state for the sentence card
  const blankDisplayClass = showResult
    ? lastTier === 'accent'
      ? 'border-warning/40 bg-warning/5 text-warning'
      : lastCorrect
      ? 'border-success/40 bg-success/5 text-success'
      : 'border-danger/40 bg-danger/5 text-danger'
    : 'border-mode-grammar/40 bg-mode-grammar/5 text-mode-grammar';

  return (
    <div className="flex flex-col h-screen pt-18">
      <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={ex.currentIndex > 0}>
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
            label="Exercise"
            color="bg-mode-grammar"
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={showResult ? `result-${exerciseIndex}` : `input-${exerciseIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Sentence with blank — XSS safe: JSX split, no dangerouslySetInnerHTML */}
              <motion.div
                className="bg-surface-2 border border-border rounded-2xl px-6 py-8 text-center mb-5"
                animate={shakeInput && showResult ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                transition={shakeInput && showResult ? { duration: 0.4 } : {}}
              >
                <SentenceWithBlank
                  sentence={currentExercise.sentence}
                  blankContent={showResult ? currentExercise.blank : '____'}
                  blankClassName={blankDisplayClass}
                />
              </motion.div>

              {/* Hint */}
              {currentExercise.hint && !showResult && (
                isMultipleChoice && !showHint ? (
                  <button
                    onClick={() => setShowHint(true)}
                    className="flex items-center gap-1.5 text-[12px] text-text-faint hover:text-warning cursor-pointer bg-transparent border-none mb-4 transition-colors"
                  >
                    <Lightbulb size={13} />
                    <span>Show hint</span>
                  </button>
                ) : (
                  <div className="flex items-start gap-2 bg-warning-muted border border-warning/15 rounded-xl px-3 py-2.5 mb-4">
                    <Lightbulb size={13} className="text-warning shrink-0 mt-0.5" />
                    <span className="text-[12px] text-text-secondary">{currentExercise.hint}</span>
                  </div>
                )
              )}

              {isMultipleChoice ? (
                /* Multiple choice (beginner) */
                <>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {currentExercise.choices!.map((choice, idx) => {
                      const isThisCorrect = idx === correctChoiceIndex;
                      const isThisSelected = idx === selected;
                      const isWrong = showResult && !isThisCorrect;
                      const isRight = showResult && isThisCorrect;

                      let cardClass = 'bg-surface-2 border-border hover:border-mode-grammar/50 hover:bg-mode-grammar/5';
                      if (isRight) {
                        cardClass = lastTier === 'accent'
                          ? 'bg-warning/10 border-warning/50 ring-2 ring-warning/30'
                          : 'bg-success/10 border-success/50 ring-2 ring-success/30';
                      } else if (isThisSelected && !lastCorrect) {
                        cardClass = 'bg-danger/10 border-danger/50';
                      } else if (isWrong) {
                        cardClass = 'bg-surface-2 border-border opacity-40';
                      }

                      return (
                        <motion.button
                          key={idx}
                          whileTap={showResult ? {} : { scale: 0.95 }}
                          whileHover={showResult ? {} : { scale: 1.02 }}
                          animate={
                            shakeCards.has(idx) && showResult
                              ? { x: [0, -6, 6, -6, 6, 0] }
                              : isRight
                              ? { scale: [1, 1.05, 1] }
                              : {}
                          }
                          transition={
                            shakeCards.has(idx) && showResult
                              ? { duration: 0.4 }
                              : isRight
                              ? { duration: 0.3 }
                              : {}
                          }
                          onClick={() => handleSelect(idx)}
                          disabled={showResult}
                          className={`relative p-4 rounded-xl border-2 text-[14px] font-semibold cursor-pointer transition-all duration-200 disabled:cursor-default ${cardClass}`}
                        >
                          {isRight && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md ${lastTier === 'accent' ? 'bg-warning' : 'bg-success'}`}
                            >
                              <Check size={12} className="text-white" />
                            </motion.div>
                          )}
                          {isThisSelected && !lastCorrect && showResult && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger flex items-center justify-center shadow-md"
                            >
                              <X size={12} className="text-white" />
                            </motion.div>
                          )}
                          <span className={isWrong && !isThisSelected ? 'text-text-faint' : 'text-text-primary'}>
                            {choice}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Result feedback for MC */}
                  {showResult && (
                    <TierFeedback
                      tier={lastTier}
                      wasCorrect={lastCorrect}
                      streak={streak}
                      correctAnswer={currentExercise.blank}
                      explanation={currentExercise.explanation}
                      onNext={handleNext}
                      isLast={ex.currentIndex >= ex.exercises.length}
                    />
                  )}
                </>
              ) : showResult ? (
                /* Result feedback (fill-in-the-blank) */
                <TierFeedback
                  tier={lastTier}
                  wasCorrect={lastCorrect}
                  streak={streak}
                  correctAnswer={currentExercise.blank}
                  explanation={currentExercise.explanation}
                  onNext={handleNext}
                  isLast={ex.currentIndex >= ex.exercises.length}
                />
              ) : (
                /* Text input (intermediate/advanced) */
                <div>
                  <div className="flex gap-3 items-end">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type the missing word..."
                      autoFocus
                      className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 text-[14px] text-text-primary placeholder:text-text-faint focus:border-border-focus transition-colors"
                    />
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={handleSubmit}
                      disabled={!input.trim()}
                      className="shrink-0 h-[46px] px-5 rounded-xl bg-mode-grammar hover:bg-mode-grammar/80 text-white font-medium text-[13px] cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Check
                    </motion.button>
                  </div>
                  <DiacriticsKeyboard inputRef={inputRef} value={input} onChange={setInput} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Tier-aware result feedback panel. */
function TierFeedback({
  tier,
  wasCorrect,
  streak,
  correctAnswer,
  explanation,
  onNext,
  isLast,
}: {
  tier: string | null;
  wasCorrect: boolean | null;
  streak: number;
  correctAnswer: string;
  explanation?: string;
  onNext: () => void;
  isLast: boolean;
}) {
  const isAccent = tier === 'accent';
  const isExact = tier === 'exact' || (wasCorrect && tier == null);
  const isWrong = !wasCorrect;

  // accent = correct (counted as correct) but diacritics note
  const panelClass = isWrong
    ? 'bg-danger/5 border-danger/20'
    : isAccent
    ? 'bg-warning/5 border-warning/20'
    : 'bg-success/5 border-success/20';

  const iconClass = isWrong ? 'text-danger' : isAccent ? 'text-warning' : 'text-success';
  const labelClass = isWrong ? 'text-danger' : isAccent ? 'text-warning' : 'text-success';

  const label = isWrong
    ? 'Not quite'
    : isAccent
    ? 'Takmer!'
    : streak >= 3
    ? `${streak} in a row!`
    : 'Correct!';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 border mb-5 ${panelClass}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {isWrong
          ? <X size={15} className={iconClass} />
          : <Check size={15} className={iconClass} />}
        <span className={`text-[13px] font-semibold ${labelClass}`}>{label}</span>
      </div>

      {isAccent && (
        <p className="text-[12px] text-text-secondary ml-[23px]">
          Watch the diacritics: <strong className="text-warning">{correctAnswer}</strong>
        </p>
      )}

      {isExact && !isAccent && explanation && (
        <p className="text-[12px] text-text-muted ml-[23px] mt-1">{explanation}</p>
      )}

      {isWrong && (
        <>
          <p className="text-[12px] text-text-secondary ml-[23px]">
            The correct answer is <strong className="text-success">{correctAnswer}</strong>
          </p>
          {explanation && (
            <p className="text-[12px] text-text-muted ml-[23px] mt-1">{explanation}</p>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNext}
            className="mt-3 ml-[23px] flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          >
            {isLast ? 'See Results' : 'Next'} <ArrowRight size={12} />
          </motion.button>
        </>
      )}

      {isAccent && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="mt-3 ml-[23px] flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          {isLast ? 'See Results' : 'Next'} <ArrowRight size={12} />
        </motion.button>
      )}
    </motion.div>
  );
}

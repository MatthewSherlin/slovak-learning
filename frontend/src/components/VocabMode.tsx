import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, Trophy, RotateCcw, Sparkles } from 'lucide-react';
import SessionHeader from './SessionHeader';
import ProgressBar from './ProgressBar';
import LoadingDots from './LoadingDots';
import { submitVocabAnswer, endSession, getSession } from '../lib/api';
import { playCorrect, playIncorrect } from '../lib/sounds';
import type { Session, SessionFeedback, VocabExerciseData } from '../lib/types';
import FeedbackView from './FeedbackView';

interface VocabModeProps {
  session: Session;
  setSession: (s: Session) => void;
  onEnd: () => void;
}

export default function VocabMode({ session, setSession }: VocabModeProps) {
  const ex = session.exercises as VocabExerciseData;
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [streak, setStreak] = useState(0);
  const [shakeCards, setShakeCards] = useState<Set<number>>(new Set());
  const pendingRef = useRef<Session | null>(null);

  const currentQuestion = ex.phase === 'retry'
    ? ex.questions[ex.currentIndex]
    : ex.questions[ex.currentIndex];

  const totalInPhase = ex.phase === 'retry' ? ex.retryQueue.length : ex.questions.length;
  const currentInPhase = ex.phase === 'retry'
    ? ex.retryQueue.indexOf(ex.currentIndex)
    : ex.currentIndex;

  const isCorrect = selected !== null ? selected === currentQuestion?.correctIndex : null;

  const handleSelect = useCallback(async (idx: number) => {
    if (showResult || !currentQuestion) return;
    setSelected(idx);
    setShowResult(true);

    const correct = idx === currentQuestion.correctIndex;

    if (correct) {
      setStreak(s => s + 1);
      playCorrect();
    } else {
      setStreak(0);
      playIncorrect();
      // Shake all wrong cards
      const wrongSet = new Set<number>();
      currentQuestion.choices.forEach((_, i) => {
        if (i !== currentQuestion.correctIndex) wrongSet.add(i);
      });
      setShakeCards(wrongSet);
    }

    const updated = await submitVocabAnswer(session.id, idx);
    pendingRef.current = updated;
  }, [showResult, currentQuestion, session.id]);

  const handleNext = useCallback(() => {
    if (pendingRef.current) {
      setSession(pendingRef.current);
      pendingRef.current = null;
    }
    setSelected(null);
    setShowResult(false);
    setShakeCards(new Set());
  }, [setSession]);

  // Auto-advance after correct answer
  useEffect(() => {
    if (showResult && isCorrect) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, isCorrect, handleNext]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      const fb = await endSession(session.id);
      setFeedback(fb);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch (err) {
      console.error('Failed to end session:', err);
      setEndError('Failed to get feedback. Please try again.');
      setEnding(false);
    }
  };

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  // ── Completion screen ─────────────────────────────────────────────
  if (ex.phase === 'complete') {
    const correctCount = ex.answers.filter((a, i) => a === ex.questions[i].correctIndex).length;
    const total = ex.questions.length;
    const pct = Math.round((correctCount / total) * 100);

    return (
      <div className="flex flex-col h-screen pt-14">
        <SessionHeader session={session} onEnd={handleEnd} ending={ending} />
        <div className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-lg mx-auto text-center">
            {ending ? (
              <div className="py-12">
                <LoadingDots text="Analyzing your results" />
                <p className="text-[11px] text-text-faint mt-3">Generating detailed feedback...</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="w-20 h-20 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-6">
                  <Trophy size={36} className="text-accent" />
                </div>
                <h2 className="text-2xl font-bold text-text-primary mb-1">Quiz Complete!</h2>

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
                  {correctCount === total ? 'Perfect score! Amazing work!' :
                   correctCount >= total * 0.8 ? 'Great job! Almost perfect!' :
                   correctCount >= total * 0.5 ? 'Good effort, keep practicing!' :
                   'Keep at it — practice makes perfect!'}
                </p>

                {/* Word review */}
                <div className="text-left space-y-2 mb-8">
                  {ex.questions.map((q, i) => {
                    const wasCorrect = ex.answers[i] === q.correctIndex;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className={`flex items-center gap-3 p-3 rounded-xl border ${wasCorrect ? 'bg-success/5 border-success/15' : 'bg-danger/5 border-danger/15'}`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${wasCorrect ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                          {wasCorrect ? <Check size={12} /> : <X size={12} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-semibold text-text-primary">{q.word}</span>
                          <span className="text-text-faint mx-2 text-[11px]">&rarr;</span>
                          <span className="text-[13px] text-text-secondary">{q.choices[q.correctIndex]}</span>
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
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-sky-400 hover:from-accent-hover hover:to-sky-300 text-white font-semibold py-3.5 px-6 rounded-xl cursor-pointer border-none text-[14px] shadow-lg shadow-accent/20 transition-all"
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

  if (!currentQuestion) return null;

  const directionLabel = currentQuestion.direction === 'sk-en'
    ? 'What does this mean in English?'
    : 'What is this in Slovak?';

  // ── Active quiz ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen pt-14">
      <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={currentInPhase > 0}>
        <div className="flex items-center gap-3">
          {ex.phase === 'retry' && (
            <div className="flex items-center gap-1.5 text-[11px] text-warning font-medium">
              <RotateCcw size={11} />
              Retry round
            </div>
          )}
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
        </div>
      </SessionHeader>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-lg mx-auto">
          <ProgressBar
            current={currentInPhase}
            total={totalInPhase}
            label={ex.phase === 'retry' ? 'Retry' : 'Question'}
            color="bg-mode-vocab"
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={`${ex.phase}-${ex.currentIndex}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Direction label */}
              <p className="text-[12px] text-text-faint mb-4 text-center uppercase tracking-wider font-medium">
                {directionLabel}
              </p>

              {/* Flashcard word */}
              <motion.div
                className="relative bg-gradient-to-br from-surface-2 to-surface-3 border border-border rounded-2xl px-8 py-12 text-center mb-8 overflow-hidden"
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {/* Subtle gradient accent */}
                <div className="absolute inset-0 bg-gradient-to-br from-mode-vocab/5 to-transparent pointer-events-none" />
                <span className="relative text-4xl font-bold text-text-primary tracking-tight">
                  {currentQuestion.word}
                </span>
                <div className="relative mt-3 text-[11px] text-text-faint font-medium uppercase tracking-widest">
                  {currentQuestion.direction === 'sk-en' ? 'Slovak' : 'English'}
                </div>
              </motion.div>

              {/* Choice cards — 2x2 grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {currentQuestion.choices.map((choice, idx) => {
                  const isThisCorrect = idx === currentQuestion.correctIndex;
                  const isThisSelected = idx === selected;
                  const isWrong = showResult && !isThisCorrect;
                  const isRight = showResult && isThisCorrect;

                  let cardClass = 'bg-surface-2 border-border hover:border-mode-vocab/50 hover:bg-mode-vocab/5';
                  if (isRight) {
                    cardClass = 'bg-success/10 border-success/50 ring-2 ring-success/30';
                  } else if (isThisSelected && !isCorrect) {
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
                      className={`relative p-5 rounded-xl border-2 text-[15px] font-semibold cursor-pointer transition-all duration-200 disabled:cursor-default ${cardClass}`}
                    >
                      {/* Correct indicator */}
                      {isRight && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-success flex items-center justify-center shadow-md"
                        >
                          <Check size={12} className="text-white" />
                        </motion.div>
                      )}
                      {isThisSelected && !isCorrect && showResult && (
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

              {/* Explanation + Next on wrong answer */}
              <AnimatePresence>
                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`rounded-xl p-4 border ${
                      isCorrect
                        ? 'bg-success/5 border-success/20'
                        : 'bg-danger/5 border-danger/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isCorrect ? (
                        <Check size={15} className="text-success" />
                      ) : (
                        <X size={15} className="text-danger" />
                      )}
                      <span className={`text-[13px] font-semibold ${isCorrect ? 'text-success' : 'text-danger'}`}>
                        {isCorrect
                          ? streak >= 3 ? `${streak} in a row!` : 'Correct!'
                          : 'Not quite'}
                      </span>
                    </div>
                    {!isCorrect && (
                      <p className="text-[12px] text-text-secondary ml-[23px]">
                        The answer is <strong className="text-success">{currentQuestion.choices[currentQuestion.correctIndex]}</strong>
                      </p>
                    )}
                    {currentQuestion.explanation && (
                      <p className="text-[12px] text-text-muted ml-[23px] mt-1">
                        {currentQuestion.explanation}
                      </p>
                    )}

                    {!isCorrect && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleNext}
                        className="mt-3 ml-[23px] flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold bg-surface-2 border border-border text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                      >
                        Next <ArrowRight size={12} />
                      </motion.button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

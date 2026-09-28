import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Volume2, Flame } from 'lucide-react';
import SessionHeader from './SessionHeader';
import LoadingDots from './LoadingDots';
import { submitVocabAnswer, endSession, getSession } from '../lib/api';
import { renderInlineMd } from '../lib/mdlite';
import { playCorrect, playIncorrect } from '../lib/sounds';
import type { Session, SessionFeedback, VocabExerciseData } from '../lib/types';
import FeedbackView from './FeedbackView';

interface VocabModeProps {
  session: Session;
  setSession: (s: Session) => void;
}

export default function VocabMode({ session, setSession }: VocabModeProps) {
  // Narrow in a wrapper so every hook in the inner component runs unconditionally.
  if (session.exercises?.type !== 'vocabulary') return null;
  return <VocabModeInner session={session} ex={session.exercises} setSession={setSession} />;
}

function VocabModeInner({
  session,
  ex,
  setSession,
}: VocabModeProps & { ex: VocabExerciseData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [streak, setStreak] = useState(0);
  // State (not a ref) so the auto-advance effect waits for the server ack.
  const [pending, setPending] = useState<Session | null>(null);
  // Bug fix RISK: sync ref guard so end-session can't double-fire
  const endingRef = useRef(false);

  const currentQuestion = ex.questions[ex.currentIndex] ?? null;

  // Bug fix #7: derive progress from answers state — never use retryQueue.indexOf(currentIndex)
  // During retry: filled = words mastered so far = questions.length - retryQueue.length
  const totalInPhase = ex.questions.length;
  const currentInPhase = ex.phase === 'retry'
    ? ex.questions.length - ex.retryQueue.length
    : ex.currentIndex;

  const isCorrect = selected !== null && currentQuestion !== null
    ? selected === currentQuestion.correctIndex
    : null;

  const handleSelect = useCallback(async (idx: number) => {
    if (showResult || !currentQuestion) return;
    setSelected(idx);
    setShowResult(true);
    setSubmitError('');

    const correct = idx === currentQuestion.correctIndex;
    if (correct) {
      setStreak(s => s + 1);
      playCorrect();
    } else {
      setStreak(0);
      playIncorrect();
    }

    try {
      const updated = await submitVocabAnswer(session.id, idx);
      setPending(updated);
    } catch {
      // Answer never reached the server — let the user re-select.
      setSelected(null);
      setShowResult(false);
      setSubmitError('Connection hiccup — that answer was not saved. Try again.');
    }
  }, [showResult, currentQuestion, session.id]);

  const handleNext = useCallback(() => {
    if (!pending) return; // server hasn't acknowledged the answer yet
    setSession(pending);
    setPending(null);
    setSelected(null);
    setShowResult(false);
  }, [pending, setSession]);

  const handleEnd = useCallback(async () => {
    // Sync ref guard prevents double-fire
    if (endingRef.current || feedback) return;
    endingRef.current = true;
    setEnding(true);
    setEndError('');
    try {
      const fb = await endSession(session.id);
      setFeedback(fb);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch (err) {
      console.error('Failed to end session:', err);
      setEndError('Failed to get feedback. Please try again.');
      setEnding(false);
      endingRef.current = false;
    }
  }, [feedback, session.id, setSession]);

  // Auto-advance after correct answer — only once the server has responded,
  // otherwise a slow request would advance the UI past an unsaved answer.
  useEffect(() => {
    if (showResult && isCorrect && pending) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, isCorrect, pending, handleNext]);

  // Auto-end when exercises complete
  useEffect(() => {
    if (ex.phase === 'complete' && !endingRef.current && !feedback) {
      handleEnd();
    }
  }, [ex.phase, feedback, handleEnd]);

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  // ── Completion / ending loading screen ─────────────────────────────────
  if (ex.phase === 'complete') {
    return (
      <div className="flex flex-col h-screen" style={{ background: '#0e1017' }}>
        <div className="flex-1 flex items-center justify-center px-6">
          {endError ? (
            /* Never trap the user on a spinner: failed feedback gets a retry */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-[13px] mb-4" style={{ color: '#f07070' }}>{endError}</p>
              <button
                onClick={handleEnd}
                style={{
                  padding: '12px 24px', borderRadius: 14, border: 'none',
                  background: '#5ea4f7', color: '#fff', fontSize: 14,
                  fontWeight: 700, cursor: 'pointer', marginBottom: 12,
                }}
              >
                Try again
              </button>
              <a href="#/" style={{ fontSize: 12, color: '#6b7289' }}>Back to Home</a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24">
              <LoadingDots text="Analyzing your results" />
              <p className="text-[11px] mt-3" style={{ color: '#6b7289' }}>Generating detailed feedback...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const directionLabel = currentQuestion.direction === 'sk-en'
    ? 'What does this mean in English?'
    : 'What is this in Slovak?';

  // ── Progress segments ─────────────────────────────────────────────────
  // Always use total questions as segment count; filled = words mastered so far
  const progressSegments = Array.from({ length: ex.questions.length }, (_, i) => i < currentInPhase);

  // ── Active quiz ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen" style={{ background: '#0e1017' }}>
      {/* Header row: close + progress segments + streak */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 20px 16px 20px' }}>
        <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={currentInPhase > 0}>
          {/* progress segments rendered inside header slot */}
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {progressSegments.map((filled, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 999,
                  background: filled ? '#5de4a5' : 'rgba(255,255,255,0.09)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          {/* Streak badge */}
          {streak >= 3 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 999,
                background: 'rgba(245,196,94,0.12)', flexShrink: 0,
              }}
            >
              <Flame size={12} color="#f5c45e" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#f5c45e', fontVariantNumeric: 'tabular-nums' }}>
                {streak}
              </span>
            </motion.div>
          )}
        </SessionHeader>
      </div>

      {/* Progress label */}
      <div style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 4 }}>
        {ex.phase === 'retry' ? (
          <p data-testid="retry-progress" style={{ fontSize: 11, color: '#f5c45e', fontWeight: 600, margin: 0 }}>
            Retry round · {ex.retryQueue.length} left
          </p>
        ) : (
          <p data-testid="questions-progress" style={{ fontSize: 11, color: '#6b7289', fontWeight: 500, margin: 0 }}>
            {currentInPhase} / {totalInPhase}
          </p>
        )}
        {submitError && (
          <p style={{ fontSize: 11, color: '#f07070', fontWeight: 600, margin: '4px 0 0 0' }}>
            {submitError}
          </p>
        )}
      </div>

      {/* Scrollable quiz body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0 20px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${ex.phase}-${ex.currentIndex}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            {/* Direction label */}
            <p style={{
              fontSize: 12, color: '#6b7289', textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              fontWeight: 600, margin: '0 0 20px 0',
            }}>
              {directionLabel}
            </p>

            {/* Word card */}
            <motion.div
              style={{
                borderRadius: 26,
                padding: '44px 24px',
                textAlign: 'center',
                marginBottom: 28,
                background: 'radial-gradient(circle at 50% 0%, rgba(93,228,165,0.08), transparent 65%), #151926',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
              initial={{ rotateY: 90 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <div style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginBottom: 10,
                color: '#eef1f8',
              }}>
                {currentQuestion.word}
              </div>
              {/* Pronunciation pill — JetBrains Mono — only shown when pronunciation data is available */}
              {currentQuestion.direction === 'sk-en' && currentQuestion.pronunciation && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <Volume2 size={14} color="#5ea4f7" />
                  <span style={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#a3aabe',
                  }}>
                    /{currentQuestion.pronunciation}/
                  </span>
                </div>
              )}
            </motion.div>

            {/* Choice grid — 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {currentQuestion.choices.map((choice, idx) => {
                const isThisCorrect = idx === currentQuestion.correctIndex;
                const isThisSelected = idx === selected;
                const isWrongSelected = showResult && isThisSelected && !isThisCorrect;
                const isRight = showResult && isThisCorrect;
                const isDimmed = showResult && !isThisCorrect && !isThisSelected;

                let borderColor = 'rgba(255,255,255,0.07)';
                let bg = '#151926';
                let boxShadow = 'none';
                let opacity = isDimmed ? 0.5 : 1;
                let textColor = isDimmed ? '#4a5068' : '#eef1f8';

                if (isRight) {
                  borderColor = '#5de4a5';
                  bg = 'rgba(93,228,165,0.1)';
                  boxShadow = '0 0 20px rgba(93,228,165,0.15)';
                  textColor = '#eef1f8';
                  opacity = 1;
                } else if (isWrongSelected) {
                  borderColor = '#f07070';
                  bg = 'rgba(240,112,112,0.1)';
                  textColor = '#eef1f8';
                }

                return (
                  <motion.button
                    key={idx}
                    onClick={() => handleSelect(idx)}
                    disabled={showResult}
                    whileTap={showResult ? {} : { scale: 0.97 }}
                    animate={isWrongSelected && showResult ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                    transition={isWrongSelected ? { duration: 0.4 } : {}}
                    style={{
                      minHeight: 64,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 18,
                      border: `2px solid ${borderColor}`,
                      background: bg,
                      fontSize: 15,
                      fontWeight: isRight ? 700 : 600,
                      color: textColor,
                      position: 'relative',
                      cursor: showResult ? 'default' : 'pointer',
                      boxShadow,
                      opacity,
                      transition: 'border-color 0.2s, background 0.2s, opacity 0.2s',
                    }}
                  >
                    {/* Correct badge */}
                    {isRight && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                          position: 'absolute', top: -9, right: -9,
                          width: 26, height: 26, borderRadius: 999,
                          background: '#5de4a5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                        }}
                      >
                        <Check size={13} color="#0e1017" strokeWidth={3.2} />
                      </motion.div>
                    )}
                    {/* Wrong selected badge */}
                    {isWrongSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                          position: 'absolute', top: -9, right: -9,
                          width: 26, height: 26, borderRadius: 999,
                          background: '#f07070',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                        }}
                      >
                        <X size={13} color="#0e1017" strokeWidth={3.2} />
                      </motion.div>
                    )}
                    <span>{choice}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom result panel */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              background: isCorrect ? 'rgba(93,228,165,0.1)' : 'rgba(240,112,112,0.08)',
              borderTop: isCorrect
                ? '1px solid rgba(93,228,165,0.25)'
                : '1px solid rgba(240,112,112,0.2)',
              padding: '20px 20px 32px 20px',
            }}
          >
            {isCorrect ? (
              <>
                {/* Correct row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 999,
                      background: '#5de4a5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={15} color="#0e1017" strokeWidth={3.2} />
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#5de4a5' }}>
                      {streak >= 3 ? `${streak} in a row!` : 'Správne!'}
                    </span>
                  </div>
                  {/* No fake per-answer XP — real XP is awarded per session
                      and shown on the feedback screen */}
                </div>
                {/* Continue button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleNext}
                  disabled={!pending}
                  style={{
                    width: '100%', height: 52,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 16,
                    background: '#5de4a5',
                    color: '#0e1017',
                    fontSize: 16,
                    fontWeight: 800,
                    border: 'none',
                    cursor: pending ? 'pointer' : 'wait',
                    opacity: pending ? 1 : 0.6,
                  }}
                >
                  Continue
                </motion.button>
              </>
            ) : (
              <>
                {/* Wrong row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: '#f07070',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <X size={15} color="#0e1017" strokeWidth={3.2} />
                  </div>
                  <div>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#f07070' }}>
                      Not quite
                    </span>
                    <p style={{ fontSize: 12, color: '#a3aabe', margin: '4px 0 0 0' }}>
                      The answer is{' '}
                      <strong style={{ color: '#5de4a5' }}>
                        {currentQuestion.choices[currentQuestion.correctIndex]}
                      </strong>
                    </p>
                    {currentQuestion.explanation && (
                      <p style={{ fontSize: 12, color: '#6b7289', margin: '3px 0 0 0' }}>
                        {renderInlineMd(currentQuestion.explanation)}
                      </p>
                    )}
                  </div>
                </div>
                {/* Continue button (wrong) */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleNext}
                  disabled={!pending}
                  style={{
                    width: '100%', height: 52,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 16,
                    background: '#1e2130',
                    border: '1px solid rgba(240,112,112,0.3)',
                    color: '#eef1f8',
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: pending ? 'pointer' : 'wait',
                    opacity: pending ? 1 : 0.6,
                  }}
                >
                  Continue
                </motion.button>
              </>
            )}
            {endError && (
              <p style={{ color: '#f07070', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{endError}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

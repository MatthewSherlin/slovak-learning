import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, X, Volume2, Flame } from 'lucide-react';
import SessionHeader from './SessionHeader';
import { submitVocabAnswer, endSession, getSession } from '../lib/api';
import { renderInlineMd } from '../lib/mdlite';
import { playCorrect, playIncorrect } from '../lib/sounds';
import { speakSlovak, cancelSpeech, useCanSpeakSlovak } from '../lib/speech';
import { ADVANCE_AFTER_CORRECT_MS, SCREEN_FADE_S } from '../lib/pacing';
import type { Session, SessionFeedback, VocabExerciseData } from '../lib/types';
import FeedbackView from './FeedbackView';
import ResultsLoader from './ResultsLoader';

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
  const reduceMotion = useReducedMotion();
  const canSpeak = useCanSpeakSlovak();

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
      const updated = await submitVocabAnswer(session.id, idx, ex.currentIndex);
      setPending(updated);
    } catch (e) {
      setSelected(null);
      setShowResult(false);
      // The server already has an answer for this question (its reply was
      // lost): show the question it is really on, without an error.
      if (e instanceof Error && e.message.includes('stale_answer')) {
        try {
          setSession(await getSession(session.id));
          return;
        } catch {
          // Fall through to the connection message.
        }
      }
      // Answer never reached the server — let the user re-select.
      setSubmitError('Connection hiccup — that answer was not saved. Try again.');
    }
  }, [showResult, currentQuestion, session.id, ex.currentIndex, setSession]);

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
      const timer = setTimeout(handleNext, ADVANCE_AFTER_CORRECT_MS);
      return () => clearTimeout(timer);
    }
  }, [showResult, isCorrect, pending, handleNext]);

  // Stop any word being spoken when the question changes or the lesson is left,
  // so it is not read over the next screen.
  useEffect(() => cancelSpeech, [ex.phase, ex.currentIndex]);

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
      <div className="flex flex-col h-dvh" style={{ background: 'var(--color-surface-sunken)' }}>
        <div className="flex-1 flex items-center justify-center px-5">
          {endError ? (
            /* Never trap the user on a spinner: failed feedback gets a retry */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-[13px] mb-4" style={{ color: 'var(--color-danger)' }}>{endError}</p>
              <button
                onClick={handleEnd}
                style={{
                  padding: '12px 24px', borderRadius: 14, border: 'none',
                  background: 'var(--color-accent)', color: 'var(--color-on-accent)', fontSize: 14,
                  fontWeight: 700, cursor: 'pointer', marginBottom: 12,
                }}
              >
                Try again
              </button>
              <a href="#/" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Back to Home</a>
            </div>
          ) : (
            <ResultsLoader />
          )}
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const directionLabel = currentQuestion.direction === 'sk-en'
    ? 'What does this mean in English?'
    : 'What is this in Slovak?';

  // The Slovak word to say aloud: the prompt when it is Slovak; the answer once
  // given when the prompt is English (earlier would give the answer away).
  const spokenWord = currentQuestion.direction === 'sk-en'
    ? currentQuestion.word
    : showResult ? currentQuestion.choices[currentQuestion.correctIndex] : null;
  const pronunciationPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '7px 14px', borderRadius: 999,
    background: 'var(--color-overlay-05)',
    border: '1px solid var(--color-overlay-07)',
  };
  const pronunciationText: React.CSSProperties = {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
  };
  // 44px-tall tap target around the pill; the negative margin keeps the card its original height.
  const pronunciationTapArea: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', verticalAlign: 'top',
    minHeight: 44, margin: '-5px 0', padding: 0,
    background: 'none', border: 'none',
  };

  // ── Progress segments ─────────────────────────────────────────────────
  // Always use total questions as segment count; filled = words mastered so far
  const progressSegments = Array.from({ length: ex.questions.length }, (_, i) => i < currentInPhase);

  // ── Active quiz ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh" style={{ background: 'var(--color-surface-sunken)' }}>
      {/* Header: back + progress segments + streak, edge to edge like the other modes */}
      <SessionHeader
        session={session}
        onEnd={handleEnd}
        ending={ending}
        canEnd={currentInPhase > 0}
        progress={
          /* One segment per question, on its own row: there is no room beside the end button on a 360px phone */
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${progressSegments.length}, minmax(0, 1fr))`, gap: 4 }}>
            {progressSegments.map((filled, i) => (
              <div
                key={i}
                data-testid="progress-segment"
                data-filled={filled}
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: filled ? 'var(--color-success)' : 'var(--color-overlay-09)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        }
      >
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
            <Flame size={12} color="var(--color-warning)" />
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-warning)', fontVariantNumeric: 'tabular-nums' }}>
              {streak}
            </span>
          </motion.div>
        )}
      </SessionHeader>

      {/* Progress label */}
      <div style={{ paddingTop: 16, paddingLeft: 20, paddingRight: 20, paddingBottom: 4 }}>
        {ex.phase === 'retry' ? (
          <p data-testid="retry-progress" style={{ fontSize: 11, color: 'var(--color-warning)', fontWeight: 600, margin: 0 }}>
            Retry round · {ex.retryQueue.length} left
          </p>
        ) : (
          <p data-testid="questions-progress" style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, margin: 0 }}>
            {currentInPhase} / {totalInPhase}
          </p>
        )}
        {submitError && (
          <p style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 600, margin: '4px 0 0 0' }}>
            {submitError}
          </p>
        )}
      </div>

      {/* Scrollable quiz body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px env(safe-area-inset-bottom) 20px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${ex.phase}-${ex.currentIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : SCREEN_FADE_S, ease: 'easeOut' }}
          >
            {/* Direction label */}
            <p style={{
              fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              fontWeight: 600, margin: '0 0 20px 0',
            }}>
              {directionLabel}
              {currentQuestion.review && (
                <span style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(245,196,94,0.12)', color: 'var(--color-warning)',
                  letterSpacing: '0.08em',
                }}>
                  Review
                </span>
              )}
            </p>

            {/* Word card — fades in with the question */}
            <div
              style={{
                borderRadius: 26,
                padding: '44px 24px',
                textAlign: 'center',
                marginBottom: 28,
                background: 'radial-gradient(circle at 50% 0%, rgba(93,228,165,0.08), transparent 65%), var(--color-surface-card)',
                border: '1px solid var(--color-overlay-07)',
              }}
            >
              <div style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginBottom: 10,
                color: 'var(--color-text-primary)',
              }}>
                {currentQuestion.word}
              </div>
              {/* Pronunciation pill — JetBrains Mono. With a Slovak voice on the
                  phone it is a button that says the word; without one it shows
                  the phonetic hint alone, with no speaker icon. */}
              {canSpeak && spokenWord !== null ? (
                <button
                  type="button"
                  onClick={() => speakSlovak(spokenWord)}
                  aria-label={`Hear ${spokenWord}`}
                  style={{ ...pronunciationTapArea, cursor: 'pointer' }}
                >
                  <span style={pronunciationPill}>
                    <Volume2 size={14} color="var(--color-accent)" />
                    <span style={pronunciationText}>
                      {currentQuestion.pronunciation ? `/${currentQuestion.pronunciation}/` : 'Listen'}
                    </span>
                  </span>
                </button>
              ) : canSpeak && currentQuestion.direction === 'en-sk' ? (
                /* Holds the button's place until the learner answers, so the choices do not move down */
                <span aria-hidden="true" style={{ ...pronunciationTapArea, visibility: 'hidden' }}>
                  <span style={pronunciationPill}>
                    <Volume2 size={14} />
                    <span style={pronunciationText}>Listen</span>
                  </span>
                </span>
              ) : currentQuestion.direction === 'sk-en' && currentQuestion.pronunciation ? (
                <div style={pronunciationPill}>
                  <span style={pronunciationText}>
                    /{currentQuestion.pronunciation}/
                  </span>
                </div>
              ) : null}
            </div>

            {/* Choice grid — 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {currentQuestion.choices.map((choice, idx) => {
                const isThisCorrect = idx === currentQuestion.correctIndex;
                const isThisSelected = idx === selected;
                const isWrongSelected = showResult && isThisSelected && !isThisCorrect;
                const isRight = showResult && isThisCorrect;
                const isDimmed = showResult && !isThisCorrect && !isThisSelected;

                let borderColor = 'var(--color-overlay-07)';
                let bg = 'var(--color-surface-card)';
                let boxShadow = 'none';
                let opacity = isDimmed ? 0.5 : 1;
                let textColor = isDimmed ? 'var(--color-text-faint)' : 'var(--color-text-primary)';

                if (isRight) {
                  borderColor = 'var(--color-success)';
                  bg = 'rgba(93,228,165,0.1)';
                  boxShadow = '0 0 20px rgba(93,228,165,0.15)';
                  textColor = 'var(--color-text-primary)';
                  opacity = 1;
                } else if (isWrongSelected) {
                  borderColor = 'var(--color-danger)';
                  bg = 'rgba(240,112,112,0.1)';
                  textColor = 'var(--color-text-primary)';
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
                          background: 'var(--color-success)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 10px var(--color-shadow-badge)',
                        }}
                      >
                        <Check size={13} color="var(--color-surface-sunken)" strokeWidth={3.2} />
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
                          background: 'var(--color-danger)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 10px var(--color-shadow-badge)',
                        }}
                      >
                        <X size={13} color="var(--color-surface-sunken)" strokeWidth={3.2} />
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
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
            style={{
              background: isCorrect ? 'rgba(93,228,165,0.1)' : 'rgba(240,112,112,0.08)',
              borderTop: isCorrect
                ? '1px solid rgba(93,228,165,0.25)'
                : '1px solid rgba(240,112,112,0.2)',
              padding: '20px 20px max(32px, env(safe-area-inset-bottom)) 20px',
            }}
          >
            {isCorrect ? (
              <>
                {/* Correct row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 999,
                      background: 'var(--color-success)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={15} color="var(--color-surface-sunken)" strokeWidth={3.2} />
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-success)' }}>
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
                    background: 'var(--color-success)',
                    color: 'var(--color-surface-sunken)',
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
                    background: 'var(--color-danger)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <X size={15} color="var(--color-surface-sunken)" strokeWidth={3.2} />
                  </div>
                  <div>
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-danger)' }}>
                      Not quite
                    </span>
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                      The answer is{' '}
                      <strong style={{ color: 'var(--color-success)' }}>
                        {currentQuestion.choices[currentQuestion.correctIndex]}
                      </strong>
                    </p>
                    {currentQuestion.explanation && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0 0' }}>
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
                    background: 'var(--color-surface-button)',
                    border: '1px solid rgba(240,112,112,0.3)',
                    color: 'var(--color-text-primary)',
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
              <p style={{ color: 'var(--color-danger)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{endError}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

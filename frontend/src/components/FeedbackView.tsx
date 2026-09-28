import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Session, SessionFeedback } from '../lib/types';
import { listItemFade } from '../lib/pacing';
import {
  breakdownScores,
  conversationSummary,
  grammarRows,
  translationRows,
  vocabRows,
  type VocabOutcome,
} from '../lib/results';

interface FeedbackViewProps {
  session: Session;
  feedback: SessionFeedback;
}

function encouragement(score: number): string {
  if (score >= 9) return 'Výborne!';
  if (score >= 7) return 'Dobre!';
  if (score >= 5) return 'Pokračuj!';
  return 'Skús znova!';
}

function encouragementMessage(score: number): string {
  if (score >= 9) return 'Excellent work! Your Slovak is coming along beautifully.';
  if (score >= 7) return 'Good progress. Focus on the areas below to level up.';
  if (score >= 5) return "You're making progress. Review the vocabulary and try again.";
  return "Everyone starts somewhere. Check out the Guides page and give it another shot.";
}

function barGradient(score: number): string {
  if (score >= 8) return 'linear-gradient(90deg, var(--color-score-good-from), var(--color-success))';
  if (score >= 5) return 'linear-gradient(90deg, var(--color-score-warn-from), var(--color-warning))';
  return 'linear-gradient(90deg, var(--color-score-danger-from), var(--color-score-danger))';
}

function scoreColor(score: number): string {
  if (score >= 8) return 'var(--color-success)';
  if (score >= 5) return 'var(--color-warning)';
  return 'var(--color-score-danger)';
}

function formatTopic(topic: string): string {
  return topic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMode(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

const VOCAB_OUTCOME: Record<VocabOutcome, { label: string; color: string }> = {
  first_try: { label: 'First try', color: 'var(--color-success)' },
  retry: { label: 'On retry', color: 'var(--color-warning)' },
  missed: { label: 'Missed', color: 'var(--color-score-danger)' },
};

const sectionStyle = {
  borderRadius: 22,
  background: 'var(--color-surface-card)',
  border: '1px solid var(--color-overlay-06)',
  padding: 20,
  marginBottom: 14,
};

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 700,
  margin: '0 0 14px 0',
  color: 'var(--color-text-primary)',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 14,
  background: 'var(--color-overlay-03)',
  border: '1px solid var(--color-overlay-05)',
};

const rowStatusStyle = {
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums' as const,
};

/** "Your answers", with how many were answered when the lesson ended early. */
function AnswersHeading({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return <h3 style={sectionTitleStyle}>Your answers</h3>;
  return (
    <>
      <h3 style={{ ...sectionTitleStyle, margin: '0 0 4px 0' }}>Your answers</h3>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '0 0 14px 0' }}>
        {shown} of {total} answered
      </p>
    </>
  );
}

const RING_R = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function FeedbackView({ session, feedback }: FeedbackViewProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  // Built from the lesson itself; text a model once wrote about it is ignored.
  const ex = session.exercises;
  const conversation = ex?.type === 'conversation' ? conversationSummary(ex, session.messages) : null;
  const vocab = ex?.type === 'vocabulary' ? vocabRows(ex) : [];
  const grammar = ex?.type === 'grammar' ? grammarRows(ex) : [];
  const translation = ex?.type === 'translation' ? translationRows(ex) : [];
  const score = conversation ? null : feedback.overall_score;
  // A lesson from before exercises existed shows its score card alone.
  const itemTotal = ex?.type === 'vocabulary' ? ex.questions.length
    : ex?.type === 'grammar' || ex?.type === 'translation' ? ex.exercises.length
    : 0;
  const breakdown = breakdownScores(feedback);
  const showBreakdown = !!ex && !conversation && breakdown.length > 0;

  return (
    <div className="min-h-dvh">
      <div className="max-w-2xl mx-auto px-5 py-10">

        {/* Score hero card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            textAlign: 'center',
            marginBottom: '20px',
            padding: '28px 20px',
            borderRadius: '26px',
            background: 'radial-gradient(circle at 50% 0%, rgba(94,164,247,0.1), transparent 70%), var(--color-surface-card)',
            border: '1px solid var(--color-overlay-07)',
          }}
        >
          {score !== null && (
            <>
              {/* Animated ring */}
              <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto 16px auto' }}>
                <svg
                  viewBox="0 0 132 132"
                  style={{ width: 132, height: 132, transform: 'rotate(-90deg)', display: 'block' }}
                >
                  <circle
                    cx="66" cy="66" r={RING_R}
                    fill="none"
                    stroke="var(--color-overlay-07)"
                    strokeWidth="9"
                  />
                  <motion.circle
                    cx="66" cy="66" r={RING_R}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                    animate={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - score / 10) }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    style={{
                      fontSize: 38,
                      fontWeight: 800,
                      color: 'var(--color-accent)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {score}
                  </motion.span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>out of 10</span>
                </div>
              </div>

              {/* Encouragement label */}
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  margin: '0 0 6px 0',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-primary)',
                }}
              >
                {encouragement(score)}
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--color-text-muted)',
                  margin: '0 auto',
                  maxWidth: 280,
                  lineHeight: 1.55,
                }}
              >
                {encouragementMessage(score)}
              </p>
            </>
          )}

          {/* Conversation: messages sent, in place of the ring */}
          {conversation && (
            <div style={{ margin: '0 auto 4px auto' }}>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                style={{
                  display: 'block',
                  fontSize: 38,
                  fontWeight: 800,
                  color: 'var(--color-accent)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {conversation.sent}
              </motion.span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                of {conversation.max} messages sent
              </span>
            </div>
          )}

          {/* Mode / topic / difficulty chips */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'rgba(93,228,165,0.12)',
                color: 'var(--color-success)',
              }}
            >
              {formatMode(session.mode)}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'var(--color-overlay-06)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {formatTopic(session.topic)}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'var(--color-overlay-06)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {formatMode(session.difficulty)}
            </span>
          </div>
        </motion.div>

        {/* Breakdown bars */}
        {showBreakdown && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{
              borderRadius: 22,
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-overlay-06)',
              padding: 20,
              marginBottom: 14,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: '0 0 18px 0',
                color: 'var(--color-text-primary)',
              }}
            >
              Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {breakdown.map((s, i) => (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 7,
                    }}
                  >
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                    >
                      {s.category}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: scoreColor(s.score),
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {s.score}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 999,
                      background: 'var(--color-overlay-06)',
                      overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.score * 10}%` }}
                      transition={reduceMotion ? { duration: 0 } : {
                        delay: 0.2 + i * 0.12,
                        duration: 0.8,
                        ease: 'easeOut',
                      }}
                      style={{
                        height: '100%',
                        borderRadius: 999,
                        background: barGradient(s.score),
                      }}
                    />
                  </div>
                  {s.comment && (
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        margin: '7px 0 0 0',
                        lineHeight: 1.55,
                      }}
                    >
                      {s.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Vocabulary: each word and how it went */}
        {vocab.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            style={sectionStyle}
          >
            <AnswersHeading shown={vocab.length} total={itemTotal} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vocab.map((row, i) => (
                <motion.div key={i} {...listItemFade(i, reduceMotion)} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)' }}>{row.slovak}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginLeft: 10 }}>{row.english}</span>
                  </div>
                  <span style={{ ...rowStatusStyle, color: VOCAB_OUTCOME[row.outcome].color }}>
                    {VOCAB_OUTCOME[row.outcome].label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Grammar: each sentence, what was typed, right or wrong */}
        {grammar.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            style={sectionStyle}
          >
            <AnswersHeading shown={grammar.length} total={itemTotal} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grammar.map((row, i) => (
                <motion.div key={i} {...listItemFade(i, reduceMotion)} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.45 }}>
                      {row.sentence}
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                      You typed: {row.typed}
                    </p>
                  </div>
                  <span style={{ ...rowStatusStyle, color: row.right ? 'var(--color-success)' : 'var(--color-score-danger)' }}>
                    {row.right ? 'Right' : 'Wrong'}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Translation: each sentence reached, with its score */}
        {translation.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            style={sectionStyle}
          >
            <AnswersHeading shown={translation.length} total={itemTotal} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {translation.map((row, i) => (
                <motion.div key={i} {...listItemFade(i, reduceMotion)} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.45 }}>
                      {row.source}
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '4px 0 0 0', lineHeight: 1.45 }}>
                      You typed: {row.typed}
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0 0', lineHeight: 1.45 }}>
                      Model answer: {row.modelAnswer}
                    </p>
                  </div>
                  <span style={{ ...rowStatusStyle, color: scoreColor(row.score) }}>
                    {row.score}/10
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Conversation: the tutor's corrections */}
        {conversation && conversation.corrections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={sectionStyle}
          >
            <h3 style={sectionTitleStyle}>Corrections</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {conversation.corrections.map((text, i) => (
                <motion.div key={i} {...listItemFade(i, reduceMotion)} style={rowStyle}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          style={{ display: 'flex', gap: 10 }}
        >
          <button
            onClick={() => navigate('/history')}
            style={{
              flex: 1,
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-overlay-08)',
              color: 'var(--color-text-secondary)',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            History
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            style={{
              flex: 2,
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 16,
              background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-gradient-end))',
              color: 'var(--color-on-accent)',
              fontSize: 15,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 10px 24px rgba(94,164,247,0.25)',
            }}
          >
            Practice again
            <ArrowRight size={15} />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Session, SessionFeedback } from '../lib/types';

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
  if (score >= 8) return 'linear-gradient(90deg, #3dcb8c, #5de4a5)';
  if (score >= 5) return 'linear-gradient(90deg, #d9a63e, #f5c45e)';
  return 'linear-gradient(90deg, #e05555, #f87171)';
}

function scoreColor(score: number): string {
  if (score >= 8) return '#5de4a5';
  if (score >= 5) return '#f5c45e';
  return '#f87171';
}

function formatTopic(topic: string): string {
  return topic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMode(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

const RING_R = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function FeedbackView({ session, feedback }: FeedbackViewProps) {
  const navigate = useNavigate();

  const score = feedback.overall_score;
  const fillOffset = RING_CIRCUMFERENCE * (1 - score / 10);
  const label = encouragement(score);
  const message = encouragementMessage(score);

  return (
    <div className="min-h-screen pt-18">
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
            background: 'radial-gradient(circle at 50% 0%, rgba(94,164,247,0.1), transparent 70%), #151926',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {/* Animated ring */}
          <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto 16px auto' }}>
            <svg
              viewBox="0 0 132 132"
              style={{ width: 132, height: 132, transform: 'rotate(-90deg)', display: 'block' }}
            >
              <circle
                cx="66" cy="66" r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="9"
              />
              <motion.circle
                cx="66" cy="66" r={RING_R}
                fill="none"
                stroke="#5ea4f7"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                animate={{ strokeDashoffset: fillOffset }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
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
                  color: '#5ea4f7',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {score}
              </motion.span>
              <span style={{ fontSize: 11, color: '#6b7289', marginTop: 4 }}>out of 10</span>
            </div>
          </div>

          {/* Encouragement label */}
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em',
              color: '#eef1f8',
            }}
          >
            {label}
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: '#6b7289',
              margin: '0 auto',
              maxWidth: 280,
              lineHeight: 1.55,
            }}
          >
            {message}
          </p>

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
                color: '#5de4a5',
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
                background: 'rgba(255,255,255,0.06)',
                color: '#a3aabe',
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
                background: 'rgba(255,255,255,0.06)',
                color: '#a3aabe',
              }}
            >
              {formatMode(session.difficulty)}
            </span>
          </div>
        </motion.div>

        {/* Breakdown bars */}
        {feedback.scores.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{
              borderRadius: 22,
              background: '#151926',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 20,
              marginBottom: 14,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: '0 0 18px 0',
                color: '#eef1f8',
              }}
            >
              Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {feedback.scores.map((s, i) => (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 7,
                    }}
                  >
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: '#eef1f8' }}
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
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.score * 10}%` }}
                      transition={{
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
                        color: '#6b7289',
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

        {/* Strengths & Improvements */}
        {(feedback.strengths.length > 0 || feedback.improvements.length > 0) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: feedback.strengths.length > 0 && feedback.improvements.length > 0
                ? '1fr 1fr'
                : '1fr',
              gap: 12,
              marginBottom: 14,
            }}
          >
            {feedback.strengths.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                style={{
                  borderRadius: 22,
                  background: '#151926',
                  border: '1px solid rgba(255,255,255,0.06)',
                  padding: 18,
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#5de4a5',
                    margin: '0 0 12px 0',
                  }}
                >
                  What went well
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feedback.strengths.map((s, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12.5,
                        color: '#a3aabe',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        lineHeight: 1.55,
                      }}
                    >
                      <span style={{ color: '#5de4a5', flexShrink: 0, fontSize: 11, marginTop: 2 }}>+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
            {feedback.improvements.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                  borderRadius: 22,
                  background: '#151926',
                  border: '1px solid rgba(255,255,255,0.06)',
                  padding: 18,
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#f5c45e',
                    margin: '0 0 12px 0',
                  }}
                >
                  Where to improve
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feedback.improvements.map((s, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12.5,
                        color: '#a3aabe',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        lineHeight: 1.55,
                      }}
                    >
                      <span style={{ color: '#f5c45e', flexShrink: 0, fontSize: 11, marginTop: 2 }}>*</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </div>
        )}

        {/* New words to keep */}
        {feedback.vocabulary_learned.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            style={{
              borderRadius: 22,
              background: '#151926',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 20,
              marginBottom: 14,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: '0 0 14px 0',
                color: '#eef1f8',
              }}
            >
              New words to keep
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {feedback.vocabulary_learned.map((v, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: '#5de4a5' }}
                    >
                      {v.slovak}
                    </span>
                    <span
                      style={{ fontSize: 13, color: '#a3aabe', marginLeft: 10 }}
                    >
                      {v.english}
                    </span>
                    {v.example && (
                      <p
                        style={{
                          fontSize: 11,
                          color: '#6b7289',
                          fontStyle: 'italic',
                          margin: '4px 0 0 0',
                        }}
                      >
                        "{v.example}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Grammar notes */}
        {feedback.grammar_notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            style={{
              borderRadius: 22,
              background: '#151926',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 20,
              marginBottom: 14,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: '0 0 12px 0',
                color: '#eef1f8',
              }}
            >
              Grammar notes
            </h3>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {feedback.grammar_notes.map((note, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 12.5,
                    color: '#a3aabe',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    lineHeight: 1.55,
                  }}
                >
                  <span style={{ color: '#a78bfa', flexShrink: 0, fontSize: 11, marginTop: 2 }}>*</span>
                  {note}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Sample answer */}
        {feedback.sample_answer && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{
              borderRadius: 22,
              background: '#151926',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 20,
              marginBottom: 14,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: '0 0 12px 0',
                color: '#eef1f8',
              }}
            >
              Example strong answer
            </h3>
            <p
              style={{
                fontSize: 13,
                color: '#a3aabe',
                lineHeight: 1.6,
                margin: 0,
                padding: '14px 16px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {feedback.sample_answer}
            </p>
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
              background: '#151926',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#a3aabe',
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
              background: 'linear-gradient(90deg, #5ea4f7, #38bdf8)',
              color: '#ffffff',
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

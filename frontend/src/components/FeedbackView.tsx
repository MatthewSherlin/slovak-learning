import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Trophy, TrendingUp, Target, BookOpen, Sparkles, BookText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Session, SessionFeedback } from '../lib/types';

interface FeedbackViewProps {
  session: Session;
  feedback: SessionFeedback;
}

export default function FeedbackView({ session, feedback }: FeedbackViewProps) {
  const navigate = useNavigate();

  const score = feedback.overall_score;
  const pct = score * 10;

  const scoreLabel =
    score >= 8 ? 'Vyborne!' :
    score >= 6 ? 'Dobre!' :
    score >= 4 ? 'Getting there' :
    'Keep practicing';

  const scoreMessage =
    score >= 8 ? "Excellent work! Your Slovak is coming along beautifully." :
    score >= 6 ? "Good progress. Focus on the areas below to level up." :
    score >= 4 ? "You're making progress. Review the vocabulary and try again." :
    "Everyone starts somewhere. Check out the Guides page and give it another shot.";

  const ringColor =
    score >= 8 ? 'var(--color-success)' :
    score >= 6 ? 'var(--color-accent)' :
    score >= 4 ? 'var(--color-warning)' :
    'var(--color-danger)';

  const ringTextColor =
    score >= 8 ? 'text-success' :
    score >= 6 ? 'text-accent' :
    score >= 4 ? 'text-warning' :
    'text-danger';

  return (
    <div className="min-h-screen pt-14">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Back */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button
            onClick={() => navigate('/')}
            className="text-text-faint hover:text-text-primary text-[13px] mb-8 flex items-center gap-1.5 cursor-pointer bg-transparent border-none transition-colors"
          >
            <ArrowLeft size={14} />
            Back to practice
          </button>
        </motion.div>

        {/* Overall Score — animated ring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <div className="relative w-28 h-28 mx-auto">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
              <motion.circle
                cx="60" cy="60" r="52" fill="none"
                stroke={ringColor}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100) }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                className={`text-3xl font-bold tabular-nums ${ringTextColor}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {score}
              </motion.span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mt-5 tracking-tight">{scoreLabel}</h2>
          <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">
            {scoreMessage}
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 text-[11px] text-text-faint">
            <span className="capitalize">{session.mode}</span>
            <span>&middot;</span>
            <span>{session.topic.replace(/_/g, ' ')}</span>
            <span>&middot;</span>
            <span className="capitalize">{session.difficulty}</span>
          </div>
        </motion.div>

        {/* Category Scores */}
        {feedback.scores.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface border border-border rounded-2xl p-6 mb-5"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-5 flex items-center gap-2">
              <Target size={14} className="text-accent" />
              Breakdown
            </h3>
            <div className="space-y-5">
              {feedback.scores.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-text-primary font-medium">{s.category}</span>
                    <span className={`text-[13px] font-bold tabular-nums ${
                      s.score >= 8 ? 'text-success' :
                      s.score >= 6 ? 'text-accent' :
                      s.score >= 4 ? 'text-warning' :
                      'text-danger'
                    }`}>{s.score}/10</span>
                  </div>
                  <div className="w-full bg-surface-3 rounded-full h-1.5 mb-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.score * 10}%` }}
                      transition={{ delay: 0.2 + i * 0.15, duration: 0.8, ease: 'easeOut' }}
                      className={`h-1.5 rounded-full ${
                        s.score >= 8 ? 'bg-success' :
                        s.score >= 6 ? 'bg-accent' :
                        s.score >= 4 ? 'bg-warning' :
                        'bg-danger'
                      }`}
                    />
                  </div>
                  <p className="text-[12px] text-text-muted leading-relaxed">{s.comment}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Strengths & Improvements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {feedback.strengths.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-surface border border-border rounded-2xl p-5"
            >
              <h3 className="text-[13px] font-semibold text-success mb-3 flex items-center gap-2">
                <Trophy size={14} />
                What went well
              </h3>
              <ul className="space-y-2.5">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="text-[12.5px] text-text-secondary flex items-start gap-2 leading-relaxed">
                    <span className="text-success mt-0.5 shrink-0 text-xs">+</span>
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
              transition={{ delay: 0.25 }}
              className="bg-surface border border-border rounded-2xl p-5"
            >
              <h3 className="text-[13px] font-semibold text-warning mb-3 flex items-center gap-2">
                <TrendingUp size={14} />
                Where to improve
              </h3>
              <ul className="space-y-2.5">
                {feedback.improvements.map((s, i) => (
                  <li key={i} className="text-[12.5px] text-text-secondary flex items-start gap-2 leading-relaxed">
                    <span className="text-warning mt-0.5 shrink-0 text-xs">*</span>
                    {s}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>

        {/* Vocabulary Learned */}
        {feedback.vocabulary_learned.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-surface border border-border rounded-2xl p-6 mb-5"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <BookText size={14} className="text-mode-vocab" />
              Vocabulary learned
            </h3>
            <div className="space-y-2.5">
              {feedback.vocabulary_learned.map((v, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-surface-2 rounded-xl border border-border-subtle">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-mode-vocab">{v.slovak}</span>
                      <span className="text-text-faint text-[11px]">&rarr;</span>
                      <span className="text-[13px] text-text-primary">{v.english}</span>
                    </div>
                    {v.example && (
                      <p className="text-[11px] text-text-muted italic mt-1">"{v.example}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Grammar Notes */}
        {feedback.grammar_notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="bg-surface border border-border rounded-2xl p-6 mb-5"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-mode-grammar" />
              Grammar notes
            </h3>
            <ul className="space-y-2">
              {feedback.grammar_notes.map((note, i) => (
                <li key={i} className="text-[12.5px] text-text-secondary flex items-start gap-2 leading-relaxed">
                  <span className="text-mode-grammar mt-0.5 shrink-0 text-xs">*</span>
                  {note}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Sample Answer */}
        {feedback.sample_answer && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-surface border border-border rounded-2xl p-6 mb-5"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-2">
              <BookOpen size={14} className="text-accent" />
              Example strong answer
            </h3>
            <div className="text-[13px] text-text-secondary leading-relaxed markdown-content bg-surface-2 rounded-xl p-4 border border-border-subtle">
              <ReactMarkdown>{feedback.sample_answer}</ReactMarkdown>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex gap-3 justify-center"
        >
          <button
            onClick={() => navigate('/history')}
            className="px-5 py-3 rounded-xl text-[13px] font-medium bg-surface border border-border text-text-muted hover:text-text-primary cursor-pointer transition-colors"
          >
            View History
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-medium bg-gradient-to-r from-accent to-sky-400 text-white cursor-pointer border-none shadow-md shadow-accent/20 transition-all"
          >
            Practice Again
            <ArrowRight size={14} />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

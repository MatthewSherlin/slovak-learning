import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Lightbulb,
  Clock,
  MessageSquare,
  ArrowRight,
  PenLine,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ChatMessage from './ChatMessage';
import SessionHeader from './SessionHeader';
import LoadingDots from './LoadingDots';
import FeedbackView from './FeedbackView';
import DiacriticsKeyboard from './DiacriticsKeyboard';
import { submitAnswer, requestHint, endSession, getSession } from '../lib/api';
import type { Session, SessionFeedback, ConversationExerciseData, Difficulty } from '../lib/types';

interface ConversationModeProps {
  session: Session;
  setSession: (s: Session) => void;
  onEnd: () => void;
}

interface Correction {
  text: string;
  index: number;
}

const SUGGESTED_PHRASES: Record<Difficulty, string[]> = {
  beginner: ['Dobry den...', 'Chcel by som...', 'Prosim...', 'Dakujem, ...'],
  intermediate: ['Mohol by som...', 'Co mi odporucate?', 'Ako sa povie...?'],
  advanced: ['Podla mna...', 'Suhlasim, ale...', 'Mohli by ste mi vysvetlit...?'],
};

function parseCorrections(messages: { role: string; content: string }[]): Correction[] {
  const corrections: Correction[] = [];
  messages.forEach((msg, i) => {
    if (msg.role !== 'tutor') return;
    const lines = msg.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('\u{1F4DD}')) {
        corrections.push({ text: trimmed, index: i });
      }
    }
  });
  return corrections;
}

export default function ConversationMode({ session, setSession }: ConversationModeProps) {
  const ex = session.exercises as ConversationExerciseData;
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [error, setError] = useState('');
  const [scenarioCollapsed, setScenarioCollapsed] = useState(false);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const corrections = useMemo(() => parseCorrections(session.messages), [session.messages]);

  const studentMessages = session.messages.filter((m) => m.role === 'student').length;

  // Auto-collapse scenario after first student message
  useEffect(() => {
    if (studentMessages > 0 && !scenarioCollapsed) {
      setScenarioCollapsed(true);
    }
  }, [studentMessages, scenarioCollapsed]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, loading]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    const answer = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);
    setError('');

    try {
      const updated = await submitAnswer(session.id, answer);
      setSession(updated);
    } catch {
      setError('Failed to send. Please try again.');
      setInput(answer);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleHint = async () => {
    if (hintLoading) return;
    setHintLoading(true);
    try {
      const updated = await requestHint(session.id);
      setSession(updated);
    } catch {
      setError('Failed to get hint.');
    } finally {
      setHintLoading(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      const fb = await endSession(session.id);
      setFeedback(fb);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch {
      setError('Failed to end session.');
      setEnding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handlePhraseClick = (phrase: string) => {
    setInput((prev) => prev + phrase);
    textareaRef.current?.focus();
  };

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  const isComplete = ex.phase === 'complete';
  const phrases = SUGGESTED_PHRASES[session.difficulty] ?? SUGGESTED_PHRASES.beginner;
  const showPhrases = !isComplete && !loading && input.length < 10;

  return (
    <div className="flex flex-col h-screen pt-14">
      <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={studentMessages > 0}>
        <div className="flex items-center gap-3">
          {/* Exchange counter */}
          <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <MessageSquare size={11} />
            <span className="tabular-nums">
              {ex.exchangeCount}/{ex.maxExchanges}
            </span>
          </div>

          {/* Corrections badge */}
          {corrections.length > 0 && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCorrectionsOpen(!correctionsOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-warning border border-warning/20 hover:border-warning/40 cursor-pointer transition-all"
            >
              <PenLine size={10} />
              <span className="tabular-nums">{corrections.length}</span>
              {correctionsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </motion.button>
          )}
        </div>
      </SessionHeader>

      {/* Corrections Drawer */}
      <AnimatePresence>
        {correctionsOpen && corrections.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-border-subtle"
          >
            <div className="bg-warning/5 px-6 py-3">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-2 mb-2">
                  <PenLine size={13} className="text-warning" />
                  <span className="text-[12px] font-semibold text-warning">
                    Corrections ({corrections.length})
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {corrections.map((c, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="text-[12px] text-text-secondary leading-relaxed pl-3 border-l-2 border-warning/30"
                    >
                      {c.text.replace(/^\u{1F4DD}\s*/u, '')}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Scenario Card */}
          {ex.scenario && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <div className="rounded-2xl border border-mode-conversation/25 bg-mode-conversation/5 overflow-hidden">
                <button
                  onClick={() => setScenarioCollapsed(!scenarioCollapsed)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-transparent border-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-mode-conversation/15 flex items-center justify-center">
                      <MessageSquare size={14} className="text-mode-conversation" />
                    </div>
                    <span className="text-[12px] font-semibold text-mode-conversation uppercase tracking-wide">
                      Scenario
                    </span>
                  </div>
                  <motion.div
                    animate={{ rotate: scenarioCollapsed ? 0 : 180 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={14} className="text-mode-conversation/60" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!scenarioCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4">
                        <p className="text-[13.5px] text-text-secondary leading-relaxed">
                          {ex.scenario}
                        </p>
                        {studentMessages === 0 && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-[11px] text-mode-conversation/70 font-medium mt-3 italic"
                          >
                            Start speaking in Slovak!
                          </motion.p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Messages */}
          {session.messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} index={i} />
          ))}

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 my-5"
            >
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-accent-muted text-accent mt-1">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
              <div className="bg-surface-2 border border-border-subtle rounded-2xl px-5 py-4">
                <LoadingDots text="Thinking" />
              </div>
            </motion.div>
          )}

          {ending && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center my-8"
            >
              <div className="bg-surface-2 border border-border rounded-2xl px-6 py-5 text-center max-w-sm">
                <LoadingDots text="Analyzing your conversation" />
                <p className="text-[11px] text-text-faint mt-3">
                  Generating detailed feedback and vocabulary review...
                </p>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center my-4"
            >
              <span className="text-[13px] text-danger bg-danger-muted px-4 py-2 rounded-lg inline-block">
                {error}
              </span>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      {!session.completed && !ending && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="border-t border-border-subtle glass px-6 py-4"
        >
          <div className="max-w-3xl mx-auto">
            {isComplete ? (
              /* Conversation complete prompt */
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-2"
              >
                <p className="text-[13px] text-text-secondary mb-3">
                  You've completed {ex.maxExchanges} exchanges! Ready for your feedback?
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEnd}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent to-sky-400 text-white font-medium text-[13px] cursor-pointer border-none shadow-md shadow-accent/20 transition-all"
                >
                  Get Feedback <ArrowRight size={13} />
                </motion.button>
              </motion.div>
            ) : (
              <>
                {/* Suggested Phrases */}
                <AnimatePresence>
                  {showPhrases && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {phrases.map((phrase) => (
                          <motion.button
                            key={phrase}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handlePhraseClick(phrase)}
                            className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-surface-3 text-text-muted hover:text-text-primary border border-transparent hover:border-border-subtle cursor-pointer transition-all duration-150"
                          >
                            {phrase}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quick Actions */}
                <div className="flex gap-2 mb-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleHint}
                    disabled={hintLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-warning-muted text-warning border border-warning/15 hover:border-warning/30 cursor-pointer disabled:opacity-40 transition-all duration-200"
                  >
                    <Lightbulb size={11} />
                    {hintLoading ? 'Getting hint...' : 'Hint'}
                  </motion.button>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-faint ml-auto">
                    <Clock size={11} />
                    <span>Take your time -- there's no timer</span>
                  </div>
                </div>

                {/* Input Area */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your response in Slovak... (Enter to send)"
                      rows={1}
                      className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-[13.5px] text-text-primary placeholder:text-text-faint resize-none focus:border-border-focus transition-colors leading-relaxed"
                    />
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleSubmit}
                    disabled={!input.trim() || loading}
                    className="shrink-0 w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover text-white flex items-center justify-center cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-md shadow-accent/20"
                  >
                    <Send size={15} />
                  </motion.button>
                </div>
                <DiacriticsKeyboard inputRef={textareaRef} value={input} onChange={setInput} />
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

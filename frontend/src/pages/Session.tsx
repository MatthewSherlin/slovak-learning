import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, Lightbulb, Square, ArrowLeft, Clock, MessageSquare } from 'lucide-react';
import ChatMessage from '../components/ChatMessage';
import LoadingDots from '../components/LoadingDots';
import FeedbackView from '../components/FeedbackView';
import { getSession, submitAnswer, requestHint, endSession } from '../lib/api';
import type { Session as SessionType, SessionFeedback } from '../lib/types';

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionType | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (id) {
      getSession(id).then((s) => {
        setSession(s);
        if (s.feedback) setFeedback(s.feedback);
      }).catch(() => navigate('/'));
    }
  }, [id, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, loading]);

  const handleSubmit = async () => {
    if (!input.trim() || !session || loading) return;
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
    if (!session || hintLoading) return;
    setHintLoading(true);
    try {
      await requestHint(session.id);
      const updated = await getSession(session.id);
      setSession(updated);
    } catch {
      setError('Failed to get hint.');
    } finally {
      setHintLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!session || ending) return;
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

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingDots text="Loading session" />
      </div>
    );
  }

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);
  const studentMessages = session.messages.filter((m) => m.role === 'student').length;

  return (
    <div className="flex flex-col h-screen pt-14">
      {/* Session Header Bar */}
      <div className="border-b border-border-subtle glass px-6 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-text-faint hover:text-text-primary bg-transparent border-none cursor-pointer p-1 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text-primary">{modeLabel}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-3 text-text-faint capitalize font-medium">
                  {session.difficulty}
                </span>
              </div>
              <div className="text-[11px] text-text-faint mt-0.5">
                {session.topic.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <MessageSquare size={11} />
              <span>{studentMessages}</span>
            </div>
            <button
              onClick={handleEnd}
              disabled={ending || studentMessages === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary border border-border hover:bg-danger-muted hover:text-danger hover:border-danger/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Square size={10} />
              End & Get Feedback
            </button>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
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
                <LoadingDots text="Analyzing your responses" />
                <p className="text-[11px] text-text-faint mt-3">
                  Generating detailed feedback and vocabulary review...
                </p>
              </div>
            </motion.div>
          )}

          {error && (
            <div className="text-center my-4">
              <span className="text-[13px] text-danger bg-danger-muted px-4 py-2 rounded-lg inline-block">
                {error}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      {!session.completed && !ending && (
        <div className="border-t border-border-subtle glass px-6 py-4">
          <div className="max-w-3xl mx-auto">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleHint}
                disabled={hintLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-warning-muted text-warning border border-warning/15 hover:border-warning/30 cursor-pointer disabled:opacity-40 transition-all duration-200"
              >
                <Lightbulb size={11} />
                {hintLoading ? 'Getting hint...' : 'Hint'}
              </button>
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
                  placeholder="Type your response... (Enter to send, Shift+Enter for new line)"
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
          </div>
        </div>
      )}
    </div>
  );
}

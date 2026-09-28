import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import { Send, Lightbulb, Clock, MessageSquare, RefreshCw } from 'lucide-react';
import ChatMessage from '../components/ChatMessage';
import SessionHeader from '../components/SessionHeader';
import LoadingDots from '../components/LoadingDots';
import BrandedLoader from '../components/BrandedLoader';
import FeedbackView from '../components/FeedbackView';
import VocabMode from '../components/VocabMode';
import GrammarMode from '../components/GrammarMode';
import TranslationMode from '../components/TranslationMode';
import ConversationMode from '../components/ConversationMode';
import { SLOVAK_INPUT_PROPS } from '../lib/slovakInput';
import { getSession, submitAnswer, requestHint, endSession } from '../lib/api';
import { useUser } from '../components/UserPicker';
import type { Session as SessionType, SessionFeedback } from '../lib/types';

// Legacy chat UI for old sessions that don't have structured exercises
function LegacyChatMode({ session, setSession }: { session: SessionType; setSession: (s: SessionType) => void }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(session.feedback);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  if (feedback) {
    return <FeedbackView session={session} feedback={feedback} />;
  }

  const studentMessages = session.messages.filter((m) => m.role === 'student').length;

  return (
    <div className="flex flex-col h-dvh">
      <SessionHeader session={session} onEnd={handleEnd} ending={ending} canEnd={studentMessages > 0}>
        <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
          <MessageSquare size={11} />
          <span>{studentMessages}</span>
        </div>
      </SessionHeader>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-3xl mx-auto">
          {session.messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 my-5">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-accent-muted text-accent mt-1">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
              <div className="bg-surface-2 border border-border-subtle rounded-2xl px-5 py-4">
                <LoadingDots text="Thinking" />
              </div>
            </motion.div>
          )}
          {ending && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-8">
              <div className="bg-surface-2 border border-border rounded-2xl px-6 py-5 text-center max-w-sm">
                <LoadingDots text="Analyzing your responses" />
                <p className="text-[11px] text-text-faint mt-3">Generating detailed feedback and vocabulary review...</p>
              </div>
            </motion.div>
          )}
          {error && (
            <div className="text-center my-4">
              <span className="text-[13px] text-danger bg-danger-muted px-4 py-2 rounded-lg inline-block">{error}</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {!session.completed && !ending && (
        <div className="border-t border-border-subtle glass px-5 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <div className="max-w-3xl mx-auto">
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
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response... (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  {...SLOVAK_INPUT_PROPS}
                  className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-[16px] text-text-primary placeholder:text-text-faint resize-none focus:border-border-focus transition-colors leading-relaxed"
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

/** The session ConfigSheet just created, handed over with the navigation so
 *  the lesson renders at once. Absent when the lesson is opened any other way. */
function handedOverSession(state: unknown, id: string | undefined): SessionType | null {
  const handed = (state as { session?: SessionType } | null)?.session;
  return handed && handed.id === id ? handed : null;
}

// Main session page. Under prefers-reduced-motion, framer-motion skips every
// transform (slides, shakes, pops, tap squeezes) on the lesson screens and
// their feedback; the screens gate their other animations themselves.
export default function Session() {
  return (
    <MotionConfig reducedMotion="user">
      <SessionPage />
    </MotionConfig>
  );
}

// Routes to mode-specific components
function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const [session, setSession] = useState<SessionType | null>(
    () => handedOverSession(location.state, id),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadSession = async (sessionId: string) => {
    setLoadError(null);
    try {
      const s = await getSession(sessionId);
      setSession(s);
    } catch {
      setLoadError('Failed to load session. Please check your connection and try again.');
    }
  };

  useEffect(() => {
    if (!id) return;
    const handed = handedOverSession(location.state, id);
    if (handed) {
      setSession(handed);
      // Use it once: browsers keep history state across a reload and Back,
      // where this snapshot would be out of date. Those visits fetch instead.
      navigate(location.pathname, { replace: true, state: null });
    } else {
      loadSession(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    await loadSession(id);
    setRetrying(false);
  };

  // Error state — show banner with retry, don't silently navigate
  if (loadError) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-surface border border-border rounded-2xl p-8 text-center shadow-xl"
        >
          <div className="w-12 h-12 rounded-2xl bg-danger-muted flex items-center justify-center mx-auto mb-4">
            <span className="text-danger text-xl">!</span>
          </div>
          <h2 className="text-lg font-bold text-text-primary mb-2">Could not load session</h2>
          <p className="text-sm text-text-muted mb-6">{loadError}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white text-sm font-semibold border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={15} className={retrying ? 'animate-spin' : ''} />
              {retrying ? 'Retrying…' : 'Try Again'}
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-3 rounded-xl bg-surface-2 text-text-secondary text-sm font-medium border-none cursor-pointer hover:bg-surface-3 transition-colors"
            >
              Go Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!session) {
    return <BrandedLoader heading="Načítavam lekciu…" subCopy="Loading your lesson" hint={null} />;
  }

  // Ownership guard: a deep link or stale history entry can point at another
  // profile's session — answering would silently record against their account.
  if (user && session.user_id !== user.id) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
        <h2 className="text-lg font-bold text-text-primary mb-2">Not your session</h2>
        <p className="text-sm text-text-muted mb-6">
          This session belongs to another profile.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-xl bg-surface-2 text-text-secondary text-sm font-medium border-none cursor-pointer"
        >
          Go Home
        </button>
      </div>
    );
  }

  // Feedback already shown? Let FeedbackView handle it for legacy sessions
  // For new sessions, the mode components handle their own feedback display
  if (session.feedback && !session.exercises) {
    return <FeedbackView session={session} feedback={session.feedback} />;
  }

  // Route to mode-specific component based on exercises type
  const mode = session.exercises?.type ?? null;

  switch (mode) {
    case 'vocabulary':
      return <VocabMode session={session} setSession={setSession} />;
    case 'grammar':
      return <GrammarMode session={session} setSession={setSession} />;
    case 'translation':
      return <TranslationMode session={session} setSession={setSession} />;
    case 'conversation':
      return <ConversationMode session={session} setSession={setSession} />;
    default:
      return <LegacyChatMode session={session} setSession={setSession} />;
  }
}

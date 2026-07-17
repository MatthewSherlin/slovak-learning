/**
 * ConfigSheet — bottom sheet for configuring a new learning session.
 * Slides up over the home screen with difficulty pills, topic chips,
 * and a free-text focus area before calling createSession.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getTopics, createSession } from '../lib/api';
import type { Difficulty, LearningMode, Topic } from '../lib/types';

// ── Mode metadata ──────────────────────────────────────────────────────

const MODE_META: Record<
  LearningMode,
  { title: string; subtitle: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  vocabulary: {
    title: 'Vocabulary session',
    subtitle: '10 flashcards · retry missed words',
    color: '#5de4a5',
    bgColor: 'rgba(93,228,165,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        <path d="M8 11h8" /><path d="M8 7h6" />
      </svg>
    ),
  },
  grammar: {
    title: 'Grammar session',
    subtitle: 'Lesson + fill-in-the-blank exercises',
    color: '#a78bfa',
    bgColor: 'rgba(167,139,250,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
      </svg>
    ),
  },
  conversation: {
    title: 'Conversation session',
    subtitle: 'Chat with the AI tutor',
    color: '#f5c45e',
    bgColor: 'rgba(245,196,94,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
    ),
  },
  translation: {
    title: 'Translation session',
    subtitle: 'Translate sentences SK ⇄ EN',
    color: '#f0a8d0',
    bgColor: 'rgba(240,168,208,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
        <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
      </svg>
    ),
  },
};

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

// Maximum focus area text length enforced by backend
const MAX_FOCUS_CHARS = 100;

// ── Props ──────────────────────────────────────────────────────────────

interface ConfigSheetProps {
  /** Whether the sheet is visible */
  open: boolean;
  /** Mode this sheet is configuring */
  mode: LearningMode;
  /** ID of the current user */
  userId: string;
  /** Pre-select a topic chip by topic ID (from Recommended chip) */
  recommendedTopic?: string;
  /** Called when the sheet should close (backdrop tap or cancel) */
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────

export default function ConfigSheet({
  open,
  mode,
  userId,
  recommendedTopic,
  onClose,
}: ConfigSheetProps) {
  const navigate = useNavigate();
  const meta = MODE_META[mode];

  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [focusText, setFocusText] = useState('');
  const [focusError, setFocusError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reset state each time the sheet opens for a (potentially different) mode
  useEffect(() => {
    if (!open) return;
    setDifficulty('beginner');
    setFocusText('');
    setFocusError(null);
    setStarting(false);
    setTopics([]);
    setSelectedTopic(recommendedTopic ?? null);

    getTopics(mode)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [open, mode, recommendedTopic]);

  const handleStart = useCallback(async () => {
    // Validate focus area length
    if (focusText.length > MAX_FOCUS_CHARS) {
      setFocusError(`Focus area must be ${MAX_FOCUS_CHARS} characters or fewer.`);
      return;
    }
    setFocusError(null);
    setStarting(true);

    try {
      const session = await createSession({
        user_id: userId,
        mode,
        difficulty,
        topic: selectedTopic ?? undefined,
        focus_areas: focusText.trim() ? [focusText.trim()] : undefined,
      });
      navigate(`/session/${session.id}`);
    } catch {
      setStarting(false);
    }
  }, [userId, mode, difficulty, selectedTopic, focusText, navigate]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            data-testid="config-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5,6,10,0.55)',
              zIndex: 40,
            }}
          />

          {/* ── Sheet panel ── */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              background: '#161a28',
              borderRadius: '28px 28px 0 0',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              padding: '12px 20px 32px 20px',
              color: '#eef1f8',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            {/* Drag handle */}
            <div style={{
              width: '40px',
              height: '4px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.15)',
              margin: '0 auto 20px auto',
            }} />

            {/* Mode header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: meta.bgColor,
                color: meta.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {meta.icon}
              </div>
              <div>
                <h2 style={{ fontSize: '19px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                  {meta.title}
                </h2>
                <p style={{ fontSize: '12px', color: '#6b7289', margin: '2px 0 0 0' }}>
                  {meta.subtitle}
                </p>
              </div>
            </div>

            {/* Difficulty section */}
            <p style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#a3aabe',
              margin: '0 0 8px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Difficulty
            </p>
            <div style={{
              display: 'flex',
              background: '#0e1017',
              borderRadius: '14px',
              padding: '4px',
              gap: '4px',
              marginBottom: '20px',
            }}>
              {DIFFICULTIES.map(({ value, label }) => {
                const isSelected = difficulty === value;
                return (
                  <button
                    key={value}
                    aria-pressed={isSelected}
                    onClick={() => setDifficulty(value)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '10px 0',
                      borderRadius: '11px',
                      fontSize: '13px',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? '#5ea4f7' : 'transparent',
                      color: isSelected ? '#ffffff' : '#6b7289',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Topic section */}
            <p style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#a3aabe',
              margin: '0 0 8px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Topic{' '}
              <span style={{ color: '#4a5068', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                · optional
              </span>
            </p>
            {topics.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {topics.map((t) => {
                  const isSelected = selectedTopic === t.id;
                  return (
                    <button
                      key={t.id}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedTopic(isSelected ? null : t.id)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 500,
                        background: isSelected ? 'rgba(94,164,247,0.14)' : '#0e1017',
                        color: isSelected ? '#5ea4f7' : '#6b7289',
                        border: isSelected ? '1px solid rgba(94,164,247,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
            {topics.length === 0 && (
              <div style={{ marginBottom: '20px' }} />
            )}

            {/* Focus area section */}
            <p style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#a3aabe',
              margin: '0 0 8px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Tell the tutor what to focus on
            </p>
            <textarea
              placeholder="e.g. restaurant vocabulary…"
              value={focusText}
              onChange={(e) => {
                setFocusText(e.target.value);
                if (focusError) setFocusError(null);
              }}
              rows={2}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: '14px',
                fontSize: '14px',
                background: '#0e1017',
                border: focusError ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)',
                color: '#eef1f8',
                resize: 'none',
                outline: 'none',
                marginBottom: focusError ? '6px' : '24px',
                boxSizing: 'border-box',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            {focusError && (
              <p style={{
                fontSize: '12px',
                color: '#ef4444',
                margin: '0 0 16px 0',
              }}>
                {focusError}
              </p>
            )}

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={starting}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                background: starting
                  ? 'rgba(94,164,247,0.5)'
                  : 'linear-gradient(90deg, #5ea4f7, #38bdf8)',
                color: '#ffffff',
                fontWeight: 700,
                height: '52px',
                borderRadius: '16px',
                fontSize: '16px',
                boxShadow: starting ? 'none' : '0 10px 24px rgba(94,164,247,0.3)',
                border: 'none',
                cursor: starting ? 'not-allowed' : 'pointer',
                width: '100%',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              {starting ? (
                <>
                  <svg
                    width="18" height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Starting…
                </>
              ) : (
                <>
                  Start session
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

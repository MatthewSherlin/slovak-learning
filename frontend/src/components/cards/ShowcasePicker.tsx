/**
 * ShowcasePicker — bottom sheet for selecting a card to pin on the user's profile.
 *
 * Renders a grid of all owned cards. Tap to pin via setShowcase API.
 * Current pinned card is highlighted. Includes a "Clear" option (null).
 * Errors surfaced inline; no success state — sheet closes on success.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { setShowcase } from '../../lib/api';
import { RARITY_THEMES } from './rarity';
import type { CardData, UserCardCollection } from '../../lib/types';

// ── Rarity gradient for mini tile backgrounds ─────────────────────────────

function getRarityMiniGradient(rarity: CardData['rarity']): string {
  switch (rarity) {
    case 'common':    return 'linear-gradient(160deg, #3a4152, #5b6478 40%, #2c3242)';
    case 'uncommon':  return 'linear-gradient(160deg, #0e5f46, #4fd6a4 40%, #0a3d2e)';
    case 'rare':      return 'linear-gradient(160deg, #1e3f8f, #7db2ff 40%, #142450)';
    case 'legendary': return 'linear-gradient(160deg, #8a6118, #f7d977 40%, #6e4c12)';
    case 'mythic':    return 'linear-gradient(160deg, #5a1a5a, #f472b6 40%, #3a0e3a)';
    default:          return 'linear-gradient(160deg, #3a4152, #5b6478 40%, #2c3242)';
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ShowcasePickerProps {
  open: boolean;
  collection: UserCardCollection;
  userId: string;
  /** Currently pinned card id, or null */
  currentShowcaseCardId?: number | null;
  onClose: () => void;
  /** Called after a successful pin/clear so parent can refresh social data */
  onSuccess: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ShowcasePicker({
  open,
  collection,
  userId,
  currentShowcaseCardId,
  onClose,
  onSuccess,
}: ShowcasePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = useCallback(
    async (cardId: number | null) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      try {
        await setShowcase(userId, cardId);
        onSuccess();
        onClose();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Could not update showcase. Please try again.';
        setError(msg);
      } finally {
        setSaving(false);
      }
    },
    [saving, userId, onSuccess, onClose]
  );

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const cards = collection.cards;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="showcase-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5,6,10,0.55)',
              zIndex: 60,
            }}
          />

          {/* Sheet panel */}
          <motion.div
            data-testid="showcase-picker-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 70,
              background: '#161a28',
              borderRadius: '28px 28px 0 0',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              padding: '12px 20px 32px 20px',
              color: '#eef1f8',
              maxWidth: '500px',
              margin: '0 auto',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drag handle */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.15)',
                margin: '0 auto 20px auto',
                flexShrink: 0,
              }}
            />

            {/* Header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 4,
                flexShrink: 0,
              }}
            >
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Showcase</h2>
                <p style={{ fontSize: 12.5, color: '#6b7289', margin: '2px 0 0 0' }}>
                  Pin a card to your profile.
                </p>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close showcase picker"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  borderRadius: 999,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#6b7289',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Inline error */}
            {error && (
              <p
                data-testid="showcase-error"
                style={{
                  fontSize: 12,
                  color: '#ef4444',
                  margin: '8px 0 0 0',
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            )}

            {/* Scrollable card grid */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginTop: 16,
              }}
            >
              {/* Clear option */}
              <button
                data-testid="showcase-clear"
                onClick={() => handleSelect(null)}
                disabled={saving || currentShowcaseCardId == null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 14,
                  marginBottom: 14,
                  background:
                    currentShowcaseCardId == null
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(239,68,68,0.08)',
                  border:
                    currentShowcaseCardId == null
                      ? '1px solid rgba(255,255,255,0.06)'
                      : '1px solid rgba(239,68,68,0.3)',
                  color: currentShowcaseCardId == null ? '#4a5068' : '#ef4444',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: currentShowcaseCardId == null ? 'default' : 'pointer',
                }}
              >
                {currentShowcaseCardId == null ? 'No showcase card pinned' : 'Clear showcase'}
              </button>

              {/* Card tiles */}
              {cards.length === 0 ? (
                <p
                  style={{
                    textAlign: 'center',
                    color: '#6b7289',
                    fontSize: 14,
                    padding: '32px 0',
                  }}
                >
                  No cards in your collection yet.
                </p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                  }}
                >
                  {cards.map((card) => {
                    const isPinned = card.id === currentShowcaseCardId;
                    const r = RARITY_THEMES[card.rarity];

                    return (
                      <button
                        key={card.id}
                        data-testid={`showcase-tile-${card.id}`}
                        onClick={() => handleSelect(card.id)}
                        disabled={saving}
                        aria-pressed={isPinned}
                        title={`${card.slovak} — ${card.english}`}
                        style={{
                          position: 'relative',
                          borderRadius: 10,
                          overflow: 'hidden',
                          height: 72,
                          background: getRarityMiniGradient(card.rarity),
                          border: isPinned
                            ? `2px solid #5ea4f7`
                            : '2px solid transparent',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          padding: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                          transition: 'border-color 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 22, lineHeight: 1 }}>{card.emoji}</span>
                        <span
                          style={{
                            fontSize: 7,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: r.labelColor !== 'transparent' ? r.labelColor : '#f472b6',
                          }}
                        >
                          {r.label.charAt(0)}
                        </span>
                        {isPinned && (
                          <div
                            data-testid={`showcase-pinned-${card.id}`}
                            style={{
                              position: 'absolute',
                              top: 3,
                              right: 3,
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background: '#5ea4f7',
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

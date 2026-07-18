/**
 * TradeInSheet — bottom sheet for trading duplicate cards back into XP.
 *
 * Shows only cards where copies >= 2 (i.e. at least one extra copy).
 * Multi-select; footer sums the XP that will be gained.
 * On confirm, calls tradeInCards API; shows success state with xp_gained.
 * API 400 → inline error, no success state.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Check } from 'lucide-react';
import { tradeInCards } from '../../lib/api';
import { RARITY_XP, RARITY_THEMES } from './rarity';
import type { CardData, UserCardCollection } from '../../lib/types';

// ── Mini card thumbnail (no external image — monogram only) ───────────────

function MiniCardThumb({ card }: { card: CardData }) {
  const theme = RARITY_THEMES[card.rarity];
  return (
    <div
      style={{
        width: 38,
        height: 54,
        borderRadius: 7,
        padding: 2,
        background: theme.frameGradient,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 5,
          background: '#0d1019',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 15,
            fontWeight: 700,
            background: theme.monogramGradient,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {card.slovak.charAt(0)}
        </span>
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface TradeInSheetProps {
  open: boolean;
  collection: UserCardCollection;
  userId: string;
  onClose: () => void;
  /** Called after a successful trade so parent can refresh collection */
  onSuccess: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TradeInSheet({
  open,
  collection,
  userId,
  onClose,
  onSuccess,
}: TradeInSheetProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState<number | null>(null);

  // Compute duplicate cards (copies >= 2)
  const copies = collection.copies ?? {};
  const duplicates: CardData[] = collection.cards.filter(
    (c) => (copies[String(c.id)] ?? 1) >= 2
  );

  const totalXp = Array.from(selected).reduce((sum, id) => {
    const card = duplicates.find((c) => c.id === id);
    return sum + (card ? RARITY_XP[card.rarity] : 0);
  }, 0);

  const toggleCard = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await tradeInCards(userId, Array.from(selected));
      setXpGained(result.xp_gained);
      onSuccess();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Trade-in failed. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }, [selected, submitting, userId, onSuccess]);

  const handleClose = useCallback(() => {
    // Reset state on close
    setSelected(new Set());
    setError(null);
    setXpGained(null);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="trade-in-backdrop"
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
            data-testid="trade-in-sheet"
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
                <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Duplicates</h2>
                <p style={{ fontSize: 12.5, color: '#6b7289', margin: '2px 0 0 0' }}>
                  Trade extra copies back into XP.
                </p>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
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

            {/* Success state */}
            {xpGained !== null ? (
              <div
                data-testid="trade-in-success"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                  padding: '32px 0',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    background: 'rgba(94,164,247,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={28} color="#5ea4f7" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                    +{xpGained} XP
                  </p>
                  <p style={{ fontSize: 13, color: '#6b7289', margin: '4px 0 0 0' }}>
                    Trade-in complete!
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  style={{
                    marginTop: 8,
                    padding: '12px 32px',
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 700,
                    background: 'linear-gradient(90deg, #5ea4f7, #38bdf8)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Card list — scrollable */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    marginTop: 16,
                    marginBottom: 16,
                  }}
                >
                  {duplicates.length === 0 ? (
                    <p
                      style={{
                        textAlign: 'center',
                        color: '#6b7289',
                        fontSize: 14,
                        padding: '32px 0',
                      }}
                    >
                      No duplicate cards to trade in.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {duplicates.map((card) => {
                        const copyCount = copies[String(card.id)] ?? 1;
                        const extraCount = copyCount - 1;
                        const xp = RARITY_XP[card.rarity];
                        const isSelected = selected.has(card.id);

                        return (
                          <button
                            key={card.id}
                            data-testid={`trade-row-${card.id}`}
                            onClick={() => toggleCard(card.id)}
                            aria-pressed={isSelected}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 14,
                              padding: '12px 14px',
                              borderRadius: 16,
                              background: isSelected
                                ? 'rgba(94,164,247,0.08)'
                                : 'rgba(255,255,255,0.03)',
                              border: isSelected
                                ? '1px solid rgba(94,164,247,0.35)'
                                : '1px solid rgba(255,255,255,0.06)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background 0.15s, border-color 0.15s',
                            }}
                          >
                            <MiniCardThumb card={card} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  margin: 0,
                                  color: '#eef1f8',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {card.slovak}
                              </p>
                              <p style={{ fontSize: 11, color: '#6b7289', margin: '1px 0 0 0' }}>
                                {RARITY_THEMES[card.rarity].label} · ×{extraCount} extra
                              </p>
                            </div>

                            <span
                              data-testid={`xp-value-${card.id}`}
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: '#f5c45e',
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0,
                              }}
                            >
                              +{xp} XP
                            </span>

                            {/* Checkbox indicator */}
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                border: isSelected
                                  ? '2px solid #5ea4f7'
                                  : '2px solid rgba(255,255,255,0.2)',
                                background: isSelected ? '#5ea4f7' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background 0.15s, border-color 0.15s',
                              }}
                            >
                              {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Inline error */}
                {error && (
                  <p
                    data-testid="trade-in-error"
                    style={{
                      fontSize: 12,
                      color: '#ef4444',
                      margin: '0 0 10px 0',
                      textAlign: 'center',
                    }}
                  >
                    {error}
                  </p>
                )}

                {/* Footer with total XP + confirm button */}
                <div style={{ flexShrink: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#6b7289' }}>
                      {selected.size} card{selected.size !== 1 ? 's' : ''} selected
                    </span>
                    <span
                      data-testid="trade-in-total-xp"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#f5c45e',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <Zap size={14} />
                      {totalXp} XP total
                    </span>
                  </div>

                  <button
                    data-testid="trade-in-confirm"
                    onClick={handleConfirm}
                    disabled={selected.size === 0 || submitting}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      background:
                        selected.size === 0 || submitting
                          ? 'rgba(94,164,247,0.3)'
                          : 'linear-gradient(90deg, #5ea4f7, #38bdf8)',
                      color: '#ffffff',
                      fontWeight: 700,
                      height: 52,
                      borderRadius: 16,
                      fontSize: 16,
                      boxShadow:
                        selected.size > 0 && !submitting
                          ? '0 10px 24px rgba(94,164,247,0.3)'
                          : 'none',
                      border: 'none',
                      cursor: selected.size === 0 || submitting ? 'not-allowed' : 'pointer',
                      width: '100%',
                      transition: 'background 0.15s, box-shadow 0.15s',
                    }}
                  >
                    {submitting ? 'Trading in…' : `Trade in · +${totalXp} XP`}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

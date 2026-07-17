/**
 * PackOpening — swipe-to-tear foil pack with card reveal flow.
 *
 * State machine: sealed → tearing → revealed → done
 *
 * - Foil strip with POTIAHNI label: drag right ≥80 px to tear (framer-motion drag)
 * - Accessible fallback: "Otvoriť" button triggers the same transition
 * - Cards fan out face-down, tap each to flip
 * - NEW badge on new_card_ids, Dupe badge + XP hint on duplicate_card_ids
 * - Continue button enabled after all 5 flipped → calls onDone()
 * - All async/timer state changes guarded via mounted ref
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { CardData, PackPurchaseResult, CardSet } from '../../lib/types';
import CardFrame from './CardFrame';
import { RARITY_THEMES } from './rarity';

// ── Exported pure helper (tested directly) ─────────────────────────────

/** Returns true when the drag offset is ≥ TEAR_THRESHOLD (accessible for tests) */
export function tearThresholdMet(offsetX: number): boolean {
  return offsetX >= TEAR_THRESHOLD;
}

const TEAR_THRESHOLD = 80; // px to the right to trigger a tear

// ── Card back (design: double-cross mark, blue gradient shell) ─────────

function PackCardBack() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 18,
        padding: 6,
        background: 'linear-gradient(160deg, #2b3a5e, #6f92d8 28%, #1c2540 58%, #4a6cb8 85%)',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 13,
          background: '#0b0e17',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Crosshatch pattern */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 9px, rgba(94,164,247,0.05) 9px, rgba(94,164,247,0.05) 10px), repeating-linear-gradient(-45deg, transparent, transparent 9px, rgba(94,164,247,0.05) 9px, rgba(94,164,247,0.05) 10px)',
          }}
        />
        {/* Foil shimmer */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(125deg, transparent 25%, rgba(94,164,247,0.1) 45%, rgba(111,146,216,0.14) 52%, transparent 75%)',
            backgroundSize: '250% 250%',
            animation: 'holo-shift 6s ease infinite',
          }}
        />
        {/* Inner border */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 10,
            border: '1px solid rgba(94,164,247,0.2)',
            borderRadius: 9,
          }}
        />
        {/* Logo slot */}
        <div
          style={{
            position: 'relative',
            width: 88,
            height: 88,
            borderRadius: 24,
            background:
              'radial-gradient(circle at 50% 35%, rgba(94,164,247,0.3), rgba(94,164,247,0.06) 75%)',
            border: '1px solid rgba(94,164,247,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          {/* Cross-mark SVG (SlovakPrep logo) */}
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect x="14.25" y="2" width="3.5" height="28" rx="1" fill="#9cc4ff" />
            <rect x="10" y="7" width="12" height="3.2" rx="1" fill="#9cc4ff" />
            <rect x="8" y="14" width="16" height="3.2" rx="1" fill="#9cc4ff" />
          </svg>
        </div>
        <p
          style={{
            position: 'relative',
            fontSize: 12,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.32em',
            color: 'rgba(156,196,255,0.85)',
            margin: 0,
          }}
        >
          SlovakPrep
        </p>
        <p
          style={{
            position: 'relative',
            fontSize: 8,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'rgba(156,196,255,0.4)',
            margin: '6px 0 0 0',
            letterSpacing: '0.2em',
          }}
        >
          ZBERATEĽSKÉ KARTY
        </p>
      </div>
    </div>
  );
}

// ── Sealed foil pack with swipe strip ─────────────────────────────────

interface SealedPackProps {
  set: CardSet;
  accentColor: string;
  gradient: string;
  onTear: () => void;
}

function SealedPack({ set, accentColor, gradient, onTear }: SealedPackProps) {
  const x = useMotionValue(0);
  const stripOpacity = useTransform(x, [0, TEAR_THRESHOLD], [1, 0.3]);
  const packX = useTransform(x, [0, TEAR_THRESHOLD], [0, 18]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      if (tearThresholdMet(info.offset.x)) {
        onTear();
      } else {
        // Snap back
        x.set(0);
      }
    },
    [onTear, x]
  );

  // First letter of set name for Cinzel monogram
  const monogram = set.name.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-text-muted">Swipe the foil strip to tear it open</p>

      <motion.div
        style={{ x: packX }}
        className="relative"
        aria-label={`${set.name} pack — sealed`}
      >
        {/* Pack body: 210 × 290 per design */}
        <div
          style={{
            position: 'relative',
            width: 210,
            height: 290,
            borderRadius: 16,
            background: gradient,
            border: `1px solid ${accentColor}66`,
            boxShadow: `0 24px 50px ${accentColor}4d`,
            overflow: 'hidden',
          }}
        >
          {/* Holo shimmer */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)',
              backgroundSize: '250% 250%',
              animation: 'holo-shift 4s ease infinite',
            }}
          />

          {/* Foil strip (top 34 px) */}
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: TEAR_THRESHOLD * 1.2 }}
            dragElastic={0.1}
            style={{ x, opacity: stripOpacity, cursor: 'grab' }}
            onDragEnd={handleDragEnd}
            whileDrag={{ cursor: 'grabbing' }}
            aria-hidden
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 34,
                background: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: '0 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  animation: 'tear-hint 1.4s ease-in-out infinite',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.75)',
                    letterSpacing: '0.06em',
                  }}
                >
                  POTIAHNI
                </span>
                <ArrowRight size={14} color="rgba(255,255,255,0.75)" />
              </div>
            </div>
          </motion.div>

          {/* Dashed perforation line */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              right: 0,
              borderTop: '2px dashed rgba(255,255,255,0.35)',
            }}
          />

          {/* Pack interior below strip */}
          <div
            style={{
              position: 'absolute',
              top: 34,
              bottom: 0,
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            {/* Monogram art */}
            <div
              style={{
                position: 'relative',
                width: 84,
                height: 84,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: 66,
                  height: 66,
                  transform: 'rotate(45deg)',
                  border: `2px solid ${accentColor}80`,
                  borderRadius: 10,
                }}
                aria-hidden
              />
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: 44,
                  fontWeight: 900,
                  color: accentColor,
                  position: 'relative',
                }}
              >
                {monogram}
              </span>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#eef1f8' }}>
                {set.name}
              </p>
              <p
                style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(255,255,255,0.5)',
                  margin: '4px 0 0 0',
                }}
              >
                5 KARIET · 1 RARE+
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Accessible fallback button */}
      <button
        onClick={onTear}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold cursor-pointer border-none hover:bg-accent-hover transition-colors"
        aria-label="Otvoriť"
      >
        <Sparkles size={14} />
        Otvoriť
      </button>

      <style>{`
        @keyframes tear-hint {
          0%, 100% { transform: translateX(0); opacity: 0.75; }
          50% { transform: translateX(6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Tearing transition (brief flash) ──────────────────────────────────

function TearingFlash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.65, 0] }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        background:
          'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(147,197,253,0.4) 40%, transparent 70%)',
      }}
    />
  );
}

// ── Flippable card slot ────────────────────────────────────────────────

interface FlippableSlotProps {
  card: CardData;
  setTotal: number;
  isNew: boolean;
  isDupe: boolean;
  flipped: boolean;
  entryDelay: number;
  onFlip: () => void;
}

function FlippableSlot({
  card,
  setTotal,
  isNew,
  isDupe,
  flipped,
  entryDelay,
  onFlip,
}: FlippableSlotProps) {
  const theme = RARITY_THEMES[card.rarity];

  return (
    <motion.div
      initial={{ opacity: 0, y: -60, scale: 0.5 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: entryDelay, type: 'spring', damping: 18, stiffness: 200 }}
      style={{ position: 'relative', width: 140, height: theme.height * (140 / 210) }}
      className="flex-shrink-0"
    >
      {/* 3-D flip wrapper */}
      <div
        style={{
          width: '100%',
          height: '100%',
          perspective: 1200,
        }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.55, type: 'spring', damping: 25, stiffness: 220 }}
          style={{
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            position: 'relative',
          }}
        >
          {/* Back face */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {!flipped && (
              <button
                onClick={onFlip}
                aria-label="Flip card"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  zIndex: 2,
                }}
              />
            )}
            <PackCardBack />
          </div>

          {/* Front face */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <CardFrame card={card} setTotal={setTotal} size={140} />
          </div>
        </motion.div>
      </div>

      {/* NEW badge */}
      <AnimatePresence>
        {flipped && isNew && (
          <motion.div
            key="new-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '3px 7px',
              borderRadius: 999,
              boxShadow: '0 2px 8px rgba(34,197,94,0.5)',
              zIndex: 10,
            }}
            aria-label="New card"
          >
            NEW
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dupe badge + XP hint */}
      <AnimatePresence>
        {flipped && isDupe && (
          <>
            <motion.div
              key="dupe-badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 300, delay: 0.1 }}
              style={{
                position: 'absolute',
                top: -8,
                right: -8,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#171205',
                fontSize: 9,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '3px 7px',
                borderRadius: 999,
                boxShadow: '0 2px 8px rgba(245,158,11,0.5)',
                zIndex: 10,
              }}
            >
              ×Dupe
            </motion.div>
            <motion.div
              key="dupe-xp"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.25 }}
              style={{
                position: 'absolute',
                bottom: -22,
                left: '50%',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#f5c45e',
                fontWeight: 700,
              }}
              aria-label="+XP on trade-in"
            >
              +XP on trade-in
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export type OpeningPhase = 'sealed' | 'tearing' | 'revealed' | 'done';

interface PackOpeningProps {
  set: CardSet;
  result: PackPurchaseResult;
  /** Called when the user clicks Continue after all cards are flipped */
  onDone: () => void;
  /** Accent color for the foil pack shell (defaults to #5ea4f7) */
  accentColor?: string;
  /** Gradient for the foil pack shell */
  gradient?: string;
}

// Set theme for pack visuals (mirrors SET_THEMES in Cards.tsx)
const SET_PACK_THEMES: Record<string, { accent: string; gradient: string }> = {
  myty:      { accent: '#a855f7', gradient: 'linear-gradient(165deg, #2a1a4a, #6d28d9 45%, #1e1235 90%)' },
  jedlo:     { accent: '#ef4444', gradient: 'linear-gradient(165deg, #4a1a1a, #dc2626 45%, #351212 90%)' },
  pamiatky:  { accent: '#f59e0b', gradient: 'linear-gradient(165deg, #2c1a0e, #d97706 45%, #1a0e05 90%)' },
  slang:     { accent: '#ec4899', gradient: 'linear-gradient(165deg, #3a1a3a, #be185d 45%, #2a1228 90%)' },
  rozpravky: { accent: '#6366f1', gradient: 'linear-gradient(165deg, #1a1a4a, #4338ca 45%, #0e0e35 90%)' },
  futbal:    { accent: '#22c55e', gradient: 'linear-gradient(165deg, #0a3a1a, #15803d 45%, #052512 90%)' },
  zvierata:  { accent: '#f97316', gradient: 'linear-gradient(165deg, #3a1a0a, #c2410c 45%, #2a0e05 90%)' },
  tradicie:  { accent: '#06b6d4', gradient: 'linear-gradient(165deg, #0a2a3a, #0e7490 45%, #051825 90%)' },
  priroda:   { accent: '#14b8a6', gradient: 'linear-gradient(165deg, #0a2a25, #0f766e 45%, #05150f 90%)' },
  hudba:     { accent: '#3b82f6', gradient: 'linear-gradient(165deg, #1a2c4a, #2563eb 45%, #12203a 90%)' },
};

const DEFAULT_PACK_THEME = {
  accent: '#5ea4f7',
  gradient: 'linear-gradient(165deg, #1a2c4a, #2563eb 45%, #12203a 90%)',
};

export default function PackOpening({
  set,
  result,
  onDone,
  accentColor: accentProp,
  gradient: gradientProp,
}: PackOpeningProps) {
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const packTheme = SET_PACK_THEMES[set.set_id] ?? DEFAULT_PACK_THEME;
  const accentColor = accentProp ?? packTheme.accent;
  const gradient = gradientProp ?? packTheme.gradient;

  const [phase, setPhase] = useState<OpeningPhase>('sealed');
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const newIdSet = new Set(result.new_card_ids);
  const dupeIdSet = new Set(result.duplicate_card_ids);

  const allFlipped = result.cards.length > 0 && flipped.size >= result.cards.length;

  const handleTear = useCallback(() => {
    if (!mounted.current) return;
    setPhase('tearing');
  }, []);

  const handleTearComplete = useCallback(() => {
    if (!mounted.current) return;
    setPhase('revealed');
  }, []);

  const handleFlip = useCallback((cardId: number) => {
    if (!mounted.current) return;
    setFlipped((prev) => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    if (!mounted.current) return;
    setPhase('done');
    onDone();
  }, [onDone]);

  return (
    <div className="flex flex-col items-center gap-6 pb-10 relative">
      {/* Pack name header */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-text-primary tracking-tight">
          {set.emoji} {set.name}
        </h2>
      </div>

      <AnimatePresence mode="wait">
        {/* ── SEALED ── */}
        {phase === 'sealed' && (
          <motion.div
            key="sealed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <SealedPack
              set={set}
              accentColor={accentColor}
              gradient={gradient}
              onTear={handleTear}
            />
          </motion.div>
        )}

        {/* ── TEARING FLASH ── */}
        {phase === 'tearing' && (
          <motion.div key="tearing" className="relative">
            <TearingFlash onComplete={handleTearComplete} />
          </motion.div>
        )}

        {/* ── REVEALED ── */}
        {(phase === 'revealed' || phase === 'done') && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-8 w-full"
          >
            {/* Hint text */}
            {!allFlipped && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-text-muted font-mono"
              >
                Tap each card to flip · rarity decides the reveal fanfare
              </motion.p>
            )}

            {/* Card fan */}
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-4">
              {result.cards.map((card, i) => (
                <FlippableSlot
                  key={card.id}
                  card={card}
                  setTotal={set.total_cards}
                  isNew={newIdSet.has(card.id)}
                  isDupe={dupeIdSet.has(card.id)}
                  flipped={flipped.has(card.id)}
                  entryDelay={i * 0.08}
                  onFlip={() => handleFlip(card.id)}
                />
              ))}
            </div>

            {/* Summary + Continue */}
            <AnimatePresence>
              {allFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                  className="text-center space-y-3 mt-6"
                >
                  {result.new_card_ids.length > 0 ? (
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles size={15} className="text-warning" />
                      <p className="text-sm font-medium text-text-secondary">
                        <span className="text-warning font-bold">{result.new_card_ids.length}</span>{' '}
                        new {result.new_card_ids.length === 1 ? 'card' : 'cards'} added!
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-text-faint">All duplicates — you already had these!</p>
                  )}

                  {result.duplicate_card_ids.length > 0 && (
                    <p className="text-xs text-text-muted font-mono">
                      {result.duplicate_card_ids.length} duplicate{result.duplicate_card_ids.length > 1 ? 's' : ''} — trade in for XP
                    </p>
                  )}

                  <button
                    onClick={handleContinue}
                    disabled={!allFlipped}
                    aria-label="Continue"
                    className="mt-2 px-6 py-2.5 rounded-xl bg-accent text-white font-bold text-sm cursor-pointer border-none hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Continue button is always rendered (disabled when not all flipped) for testability */}
            {!allFlipped && (
              <button
                disabled
                aria-label="Continue"
                className="px-6 py-2.5 rounded-xl bg-accent/40 text-white font-bold text-sm border-none cursor-not-allowed opacity-40"
              >
                Continue
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

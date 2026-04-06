import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, useAnimate } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { PackPurchaseResult } from '../lib/types';
import { Zap, ChevronLeft, ChevronRight, ShoppingBag, Library, Users, ArrowLeft, Sparkles, X } from 'lucide-react';
import { useUser } from '../components/UserPicker';
import { getUserCards, getCardCatalog, purchasePack, getCardsSocial } from '../lib/api';
import type { CardData, CardSet, UserCardCollection, CardSocialEntry } from '../lib/types';

// ── Rarity config ──────────────────────────────────────────────────

const RARITY = {
  common: {
    label: 'Common',
    borderColor: 'rgba(148, 163, 184, 0.4)',
    glow: '',
    bg: 'from-slate-800/95 via-slate-800 to-slate-900',
    dot: 'bg-gray-400',
    text: 'text-gray-400',
    badge: 'bg-gray-500/20 text-gray-400',
    edgeColor: 'rgba(148, 163, 184, 0.2)',
  },
  uncommon: {
    label: 'Uncommon',
    borderColor: 'rgba(52, 211, 153, 0.6)',
    glow: 'card-glow-uncommon',
    bg: 'from-emerald-950/60 via-slate-800 to-slate-900',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-400',
    edgeColor: 'rgba(52, 211, 153, 0.3)',
  },
  rare: {
    label: 'Rare',
    borderColor: 'rgba(96, 165, 250, 0.7)',
    glow: 'card-glow-rare',
    bg: 'from-blue-950/60 via-slate-800 to-slate-900',
    dot: 'bg-blue-400',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400',
    edgeColor: 'rgba(96, 165, 250, 0.3)',
  },
  legendary: {
    label: 'Legendary',
    borderColor: 'rgba(251, 191, 36, 0.8)',
    glow: 'card-glow-legendary',
    bg: 'from-amber-950/60 via-slate-800 to-slate-900',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400',
    edgeColor: 'rgba(251, 191, 36, 0.4)',
  },
};

// ── Set theme colors ───────────────────────────────────────────────

const SET_THEMES: Record<string, { accent: string; bg: string }> = {
  myty: { accent: '#a855f7', bg: 'from-purple-900/20' },
  jedlo: { accent: '#ef4444', bg: 'from-red-900/20' },
  pamiatky: { accent: '#f59e0b', bg: 'from-amber-900/20' },
  slang: { accent: '#ec4899', bg: 'from-pink-900/20' },
  rozpravky: { accent: '#6366f1', bg: 'from-indigo-900/20' },
  futbal: { accent: '#22c55e', bg: 'from-green-900/20' },
  zvierata: { accent: '#f97316', bg: 'from-orange-900/20' },
  tradicie: { accent: '#06b6d4', bg: 'from-cyan-900/20' },
  priroda: { accent: '#14b8a6', bg: 'from-teal-900/20' },
  hudba: { accent: '#3b82f6', bg: 'from-blue-900/20' },
};

// ── Card front component ───────────────────────────────────────────

function CardFront({ card, size = 'normal', flipMode = false, onInspect }: { card: CardData; size?: 'normal' | 'small' | 'large'; flipMode?: boolean; onInspect?: () => void }) {
  const r = RARITY[card.rarity];
  const isSmall = size === 'small';
  const isLarge = size === 'large';

  return (
    <div
      className={`${flipMode ? 'card-face card-front' : ''} w-full h-full rounded-2xl bg-gradient-to-br ${r.bg} flex flex-col overflow-hidden relative ${r.glow} card-edge-${card.rarity}`}
      style={{
        padding: isSmall ? '8px' : isLarge ? '20px' : '12px',
        border: `${card.rarity === 'legendary' ? '2.5px' : '2px'} solid ${r.borderColor}`,
        cursor: onInspect ? 'pointer' : undefined,
      }}
      onClick={onInspect}
    >
      {/* Holographic overlay for non-common */}
      {card.rarity !== 'common' && <div className={`card-holo card-holo-${card.rarity}`} />}

      {/* Corner decorations for rare+ */}
      {(card.rarity === 'rare' || card.rarity === 'legendary') && (
        <>
          <div className={`card-corner card-corner-tl card-corner-${card.rarity}`} />
          <div className={`card-corner card-corner-tr card-corner-${card.rarity}`} />
          <div className={`card-corner card-corner-bl card-corner-${card.rarity}`} />
          <div className={`card-corner card-corner-br card-corner-${card.rarity}`} />
        </>
      )}

      {/* Inner border glow for legendary */}
      {card.rarity === 'legendary' && <div className="card-inner-glow" />}

      {/* Set label */}
      <div className="text-center relative z-10" style={{ marginBottom: isSmall ? '0px' : isLarge ? '6px' : '2px' }}>
        <span className={`font-semibold uppercase tracking-[0.2em] text-text-faint ${isSmall ? 'text-[7px]' : isLarge ? 'text-[11px]' : 'text-[9px]'}`}>
          {card.set_name}
        </span>
      </div>

      {/* Emoji art */}
      <div className="flex items-center justify-center relative z-10" style={{ flex: isLarge ? '1 1 auto' : '0 0 auto', margin: isSmall ? '4px 0' : isLarge ? '8px 0' : '6px 0' }}>
        <span className={`leading-none select-none drop-shadow-lg ${isSmall ? 'text-4xl' : isLarge ? 'text-8xl' : 'text-6xl'}`}>
          {card.emoji}
        </span>
      </div>

      {/* Divider */}
      <div className={`h-px w-3/5 mx-auto relative z-10`} style={{ marginBottom: isSmall ? '4px' : isLarge ? '12px' : '6px', background: `linear-gradient(90deg, transparent, ${r.borderColor}, transparent)` }} />

      {/* Word */}
      <div className="text-center relative z-10" style={{ marginBottom: isSmall ? '1px' : isLarge ? '4px' : '2px' }}>
        <h3 className={`font-black text-white tracking-tight ${isSmall ? 'text-base' : isLarge ? 'text-3xl' : 'text-xl'}`}>{card.slovak}</h3>
        <p className={`text-text-faint font-mono mt-0.5 ${isSmall ? 'text-[8px]' : isLarge ? 'text-sm' : 'text-[10px]'}`}>/{card.pronunciation}/</p>
      </div>

      {/* Translation */}
      <div className="text-center relative z-10" style={{ marginBottom: isSmall ? '4px' : isLarge ? '8px' : '4px' }}>
        <p className={`font-semibold text-text-secondary ${isSmall ? 'text-[10px]' : isLarge ? 'text-base' : 'text-xs'}`}>{card.english}</p>
        {card.origin && !isSmall && (
          <p className={`text-text-faint italic ${isLarge ? 'text-xs mt-1' : 'text-[8px] mt-0.5'}`}>{card.origin}</p>
        )}
      </div>

      {/* Example sentence — hide on small, truncate on normal */}
      {!isSmall && (
        <div className={`bg-black/30 rounded-xl relative z-10 ${isLarge ? 'px-4 py-3 mb-4' : 'px-2.5 py-2 mb-2'}`} style={{ minHeight: 0 }}>
          <p className={`text-text-secondary italic leading-snug ${isLarge ? 'text-sm' : 'text-[10px]'}`} style={isLarge ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            &ldquo;{card.example_sk}&rdquo;
          </p>
          <p className={`text-text-faint ${isLarge ? 'text-xs mt-1.5' : 'text-[9px] mt-0.5'}`} style={isLarge ? {} : { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {card.example_en}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between relative z-10 mt-auto">
        <span className={`font-mono text-text-faint ${isSmall ? 'text-[7px]' : isLarge ? 'text-xs' : 'text-[9px]'}`}>
          #{String(card.number).padStart(3, '0')}/015
        </span>
        <div className="flex items-center gap-1">
          <div className={`rounded-full ${r.dot} ${isSmall ? 'w-1 h-1' : isLarge ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'}`} />
          <span className={`font-bold uppercase tracking-wider ${r.text} ${isSmall ? 'text-[7px]' : isLarge ? 'text-xs' : 'text-[9px]'}`}>
            {r.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Card back ──────────────────────────────────────────────────────

function CardBack({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return (
    <div className="card-face card-back w-full h-full rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-slate-800 via-accent/10 to-slate-900 flex items-center justify-center overflow-hidden relative">
      <div className="card-back-pattern" />
      <div className="card-back-foil" />
      <div className="relative z-10 text-center">
        <div className={`mb-2 opacity-80 ${size === 'small' ? 'text-3xl' : 'text-5xl'}`}>🇸🇰</div>
        <p className={`font-bold uppercase tracking-[0.25em] text-accent/60 ${size === 'small' ? 'text-[8px]' : 'text-xs'}`}>
          SlovakPrep
        </p>
      </div>
    </div>
  );
}

// ── Card inspect modal ─────────────────────────────────────────────

function CardInspectModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  const r = RARITY[card.rarity];
  const theme = SET_THEMES[card.set_id];

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Card */}
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.7, rotateY: -15 }}
        animate={{ scale: 1, rotateY: 0 }}
        exit={{ scale: 0.7, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{ perspective: 1200, width: 300, height: 480 }}
      >
        <CardFront card={card} size="large" />
      </motion.div>

      {/* Close button */}
      <motion.button
        className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center cursor-pointer text-white/80 hover:text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <X size={18} />
      </motion.button>

      {/* Card info panel below */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-lg">{card.set_emoji}</span>
          <span className="text-sm font-medium text-white/70">{card.set_name}</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className={`rounded-full ${r.dot} w-2 h-2`} />
          <span className={`text-sm font-bold uppercase tracking-wider ${r.text}`}>{r.label}</span>
          {theme && (
            <span className="text-xs text-white/40 ml-1">#{String(card.number).padStart(3, '0')}/015</span>
          )}
        </div>
        {card.origin && (
          <p className="text-xs text-white/50 italic mt-1">Origin: {card.origin}</p>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Flippable card for pack opening ────────────────────────────────

function FlippableCard({
  card,
  flipped,
  delay = 0,
  onFlip,
  onInspect,
}: {
  card: CardData;
  flipped: boolean;
  delay?: number;
  onFlip?: () => void;
  onInspect?: () => void;
}) {
  return (
    <motion.div
      className="card-container cursor-pointer"
      style={{ perspective: 1200 }}
      initial={{ opacity: 0, y: -80, scale: 0.3, rotate: 0 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', damping: 18, stiffness: 200 }}
      onClick={flipped ? onInspect : onFlip}
    >
      <motion.div
        className="card-inner"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', damping: 25, stiffness: 200 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <CardBack />
        <CardFront card={card} flipMode />
      </motion.div>
    </motion.div>
  );
}

// ── Rarity timing config ──────────────────────────────────────────

const RARITY_TIMING: Record<string, { preDelay: number; postDelay: number }> = {
  common:    { preDelay: 300,  postDelay: 200 },
  uncommon:  { preDelay: 500,  postDelay: 300 },
  rare:      { preDelay: 600,  postDelay: 600 },
  legendary: { preDelay: 800,  postDelay: 1000 },
};

// ── Burst particles helper ────────────────────────────────────────

function makeBurstParticles(count: number, minDist: number, maxDist: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const distance = minDist + Math.random() * (maxDist - minDist);
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 0.08,
    };
  });
}

const BURST_PARTICLES = makeBurstParticles(10, 100, 180);
const LEGENDARY_PARTICLES = makeBurstParticles(14, 60, 140);

// ── Shaking pack (escalating tension) ─────────────────────────────

function ShakingPack({ set, onComplete }: { set: CardSet; onComplete: () => void }) {
  const [scope, animateEl] = useAnimate();
  const glowOpacity = useMotionValue(0.15);
  const [showCracks, setShowCracks] = useState(false);
  const completeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // Ramp glow over 2s
        animate(glowOpacity, 1.0, { duration: 2, ease: 'easeIn' });

        // Stage 1: gentle wobble (0.7s)
        await animateEl(scope.current,
          { rotate: [0, -2, 2, -2, 2, -1, 1, 0], scale: [1, 1.01, 1.01, 1.01, 1.01, 1.0, 1.0, 1] },
          { duration: 0.7, ease: 'easeInOut' }
        );
        if (cancelled) return;
        // Stage 2: medium shake (0.7s)
        await animateEl(scope.current,
          { rotate: [0, -5, 5, -6, 6, -5, 5, -3, 3, 0], scale: [1, 1.02, 1.03, 1.04, 1.04, 1.03, 1.03, 1.02, 1.01, 1] },
          { duration: 0.7, ease: 'easeInOut' }
        );
        if (cancelled) return;
        // Show cracks for final stage
        setShowCracks(true);
        // Stage 3: intense shake (0.6s)
        await animateEl(scope.current,
          { rotate: [0, -8, 8, -10, 10, -12, 12, -8, 8, -4, 0], scale: [1.04, 1.05, 1.06, 1.07, 1.08, 1.09, 1.10, 1.08, 1.06, 1.04, 1.02] },
          { duration: 0.6, ease: 'easeInOut' }
        );
        if (cancelled) return;
        if (!completeRef.current) {
          completeRef.current = true;
          onComplete();
        }
      } catch {
        // Component unmounted mid-animation — safe to ignore
      }
    };
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="flex justify-center py-8 relative"
      exit={{ opacity: 0, scale: 1.3, y: -20 }}
      transition={{ duration: 0.25 }}
    >
      <div className="relative" ref={scope}>
        {/* Escalating glow */}
        <motion.div
          className="absolute -inset-8 rounded-3xl blur-2xl"
          style={{ opacity: glowOpacity, background: 'radial-gradient(circle, rgba(94,164,247,0.6) 0%, rgba(147,51,234,0.3) 50%, transparent 70%)' }}
        />
        {/* Energy cracks */}
        <AnimatePresence>
          {showCracks && [0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              className="absolute bg-white/80 rounded-full"
              style={{
                width: 20 + i * 8,
                height: 2,
                top: '50%',
                left: '50%',
                transformOrigin: 'left center',
                rotate: i * 90 + 15,
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.7] }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            />
          ))}
        </AnimatePresence>
        {/* Pack body */}
        <div className="relative w-36 h-48 sm:w-44 sm:h-56 rounded-xl border-2 border-accent/40 bg-gradient-to-br from-slate-700 via-accent/10 to-slate-800 flex flex-col items-center justify-center gap-2 overflow-hidden shadow-xl">
          <div className="absolute inset-0 opacity-10">
            <div className="card-back-pattern" />
          </div>
          <div className="relative z-10 text-center">
            <div className="text-4xl mb-2">{set.emoji}</div>
            <h3 className="text-sm font-black text-white tracking-tight">{set.name}</h3>
            <p className="text-[10px] text-text-faint mt-0.5">{set.description}</p>
            <div className="flex items-center justify-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/30">
              <Zap size={10} className="text-warning" />
              <span className="text-[10px] font-bold text-warning">{set.cost} XP</span>
            </div>
          </div>
          <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded">
            <span className="text-[9px] font-bold text-text-faint">{set.total_cards} cards</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Burst effect ──────────────────────────────────────────────────

function BurstEffect({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="flex justify-center py-8 relative"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* White flash overlay */}
      <motion.div
        className="fixed inset-0 z-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(147,197,253,0.4) 40%, transparent 70%)', willChange: 'opacity' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.7, 0] }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      {/* Expanding ring */}
      <motion.div
        className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-accent/60"
        style={{ top: '50%', left: '50%', x: '-50%', y: '-50%' }}
        initial={{ scale: 0.5, opacity: 0.8 }}
        animate={{ scale: 3, opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      {/* Particles */}
      {BURST_PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            top: '50%',
            left: '50%',
            background: i % 2 === 0 ? 'rgba(147,197,253,0.9)' : 'rgba(255,255,255,0.9)',
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: p.delay }}
        />
      ))}
    </motion.div>
  );
}

// ── Card reveal slot (rarity effects) ─────────────────────────────

function CardRevealSlot({
  card,
  flipped,
  isActive,
  justFlipped,
  entryDelay,
  onFlip,
  onInspect,
}: {
  card: CardData;
  flipped: boolean;
  isActive: boolean;
  justFlipped: boolean;
  entryDelay: number;
  onFlip: () => void;
  onInspect: () => void;
}) {
  const r = RARITY[card.rarity];
  const isRareOrAbove = card.rarity === 'rare' || card.rarity === 'legendary';
  const isLegendary = card.rarity === 'legendary';

  return (
    <div className="relative">
      {/* Pre-flip anticipation aura (rare+) */}
      {isActive && !flipped && isRareOrAbove && (
        <motion.div
          className={`absolute -inset-5 rounded-2xl blur-xl z-0 ${isLegendary ? 'aura-pulse-gold' : 'aura-pulse-blue'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Pre-flip subtle scale pulse for legendary */}
      <motion.div
        animate={isActive && !flipped && isLegendary ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <FlippableCard
          card={card}
          flipped={flipped}
          delay={entryDelay}
          onFlip={onFlip}
          onInspect={onInspect}
        />
      </motion.div>

      {/* Post-flip expanding ring (uncommon+) */}
      {justFlipped && card.rarity !== 'common' && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ border: `2px solid ${r.borderColor}` }}
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{ scale: isLegendary ? 2.0 : 1.6, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {/* Post-flip glow pulse (uncommon) */}
      {justFlipped && card.rarity === 'uncommon' && (
        <motion.div
          className="absolute -inset-3 rounded-2xl blur-lg pointer-events-none"
          style={{ background: `radial-gradient(circle, ${r.borderColor}, transparent 70%)` }}
          initial={{ opacity: 0.6, scale: 0.95 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Rare: micro-shake + blue glow burst */}
      {justFlipped && card.rarity === 'rare' && (
        <motion.div
          className="absolute -inset-4 rounded-2xl blur-xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(96, 165, 250, 0.5), transparent 70%)' }}
          initial={{ opacity: 0.8, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.3 }}
          transition={{ duration: 0.7 }}
        />
      )}

      {/* Legendary: screen flash */}
      {justFlipped && isLegendary && (
        <motion.div
          className="fixed inset-0 z-50 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4), transparent 70%)', willChange: 'opacity' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 0.7 }}
        />
      )}

      {/* Legendary: gold particle burst */}
      {justFlipped && isLegendary && (
        <>
          {LEGENDARY_PARTICLES.map((p, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full pointer-events-none z-10"
              style={{
                width: p.size,
                height: p.size,
                top: '50%',
                left: '50%',
                background: i % 3 === 0 ? 'rgba(251, 191, 36, 0.9)' : i % 3 === 1 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(239, 68, 68, 0.7)',
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: p.delay }}
            />
          ))}
        </>
      )}
    </div>
  );
}


// ── Collection carousel ────────────────────────────────────────────

function CollectionCarousel({ cards, onInspect }: { cards: CardData[]; onInspect: (card: CardData) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const CARD_W = isMobile ? 200 : 230;
  const CARD_H = isMobile ? 320 : 360;
  const GAP = isMobile ? 14 : 20;
  const STEP = CARD_W + GAP;

  // Center the active card in the viewport
  const getOffset = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 0;
    return (el.offsetWidth - CARD_W) / 2;
  }, [CARD_W]);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, cards.length - 1));
    setCurrentIndex(clamped);
    animate(x, -clamped * STEP + getOffset(), { type: 'spring', damping: 30, stiffness: 300 });
  }, [cards.length, x, STEP, getOffset]);

  // Re-center on resize
  useEffect(() => {
    const handleResize = () => {
      x.set(-currentIndex * STEP + getOffset());
    };
    window.addEventListener('resize', handleResize);
    // Initial center
    x.set(-currentIndex * STEP + getOffset());
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, STEP, getOffset, x]);

  const handleDragEnd = (_: never, info: PanInfo) => {
    const threshold = STEP / 3;
    if (info.offset.x < -threshold) {
      goTo(currentIndex + 1);
    } else if (info.offset.x > threshold) {
      goTo(currentIndex - 1);
    } else {
      goTo(currentIndex);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4 opacity-60">🃏</div>
        <p className="text-text-muted text-sm">No cards yet! Open some packs to start your collection.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Navigation arrows */}
      {currentIndex > 0 && (
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="absolute left-0 top-[170px] -translate-y-1/2 z-20 w-10 h-10 rounded-full glass border border-border flex items-center justify-center cursor-pointer text-text-secondary hover:text-white hover:bg-surface-2 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {currentIndex < cards.length - 1 && (
        <button
          onClick={() => goTo(currentIndex + 1)}
          className="absolute right-0 top-[170px] -translate-y-1/2 z-20 w-10 h-10 rounded-full glass border border-border flex items-center justify-center cursor-pointer text-text-secondary hover:text-white hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Carousel viewport */}
      <div className="overflow-hidden py-4" ref={containerRef}>
        <motion.div
          className="flex cursor-grab active:cursor-grabbing"
          style={{ x, gap: GAP }}
          drag="x"
          dragConstraints={{ left: -(cards.length - 1) * STEP + getOffset(), right: getOffset() }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          {cards.map((card, i) => {
            const isActive = i === currentIndex;
            const dist = Math.abs(i - currentIndex);
            return (
              <motion.div
                key={card.id}
                className="shrink-0"
                style={{ width: CARD_W, height: CARD_H }}
                animate={{
                  scale: isActive ? 1.05 : dist === 1 ? 0.9 : 0.8,
                  opacity: isActive ? 1 : dist === 1 ? 0.6 : 0.3,
                  y: isActive ? -8 : dist === 1 ? 0 : 8,
                }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={() => {
                  if (isActive) onInspect(card);
                  else goTo(i);
                }}
              >
                <CardFront card={card} onInspect={isActive ? () => onInspect(card) : undefined} />
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Tap hint */}
      <div className="text-center mt-4">
        <span className="text-[10px] text-text-faint/60">Tap card to inspect</span>
      </div>

      {/* Card counter */}
      <div className="text-center mt-1">
        <span className="text-xs font-mono text-text-faint">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Dot indicators (show max ~30 dots) */}
      <div className="flex justify-center gap-1 mt-2 flex-wrap max-w-[280px] mx-auto">
        {cards.length <= 30 ? cards.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all cursor-pointer border-none ${
              i === currentIndex
                ? 'w-2.5 h-2.5 bg-accent'
                : 'w-1.5 h-1.5 bg-text-faint/30 hover:bg-text-faint/60'
            }`}
          />
        )) : (
          <span className="text-[10px] text-text-faint">
            Swipe or use arrows to browse
          </span>
        )}
      </div>
    </div>
  );
}

// ── Social view ────────────────────────────────────────────────────

function SocialView({ social, sets }: { social: CardSocialEntry[]; sets: CardSet[] }) {
  return (
    <div className="space-y-4">
      {social.map((user) => (
        <motion.div
          key={user.user_id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-surface-1 border border-border p-4"
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${user.color}, ${user.color}88)` }}
            >
              {user.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">{user.name}</p>
              <p className="text-xs text-text-muted">
                {user.total_cards} / 150 cards collected
              </p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-accent">{Math.round((user.total_cards / 150) * 100)}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden mb-3">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-sky-400"
              initial={{ width: 0 }}
              animate={{ width: `${(user.total_cards / 150) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>

          {/* Set progress chips */}
          <div className="flex flex-wrap gap-1.5">
            {sets.map((s) => {
              const count = user.sets_progress[s.set_id] || 0;
              return (
                <div
                  key={s.set_id}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    count > 0
                      ? 'bg-accent/10 border-accent/30 text-accent'
                      : 'bg-surface-2 border-border text-text-faint'
                  }`}
                >
                  {s.emoji} {count}/{s.total_cards}
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

type Tab = 'shop' | 'collection' | 'social';
type PackPhase = 'idle' | 'shaking' | 'bursting' | 'revealing' | 'done';

export default function Farm() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('shop');
  const [inspectCard, setInspectCard] = useState<CardData | null>(null);

  // Data
  const [collection, setCollection] = useState<UserCardCollection | null>(null);
  const [catalog, setCatalog] = useState<CardSet[]>([]);
  const [social, setSocial] = useState<CardSocialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Pack opening state
  const [packPhase, setPackPhase] = useState<PackPhase>('idle');
  const [openingSet, setOpeningSet] = useState<CardSet | null>(null);
  const [revealedCards, setRevealedCards] = useState<CardData[]>([]);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [newCardIds, setNewCardIds] = useState<number[]>([]);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [confirmSet, setConfirmSet] = useState<CardSet | null>(null);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [justFlippedIds, setJustFlippedIds] = useState<Set<number>>(new Set());
  const apiResultRef = useRef<PackPurchaseResult | null>(null);
  const shakeCompleteRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [col, cat, soc] = await Promise.all([
        getUserCards(user.id),
        getCardCatalog(),
        getCardsSocial(),
      ]);
      setCollection(col);
      setCatalog(cat);
      setSocial(soc);
    } catch (err) {
      console.error('Failed to fetch card data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBuyPack = useCallback(async (set: CardSet) => {
    if (!user || packPhase !== 'idle') return;
    setPurchaseError(null);
    setOpeningSet(set);
    setPackPhase('shaking');
    setRevealedCards([]);
    setFlippedCards(new Set());
    setNewCardIds([]);
    setRevealIndex(-1);
    setJustFlippedIds(new Set());
    apiResultRef.current = null;
    shakeCompleteRef.current = false;

    try {
      const result = await purchasePack(user.id, set.set_id);
      apiResultRef.current = result;
      setRevealedCards(result.cards);
      setNewCardIds(result.new_card_ids);

      // Refresh collection data (XP, card counts) in background
      getUserCards(user.id).then(col => setCollection(col)).catch(() => {});

      // If shake already completed, go to burst
      if (shakeCompleteRef.current) {
        setPackPhase('bursting');
      }
    } catch {
      setPurchaseError('Not enough XP or purchase failed!');
      setPackPhase('idle');
      setOpeningSet(null);
    }
  }, [user, packPhase]);

  // Shake completion handler
  const handleShakeComplete = useCallback(() => {
    shakeCompleteRef.current = true;
    if (apiResultRef.current) {
      setPackPhase('bursting');
    }
    // If API hasn't returned yet, the API callback above will trigger burst
  }, []);

  // Burst completion handler
  const handleBurstComplete = useCallback(() => {
    setPackPhase('revealing');
    // Start sequential card reveal after cards land (500ms entry animation)
    setTimeout(() => setRevealIndex(0), 600);
  }, []);

  // Sequential card reveal orchestration
  useEffect(() => {
    if (packPhase !== 'revealing' || revealIndex < 0) return;
    if (revealIndex >= revealedCards.length) {
      // All cards revealed
      const timer = setTimeout(() => setPackPhase('done'), 500);
      return () => clearTimeout(timer);
    }

    const card = revealedCards[revealIndex];
    const timing = RARITY_TIMING[card.rarity] ?? RARITY_TIMING.common;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Pre-flip delay (anticipation), then flip, then post-delay (fanfare)
    const preTimer = setTimeout(() => {
      setFlippedCards(prev => new Set([...prev, card.id]));
      setJustFlippedIds(prev => new Set([...prev, card.id]));

      // Clear justFlipped after effects finish
      timers.push(setTimeout(() => {
        setJustFlippedIds(prev => {
          const next = new Set(prev);
          next.delete(card.id);
          return next;
        });
      }, 1000));

      // Post-flip delay then advance to next card
      timers.push(setTimeout(() => {
        setRevealIndex(prev => prev + 1);
      }, 600 + timing.postDelay));
    }, timing.preDelay);
    timers.push(preTimer);

    return () => timers.forEach(t => clearTimeout(t));
  }, [revealIndex, packPhase, revealedCards]);

  const handleClosePack = useCallback(async () => {
    setPackPhase('idle');
    setOpeningSet(null);
    setRevealedCards([]);
    setFlippedCards(new Set());
    setRevealIndex(-1);
    setJustFlippedIds(new Set());
    await fetchData();
  }, [fetchData]);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-pulse text-text-muted text-sm">Loading cards...</div>
      </div>
    );
  }

  const xpAvailable = collection?.xp_available ?? 0;

  // ── Pack opening overlay ──────────────────────────────────────────
  if (packPhase !== 'idle' && openingSet) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-16">
        {/* Back button */}
        {packPhase === 'done' && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleClosePack}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary text-sm mb-6 bg-transparent border-none cursor-pointer transition-colors"
          >
            <ArrowLeft size={16} />
            Back to shop
          </motion.button>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight mb-1">
            {openingSet.emoji} {openingSet.name} Pack
          </h1>
          <p className="text-text-muted text-sm">{openingSet.description}</p>
        </motion.div>

        {/* Pack opening phases */}
        <AnimatePresence mode="wait">
          {packPhase === 'shaking' && (
            <ShakingPack key="shaking" set={openingSet} onComplete={handleShakeComplete} />
          )}

          {packPhase === 'bursting' && (
            <BurstEffect key="bursting" onComplete={handleBurstComplete} />
          )}

          {(packPhase === 'revealing' || packPhase === 'done') && (
            <motion.div
              key="cards-reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                {revealedCards.map((card, i) => (
                  <CardRevealSlot
                    key={card.id}
                    card={card}
                    flipped={flippedCards.has(card.id)}
                    isActive={revealIndex === i}
                    justFlipped={justFlippedIds.has(card.id)}
                    entryDelay={i * 0.12}
                    onInspect={() => setInspectCard(card)}
                    onFlip={() => {
                      if (!flippedCards.has(card.id)) {
                        // Manual flip — trigger the flip and advance reveal
                        setFlippedCards(prev => new Set([...prev, card.id]));
                        setJustFlippedIds(prev => new Set([...prev, card.id]));
                        setTimeout(() => {
                          setJustFlippedIds(prev => {
                            const next = new Set(prev);
                            next.delete(card.id);
                            return next;
                          });
                        }, 1000);
                        // Advance reveal index if this card is current or earlier
                        if (i <= revealIndex || revealIndex === -1) {
                          setTimeout(() => setRevealIndex(prev => Math.max(prev, i + 1)), 800);
                        }
                      }
                    }}
                  />
                ))}
              </div>

              <AnimatePresence>
                {packPhase === 'done' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, type: 'spring', damping: 20, stiffness: 200 }}
                    className="text-center mt-8 space-y-3"
                  >
                    {newCardIds.length > 0 && (
                      <motion.div
                        className="flex items-center justify-center gap-2"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                      >
                        <Sparkles size={16} className="text-warning" />
                        <p className="text-text-secondary text-sm font-medium">
                          <span className="text-warning font-bold">{newCardIds.length}</span> new {newCardIds.length === 1 ? 'card' : 'cards'} added!
                        </p>
                      </motion.div>
                    )}
                    {newCardIds.length === 0 && (
                      <p className="text-text-faint text-sm">All duplicates — you already had these!</p>
                    )}
                    {newCardIds.length === revealedCards.length && revealedCards.length > 0 && (
                      <motion.p
                        className="text-xs font-bold text-warning uppercase tracking-widest"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: [0.5, 1.1, 1] }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                      >
                        Perfect Pull!
                      </motion.p>
                    )}
                    <motion.div
                      className="flex items-center justify-center gap-3 mt-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <button
                        onClick={handleClosePack}
                        className="px-5 py-2.5 rounded-xl bg-surface-2 text-text-secondary font-medium text-sm cursor-pointer border border-border hover:bg-surface-3 transition-colors"
                      >
                        Back to Shop
                      </button>
                      {xpAvailable >= openingSet.cost && (
                        <button
                          onClick={() => {
                            setPackPhase('idle');
                            setTimeout(() => handleBuyPack(openingSet), 50);
                          }}
                          className="px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm cursor-pointer border-none hover:bg-accent-hover transition-colors"
                        >
                          Open Another
                        </button>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inspect modal */}
        <AnimatePresence>
          {inspectCard && <CardInspectModal card={inspectCard} onClose={() => setInspectCard(null)} />}
        </AnimatePresence>

        <style>{cardStyles}</style>
      </div>
    );
  }

  // ── Main page with tabs ───────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pt-32 pb-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mb-1">
          Slovak Cards
        </h1>
        <p className="text-text-muted text-sm mb-3">
          Spend XP to open packs and collect vocabulary cards
        </p>
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <Zap size={14} className="text-warning" />
            <span className="text-sm font-bold text-warning tabular-nums">{xpAvailable} XP</span>
          </div>
          <span className="text-text-faint text-xs">•</span>
          <span className="text-xs text-text-muted tabular-nums">
            {collection?.total_unique ?? 0} / {collection?.total_possible ?? 150} cards
          </span>
        </div>
      </motion.div>

      {/* Tab bar */}
      <div className="flex justify-center gap-1 mb-8 bg-surface-1 rounded-xl p-1 max-w-sm mx-auto border border-border">
        {([
          { id: 'shop' as Tab, icon: ShoppingBag, label: 'Shop' },
          { id: 'collection' as Tab, icon: Library, label: 'Collection' },
          { id: 'social' as Tab, icon: Users, label: 'Friends' },
        ]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer border-none transition-all ${
              tab === id
                ? 'bg-accent text-white shadow-sm'
                : 'bg-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {purchaseError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4 text-danger text-sm bg-danger-muted rounded-lg px-4 py-2"
        >
          {purchaseError}
        </motion.div>
      )}

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'shop' && (
          <motion.div
            key="shop"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {catalog.map((set) => {
                const ownedInSet = collection?.cards.filter(c => c.set_id === set.set_id).length ?? 0;
                const canAfford = xpAvailable >= set.cost;
                const complete = ownedInSet >= set.total_cards;
                const theme = SET_THEMES[set.set_id] || { accent: '#5ea4f7', bg: 'from-blue-900/20' };

                return (
                  <motion.button
                    key={set.set_id}
                    whileHover={canAfford && !complete ? { scale: 1.03, y: -2 } : {}}
                    whileTap={canAfford && !complete ? { scale: 0.97 } : {}}
                    onClick={() => canAfford && !complete && setConfirmSet(set)}
                    disabled={!canAfford || complete}
                    className={`relative rounded-xl border overflow-hidden text-left cursor-pointer transition-all ${
                      complete
                        ? 'border-emerald-500/30 bg-emerald-950/20'
                        : canAfford
                          ? 'border-border hover:border-accent/40 bg-surface-1 hover:bg-surface-2'
                          : 'border-border bg-surface-1 opacity-50 cursor-not-allowed'
                    }`}
                    style={{ padding: 0 }}
                  >
                    {/* Top gradient accent */}
                    <div
                      className={`h-1.5 w-full`}
                      style={{ background: complete ? '#22c55e' : theme.accent }}
                    />

                    <div className="p-3 sm:p-4">
                      {/* Emoji + name */}
                      <div className="text-center mb-3">
                        <div className="text-3xl mb-1.5">{set.emoji}</div>
                        <h3 className="text-sm font-bold text-text-primary">{set.name}</h3>
                        <p className="text-[10px] text-text-faint mt-0.5">{set.description}</p>
                      </div>

                      {/* Progress */}
                      <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(ownedInSet / set.total_cards) * 100}%`,
                            background: complete ? '#22c55e' : theme.accent,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-text-faint tabular-nums">
                          {ownedInSet}/{set.total_cards}
                        </span>
                        {complete && (
                          <span className="text-[10px] font-bold text-emerald-400">COMPLETE</span>
                        )}
                      </div>

                      {/* Price */}
                      {!complete && (
                        <div className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-black/20 border border-white/5">
                          <Zap size={10} className="text-warning" />
                          <span className="text-[11px] font-bold text-warning">{set.cost} XP</span>
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {tab === 'collection' && (
          <motion.div
            key="collection"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <CollectionView cards={collection?.cards ?? []} sets={catalog} onInspect={setInspectCard} />
          </motion.div>
        )}

        {tab === 'social' && (
          <motion.div
            key="social"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <SocialView social={social} sets={catalog} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspect modal */}
      <AnimatePresence>
        {inspectCard && <CardInspectModal card={inspectCard} onClose={() => setInspectCard(null)} />}
      </AnimatePresence>

      {/* Confirm purchase modal */}
      <AnimatePresence>
        {confirmSet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setConfirmSet(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="text-4xl mb-3">{confirmSet.emoji}</div>
                <h3 className="text-lg font-bold text-text-primary mb-1">{confirmSet.name}</h3>
                <p className="text-sm text-text-muted mb-4">Open this pack for {confirmSet.cost} XP?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmSet(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-text-secondary hover:bg-surface-2 border-none cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const set = confirmSet;
                      setConfirmSet(null);
                      handleBuyPack(set);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-accent to-sky-400 text-white border-none cursor-pointer shadow-md shadow-accent/20"
                  >
                    Open Pack
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{cardStyles}</style>
    </div>
  );
}

// ── Collection view with set filter + carousel ─────────────────────

function CollectionView({ cards, sets, onInspect }: { cards: CardData[]; sets: CardSet[]; onInspect: (card: CardData) => void }) {
  const [filterSet, setFilterSet] = useState<string | null>(null);

  const filtered = filterSet
    ? cards.filter(c => c.set_id === filterSet)
    : cards;

  // Sort: legendary first, then rare, uncommon, common
  const rarityOrder = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
  const sorted = [...filtered].sort((a, b) =>
    rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.set_id.localeCompare(b.set_id) || a.number - b.number
  );

  return (
    <div>
      {/* Set filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-6 scrollbar-hide">
        <button
          onClick={() => setFilterSet(null)}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
            !filterSet
              ? 'bg-accent text-white border-accent'
              : 'bg-surface-1 text-text-muted border-border hover:border-accent/40'
          }`}
        >
          All ({cards.length})
        </button>
        {sets.map(s => {
          const count = cards.filter(c => c.set_id === s.set_id).length;
          return (
            <button
              key={s.set_id}
              onClick={() => setFilterSet(s.set_id === filterSet ? null : s.set_id)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
                filterSet === s.set_id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-1 text-text-muted border-border hover:border-accent/40'
              }`}
            >
              {s.emoji} {count > 0 ? count : '—'}
            </button>
          );
        })}
      </div>

      {/* Carousel */}
      <CollectionCarousel cards={sorted} onInspect={onInspect} />
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const cardStyles = `
  .card-container {
    width: 200px;
    height: 310px;
  }
  @media (min-width: 640px) {
    .card-container {
      width: 220px;
      height: 340px;
    }
  }

  .card-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }

  .card-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .card-back {
    transform: rotateY(0deg);
  }

  .card-front {
    transform: rotateY(180deg);
  }

  .card-back-pattern {
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(94, 164, 247, 0.06) 10px,
        rgba(94, 164, 247, 0.06) 11px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 10px,
        rgba(94, 164, 247, 0.06) 10px,
        rgba(94, 164, 247, 0.06) 11px
      );
  }

  .card-back-foil {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      transparent 20%,
      rgba(94, 164, 247, 0.08) 35%,
      rgba(168, 85, 247, 0.06) 50%,
      rgba(94, 164, 247, 0.08) 65%,
      transparent 80%
    );
    background-size: 200% 200%;
    animation: foil-shift 6s ease infinite;
  }

  /* ── Holographic effects per rarity ── */

  .card-holo {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 1;
  }

  .card-holo-uncommon {
    background: linear-gradient(
      125deg,
      transparent 0%,
      rgba(52, 211, 153, 0.08) 25%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(52, 211, 153, 0.08) 75%,
      transparent 100%
    );
    background-size: 300% 300%;
    animation: holo-shift 5s ease infinite;
  }

  .card-holo-rare {
    background: linear-gradient(
      125deg,
      transparent 0%,
      rgba(96, 165, 250, 0.12) 20%,
      rgba(168, 85, 247, 0.15) 35%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(96, 165, 250, 0.15) 65%,
      rgba(168, 85, 247, 0.12) 80%,
      transparent 100%
    );
    background-size: 300% 300%;
    animation: holo-shift 4s ease infinite;
  }

  .card-holo-legendary {
    background: linear-gradient(
      125deg,
      transparent 0%,
      rgba(251, 191, 36, 0.15) 15%,
      rgba(239, 68, 68, 0.12) 30%,
      rgba(255, 255, 255, 0.22) 45%,
      rgba(168, 85, 247, 0.15) 60%,
      rgba(251, 191, 36, 0.18) 75%,
      rgba(239, 68, 68, 0.12) 90%,
      transparent 100%
    );
    background-size: 400% 400%;
    animation: holo-shift-legendary 3s ease infinite;
  }

  @keyframes holo-shift {
    0% { background-position: 0% 0%; }
    50% { background-position: 100% 100%; }
    100% { background-position: 0% 0%; }
  }

  @keyframes holo-shift-legendary {
    0% { background-position: 0% 0%; }
    33% { background-position: 100% 50%; }
    66% { background-position: 50% 100%; }
    100% { background-position: 0% 0%; }
  }

  @keyframes foil-shift {
    0% { background-position: 0% 0%; }
    50% { background-position: 100% 100%; }
    100% { background-position: 0% 0%; }
  }

  /* ── Corner decorations for rare+ ── */

  .card-corner {
    position: absolute;
    width: 20px;
    height: 20px;
    z-index: 2;
    pointer-events: none;
  }
  .card-corner-tl { top: 5px; left: 5px; border-top: 2.5px solid; border-left: 2.5px solid; border-radius: 4px 0 0 0; }
  .card-corner-tr { top: 5px; right: 5px; border-top: 2.5px solid; border-right: 2.5px solid; border-radius: 0 4px 0 0; }
  .card-corner-bl { bottom: 5px; left: 5px; border-bottom: 2.5px solid; border-left: 2.5px solid; border-radius: 0 0 0 4px; }
  .card-corner-br { bottom: 5px; right: 5px; border-bottom: 2.5px solid; border-right: 2.5px solid; border-radius: 0 0 4px 0; }

  .card-corner-rare { border-color: rgba(96, 165, 250, 0.6); }
  .card-corner-legendary { border-color: rgba(251, 191, 36, 0.7); }

  /* ── Inner glow for legendary ── */

  .card-inner-glow {
    position: absolute;
    inset: 2px;
    border-radius: inherit;
    box-shadow: inset 0 0 40px rgba(251, 191, 36, 0.12), inset 0 0 80px rgba(251, 191, 36, 0.04);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Edge treatments ── */

  .card-edge-common {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .card-edge-uncommon {
    box-shadow: 0 0 25px rgba(52, 211, 153, 0.25), 0 0 50px rgba(52, 211, 153, 0.08), 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(52, 211, 153, 0.2);
  }
  .card-edge-rare {
    box-shadow: 0 0 30px rgba(96, 165, 250, 0.35), 0 0 60px rgba(96, 165, 250, 0.12), 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(96, 165, 250, 0.25);
  }
  .card-edge-legendary {
    box-shadow: 0 0 35px rgba(251, 191, 36, 0.4), 0 0 70px rgba(251, 191, 36, 0.15), 0 0 120px rgba(251, 191, 36, 0.06), 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(251, 191, 36, 0.3);
    animation: legendary-pulse 2s ease-in-out infinite;
  }

  @keyframes legendary-pulse {
    0%, 100% { box-shadow: 0 0 30px rgba(251, 191, 36, 0.35), 0 0 60px rgba(251, 191, 36, 0.12), 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(251, 191, 36, 0.25); }
    50% { box-shadow: 0 0 50px rgba(251, 191, 36, 0.5), 0 0 100px rgba(251, 191, 36, 0.2), 0 0 150px rgba(251, 191, 36, 0.06), 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(251, 191, 36, 0.4); }
  }

  .pack-glow {
    animation: pack-pulse 2s ease-in-out infinite;
  }
  @keyframes pack-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }

  /* ── Pre-flip aura pulses ── */

  @keyframes aura-pulse {
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.7; }
  }

  .aura-pulse-blue {
    animation: aura-pulse 0.6s ease-in-out infinite;
    background: radial-gradient(circle, rgba(96, 165, 250, 0.5), transparent 70%);
  }

  .aura-pulse-gold {
    animation: aura-pulse 0.5s ease-in-out infinite;
    background: radial-gradient(circle, rgba(251, 191, 36, 0.6), transparent 70%);
  }

  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

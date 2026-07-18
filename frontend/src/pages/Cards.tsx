import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ShoppingBag,
  BookOpen,
  Users,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react';
import PackOpening from '../components/cards/PackOpening';
import TradeInSheet from '../components/cards/TradeInSheet';
import ShowcasePicker from '../components/cards/ShowcasePicker';
import CardFrame from '../components/cards/CardFrame';
import { useUser } from '../components/UserPicker';
import { getUserCards, getCardCatalog, purchasePack, getCardsSocial, getAllCards } from '../lib/api';
import type { CardData, CardSet, UserCardCollection, CardSocialEntry, PackPurchaseResult } from '../lib/types';
import { getSetTheme } from '../components/cards/setThemes';

// Tailwind text-color per rarity for the binder mini-tile rarity letter.
const RARITY_TEXT_CLASS: Record<CardData['rarity'], string> = {
  common: 'text-gray-400',
  uncommon: 'text-emerald-400',
  rare: 'text-blue-400',
  legendary: 'text-amber-400',
  mythic: 'text-pink-400',
};

// Local alias so existing call-sites don't change
function getTheme(setId: string) {
  return getSetTheme(setId);
}


// ── Binder skeleton ────────────────────────────────────────────────

function BinderSkeleton() {
  // 2 set groups × 4 slots each = 8 skeleton slots
  return (
    <div className="space-y-10">
      {[0, 1].map((group) => (
        <div key={group}>
          {/* Section header skeleton */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-surface-2 animate-pulse" />
            <div className="h-4 w-36 rounded-full bg-surface-2 animate-pulse" />
            <div className="h-3 w-20 rounded-full bg-surface-2 animate-pulse ml-2" />
          </div>
          {/* Card grid skeleton */}
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                data-testid="skeleton-slot"
                className="rounded-xl bg-surface-2 animate-pulse"
                style={{ height: 88, animationDelay: `${(group * 4 + i) * 0.07}s` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Error retry ────────────────────────────────────────────────────

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
      <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
        <AlertCircle size={22} className="text-danger" />
      </div>
      <p className="text-text-muted text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium bg-surface border border-border hover:border-accent/50 text-text-primary cursor-pointer transition-colors"
        aria-label="Retry"
      >
        <RefreshCw size={13} />
        Retry
      </button>
    </motion.div>
  );
}

// ── Card image with emoji fallback ────────────────────────────────

const CardImage = memo(function CardImage({
  card,
  className,
  style,
  emojiClass,
}: {
  card: CardData;
  className?: string;
  style?: React.CSSProperties;
  emojiClass?: string;
}) {
  const [err, setErr] = useState(false);
  if (err) return <span className={emojiClass}>{card.emoji}</span>;
  return (
    <img
      src={`${import.meta.env.BASE_URL}cards/${card.set_id}/${card.id}.jpg`}
      alt={card.slovak}
      onError={() => setErr(true)}
      className={className}
      style={style}
      loading="lazy"
    />
  );
});

function CardInspectModal({ card, setTotal, onClose }: { card: CardData; setTotal: number; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.7, rotateY: -15 }}
        animate={{ scale: 1, rotateY: 0 }}
        exit={{ scale: 0.7, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{ perspective: 1200 }}
      >
        <CardFrame card={card} setTotal={setTotal} size={300} />
      </motion.div>
      <motion.button
        className="absolute right-6 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center cursor-pointer text-white/80 hover:text-white hover:bg-white/20 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
        onClick={onClose}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <X size={18} />
      </motion.button>
    </motion.div>
  );
}

// ── Shop tab ───────────────────────────────────────────────────────

function ShopTab({
  catalog,
  collection,
  xpAvailable,
  onBuy,
}: {
  catalog: CardSet[];
  collection: UserCardCollection | null;
  xpAvailable: number;
  onBuy: (set: CardSet) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {catalog.map((set) => {
        const ownedInSet = collection?.cards.filter((c) => c.set_id === set.set_id).length ?? 0;
        const canAfford = xpAvailable >= set.cost;
        const complete = ownedInSet >= set.total_cards;
        const theme = getTheme(set.set_id);

        return (
          <motion.button
            key={set.set_id}
            whileHover={canAfford && !complete ? { scale: 1.03, y: -2 } : {}}
            whileTap={canAfford && !complete ? { scale: 0.97 } : {}}
            onClick={() => canAfford && !complete && onBuy(set)}
            disabled={!canAfford || complete}
            className={`relative rounded-xl overflow-hidden text-left cursor-pointer transition-all border ${
              complete
                ? 'border-emerald-500/30'
                : canAfford
                  ? 'hover:border-accent/40'
                  : 'opacity-50 cursor-not-allowed border-border'
            }`}
            style={{
              padding: 0,
              background: complete ? 'rgba(16,55,25,0.5)' : theme.gradient,
              borderColor: complete ? 'rgba(34,197,94,0.3)' : `rgba(${hexToRgb(theme.accent)}, 0.35)`,
            }}
          >
            {/* Top accent bar */}
            <div className="h-1 w-full" style={{ background: complete ? '#22c55e' : theme.accent }} />

            <div className="p-3 sm:p-4">
              {/* Emoji / set name */}
              <div className="text-center mb-3">
                <div
                  className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center border"
                  style={{
                    background: `rgba(${hexToRgb(theme.accent)}, 0.15)`,
                    borderColor: `rgba(${hexToRgb(theme.accent)}, 0.35)`,
                  }}
                >
                  <span className="text-xl">{set.emoji}</span>
                </div>
                <h3 className="text-xs font-bold text-white leading-tight">{set.name}</h3>
              </div>

              {/* Composition line */}
              <p className="text-center text-[9px] font-mono text-white/40 mb-2">8C · 4U · 2R · 1L+</p>

              {/* Progress bar */}
              <div className="w-full h-1 rounded-full bg-black/30 overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(ownedInSet / set.total_cards) * 100}%`,
                    background: complete ? '#22c55e' : theme.accent,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-white/50 tabular-nums">
                  {ownedInSet}/{set.total_cards}
                </span>
                {complete && (
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Complete</span>
                )}
              </div>

              {/* Price */}
              {!complete && (
                <div
                  className="flex items-center justify-center gap-1 py-1.5 rounded-lg border"
                  style={{
                    background: `rgba(${hexToRgb(theme.accent)}, 0.12)`,
                    borderColor: `rgba(${hexToRgb(theme.accent)}, 0.30)`,
                  }}
                >
                  <Zap size={10} className="text-warning" />
                  <span className="text-[11px] font-bold text-warning">{set.cost} XP</span>
                </div>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Binder tab ─────────────────────────────────────────────────────

function BinderTab({
  catalog,
  collection,
  onInspect,
}: {
  catalog: CardSet[];
  collection: UserCardCollection | null;
  onInspect: (card: CardData) => void;
}) {
  const ownedCards = collection?.cards ?? [];
  const copies = collection?.copies ?? {};

  return (
    <div className="space-y-10">
      {catalog.map((set) => {
        const setCards = ownedCards.filter((c) => c.set_id === set.set_id);
        const ownedIds = new Set(setCards.map((c) => c.number));
        const isComplete = setCards.length >= set.total_cards;
        const theme = getTheme(set.set_id);

        // Build a lookup for owned cards by number
        const byNumber: Record<number, CardData> = {};
        for (const c of setCards) byNumber[c.number] = c;

        return (
          <div key={set.set_id}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
                style={{
                  background: `rgba(${hexToRgb(theme.accent)}, 0.15)`,
                  borderColor: `rgba(${hexToRgb(theme.accent)}, 0.35)`,
                }}
              >
                <span className="text-base">{set.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-text-primary">{set.name}</h3>
              </div>
              <div className="shrink-0">
                {isComplete ? (
                  <span className="text-[11px] font-bold text-emerald-400">Complete · {set.total_cards} of {set.total_cards}</span>
                ) : (
                  <span className="text-[11px] text-text-muted tabular-nums">{setCards.length} of {set.total_cards} collected</span>
                )}
              </div>
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
              {Array.from({ length: set.total_cards }, (_, i) => {
                const num = i + 1;
                const owned = ownedIds.has(num);
                const card = byNumber[num];

                if (owned && card) {
                  const copyCount = copies[String(card.id)] ?? 1;
                  return (
                    <motion.button
                      key={num}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onInspect(card)}
                      className="rounded-xl overflow-hidden cursor-pointer border-none p-0 relative"
                      style={{ height: 88, background: getRarityMiniGradient(card.rarity) }}
                      title={`${card.slovak} — ${card.english}`}
                    >
                      {/* Card art image (covers tile); emoji shown as fallback */}
                      <CardImage
                        card={card}
                        className="absolute inset-0 w-full h-full object-cover"
                        emojiClass="absolute inset-0 w-full h-full flex items-center justify-center text-2xl leading-none"
                      />
                      {/* Rarity + number overlays */}
                      <div className="absolute inset-0 flex flex-col items-center justify-end p-1 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 40%, transparent)' }}>
                        <span className={`text-[7px] font-bold uppercase ${RARITY_TEXT_CLASS[card.rarity]}`}>{card.rarity.charAt(0)}</span>
                        <span className="text-[7px] font-mono text-white/40">{String(num).padStart(3, '0')}</span>
                      </div>
                      {copyCount >= 2 && (
                        <span
                          data-testid={`copies-badge-${card.id}`}
                          className="absolute top-1 right-1 text-[8px] font-bold text-white bg-black/60 rounded-full px-1 leading-tight"
                        >
                          ×{copyCount}
                        </span>
                      )}
                    </motion.button>
                  );
                }

                return (
                  <div
                    key={num}
                    data-testid={`unowned-slot-${num}`}
                    className="rounded-xl flex items-center justify-center"
                    style={{
                      height: 88,
                      border: '1.5px dashed rgba(255,255,255,0.13)',
                    }}
                  >
                    <span className="text-[11px] font-mono text-white/20">{String(num).padStart(3, '0')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

// ── Friends tab ────────────────────────────────────────────────────

function FriendsTab({
  social,
  catalog,
  allCardsMap,
}: {
  social: CardSocialEntry[];
  catalog: CardSet[];
  allCardsMap: Record<number, CardData>;
}) {
  const totalPossible = catalog.reduce((sum, s) => sum + s.total_cards, 0) || 1;

  return (
    <div className="space-y-4">
      {social.length === 0 && (
        <div className="text-center py-16 text-text-muted text-sm">No friends data yet.</div>
      )}
      {social.map((entry) => {
        const showcaseCard = entry.showcase_card_id != null ? allCardsMap[entry.showcase_card_id] : null;
        return (
        <motion.div
          key={entry.user_id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-surface-1 border border-border p-4"
        >
          <div className="flex items-center gap-3 mb-3">
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${entry.color}, ${entry.color}88)` }}
            >
              {entry.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">{entry.name}</p>
              <p className="text-xs text-text-muted">{entry.total_cards} cards collected</p>
            </div>
            {showcaseCard && (
              <div
                data-testid={`showcase-thumb-${entry.user_id}`}
                className="w-10 h-14 rounded-lg overflow-hidden shrink-0 relative border border-white/10"
                style={{ background: getRarityMiniGradient(showcaseCard.rarity) }}
                title={`${showcaseCard.slovak} — ${showcaseCard.english}`}
              >
                <CardImage
                  card={showcaseCard}
                  className="absolute inset-0 w-full h-full object-cover"
                  emojiClass="absolute inset-0 flex items-center justify-center text-lg leading-none"
                />
              </div>
            )}
            <div className="text-right">
              <span className="text-sm font-bold text-accent tabular-nums">
                {Math.round((entry.total_cards / totalPossible) * 100)}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden mb-3">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-sky-400"
              initial={{ width: 0 }}
              animate={{ width: `${(entry.total_cards / totalPossible) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>

          {/* Per-set chips */}
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((s) => {
              const count = entry.sets_progress[s.set_id] ?? 0;
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
        );
      })}
    </div>
  );
}

// ── Hex → rgb helper (for rgba usage) ─────────────────────────────

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '94, 164, 247';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// ── Main Cards page ────────────────────────────────────────────────

type Tab = 'shop' | 'binder' | 'friends';

export default function Cards() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('shop');
  const [inspectCard, setInspectCard] = useState<CardData | null>(null);

  // Data
  const [collection, setCollection] = useState<UserCardCollection | null>(null);
  const [catalog, setCatalog] = useState<CardSet[]>([]);
  const [social, setSocial] = useState<CardSocialEntry[]>([]);
  const [allCardsMap, setAllCardsMap] = useState<Record<number, CardData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pack opening state
  const [openingSet, setOpeningSet] = useState<CardSet | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PackPurchaseResult | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [confirmSet, setConfirmSet] = useState<CardSet | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  // AbortController guard for purchase (prevents double-buy on unmount)
  const purchaseAbortRef = useRef<AbortController | null>(null);

  // Trade-in & showcase state
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [col, cat, soc, allCardsRes] = await Promise.all([
        getUserCards(user.id),
        getCardCatalog(),
        getCardsSocial(),
        getAllCards(),
      ]);
      setCollection(col);
      setCatalog(cat);
      setSocial(soc);
      const map: Record<number, CardData> = {};
      for (const card of allCardsRes.cards) {
        map[card.id] = card;
      }
      setAllCardsMap(map);
    } catch {
      setError('Failed to load card data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBuyPack = useCallback(async (set: CardSet) => {
    if (!user || isPurchasing) return;

    // Cancel any in-flight purchase
    purchaseAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    purchaseAbortRef.current = abortCtrl;

    setPurchaseError(null);
    setIsPurchasing(true);
    setOpeningSet(set);
    setPurchaseResult(null);

    try {
      const result = await purchasePack(user.id, set.set_id);
      if (abortCtrl.signal.aborted) return;

      // Refresh collection in background
      getUserCards(user.id).then((col) => {
        if (!abortCtrl.signal.aborted) setCollection(col);
      }).catch(() => {});

      setPurchaseResult(result);
    } catch {
      if (!abortCtrl.signal.aborted) {
        setPurchaseError('Not enough XP or purchase failed!');
        setOpeningSet(null);
        setPurchaseResult(null);
      }
    } finally {
      if (!abortCtrl.signal.aborted) {
        setIsPurchasing(false);
      }
    }
  }, [user, isPurchasing]);

  const handlePackDone = useCallback(async () => {
    setOpeningSet(null);
    setPurchaseResult(null);
    await fetchData();
  }, [fetchData]);

  // ── Render states ───────────────────────────────────────────────

  if (!user || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-32 pb-16">
        {/* Header skeleton */}
        <div className="text-center mb-8">
          <div className="h-8 w-32 rounded-full bg-surface-2 animate-pulse mx-auto mb-3" />
          <div className="h-4 w-48 rounded-full bg-surface-2 animate-pulse mx-auto mb-4" />
          <div className="h-7 w-24 rounded-full bg-surface-2 animate-pulse mx-auto" />
        </div>
        {/* Tab skeleton */}
        <div className="h-10 w-64 rounded-xl bg-surface-2 animate-pulse mx-auto mb-8" />
        {/* Content skeleton */}
        <BinderSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-32 pb-16">
        <ErrorRetry message={error} onRetry={fetchData} />
      </div>
    );
  }

  const xpAvailable = collection?.xp_available ?? 0;

  // Derived: any card with copies >= 2 (for trade-in button visibility)
  const copies = collection?.copies ?? {};
  const hasDuplicates =
    collection != null &&
    collection.cards.some((c) => (copies[String(c.id)] ?? 1) >= 2);

  // Current user's showcase card id (from social list)
  const currentUserSocial = social.find((s) => s.user_id === user?.id);
  const currentShowcaseCardId = currentUserSocial?.showcase_card_id ?? null;

  // ── Pack loading (purchase in-flight) ───────────────────────────
  if (isPurchasing && openingSet) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-16 flex flex-col items-center gap-6">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-5xl mb-4">{openingSet.emoji}</div>
          <h2 className="text-lg font-bold text-text-primary">{openingSet.name}</h2>
          <p className="text-sm text-text-muted mt-1">Opening pack…</p>
        </motion.div>
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
          style={{ animationDelay: '0s' }}
        />
        <style>{cardStyles}</style>
      </div>
    );
  }

  // ── Pack opening overlay ─────────────────────────────────────────
  if (openingSet && purchaseResult) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-28 pb-16">
        <PackOpening
          set={openingSet}
          result={purchaseResult}
          onDone={handlePackDone}
        />
        <style>{cardStyles}</style>
      </div>
    );
  }

  // ── Main page with tabs ──────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pt-32 pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Cards</h1>
            <p className="text-text-muted text-sm mt-0.5">
              {collection?.total_unique ?? 0} / {collection?.total_possible ?? 0} collected
            </p>
          </div>
          {/* XP chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-1 border border-border">
            <Zap size={13} className="text-warning" />
            <span className="text-sm font-bold text-warning tabular-nums">{xpAvailable} XP</span>
          </div>
        </div>
      </motion.div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 bg-surface-1 rounded-xl p-1 max-w-xs border border-border">
        {([
          { id: 'shop' as Tab, icon: ShoppingBag, label: 'Shop' },
          { id: 'binder' as Tab, icon: BookOpen, label: 'Binder' },
          { id: 'friends' as Tab, icon: Users, label: 'Friends' },
        ]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            role="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer border-none transition-all ${
              tab === id
                ? 'bg-accent text-white shadow-sm'
                : 'bg-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {purchaseError && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4 text-danger text-sm bg-danger-muted rounded-lg px-4 py-2">
          {purchaseError}
        </motion.div>
      )}

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'shop' && (
          <motion.div key="shop" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <ShopTab catalog={catalog} collection={collection} xpAvailable={xpAvailable} onBuy={(set) => setConfirmSet(set)} />
          </motion.div>
        )}
        {tab === 'binder' && (
          <motion.div key="binder" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            {hasDuplicates && (
              <div className="flex justify-end mb-4">
                <button
                  data-testid="trade-in-open-btn"
                  onClick={() => setTradeInOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold bg-surface-1 border border-border hover:border-accent/50 text-text-secondary cursor-pointer transition-colors"
                >
                  <Zap size={13} className="text-warning" />
                  Trade in duplicates
                </button>
              </div>
            )}
            <BinderTab catalog={catalog} collection={collection} onInspect={setInspectCard} />
          </motion.div>
        )}
        {tab === 'friends' && (
          <motion.div key="friends" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <div className="flex justify-end mb-4">
              <button
                data-testid="showcase-open-btn"
                onClick={() => setShowcaseOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold bg-surface-1 border border-border hover:border-accent/50 text-text-secondary cursor-pointer transition-colors"
              >
                Pin showcase card
              </button>
            </div>
            <FriendsTab social={social} catalog={catalog} allCardsMap={allCardsMap} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspect modal */}
      <AnimatePresence>
        {inspectCard && (
          <CardInspectModal
            card={inspectCard}
            setTotal={catalog.find((s) => s.set_id === inspectCard.set_id)?.total_cards ?? 16}
            onClose={() => setInspectCard(null)}
          />
        )}
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

      {/* Trade-in sheet */}
      {collection && (
        <TradeInSheet
          open={tradeInOpen}
          collection={collection}
          userId={user.id}
          onClose={() => setTradeInOpen(false)}
          onSuccess={fetchData}
        />
      )}

      {/* Showcase picker */}
      {collection && (
        <ShowcasePicker
          open={showcaseOpen}
          collection={collection}
          userId={user.id}
          currentShowcaseCardId={currentShowcaseCardId}
          onClose={() => setShowcaseOpen(false)}
          onSuccess={fetchData}
        />
      )}

      <style>{cardStyles}</style>
    </div>
  );
}

// ── Styles (card flip + holo effects) ─────────────────────────────

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
  .card-back { transform: rotateY(0deg); }
  .card-front { transform: rotateY(180deg); }
  .card-back-pattern {
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(94, 164, 247, 0.06) 10px, rgba(94, 164, 247, 0.06) 11px),
      repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(94, 164, 247, 0.06) 10px, rgba(94, 164, 247, 0.06) 11px);
  }
  .card-back-foil {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 20%, rgba(94, 164, 247, 0.08) 35%, rgba(168, 85, 247, 0.06) 50%, rgba(94, 164, 247, 0.08) 65%, transparent 80%);
    background-size: 200% 200%;
    animation: foil-shift 6s ease infinite;
  }
  .card-holo {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 1;
  }
  .card-holo-uncommon {
    background: linear-gradient(125deg, transparent 0%, rgba(52, 211, 153, 0.08) 25%, rgba(255, 255, 255, 0.15) 50%, rgba(52, 211, 153, 0.08) 75%, transparent 100%);
    background-size: 300% 300%;
    animation: holo-shift 5s ease infinite;
  }
  .card-holo-rare {
    background: linear-gradient(125deg, transparent 0%, rgba(96, 165, 250, 0.12) 20%, rgba(168, 85, 247, 0.15) 35%, rgba(255, 255, 255, 0.2) 50%, rgba(96, 165, 250, 0.15) 65%, rgba(168, 85, 247, 0.12) 80%, transparent 100%);
    background-size: 300% 300%;
    animation: holo-shift 4s ease infinite;
  }
  .card-holo-legendary {
    background: linear-gradient(125deg, transparent 0%, rgba(251, 191, 36, 0.15) 15%, rgba(239, 68, 68, 0.12) 30%, rgba(255, 255, 255, 0.22) 45%, rgba(168, 85, 247, 0.15) 60%, rgba(251, 191, 36, 0.18) 75%, rgba(239, 68, 68, 0.12) 90%, transparent 100%);
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
  .card-edge-common { box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06); }
  .card-edge-uncommon { box-shadow: 0 0 25px rgba(52,211,153,0.25), 0 0 50px rgba(52,211,153,0.08), 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(52,211,153,0.2); }
  .card-edge-rare { box-shadow: 0 0 30px rgba(96,165,250,0.35), 0 0 60px rgba(96,165,250,0.12), 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(96,165,250,0.25); }
  .card-edge-legendary { box-shadow: 0 0 35px rgba(251,191,36,0.4), 0 0 70px rgba(251,191,36,0.15), 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(251,191,36,0.3); animation: legendary-pulse 2s ease-in-out infinite; }
  @keyframes legendary-pulse {
    0%, 100% { box-shadow: 0 0 30px rgba(251,191,36,0.35), 0 0 60px rgba(251,191,36,0.12), 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(251,191,36,0.25); }
    50% { box-shadow: 0 0 50px rgba(251,191,36,0.5), 0 0 100px rgba(251,191,36,0.2), 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(251,191,36,0.4); }
  }
  @keyframes aura-pulse {
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.7; }
  }
  .aura-pulse-blue { animation: aura-pulse 0.6s ease-in-out infinite; background: radial-gradient(circle, rgba(96,165,250,0.5), transparent 70%); }
  .aura-pulse-gold { animation: aura-pulse 0.5s ease-in-out infinite; background: radial-gradient(circle, rgba(251,191,36,0.6), transparent 70%); }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
`;

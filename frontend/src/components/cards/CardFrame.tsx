import type { CardData } from '../../lib/types';
import { RARITY_THEMES } from './rarity';
import CardArt from './CardArt';

interface CardFrameProps {
  card: CardData;
  /** Total cards in this set — used for the footer denominator (never hardcoded) */
  setTotal: number;
  /** Optional fixed width override (default 210px) */
  size?: number;
}

/**
 * CardFrame — full trading-card render.
 *
 * Shape per rarity:
 *  - common / uncommon: 18px rounded rectangle
 *  - rare: chamfered octagon (clip-path)
 *  - legendary: cathedral arch (tall border-radius top)
 *  - mythic: gem cartouche (diamond clip-path)
 *
 * Animations (keyframes in index.css):
 *  - uncommon/rare/legendary: holo-shift overlay
 *  - legendary outer border: legendary-glow
 *  - mythic outer wrapper: mythic-glow
 *  - mythic gradient border: mythic-shift
 */
export default function CardFrame({ card, setTotal, size = 210 }: CardFrameProps) {
  const theme = RARITY_THEMES[card.rarity];
  const scale = size / 210;

  const numStr = `#${String(card.number).padStart(3, '0')}/${String(setTotal).padStart(3, '0')}`;

  const isMythic = card.rarity === 'mythic';
  const isLegendary = card.rarity === 'legendary';

  const outerStyle: React.CSSProperties = {
    width: size,
    height: theme.height * scale,
    borderRadius: theme.outerRadius,
    ...(theme.outerClip !== 'none' ? { clipPath: theme.outerClip } : {}),
    padding: 6 * scale,
    background: theme.frameGradient,
    ...(theme.frameShadow !== 'none' ? { boxShadow: theme.frameShadow } : {}),
    boxSizing: 'border-box',
    flexShrink: 0,
    // Mythic: background-size + animation override
    ...(isMythic
      ? {
          backgroundSize: '300% 300%',
          animation: 'mythic-shift 5s ease infinite',
          display: 'flex',
        }
      : {}),
    // Legendary outer glow animation
    ...(isLegendary ? { animation: 'legendary-glow 2.4s ease-in-out infinite' } : {}),
  };

  const innerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: theme.innerRadius,
    ...(theme.innerClip !== 'none' ? { clipPath: theme.innerClip } : {}),
    background: theme.innerBg,
    padding: theme.innerPadding,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    color: '#eef1f8',
    position: 'relative',
    overflow: 'hidden',
    // Mythic inner: flex: 1
    ...(isMythic ? { flex: 1 } : {}),
  };

  // Art slot dimensions
  const artHeight = isLegendary ? 132 * scale : isMythic ? 116 * scale : 118 * scale;
  const artRadius = theme.artSlotRadius;

  // Holo overlay (uncommon / rare / legendary / mythic)
  const hasHolo = theme.holoOverlay !== 'none';

  return (
    <div data-rarity={card.rarity} style={{ display: 'inline-block', flexShrink: 0 }}>
      {/* Mythic outer wrapper gets the mythic-glow filter animation */}
      <div
        style={
          theme.hasMythicGlow
            ? { animation: 'mythic-glow 3s ease-in-out infinite' }
            : {}
        }
      >
        <div style={outerStyle}>
          <div style={innerStyle}>
            {/* Holo shimmer overlay */}
            {hasHolo && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: theme.holoOverlay,
                  backgroundSize: isMythic ? '300% 300%' : '250% 250%',
                  animation: isMythic
                    ? `mythic-shift ${theme.holoDuration} ease infinite`
                    : `holo-shift ${theme.holoDuration} ease infinite`,
                }}
              />
            )}

            {/* Header: set name + set emoji */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 7,
                ...(card.rarity === 'rare' ? { margin: '4px 6px 7px 6px' } : {}),
                // Legendary puts set name below art — handled further down
              }}
            >
              {!isLegendary && (
                <>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                      color: theme.setNameColor,
                    }}
                  >
                    {card.set_name}
                  </span>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      transform: 'rotate(45deg)',
                      background: '#a855f7',
                      borderRadius: 1,
                      display: 'inline-block',
                    }}
                  />
                </>
              )}
            </div>

            {/* Art slot */}
            <CardArt card={card} height={artHeight} borderRadius={artRadius} />

            {/* Word block */}
            <div
              style={{
                textAlign: 'center',
                marginBottom: 3,
                position: 'relative',
              }}
            >
              {/* Legendary / Mythic: set name appears above slovak word */}
              {(isLegendary || isMythic) && (
                <p
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    color: theme.setNameColor,
                    margin: '0 0 3px 0',
                  }}
                >
                  {card.set_name}
                </p>
              )}
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  margin: 0,
                  letterSpacing: '-0.02em',
                  ...(isLegendary
                    ? {
                        background: 'linear-gradient(90deg, #f7d977, #ffffff, #f7d977)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }
                    : isMythic
                    ? {
                        background: 'linear-gradient(90deg, #f472b6, #fbbf24, #22d3ee)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }
                    : { fontSize: 19 }),
                }}
              >
                {card.slovak}
              </h3>
              <p
                style={{
                  fontSize: 9,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#6b7289',
                  margin: '2px 0 0 0',
                }}
              >
                {card.pronunciation} · {card.english}
              </p>
            </div>

            {/* Example quote */}
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}
            >
              <p
                style={{
                  fontSize: 9.5,
                  color: '#8b92a8',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  margin: '0',
                  textAlign: 'center',
                }}
              >
                "{card.example_sk}"
              </p>
            </div>

            {/* Footer: card number + rarity */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${theme.borderColor}`,
                paddingTop: 7,
                position: 'relative',
                ...(card.rarity === 'rare' ? { padding: '7px 6px 4px 6px' } : {}),
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 8,
                  color: '#6b7289',
                }}
              >
                {numStr}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    transform: 'rotate(45deg)',
                    background: theme.pipGradient,
                    borderRadius: 1.5,
                    display: 'inline-block',
                    ...(theme.pipGlow !== 'none' ? { boxShadow: theme.pipGlow } : {}),
                  }}
                />
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    ...(isMythic
                      ? {
                          background: 'linear-gradient(90deg, #f472b6, #22d3ee)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          color: 'transparent',
                        }
                      : { color: theme.labelColor }),
                  }}
                >
                  {theme.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

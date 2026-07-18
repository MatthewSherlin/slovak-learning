import { useState } from 'react';
import type { CardData } from '../../lib/types';
import { RARITY_THEMES } from './rarity';

interface CardArtProps {
  card: CardData;
  /** Art slot height in px (varies by rarity) */
  height?: number;
  /** Border radius for the art slot */
  borderRadius?: string;
}

/**
 * CardArt — renders the card's art image.
 * On load error, falls back to an engraved Cinzel monogram (first letter of `slovak`).
 */
export default function CardArt({ card, height = 118, borderRadius = '10px' }: CardArtProps) {
  const [errored, setErrored] = useState(false);

  const theme = RARITY_THEMES[card.rarity];
  const monogram = card.slovak.charAt(0);

  return (
    <div
      style={{
        height,
        borderRadius,
        background: theme.artSlotBg,
        border: `1px solid ${theme.borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 9,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {!errored ? (
        <img
          src={`${import.meta.env.BASE_URL}cards/${card.set_id}/${card.id}.jpg`}
          alt={card.slovak}
          onError={() => setErrored(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius,
          }}
        />
      ) : (
        /* Engraved Cinzel monogram fallback */
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Ornament diamond */}
          <div
            style={{
              position: 'absolute',
              width: 74,
              height: 74,
              transform: 'rotate(45deg)',
              border: `1px solid ${theme.ornamentBorder}`,
              borderRadius: 6,
            }}
          />
          {/* Ornament circle */}
          <div
            style={{
              position: 'absolute',
              width: 92,
              height: 92,
              borderRadius: '999px',
              border: `1px solid ${theme.borderColor}`,
            }}
          />
          {/* Monogram letter */}
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: 54,
              fontWeight: 700,
              lineHeight: 1,
              background: theme.monogramGradient,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              position: 'relative',
              ...(card.rarity === 'legendary' || card.rarity === 'mythic'
                ? { filter: 'drop-shadow(0 4px 10px rgba(251,191,36,0.35))' }
                : {}),
            }}
          >
            {monogram}
          </span>
        </div>
      )}
    </div>
  );
}

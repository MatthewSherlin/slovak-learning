import type { CardData } from '../../lib/types';

export type Rarity = CardData['rarity'];

/** Ordered from lowest to highest pull weight */
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];

export interface RarityTheme {
  label: string;
  /** Outer frame gradient (background shorthand) */
  frameGradient: string;
  /** Box shadow on the outer wrapper */
  frameShadow: string;
  /** Inner panel background */
  innerBg: string;
  /** Border color for art slot and footer divider */
  borderColor: string;
  /** Art slot radial bg */
  artSlotBg: string;
  /** Monogram gradient (for Cinzel letter) */
  monogramGradient: string;
  /** Ornament border color (diamond + circle) */
  ornamentBorder: string;
  /** Footer pip gradient */
  pipGradient: string;
  /** Footer pip glow */
  pipGlow: string;
  /** Rarity label color */
  labelColor: string;
  /** Set name color (top-left) */
  setNameColor: string;
  /** Holo overlay gradient */
  holoOverlay: string;
  /** Holo animation duration */
  holoDuration: string;
  /** Whether outer border animates with legendary-glow */
  hasLegendaryGlow: boolean;
  /** Whether outer wrapper uses mythic-glow filter */
  hasMythicGlow: boolean;
  /** Whether mythic inner holo uses mythic-shift */
  hasMythicShift: boolean;
  // Shape overrides
  outerRadius: string;
  outerClip: string;
  innerRadius: string;
  innerClip: string;
  artSlotRadius: string;
  innerPadding: string;
  /** Height in px */
  height: number;
}

/** oct(n) → chamfered octagon clip-path */
function oct(n: number): string {
  return `polygon(${n}px 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0 calc(100% - ${n}px), 0 ${n}px)`;
}

export const RARITY_THEMES: Record<Rarity, RarityTheme> = {
  common: {
    label: 'Common',
    frameGradient: 'linear-gradient(160deg, #3a4152, #5b6478 28%, #2c3242 58%, #4a5265 85%)',
    frameShadow: '0 8px 24px rgba(0,0,0,0.5)',
    innerBg: '#0d1019',
    borderColor: 'rgba(255,255,255,0.06)',
    artSlotBg: 'radial-gradient(circle at 50% 40%, rgba(148,163,184,0.16), transparent 72%), #12151f',
    monogramGradient: 'linear-gradient(180deg, #d7dce8, #8b93a8)',
    ornamentBorder: 'rgba(148,163,184,0.25)',
    pipGradient: 'linear-gradient(135deg, #8b93a8, #5b6478)',
    pipGlow: 'none',
    labelColor: '#9ca3af',
    setNameColor: '#6b7289',
    holoOverlay: 'none',
    holoDuration: '5s',
    hasLegendaryGlow: false,
    hasMythicGlow: false,
    hasMythicShift: false,
    outerRadius: '18px',
    outerClip: 'none',
    innerRadius: '13px',
    innerClip: 'none',
    artSlotRadius: '10px',
    innerPadding: '9px',
    height: 330,
  },
  uncommon: {
    label: 'Uncommon',
    frameGradient: 'linear-gradient(160deg, #0e5f46, #4fd6a4 28%, #0a3d2e 58%, #2fa87d 85%)',
    frameShadow: '0 0 18px rgba(52,211,153,0.18), 0 8px 24px rgba(0,0,0,0.5)',
    innerBg: '#0d1019',
    borderColor: 'rgba(52,211,153,0.14)',
    artSlotBg: 'radial-gradient(circle at 50% 40%, rgba(52,211,153,0.18), transparent 72%), #101823',
    monogramGradient: 'linear-gradient(180deg, #a7f3d0, #34d399 55%, #059669)',
    ornamentBorder: 'rgba(52,211,153,0.3)',
    pipGradient: 'linear-gradient(135deg, #6ee7b7, #059669)',
    pipGlow: '0 0 6px rgba(52,211,153,0.6)',
    labelColor: '#34d399',
    setNameColor: '#6b7289',
    holoOverlay:
      'linear-gradient(120deg, transparent 30%, rgba(52,211,153,0.07) 48%, rgba(255,255,255,0.06) 52%, transparent 70%)',
    holoDuration: '5s',
    hasLegendaryGlow: false,
    hasMythicGlow: false,
    hasMythicShift: false,
    outerRadius: '18px',
    outerClip: 'none',
    innerRadius: '13px',
    innerClip: 'none',
    artSlotRadius: '10px',
    innerPadding: '9px',
    height: 330,
  },
  rare: {
    label: 'Rare',
    frameGradient:
      'linear-gradient(160deg, #1e3f8f, #7db2ff 28%, #142450 58%, #4f7ee0 85%)',
    frameShadow: '0 0 22px rgba(96,165,250,0.25), 0 8px 24px rgba(0,0,0,0.5)',
    innerBg: '#0d1019',
    borderColor: 'rgba(96,165,250,0.18)',
    artSlotBg:
      'radial-gradient(circle at 50% 40%, rgba(96,165,250,0.2), transparent 72%), #0f1526',
    monogramGradient: 'linear-gradient(180deg, #bfdbfe, #60a5fa 55%, #2563eb)',
    ornamentBorder: 'rgba(96,165,250,0.35)',
    pipGradient: 'linear-gradient(135deg, #93c5fd, #2563eb)',
    pipGlow: '0 0 6px rgba(96,165,250,0.7)',
    labelColor: '#60a5fa',
    setNameColor: '#6b7289',
    holoOverlay:
      'linear-gradient(120deg, transparent 25%, rgba(96,165,250,0.1) 42%, rgba(168,85,247,0.1) 50%, rgba(255,255,255,0.1) 55%, transparent 75%)',
    holoDuration: '4s',
    hasLegendaryGlow: false,
    hasMythicGlow: false,
    hasMythicShift: false,
    outerRadius: '0px',
    outerClip: oct(18),
    innerRadius: '0px',
    innerClip: oct(14),
    artSlotRadius: '10px',
    innerPadding: '9px',
    height: 330,
  },
  legendary: {
    label: 'Legendary',
    frameGradient:
      'linear-gradient(160deg, #8a6118, #f7d977 26%, #6e4c12 55%, #e3b74a 82%, #8a6118)',
    frameShadow: 'none',
    innerBg: '#0d1019',
    borderColor: 'rgba(251,191,36,0.22)',
    artSlotBg:
      'radial-gradient(circle at 50% 45%, rgba(251,191,36,0.22), transparent 75%), #17130d',
    monogramGradient: 'linear-gradient(180deg, #fef3c7, #fbbf24 55%, #b45309)',
    ornamentBorder: 'rgba(251,191,36,0.4)',
    pipGradient: 'linear-gradient(135deg, #fde68a, #d97706)',
    pipGlow: '0 0 8px rgba(251,191,36,0.8)',
    labelColor: '#fbbf24',
    setNameColor: '#b8a05e',
    holoOverlay:
      'linear-gradient(120deg, transparent 20%, rgba(251,191,36,0.12) 38%, rgba(255,255,255,0.14) 50%, rgba(239,68,68,0.08) 62%, transparent 80%)',
    holoDuration: '3.2s',
    hasLegendaryGlow: true,
    hasMythicGlow: false,
    hasMythicShift: false,
    outerRadius: '104px 104px 18px 18px',
    outerClip: 'none',
    innerRadius: '99px 99px 13px 13px',
    innerClip: 'none',
    artSlotRadius: '92px 92px 10px 10px',
    innerPadding: '9px',
    height: 330,
  },
  mythic: {
    label: 'Mythic',
    frameGradient:
      'linear-gradient(160deg, #7c3aed, #f472b6 25%, #f59e0b 50%, #22d3ee 75%, #7c3aed)',
    frameShadow: 'none',
    innerBg: '#0d1019',
    borderColor: 'rgba(244,114,182,0.22)',
    artSlotBg:
      'radial-gradient(circle at 50% 40%, rgba(244,114,182,0.2), rgba(124,58,237,0.12) 55%, transparent 80%), #140f1e',
    monogramGradient: 'linear-gradient(120deg, #f9a8d4, #fbbf24 50%, #67e8f9)',
    ornamentBorder: 'rgba(244,114,182,0.4)',
    pipGradient: 'linear-gradient(135deg, #f472b6, #7c3aed)',
    pipGlow: '0 0 8px rgba(244,114,182,0.9)',
    labelColor: 'transparent', // gradient text handled in component
    setNameColor: '#c7a5f7',
    holoOverlay:
      'linear-gradient(120deg, rgba(124,58,237,0.1) 10%, rgba(244,114,182,0.12) 30%, rgba(255,255,255,0.14) 50%, rgba(34,211,238,0.12) 70%, rgba(124,58,237,0.1) 90%)',
    holoDuration: '4s',
    hasLegendaryGlow: false,
    hasMythicGlow: true,
    hasMythicShift: true,
    outerRadius: '8px',
    outerClip: 'polygon(0 3.5%, 50% 0, 100% 3.5%, 100% 96.5%, 50% 100%, 0 96.5%)',
    innerRadius: '6px',
    innerClip: 'polygon(0 3.8%, 50% 0, 100% 3.8%, 100% 96.2%, 50% 100%, 0 96.2%)',
    artSlotRadius: '10px',
    innerPadding: '16px 9px',
    height: 336,
  },
};

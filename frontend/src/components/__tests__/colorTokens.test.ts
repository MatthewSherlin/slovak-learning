import { describe, it, expect } from 'vitest';
import vocab from '../VocabMode.tsx?raw';
import feedback from '../FeedbackView.tsx?raw';
import configSheet from '../ConfigSheet.tsx?raw';
import brandedLoader from '../BrandedLoader.tsx?raw';
import tabBar from '../TabBar.tsx?raw';
import home from '../../pages/Home.tsx?raw';
import stats from '../../pages/Stats.tsx?raw';
import guides from '../../pages/Guides.tsx?raw';

// Colours in these eight files must come from the theme tokens in index.css
// so the light theme works, instead of hand-typed hex duplicates that stay
// dark no matter which theme is active. No file here has a deliberate,
// excepted palette (that lives only in components/cards/), so no hex
// literal is allowed anywhere in them, comments included.
const files: Record<string, string> = {
  'VocabMode.tsx': vocab,
  'FeedbackView.tsx': feedback,
  'ConfigSheet.tsx': configSheet,
  'BrandedLoader.tsx': brandedLoader,
  'TabBar.tsx': tabBar,
  'Home.tsx': home,
  'Stats.tsx': stats,
  'Guides.tsx': guides,
};

// Matches the four valid CSS hex-colour lengths (#rgb, #rgba, #rrggbb,
// #rrggbbaa) and no others. `(?<!&)` excludes decimal HTML entities like
// `&#8594;`, whose digits can otherwise look like a 4-digit hex colour;
// `(?![0-9a-fA-F])` stops a longer digit run from matching a short prefix
// of itself (so a 5- or 7-digit run, which is never a valid hex colour,
// matches nothing instead of matching part of it).
const HEX_COLOR = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

describe('colours come from theme tokens', () => {
  for (const [name, source] of Object.entries(files)) {
    it(`${name} has no hex colour literal`, () => {
      const found = [...source.matchAll(HEX_COLOR)].map((m) => m[0]);
      expect(found).toEqual([]);
    });
  }
});

// A colour value built by suffixing a two-digit alpha directly onto a
// template-interpolated field (`` `${x}26` ``) only produces valid CSS when
// `x` is a bare hex string. `accentColor` on a Guide is now a CSS token
// (`var(--color-...)`), so suffixing it produces an invalid value like
// `"var(--color-success)26"`, which the browser drops — see
// Guides.tsx's read-indicator badge (fixed with `color-mix`, covered by the
// render test in Guides.test.tsx). A fully general version of this scan
// (matching any `.color`/`.Color` field, not just the specific
// `accentColor` name) is not practical here: `User.color` and
// `LeaderboardEntry.color` are genuinely per-user hex strings from the
// backend, not tokens, and are suffixed the same way in Home.tsx and
// Stats.tsx on purpose — a name-agnostic scan would flag those as false
// positives. This narrower scan catches the one field name in these eight
// files that is actually a token, so it cannot regress silently again.
describe('no alpha suffixed onto a token-bearing field', () => {
  for (const [name, source] of Object.entries(files)) {
    it(`${name} does not suffix hex digits onto \`accentColor\``, () => {
      const found = [...source.matchAll(/\$\{[^}]*\.accentColor\}[0-9a-fA-F]/g)].map((m) => m[0]);
      expect(found).toEqual([]);
    });
  }
});

describe('HEX_COLOR regex self-check', () => {
  it.each([
    ['#fff', ['#fff']],
    ['#FFF', ['#FFF']],
    ['#5de4a5', ['#5de4a5']],
    ['#ffffff80', ['#ffffff80']],
    ['#abcd', ['#abcd']],
  ])('matches %s', (input, expected) => {
    expect([...input.matchAll(HEX_COLOR)].map((m) => m[0])).toEqual(expected);
  });

  it.each([
    ['a decimal HTML entity', '&#8594;'],
    ['a hash-router root fragment', 'href="#/"'],
    ['a plain word fragment', 'href="#top"'],
    ['a 5-digit run (not a valid hex length)', '#abcde'],
    ['a 7-digit run (not a valid hex length)', '#abcdef0'],
  ])('does not match %s', (_label, input) => {
    expect([...input.matchAll(HEX_COLOR)].map((m) => m[0])).toEqual([]);
  });
});

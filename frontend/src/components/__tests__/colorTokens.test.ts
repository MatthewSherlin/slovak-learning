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

const HEX_COLOR = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

describe('colours come from theme tokens', () => {
  for (const [name, source] of Object.entries(files)) {
    it(`${name} has no hex colour literal`, () => {
      const found = [...source.matchAll(HEX_COLOR)].map((m) => m[0]);
      expect(found).toEqual([]);
    });
  }
});

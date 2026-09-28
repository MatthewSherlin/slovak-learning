import { describe, it, expect } from 'vitest';
import vocab from '../VocabMode.tsx?raw';
import grammar from '../GrammarMode.tsx?raw';
import translation from '../TranslationMode.tsx?raw';
import conversation from '../ConversationMode.tsx?raw';
import feedback from '../FeedbackView.tsx?raw';
import header from '../SessionHeader.tsx?raw';

// Nothing on a lesson screen moves sideways. The one exception is the shake
// on a wrong answer, a keyframe array that returns to where it started.
const files: Record<string, string> = {
  'VocabMode.tsx': vocab,
  'GrammarMode.tsx': grammar,
  'TranslationMode.tsx': translation,
  'ConversationMode.tsx': conversation,
  'FeedbackView.tsx': feedback,
  'SessionHeader.tsx': header,
};

describe('lesson screens', () => {
  for (const [name, source] of Object.entries(files)) {
    it(`${name} has no sideways motion other than the wrong-answer shake`, () => {
      const sideways = [...source.matchAll(/\b(?:initial|animate|exit|whileTap)=\{[^}]*\bx:\s*(?!\s|\[0, -6, 6)[^,}]+/g)]
        .map((m) => m[0]);
      expect(sideways).toEqual([]);
    });
  }
});

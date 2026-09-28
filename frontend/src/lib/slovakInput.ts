/**
 * Attributes for boxes where the learner types Slovak. iOS autocorrect rewrites
 * Slovak words into English ones ("vodu" becomes "volunteer"), and
 * auto-capitalisation changes the first letter of every answer.
 */
export const SLOVAK_INPUT_PROPS = {
  autoCorrect: 'off',
  autoCapitalize: 'none',
  autoComplete: 'off',
  spellCheck: false,
} as const;

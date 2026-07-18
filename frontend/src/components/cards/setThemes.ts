/** Per-set accent colour and gradient — single source of truth for Cards and PackOpening. */
export interface SetTheme {
  accent: string;
  gradient: string;
}

export const SET_THEMES: Record<string, SetTheme> = {
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

export const DEFAULT_SET_THEME: SetTheme = {
  accent: '#5ea4f7',
  gradient: 'linear-gradient(165deg, #1a2c4a, #2563eb 45%, #12203a 90%)',
};

export function getSetTheme(setId: string): SetTheme {
  return SET_THEMES[setId] ?? DEFAULT_SET_THEME;
}

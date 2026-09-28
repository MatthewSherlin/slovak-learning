/**
 * Minimal markdown helpers for LLM-authored strings.
 *
 * LLM output leaks markdown syntax (**bold**, pipe tables) into UI slots that
 * render plain text, and react-markdown without remark-gfm renders pipe
 * tables as literal `|` characters. These helpers cover exactly the syntax
 * the tutor actually emits without pulling in another markdown pipeline.
 */

import type { ReactNode } from 'react';

/** Render `**bold**`, `*italic*` and `` `code` `` inline; everything else verbatim. */
export function renderInlineMd(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export interface ParsedTable {
  header: string[];
  rows: string[][];
}

/** Parse a GFM pipe table (`| a | b |` + separator row) or return null. */
export function parseMarkdownTable(md: string): ParsedTable | null {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 2) return null;

  const toCells = (line: string) =>
    line.slice(1, -1).split('|').map((c) => c.trim());

  const header = toCells(lines[0]);
  const isSeparator = (line: string) =>
    toCells(line).every((c) => /^:?-{2,}:?$/.test(c));
  if (!isSeparator(lines[1])) return null;

  const rows = lines
    .slice(2)
    .filter((l) => !isSeparator(l))
    .map(toCells);
  return { header, rows };
}

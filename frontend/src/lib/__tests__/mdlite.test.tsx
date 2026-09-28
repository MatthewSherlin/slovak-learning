import { describe, it, expect } from 'vitest';
import { renderInlineMd, parseMarkdownTable } from '../mdlite';

describe('renderInlineMd', () => {
  it('returns plain text unchanged', () => {
    expect(renderInlineMd('plain sentence')).toBe('plain sentence');
  });

  it('renders **bold** as strong', () => {
    const parts = renderInlineMd('**Kniha** is feminine') as React.ReactNode[];
    const strong = parts.find(
      (p) => typeof p === 'object' && p !== null && (p as React.ReactElement).type === 'strong',
    ) as React.ReactElement<{ children: string }>;
    expect(strong).toBeTruthy();
    expect(strong.props.children).toBe('Kniha');
  });

  it('renders `code` spans', () => {
    const parts = renderInlineMd('use `-a` endings') as React.ReactNode[];
    const code = parts.find(
      (p) => typeof p === 'object' && p !== null && (p as React.ReactElement).type === 'code',
    ) as React.ReactElement<{ children: string }>;
    expect(code.props.children).toBe('-a');
  });
});

describe('parseMarkdownTable', () => {
  const table = [
    '| Gender | Ending | Example |',
    '|:-------|:-------|:--------|',
    '| Masculine | consonant | stôl |',
    '| Feminine | -a | kniha |',
  ].join('\n');

  it('parses header and rows', () => {
    const parsed = parseMarkdownTable(table);
    expect(parsed).not.toBeNull();
    expect(parsed!.header).toEqual(['Gender', 'Ending', 'Example']);
    expect(parsed!.rows).toHaveLength(2);
    expect(parsed!.rows[1]).toEqual(['Feminine', '-a', 'kniha']);
  });

  it('returns null for non-table text', () => {
    expect(parseMarkdownTable('just a sentence')).toBeNull();
    expect(parseMarkdownTable('| single line |')).toBeNull();
  });

  it('handles single-line pipe text without separator as non-table', () => {
    expect(parseMarkdownTable('| a | b |\n| c | d |')).toBeNull();
  });
});

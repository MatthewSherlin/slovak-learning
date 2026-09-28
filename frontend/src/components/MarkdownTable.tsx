/**
 * MarkdownTable — renders an LLM-authored pipe table as a real table.
 * Falls back to plain text when the string isn't a parseable table.
 */

import { parseMarkdownTable, renderInlineMd } from '../lib/mdlite';

interface MarkdownTableProps {
  md: string;
}

export default function MarkdownTable({ md }: MarkdownTableProps) {
  const parsed = parseMarkdownTable(md);
  if (!parsed) {
    return <p className="text-[13px] text-text-secondary m-0">{renderInlineMd(md)}</p>;
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {parsed.header.map((cell, i) => (
            <th
              key={i}
              className="text-left font-semibold text-text-primary px-2.5 py-1.5 border-b border-border"
            >
              {renderInlineMd(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {parsed.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className="text-text-secondary px-2.5 py-1.5 border-b border-border-subtle"
              >
                {renderInlineMd(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

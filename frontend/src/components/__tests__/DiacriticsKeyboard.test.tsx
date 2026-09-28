import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import DiacriticsKeyboard from '../DiacriticsKeyboard';

describe('DiacriticsKeyboard', () => {
  it('lays the phone keys out as two even rows of eight, each 44px tall', () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<DiacriticsKeyboard inputRef={inputRef} value="" onChange={() => {}} />);
    // jsdom does not compute layout, so this checks the classes that set the grid and height.
    const grid = screen.getByTestId('accent-keys-phone');
    expect(grid.className).toMatch(/\bgrid-cols-8\b/);
    const keys = grid.querySelectorAll('button');
    expect(keys).toHaveLength(16);
    keys.forEach((key) => expect(key.className).toMatch(/\bh-11\b/));
  });
});

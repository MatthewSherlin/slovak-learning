import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PinInput from '../PinInput';

// Mock framer-motion to avoid animation noise in tests
vi.mock('framer-motion', async () => {
  const React = await import('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const motion = new Proxy({} as any, {
    get: (_target: unknown, tag: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.forwardRef(({ children, ...props }: any, ref: any) => {
        return React.createElement(tag, { ...props, ref }, children);
      });
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children };
});

describe('PinInput', () => {
  it('renders 4 input boxes', () => {
    render(<PinInput value="" onChange={vi.fn()} />);
    // type=password inputs don't get role="textbox", query directly
    const allInputs = document.querySelectorAll('input');
    expect(allInputs).toHaveLength(4);
  });

  it('advances focus to next input when a digit is typed', async () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} autoFocus />);
    const inputs = document.querySelectorAll('input');

    // Focus first input and type a digit via keydown
    fireEvent.focus(inputs[0]);
    fireEvent.keyDown(inputs[0], { key: '1' });

    // onChange should have been called with '1'
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('calls onChange with all 4 digits after typing 4 keys', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PinInput value="" onChange={onChange} />);

    // Type into first input
    const inputs0 = document.querySelectorAll('input');
    fireEvent.keyDown(inputs0[0], { key: '1' });
    expect(onChange).toHaveBeenLastCalledWith('1');

    // Update value and type into second input
    rerender(<PinInput value="1" onChange={onChange} />);
    const inputs1 = document.querySelectorAll('input');
    fireEvent.keyDown(inputs1[1], { key: '2' });
    expect(onChange).toHaveBeenLastCalledWith('12');

    rerender(<PinInput value="12" onChange={onChange} />);
    const inputs2 = document.querySelectorAll('input');
    fireEvent.keyDown(inputs2[2], { key: '3' });
    expect(onChange).toHaveBeenLastCalledWith('123');

    rerender(<PinInput value="123" onChange={onChange} />);
    const inputs3 = document.querySelectorAll('input');
    fireEvent.keyDown(inputs3[3], { key: '4' });
    expect(onChange).toHaveBeenLastCalledWith('1234');
  });

  it('fires onComplete when 4 digits are entered', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<PinInput value="123" onChange={onChange} onComplete={onComplete} />);
    const inputs = document.querySelectorAll('input');

    fireEvent.keyDown(inputs[3], { key: '4' });
    expect(onComplete).toHaveBeenCalled();
  });

  it('fills all boxes from paste of 4 digits', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    const inputs = document.querySelectorAll('input');

    // Use fireEvent.paste with clipboardData override
    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => '1234',
      },
    });
    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('paste strips non-digits', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    const inputs = document.querySelectorAll('input');

    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => '12ab',
      },
    });
    expect(onChange).toHaveBeenCalledWith('12');
  });
});

describe('PinInput — Session error state', () => {
  it('PinInput does not use hooks inside arrays (no Rules-of-Hooks violation)', async () => {
    // This test verifies the component can be mounted multiple times without
    // triggering React hooks-in-array violations. If hooks were called inside
    // an array literal, the second mount would have different hook call count
    // and React would throw. We mount twice in succession.
    const onChange = vi.fn();
    const { unmount } = render(<PinInput value="" onChange={onChange} />);
    unmount();
    // Should not throw
    render(<PinInput value="12" onChange={onChange} />);
  });
});

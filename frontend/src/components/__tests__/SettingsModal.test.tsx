import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsModal from '../SettingsModal';
import { installMemoryStorage } from '../../test/memoryStorage';

vi.mock('../UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Ana', has_pin: false },
    setUser: vi.fn(),
    refreshUsers: vi.fn(),
  }),
}));

vi.mock('../ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('../../lib/api', () => ({
  setPin: vi.fn(),
  verifyPin: vi.fn(),
  removePin: vi.fn(),
}));

// Render motion elements as plain elements so the modal appears at once.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const strip = new Set(['initial', 'animate', 'exit', 'transition', 'whileTap']);
  // One component per tag, so re-renders update elements instead of remounting them.
  const components = new Map<string, unknown>();
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, tag: string) => {
      if (!components.has(tag)) {
        components.set(tag, React.forwardRef<HTMLElement, Record<string, unknown>>(({ children, ...props }, ref) =>
          React.createElement(
            tag,
            { ...Object.fromEntries(Object.entries(props).filter(([key]) => !strip.has(key))), ref },
            children as React.ReactNode,
          ),
        ));
      }
      return components.get(tag);
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

describe('SettingsModal — Sound', () => {
  let uninstallStorage = () => {};

  beforeEach(() => {
    uninstallStorage = installMemoryStorage().uninstall;
  });

  afterEach(() => {
    uninstallStorage();
  });

  it('has an "Answer sounds" switch, on by default', () => {
    render(<SettingsModal open onClose={() => {}} />);
    expect(screen.getByText('Sound')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Answer sounds' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('flips the stored value each time it is tapped', () => {
    render(<SettingsModal open onClose={() => {}} />);
    const toggle = screen.getByRole('switch', { name: 'Answer sounds' });

    fireEvent.click(toggle);
    expect(localStorage.getItem('sound-enabled')).toBe('false');
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    expect(localStorage.getItem('sound-enabled')).toBe('true');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the stored choice when opened', () => {
    localStorage.setItem('sound-enabled', 'false');
    render(<SettingsModal open onClose={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Answer sounds' }).getAttribute('aria-checked')).toBe('false');
  });

  it('gives the switch a tap target at least 44px tall', () => {
    render(<SettingsModal open onClose={() => {}} />);
    // min-h-11 is 44px; w-12 on the visible track is 48px wide.
    expect(screen.getByRole('switch', { name: 'Answer sounds' }).className).toMatch(/\bmin-h-11\b/);
  });
});

describe('SettingsModal — tap targets', () => {
  let uninstallStorage = () => {};

  beforeEach(() => {
    uninstallStorage = installMemoryStorage().uninstall;
  });

  afterEach(() => {
    uninstallStorage();
  });

  it('gives the close button and theme toggle a 44px tap target', () => {
    render(<SettingsModal open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Switch to light mode' }).className).toMatch(/\bmin-h-11\b/);
    // The close button has no accessible name; find it by its icon's parent.
    const closeButton = document.querySelector('button.min-w-11.min-h-11');
    expect(closeButton).toBeTruthy();
  });

  it('gives the Switch and Set a PIN buttons the tap-target class', () => {
    render(<SettingsModal open onClose={() => {}} />);
    expect(screen.getByText('Switch').closest('button')!.className).toMatch(/\btap-target\b/);
    expect(screen.getByText('Set a PIN').closest('button')!.className).toMatch(/\btap-target\b/);
  });
});

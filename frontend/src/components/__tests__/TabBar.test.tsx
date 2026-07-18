import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TabBar from '../TabBar';

function renderTabBar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>
  );
}

describe('TabBar', () => {
  it('renders 4 tab links', () => {
    renderTabBar('/');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
  });

  it('renders Home link pointing to /', () => {
    renderTabBar('/');
    const home = screen.getByRole('link', { name: /home/i });
    expect(home.getAttribute('href')).toBe('/');
  });

  it('renders Cards link pointing to /cards', () => {
    renderTabBar('/');
    const cards = screen.getByRole('link', { name: /cards/i });
    expect(cards.getAttribute('href')).toBe('/cards');
  });

  it('renders Stats link pointing to /stats', () => {
    renderTabBar('/');
    const stats = screen.getByRole('link', { name: /stats/i });
    expect(stats.getAttribute('href')).toBe('/stats');
  });

  it('renders Guides link pointing to /guides', () => {
    renderTabBar('/');
    const guides = screen.getByRole('link', { name: /guides/i });
    expect(guides.getAttribute('href')).toBe('/guides');
  });

  it('sets aria-current="page" on the active Home tab when at /', () => {
    renderTabBar('/');
    const home = screen.getByRole('link', { name: /home/i });
    expect(home.getAttribute('aria-current')).toBe('page');
  });

  it('does not set aria-current on inactive tabs when at /', () => {
    renderTabBar('/');
    const cards = screen.getByRole('link', { name: /cards/i });
    const stats = screen.getByRole('link', { name: /stats/i });
    const guides = screen.getByRole('link', { name: /guides/i });
    expect(cards.getAttribute('aria-current')).toBeNull();
    expect(stats.getAttribute('aria-current')).toBeNull();
    expect(guides.getAttribute('aria-current')).toBeNull();
  });

  it('sets aria-current="page" on Cards tab when at /cards', () => {
    renderTabBar('/cards');
    const cards = screen.getByRole('link', { name: /cards/i });
    expect(cards.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current="page" on Stats tab when at /stats', () => {
    renderTabBar('/stats');
    const stats = screen.getByRole('link', { name: /stats/i });
    expect(stats.getAttribute('aria-current')).toBe('page');
  });

  it('sets aria-current="page" on Guides tab when at /guides', () => {
    renderTabBar('/guides');
    const guides = screen.getByRole('link', { name: /guides/i });
    expect(guides.getAttribute('aria-current')).toBe('page');
  });
});

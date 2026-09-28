// Node's own experimental localStorage shadows jsdom's and is undefined unless
// Node is given a storage file, so tests that need one install this in-memory
// stand-in and remove it afterwards.

export class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

export function installMemoryStorage(): { storage: MemoryStorage; uninstall: () => void } {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return {
    storage,
    uninstall() {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    },
  };
}

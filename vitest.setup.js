// Vitest setup file
import { vi } from 'vitest';

// Mock PointerEvent for jsdom
global.PointerEvent = class PointerEvent extends Event {
  constructor(type, options = {}) {
    super(type, { bubbles: options.bubbles !== false, cancelable: options.cancelable !== false });
    this.pointerId = options.pointerId || 0;
    this.clientX = options.clientX || 0;
    this.clientY = options.clientY || 0;
    this.pointerType = options.pointerType || 'mouse';
    this.button = options.button || 0;
    this.ctrlKey = options.ctrlKey || false;
    this.metaKey = options.metaKey || false;
  }
};

global.WheelEvent = class WheelEvent extends Event {
  constructor(type, options = {}) {
    super(type, { bubbles: options.bubbles !== false, cancelable: options.cancelable !== false });
    this.deltaY = options.deltaY || 0;
    this.clientX = options.clientX || 0;
    this.clientY = options.clientY || 0;
    this.ctrlKey = options.ctrlKey || false;
    this.metaKey = options.metaKey || false;
  }
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn(id => clearTimeout(id));

// Mock getComputedStyle
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = vi.fn((element) => {
  const style = originalGetComputedStyle(element);
  return {
    ...style,
    getPropertyValue: vi.fn((prop) => {
      const cssVars = {
        '--ink': '#15201e',
        '--ink-2': '#34423f',
        '--mute': '#6b7773',
        '--mute-2': '#98a29e',
        '--line': '#dedacf',
        '--line-2': '#cdc8ba',
        '--teal': '#0d5f5a',
        '--red': '#b03a2e',
        '--card': '#fbfaf6',
        '--paper-2': '#e9e6dd',
        '--font': 'system-ui, sans-serif',
        '--mono': 'ui-monospace, monospace',
      };
      return cssVars[prop] || style.getPropertyValue(prop);
    }),
  };
});

// Suppress console.error for known issues in tests
const originalError = console.error;
console.error = (...args) => {
  if (args[0]?.includes?.('act(...)')) return;
  originalError.apply(console, args);
};
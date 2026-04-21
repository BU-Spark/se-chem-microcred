import '@testing-library/jest-dom';

// Mock window.matchMedia for all tests (supports jsdom and node environments)
const safeGlobal: typeof globalThis = typeof window !== 'undefined' ? window : (globalThis as typeof globalThis);
Object.defineProperty(safeGlobal, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

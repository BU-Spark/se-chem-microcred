'use client'; // This hook interacts with localStorage, a browser API

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * useLocalStorage.ts
 *
 * This directory (app/hooks/) is intended for custom React hooks.
 * Custom hooks are a mechanism to reuse stateful logic between components.
 * They should typically start with the word "use".
 *
 * This example hook, useLocalStorage, provides a simple way to synchronize
 * component state with the browser's localStorage.
 */

// <T> is a generic type parameter. It allows this hook to work with different data types (string, number, object, etc.) while maintaining type safety. T is inferred from the initialValue you pass in.
function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  // Dispatch<SetStateAction<T>> is the standard React type for a state setter function
  const [storedValue, setStoredValue] = useState<T>(() => {
    // SSR Safety: Ensure window is defined before accessing localStorage
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      // Parse stored JSON or return initialValue if no item exists
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // useEffect to update local storage when storedValue changes
  useEffect(() => {
    // SSR Safety again: Ensure window is defined
    if (typeof window !== 'undefined') {
      try {
        // Save state to local storage
        window.localStorage.setItem(key, JSON.stringify(storedValue));
      } catch (error) {
        // More advanced implementations might allow passing an error handler
        console.error(`Error writing to localStorage key "${key}":`, error);
      }
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}

export default useLocalStorage;

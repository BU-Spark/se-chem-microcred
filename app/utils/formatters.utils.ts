/**
 * formatters.utils.ts
 *
 * This directory (app/utils/) is intended for general utility functions that can be reused
 * throughout the application. These functions should ideally be pure and not rely on React state or hooks.
 * Examples include data transformation, formatting, validation, or calculations.
 *
 * This file provides examples of simple string and date formatting utility functions.
 */

/**
 * Capitalizes the first letter of a string.
 * @param str The string to capitalize.
 * @returns The string with its first letter capitalized, or an empty string if input is null/undefined.
 */
export function capitalizeFirstLetter(str?: string | null): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Formats a Date object into a simple YYYY-MM-DD string.
 * @param date The Date object to format.
 * @returns A string representation of the date in YYYY-MM-DD format, or an empty string if input is invalid.
 */
export function formatDateYYYYMMDD(date?: Date | null): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Truncates a string to a maximum length and appends an ellipsis if truncated.
 * @param str The string to truncate.
 * @param maxLength The maximum length of the string (excluding ellipsis).
 * @returns The truncated string with ellipsis, or the original string if shorter than maxLength.
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '...';
}

// Add more utility functions as needed, e.g., for currency formatting, number calculations, etc.

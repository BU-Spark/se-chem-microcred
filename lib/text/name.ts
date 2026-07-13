// Functions for manipulating names, such as converting to title case or generating initials.

export function splitName(fullName?: string | null): {
  first: string;
  last: string;
  isFallback?: boolean;
} {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return { first: '', last: '', isFallback: true };
  }

  if (trimmed.includes(',')) {
    const [last, ...firstParts] = trimmed.split(',');
    return {
      first: firstParts.join(',').trim(),
      last: last.trim(),
      isFallback: false,
    };
  }

  const tokens = trimmed.split(/\s+/);

  return {
    first: tokens.length > 1 ? tokens.slice(0, -1).join(' ') : tokens[0],
    last: tokens.length > 1 ? tokens[tokens.length - 1] : '',
    isFallback: false,
  };
}

export function getNameForProfile(fullname?: string | null): {
  headlineTop: string;
  headlineBottom: string;
  initials: string;
} {
  const { first, last, isFallback } = splitName(fullname);

  if (isFallback) {
    return { headlineTop: 'Student,', headlineBottom: 'Profile', initials: 'ST' };
  }

  return {
    headlineTop: last ? `${last},` : `${first},`,
    headlineBottom: first,
    initials: last ? `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() : first.slice(0, 2).toUpperCase(),
  };
}

export function generateInitials(fullName: string | null): string {
  const { first, last, isFallback } = splitName(fullName);
  if (isFallback) return 'ST';

  const firstInitial = first.charAt(0).toUpperCase();
  const lastInitial = last.charAt(0).toUpperCase();

  return lastInitial ? `${firstInitial}${lastInitial}` : first.slice(0, 2).toUpperCase();
}

// May move this to a straight utils
export function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

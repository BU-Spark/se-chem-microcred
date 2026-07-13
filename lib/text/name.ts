// Functions for manipulating names, such as converting to title case or generating initials.

export function splitName(fullName?: string | null): {
  first: string;
  last: string;
  isFallback?: boolean;
} {
  if (!fullName) {
    return { first: 'Student', last: '', isFallback: true };
  }

  const tokens = fullName.trim().split(/\s+/);

  return {
    first: tokens[0],
    last: tokens.length > 1 ? tokens[tokens.length - 1] : '',
    isFallback: false,
  };
}

export function getNameForProfile(fullname?: string | null): {
  headlineTop: string;
  headlineBottom: string;
  initials: string;
} {
  const { first, last } = splitName(fullname);

  return {
    headlineTop: `${last}`,
    headlineBottom: first,
    initials: `${first.charAt(0)}${last.charAt(0)}`.toUpperCase(),
  };
}

export function generateInitials(fullName: string | null): string {
  const { first, last } = splitName(fullName);

  const firstInitial = first.charAt(0).toUpperCase();
  const lastInitial = last.charAt(0).toUpperCase();

  return `${firstInitial}${lastInitial}`;
}

// May move this to a straight utils
export function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

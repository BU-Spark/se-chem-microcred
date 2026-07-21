// Functions to help modify and format emails

export function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

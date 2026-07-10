/**
 * Alpha-test allowlist for content creation (courses & badges).
 *
 * During the alpha we temporarily restrict who may create courses and badges to a
 * short list of known accounts. This is controlled by two server-only env vars:
 *
 *   - `ALPHA_MODE`          — master on/off switch for the lock. When off (the
 *                             default), creation is unrestricted for everyone.
 *   - `ALPHA_ADMIN_EMAILS`  — comma-separated allowlist of accounts permitted to
 *                             create while the lock is on.
 *
 * Keeping them separate means the email list can stay populated while the lock is
 * flipped on or off with a single boolean. To unlock: set `ALPHA_MODE=false` (or
 * remove it). To re-lock later: set it back to `true` — no need to touch the list.
 *
 * Emails are normalized the same way the rest of the app keys off Clerk identities
 * (`.trim().toLowerCase()`).
 */

function parseBoolean(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

/** Whether the alpha lock is currently engaged. */
export function isAlphaMode(): boolean {
  return parseBoolean(process.env.ALPHA_MODE);
}

export function getAdminEmails(): string[] {
  return (process.env.ALPHA_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the alpha lock is engaged (i.e. creation is restricted to the allowlist). */
export function isContentCreationRestricted(): boolean {
  return isAlphaMode();
}

/**
 * Whether the given email is an admin account (a member of ALPHA_ADMIN_EMAILS).
 * This is independent of ALPHA_MODE — use it for admin-only surfaces that should be
 * hidden from non-admins whether or not the alpha lock is engaged.
 */
export function isAdminEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  return !!normalized && getAdminEmails().includes(normalized);
}

/**
 * Whether the given email may create courses/badges. When alpha mode is off, returns
 * true for everyone (unlocked). When on, returns true only for allowlisted emails.
 */
export function canCreateContent(email?: string | null): boolean {
  // Unlocked when alpha mode is off; otherwise restricted to admin accounts.
  return !isAlphaMode() || isAdminEmail(email);
}

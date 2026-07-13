import type { Appearance } from '@clerk/types';

/**
 * Brand theme for the Clerk sign-in / sign-up cards, matching the splash page
 * (blue #2f5596, Plus Jakarta Sans, rounded card). Applied per-component via the
 * `appearance` prop — NOT on ClerkProvider — so it only affects these two pages
 * and leaves every other Clerk widget (e.g. UserButton) untouched.
 */
export const authAppearance: Appearance = {
  variables: {
    colorPrimary: '#2f5596',
    colorText: '#1f2a3a',
    colorTextSecondary: '#52617a',
    borderRadius: '10px',
    fontFamily: '"Plus Jakarta Sans", "Open Sans", system-ui, sans-serif',
  },
  elements: {
    card: { boxShadow: '0 12px 40px rgba(31, 42, 58, 0.10)', borderRadius: '20px' },
    formButtonPrimary: { textTransform: 'none', fontSize: '15px', fontWeight: 600 },
    footerActionLink: { color: '#2f5596' },
    // Name is collected as required on our onboarding step regardless of Clerk's own
    // (optional) instance setting, so hide the "Optional" hint to avoid contradicting that.
    formFieldHintText__firstName: { display: 'none' },
    formFieldHintText__lastName: { display: 'none' },
  },
};

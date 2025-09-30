
This repository started from the Spark! DS 519 Next.js template (ESLint + Prettier preconfigured). The current state is a **student-facing micro-credential demo** that shows the overall flow (sign-up/sign-in and student dashboard). Below is a detailed breakdown of how the demo is constructed so future contributors can pick up quickly.

## Demo Overview

- **Framework:** Next.js 15 (App Router) with TypeScript.
- **Styling:** CSS Modules per page/component; global theme variables in `app/globals.css`.
- **Auth Simulation:** Lightweight localStorage-based hook (`app/hooks/useAuth.ts`) that ships with a default test account (`student@example.edu` / `demo123`).
- **Routing:** App Router pages under `app/` directory. Sidebar navigation uses `next/link` + `usePathname` for active-state highlighting.
- **Middleware:** `middleware.ts` returns `NextResponse.next()` to keep routing open (placeholder for future auth enforcement).

All changes have been validated with `npm run lint`.

## Directory Structure (Key Files)

```
app/
├─ layout.tsx                 # Root layout imports global styles + ErrorBoundary
├─ globals.css                # CSS variables and base styles (defines --font-outfit fallback)
├─ page.tsx                   # Dashboard UI that mimics the provided design
├─ page.module.css            # Styles for the home/dashboard page
├─ (auth)/auth.module.css     # Shared styles for auth pages
├─ (auth)/sign-in/.../page.tsx # Sign-in form (localStorage auth)
├─ (auth)/sign-up/.../page.tsx # Sign-up form (localStorage auth)
├─ profile/page.tsx           # Placeholder "This is the Profile page"
├─ analytics/page.tsx         # Placeholder "This is the Analytics page"
├─ badges/page.tsx            # Placeholder "This is the Badge Wallet page"
├─ grades/page.tsx            # Placeholder "This is the Grades page"
├─ settings/page.tsx          # Placeholder "This is the Settings page"
├─ components/
│  ├─ AppHeader/              # Header component (hidden on dashboard/auth pages)
│  └─ ... other UI stubs      # (Video player, Rubric panel, etc. kept from template)
├─ hooks/
│  └─ useAuth.ts              # Local auth implementation & demo credentials
└─ api/                       # Placeholder API routes kept from scaffold (no logic yet)

middleware.ts                 # Pass-through middleware
public/badges/.gitkeep        # Static asset placeholder
```

## Student Dashboard (Home `/`)

- **Layout:** Created in `app/page.tsx` using a flex layout (sidebar + main content). Styles in `app/page.module.css` mimic the provided screenshot.
- **Sidebar:** Displays initials, student name, and nav links defined inline. Links route to `/`, `/profile`, `/analytics`, `/badges`, `/grades`, `/settings` and highlight active state via `usePathname`.
- **Content:** Two sections (“Up next” and “Pick up where you left off”) are hard-coded arrays rendered into cards. Buttons currently do not navigate—purely visual placeholders.

## Auth Flow

- **Pages:** `app/(auth)/sign-in/[[...sign-in]]/page.tsx` and `app/(auth)/sign-up/[[...sign-up]]/page.tsx` provide forms with basic validation and success messaging. Styling comes from `app/(auth)/auth.module.css`.
- **Hook:** `useAuth()` manages state using `window.localStorage`. It seeds a default account (`student@example.edu` / `demo123`) and handles `signIn`, `signUp`, `signOut`, `clearError`. The hook exposes `isLoaded`/`isSignedIn` for redirects.
- **Demo Account:** Sign-in page footer displays the credentials. Successful auth redirects to `/`.

## Other Routes (Placeholders)

- `app/profile/page.tsx` → renders “This is the Profile page”
- `app/analytics/page.tsx` → renders “This is the Analytics page”
- `app/badges/page.tsx` → renders “This is the Badge Wallet page”
- `app/grades/page.tsx` → renders “This is the Grades page”
- `app/settings/page.tsx` → renders “This is the Settings page”

These satisfy navigation requirements while backend APIs and detailed UIs are under development.

## Global Error Handling

The root layout wraps children with `app/components/ErrorBoundary`. This comes from the starter template and delivers user-friendly fallback UI on runtime errors.

## How to Run the Demo

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Visit `http://localhost:3000`
   - If not signed in, you’ll be redirected to `/sign-in`
   - Use demo account `student@example.edu` / `demo123`
   - Explore sidebar to visit placeholder sub-pages

## Linting & Testing

- `npm run lint` (make sure to run after changes; passes on current code)
- Jest/RTL config from template remains, though no new tests were added yet.

## Next Steps / TODOs

- Replace localStorage auth with Clerk (or real backend) + real middleware protection.
- Build out actual content for Profile, Analytics, Badge Wallet, Grades, Settings pages.
- Wire the dashboard cards & buttons to real lesson/attempt data once APIs are ready.
- Populate placeholder API routes in `app/api/*` with real logic.

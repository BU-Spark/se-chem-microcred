import { SignIn } from '@clerk/nextjs';
import AuthShell from '../../AuthShell';
import { authAppearance } from '../../authAppearance';

export default function SignInPage() {
  return (
    <AuthShell>
      {/* signUpUrl keeps the card's "Sign up" footer link inside our own flow, and
          signUpForceRedirectUrl covers the paths where a *sign-up* completes from
          within this component (Clerk's OAuth sign-in -> sign-up transfer). Without
          it those users fell through to the default "/" and skipped onboarding. */}
      <SignIn signUpUrl="/sign-up" signUpForceRedirectUrl="/onboarding" appearance={authAppearance} />
    </AuthShell>
  );
}

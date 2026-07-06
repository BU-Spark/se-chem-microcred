import { SignUp } from '@clerk/nextjs';
import AuthShell from '../../AuthShell';
import { authAppearance } from '../../authAppearance';

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp forceRedirectUrl="/onboarding" signInUrl="/sign-in" appearance={authAppearance} />
    </AuthShell>
  );
}

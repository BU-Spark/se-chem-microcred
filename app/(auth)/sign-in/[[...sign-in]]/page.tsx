import { SignIn } from '@clerk/nextjs';
import AuthShell from '../../AuthShell';
import { authAppearance } from '../../authAppearance';

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn appearance={authAppearance} />
    </AuthShell>
  );
}

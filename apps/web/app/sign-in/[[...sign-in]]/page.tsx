import { SignIn } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { getPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export default function SignInPage() {
  const enrollmentState = getPublicEnrollmentState();

  return (
    <ConsoleDoor>
      <SignIn
        appearance={consoleDoorAppearance}
        signUpUrl={enrollmentState.status === 'open' ? "/sign-up" : undefined}
        forceRedirectUrl="/app"
      />
    </ConsoleDoor>
  );
}

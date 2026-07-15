import { SignUp } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { EnrollmentPaused } from "@/components/enrollment/enrollment-paused";
import { getPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export default function SignUpPage() {
  if (getPublicEnrollmentState().status === 'paused') return <EnrollmentPaused />;

  return (
    <ConsoleDoor>
      <SignUp
        appearance={consoleDoorAppearance}
        signInUrl="/sign-in"
        forceRedirectUrl="/app"
      />
    </ConsoleDoor>
  );
}

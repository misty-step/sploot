import { SignIn } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });

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

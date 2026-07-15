import { SignUp } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { EnrollmentPaused, EnrollmentUnavailable } from "@/components/enrollment/enrollment-paused";
import { getAuth } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";
import { PublicPageHeader } from "@/components/public-page-header";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });

  // The database-unavailable read is its own honest surface, never conflated
  // with the deliberate policy pause; both remain fail-closed for sign-up.
  if (enrollmentState.status === 'unknown') {
    return (
      <>
        <PublicPageHeader />
        <EnrollmentUnavailable />
      </>
    );
  }

  if (enrollmentState.status === 'paused') {
    const { userId } = await getAuth();
    return (
      <>
        <PublicPageHeader />
        <EnrollmentPaused showSignOut={Boolean(userId)} />
      </>
    );
  }

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

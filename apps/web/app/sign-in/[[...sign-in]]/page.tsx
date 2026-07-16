import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { EnrollmentNotice } from "@/components/enrollment/enrollment-notice";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export const dynamic = "force-dynamic";

/** Clerk appearance for the paused/unknown door: the footer's sign-up
 *  affordance is removed via the supported appearance API, belt-and-braces
 *  on top of the explicit `withSignUp={false}` opt-out. */
const closedEnrollmentAppearance = {
  ...consoleDoorAppearance,
  elements: {
    ...consoleDoorAppearance.elements,
    footerAction: "hidden!",
  },
};

export default async function SignInPage() {
  const { isQaLocalAuthEnabled } = await import("@/lib/auth/qa-local-enabled");
  if (isQaLocalAuthEnabled()) {
    redirect('/api/qa-auth/login');
  }

  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });
  const enrollmentOpen = enrollmentState.status === 'open';

  return (
    <ConsoleDoor>
      <div className="flex flex-col gap-5">
        {enrollmentOpen ? null : <EnrollmentNotice state={enrollmentState} compact />}
        <SignIn
          appearance={enrollmentOpen ? consoleDoorAppearance : closedEnrollmentAppearance}
          // Clerk's supported opt-out: while enrollment is not provably open,
          // the SignIn component must not offer any sign-up path. When open,
          // the default footer link to /sign-up is restored unchanged.
          withSignUp={enrollmentOpen ? undefined : false}
          signUpUrl={enrollmentOpen ? "/sign-up" : undefined}
          forceRedirectUrl="/app"
        />
      </div>
    </ConsoleDoor>
  );
}

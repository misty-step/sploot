import Link from "next/link";
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
  const qaLocalCaptureBuild = process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true' &&
    process.env.NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE === 'enabled';

  if (qaLocalCaptureBuild) {
    return (
      <ConsoleDoor>
        <div data-testid="qa-local-signed-out-door" className="flex flex-col gap-5">
          <EnrollmentNotice state={enrollmentState} compact />
          <div className="rounded border-2 border-foreground p-5">
            <h1 className="font-display text-2xl">Sign in unavailable in local QA capture</h1>
            <p className="mt-2">This deterministic browser proof is signed out; no account session is created.</p>
            <Link className="mt-4 inline-flex min-h-11 items-center underline" href="/">return to landing</Link>
          </div>
        </div>
      </ConsoleDoor>
    );
  }

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

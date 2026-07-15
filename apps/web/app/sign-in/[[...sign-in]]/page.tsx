import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { safeInternalPath } from "@/lib/auth/redirects";

export const metadata: Metadata = {
  title: "sign in to your pile | sploot",
};

type AuthSearchParams = Promise<{ redirect_url?: string | string[] }> | {
  redirect_url?: string | string[];
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: AuthSearchParams;
} = {}) {
  const resolved = searchParams ? await searchParams : {};
  const requested = Array.isArray(resolved.redirect_url)
    ? resolved.redirect_url[0]
    : resolved.redirect_url;
  const destination = safeInternalPath(requested, "/app");

  return (
    <ConsoleDoor title="sign in to your pile">
      <SignIn
        appearance={consoleDoorAppearance}
        signUpUrl="/sign-up"
        forceRedirectUrl={destination}
      />
    </ConsoleDoor>
  );
}

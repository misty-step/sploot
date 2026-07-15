import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";
import { safeInternalPath } from "@/lib/auth/redirects";

export const metadata: Metadata = {
  title: "make your pile | sploot",
};

type AuthSearchParams = Promise<{ redirect_url?: string | string[] }> | {
  redirect_url?: string | string[];
};

export default async function SignUpPage({
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
    <ConsoleDoor title="make your pile">
      <SignUp
        appearance={consoleDoorAppearance}
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(destination)}`}
        forceRedirectUrl={destination}
      />
    </ConsoleDoor>
  );
}

import { SignIn } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";

export default function SignInPage() {
  return (
    <ConsoleDoor route="/sign-in">
      {/* THROWAWAY: deliberately reintroducing a banned pattern to prove the
          lint:design CI gate bites (sploot-ci-enforce-lint-design). Revert
          before merge. */}
      <div className="backdrop-blur-md violet">
        <SignIn
          appearance={consoleDoorAppearance}
          signUpUrl="/sign-up"
          forceRedirectUrl="/app"
        />
      </div>
    </ConsoleDoor>
  );
}

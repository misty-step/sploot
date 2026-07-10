import { SignIn } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";

export default function SignInPage() {
  return (
    <ConsoleDoor>
      <SignIn
        appearance={consoleDoorAppearance}
        signUpUrl="/sign-up"
        forceRedirectUrl="/app"
      />
    </ConsoleDoor>
  );
}

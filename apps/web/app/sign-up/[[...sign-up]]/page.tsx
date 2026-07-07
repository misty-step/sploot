import { SignUp } from "@clerk/nextjs";
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from "@/components/auth/console-door";

export default function SignUpPage() {
  return (
    <ConsoleDoor route="/sign-up">
      <SignUp
        appearance={consoleDoorAppearance}
        signInUrl="/sign-in"
        forceRedirectUrl="/app"
      />
    </ConsoleDoor>
  );
}

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black p-6 text-center">
        <p className="text-sm text-gray-300">
          Sign-up is unavailable in this preview deployment because Clerk is not configured.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <SignUp
        appearance={{
          elements: {
            formButtonPrimary:
              "bg-violet-600 hover:bg-violet-700 transition-colors",
            footerActionLink:
              "text-violet-500 hover:text-violet-400",
            identityPreviewEditButtonIcon:
              "text-violet-500",
            formFieldInput:
              "border-gray-700 bg-gray-900/50 focus:border-violet-500",
            card:
              "bg-gray-900/90 backdrop-blur-sm border border-gray-800",
            headerTitle:
              "text-white",
            headerSubtitle:
              "text-gray-400",
            socialButtonsBlockButton:
              "bg-gray-800 hover:bg-gray-700 border-gray-700 text-white",
            formFieldLabel:
              "text-gray-300",
            dividerLine:
              "bg-gray-700",
            dividerText:
              "text-gray-400",
            formFieldInputShowPasswordButton:
              "text-gray-400 hover:text-gray-300",
          },
          layout: {
            socialButtonsPlacement: "top",
            socialButtonsVariant: "blockButton",
          },
        }}
        signInUrl="/sign-in"
        forceRedirectUrl="/app"
      />
    </div>
  );
}

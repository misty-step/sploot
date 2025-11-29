import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <SignIn
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
        signUpUrl="/sign-up"
        forceRedirectUrl="/app"
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { EnrollmentNotice } from "@/components/enrollment/enrollment-notice";
import { PublicPageHeader } from "@/components/public-page-header";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export const metadata: Metadata = {
  title: "Support - Sploot",
  description: "Get help with Sploot meme library and Chrome extension",
};

export const dynamic = "force-dynamic";

export default async function Support() {
  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });

  return (
    <main className="min-h-screen bg-background">
      <PublicPageHeader current="/support" />
      <div className="mx-auto max-w-3xl px-6 py-12">

        <h1
          className="text-4xl md:text-5xl mb-8 tracking-wide"
          style={{ fontFamily: "var(--font-bebas-neue)" }}
        >
          SUPPORT
        </h1>

        <div className="space-y-8">
          <EnrollmentNotice state={enrollmentState} />

          <section>
            <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                Sploot is a personal meme library with AI-powered semantic search. Save images from anywhere on the web and find them instantly with natural language queries.
              </p>
              <p>
                New here? The{" "}
                <Link href="/help" className="sploot-public-link">
                  Getting Started guide
                </Link>{" "}
                walks through the available ways to save a meme
                (extension, iPhone shortcut, PWA share, paste/upload), and
                how your data works.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Chrome Extension</h2>
            <div className="space-y-4">
              <h3 className="font-medium">How to save images</h3>
              <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
                <li>Install the Sploot extension from the Chrome Web Store</li>
                <li>
                  {/* The enrollment notice above is the single paused/unknown
                      statement on this page; this step only routes sign-in. */}
                  {enrollmentState.status === 'open'
                    ? 'Enrollment is open; new users can sign up at sploot.app'
                    : 'Sign in at sploot.app with your existing account (see the enrollment status above)'}
                </li>
                <li>Right-click any image on any website</li>
                <li>Select &quot;Save to Sploot&quot; from the menu</li>
                <li>You&apos;ll see a notification confirming the save</li>
              </ol>

              <h3 className="font-medium mt-6">Troubleshooting</h3>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">&quot;Not authenticated&quot; error</p>
                  <p>Click the Sploot extension icon and sign in to your account.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Context menu not appearing</p>
                  <p>Make sure you&apos;re right-clicking directly on an image. Some websites use special image loading that may not be recognized.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Upload failed</p>
                  <p>Check your internet connection. If the problem persists, the image may be protected or too large (max 10MB).</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Web App</h2>
            <div className="space-y-4">
              <h3 className="font-medium">Searching your library</h3>
              <p className="text-muted-foreground">
                Use natural language to search. Instead of keywords, describe what you&apos;re looking for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>&quot;disappointed drake&quot; - finds Drake meme variations</li>
                <li>&quot;surprised face&quot; - finds reaction images with surprised expressions</li>
                <li>&quot;cat sitting like human&quot; - finds specific cat meme poses</li>
              </ul>

              <h3 className="font-medium mt-6">Uploading directly</h3>
              <p className="text-muted-foreground">
                You can also upload images directly on sploot.app by dragging and dropping files or clicking the upload area.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Contact Us</h2>
            <p className="text-muted-foreground">
              For additional help or to report issues, email us at{" "}
              <a href="mailto:support@sploot.app" className="sploot-public-link">
                support@sploot.app
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Links</h2>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="sploot-public-link">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/sploot-app/sploot"
                  className="sploot-public-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub (Report Issues)
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

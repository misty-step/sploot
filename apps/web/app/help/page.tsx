import type { Metadata } from "next";
import Link from "next/link";
import { EnrollmentNotice } from "@/components/enrollment/enrollment-notice";
import { getPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export const metadata: Metadata = {
  title: "Help - Sploot",
  description: "Getting started, capture channels, and your data on Sploot",
};

export default function Help() {
  const enrollmentState = getPublicEnrollmentState();

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="sploot-public-link mb-8 inline-block"
        >
          ← Back to Sploot
        </Link>

        <h1
          className="text-4xl md:text-5xl mb-4 tracking-wide"
          style={{ fontFamily: "var(--font-bebas-neue)" }}
        >
          GETTING STARTED
        </h1>
        <p className="text-muted-foreground mb-8">
          Sploot is a personal meme library: save from anywhere, find things
          with plain words instead of folders. Here&apos;s how to get set up.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold mb-4">1. enrollment status</h2>
            <EnrollmentNotice state={enrollmentState} />
            {enrollmentState.status === 'open' ? (
              <p className="text-muted-foreground">
                Create an account at{' '}
                <a href="https://sploot.app" className="sploot-public-link">sploot.app</a>.
                That&apos;s it — no setup wizard, no folders to build. Your library starts empty and fills up as you save.
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Save your first meme</h2>
            <p className="text-muted-foreground mb-4">
              Sploot meets you where the meme already is. Pick whichever of
              these fits how you actually browse:
            </p>
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-foreground">Drag-and-drop or upload on the web app</h3>
                <p className="text-muted-foreground">
                  On sploot.app, drag an image onto the library or click the
                  upload area. Works for single files or a batch at once.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Chrome extension — right-click anywhere</h3>
                <p className="text-muted-foreground">
                  Install the extension, sign in, then right-click any image
                  on any site and choose &quot;Save to Sploot&quot;. See{" "}
                  <Link href="/support" className="sploot-public-link">
                    Support
                  </Link>{" "}
                  for install and troubleshooting steps.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">iPhone share sheet — Apple Shortcut</h3>
                <p className="text-muted-foreground">
                  iOS doesn&apos;t let installed web apps sit in the share
                  sheet, so the Save to Sploot shortcut fills that gap: share
                  an image from any app and it lands in your library. Full
                  walkthrough:{" "}
                  <Link href="/help/ios-shortcut" className="sploot-public-link">
                    Save to Sploot on iPhone
                  </Link>
                  .
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Android share sheet / installed PWA</h3>
                <p className="text-muted-foreground">
                  Install Sploot as an app (Settings → Install as app, or
                  &quot;Add to Home Screen&quot; in your browser menu). Once
                  installed, Sploot appears as a share target — share an
                  image from Photos, Chrome, or any app straight into your
                  library.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">Paste</h3>
                <p className="text-muted-foreground">
                  Copy an image (or a link to one) and paste it directly into
                  the library or upload area on the web app.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. Find it again</h2>
            <p className="text-muted-foreground mb-4">
              Search describes the meme instead of naming a file. Try what
              you&apos;d actually say out loud:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>&quot;disappointed drake&quot; — finds Drake meme variations</li>
              <li>&quot;surprised face&quot; — finds reaction images</li>
              <li>&quot;cat sitting like a human&quot; — finds specific poses</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Shuffle resurfaces things you forgot you saved, and piles
              cluster your library automatically as it grows — no folders to
              maintain by hand. That clustering is a first cut today: it
              sorts into fixed categories and ranks off one averaged signal,
              not a model of your personal taste yet. Real per-user taste is
              tracked as backlog 037, not shipped today.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Your data</h2>
            <p className="text-muted-foreground mb-3">
              Every meme you save stays viewable and downloadable individually
              from its detail view on the web app — nothing is locked behind
              a paywall or held hostage.
            </p>
            <p className="text-muted-foreground">
              What doesn&apos;t exist yet: a single &quot;export everything&quot;
              action (a zip or archive of your whole library in one click).
              That&apos;s a real gap against the promise that your memes are
              never held hostage, and it&apos;s tracked as a follow-up rather
              than left silent. Until it ships, downloading meme-by-meme is
              the way out.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Where to get help</h2>
            <p className="text-muted-foreground">
              For extension troubleshooting, search tips, and contact info,
              see{" "}
              <Link href="/support" className="sploot-public-link">
                Support
              </Link>
              . For the iPhone shortcut setup, see{" "}
              <Link href="/help/ios-shortcut" className="sploot-public-link">
                Save to Sploot on iPhone
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

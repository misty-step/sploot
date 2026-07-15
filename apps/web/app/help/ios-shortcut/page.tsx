import type { Metadata } from "next";
import Link from "next/link";
import { EnrollmentNotice } from "@/components/enrollment/enrollment-notice";
import { PublicPageHeader } from "@/components/public-page-header";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

export const metadata: Metadata = {
  title: "Save to Sploot on iPhone - Sploot Help",
  description:
    "Set up the Save to Sploot Apple Shortcut so images share straight from any iPhone app into your library.",
};

export const dynamic = "force-dynamic";

export default async function IosShortcutHelp() {
  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });

  return (
    <main className="min-h-screen bg-background">
      <PublicPageHeader current="/help" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/help"
          className="text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          ← Back to Getting Started
        </Link>

        <h1
          className="text-4xl md:text-5xl mb-4 tracking-wide"
          style={{ fontFamily: "var(--font-bebas-neue)" }}
        >
          SAVE TO SPLOOT ON IPHONE
        </h1>
        <p className="text-muted-foreground mb-8">
          iOS (WebKit) doesn&apos;t implement the Web Share Target API, so an
          installed Sploot PWA can never appear in the iPhone share sheet the
          way it does on Android. The workaround is an{" "}
          <strong className="text-foreground">Apple Shortcut</strong>: it
          sits in the share sheet, accepts an image, and sends it to your
          library over an authenticated request.
        </p>
        <p className="text-muted-foreground mb-8">
          Shortcuts can&apos;t carry your Sploot login, so they authenticate
          with a <strong className="text-foreground">personal upload token</strong> instead
          — a credential that can only upload to your library, never read or
          delete it.
        </p>
        <EnrollmentNotice state={enrollmentState} />
        {enrollmentState.status === 'paused' ? (
          <p className="text-sm text-muted-foreground">
            new enrollment is paused. Existing users can still sign in and
            recover access through <Link href="/support" className="sploot-public-link">Support</Link>.
          </p>
        ) : null}

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold mb-4">1. Use an existing account&apos;s upload token</h2>
            <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
              <li>
                Open Sploot →{" "}
                <Link href="/app/settings" className="text-accent-cyan hover:underline">
                  Settings
                </Link>{" "}
                → Upload tokens.
              </li>
              <li>Existing Sploot users can name it (e.g. &quot;iphone&quot;) and tap mint token.</li>
              <li>
                Copy the <code className="text-foreground">splt_…</code> value.{" "}
                <strong className="text-foreground">It is shown only once.</strong> If
                you lose it, revoke it and mint a new one.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Build the Shortcut</h2>
            <p className="text-muted-foreground mb-4">
              In the Shortcuts app, create a new shortcut with these actions:
            </p>
            <ol className="list-decimal pl-6 space-y-3 text-muted-foreground">
              <li>
                <strong className="text-foreground">Get Contents of URL</strong>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>
                    URL: <code className="text-foreground">https://www.sploot.app/api/upload</code>
                  </li>
                  <li>Method: POST</li>
                  <li>
                    Headers: add one — <code className="text-foreground">Authorization</code> ={" "}
                    <code className="text-foreground">Bearer splt_…</code> (your token, with
                    the word &quot;Bearer&quot; and a space before it).
                  </li>
                  <li>Request Body: Form</li>
                  <li>
                    Add a form field: Key = <code className="text-foreground">file</code>, Type
                    = File, Value = Shortcut Input (the shared image).
                  </li>
                </ul>
              </li>
              <li>
                (Optional) Show Result / Show Notification of the response so
                you get a &quot;saved&quot; confirmation.
              </li>
            </ol>
            <p className="text-muted-foreground mt-4">
              Then open the shortcut&apos;s settings (the ⓘ / share icon):
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Turn on Show in Share Sheet.</li>
              <li>
                Under Share Sheet Types, accept Images (and Media if you want
                to share from Photos).
              </li>
              <li>Name it &quot;Save to Sploot&quot;.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. Use it</h2>
            <p className="text-muted-foreground">
              From any app, tap Share → Save to Sploot. The image lands in
              your library. Sploot deduplicates by content hash, so
              re-sharing the same image is harmless — it returns the existing
              asset rather than creating a duplicate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Responses the Shortcut may see</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-muted-foreground">
                <thead>
                  <tr className="border-b border-border text-foreground">
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4">201</td>
                    <td className="py-2">Saved. Response includes the new asset.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4">409</td>
                    <td className="py-2">Already in your library (duplicate). The existing asset is returned.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4">401</td>
                    <td className="py-2">Unauthorized — token missing, mistyped, or revoked.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4">403</td>
                    <td className="py-2">Quota exceeded — you&apos;re out of storage.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4">413</td>
                    <td className="py-2">The image is larger than the upload limit.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">503</td>
                    <td className="py-2">Uploads are temporarily paused.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Security</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                The token is upload-only: presenting it to any read or delete
                endpoint returns 401. It cannot list, view, or remove your
                memes.
              </li>
              <li>Only a hash of the token is stored server-side; the plaintext is shown once.</li>
              <li>
                If a token leaks (lost phone, shared screenshot), open{" "}
                <Link href="/app/settings" className="text-accent-cyan hover:underline">
                  Settings → Upload tokens
                </Link>{" "}
                and revoke it. Revocation is immediate.
              </li>
              <li>&quot;Last used&quot; is shown per token so you can spot one being used unexpectedly.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Sharing your shortcut (optional)</h2>
            <p className="text-muted-foreground">
              Apple shortcuts are device-signed, so a ready-made .shortcut
              file can only be produced and shared from an Apple device. If
              you want to share your build with someone else, open the
              shortcut → Share → Copy iCloud Link and send that. Each person
              still mints and pastes their own token; never share a token.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

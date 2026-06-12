import Link from 'next/link';

export const metadata = {
  title: 'Save to Sploot Shortcut',
  description: 'Set up the iPhone share-sheet Shortcut for upload-only Sploot saves.',
};

export default function SaveToSplootShortcutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <header className="space-y-3">
        <Link href="/app/settings" className="text-sm text-accent-cyan hover:underline">
          Back to settings
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Save to Sploot Shortcut</h1>
        <p className="text-muted-foreground">
          iPhones do not expose PWA share targets, so Sploot uses an Apple
          Shortcut with an upload-only token.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Create the token</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Open Sploot settings.</li>
          <li>Create an upload token in the Save to Sploot Shortcut section.</li>
          <li>Copy the token immediately. Sploot stores only a hash and will not show it again.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Build the Shortcut</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Create a shortcut named Save to Sploot.</li>
          <li>Enable Show in Share Sheet and accept images.</li>
          <li>Add Get Contents of URL with method POST.</li>
          <li>Use <code className="text-foreground">https://www.sploot.app/api/upload</code>.</li>
          <li>Add header <code className="text-foreground">Authorization: Bearer &lt;upload token&gt;</code>.</li>
          <li>Set the request body to form data with one field named <code className="text-foreground">file</code> whose value is the Shortcut input.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Revoke access</h2>
        <p className="text-sm text-muted-foreground">
          Revoke the token from settings. The same Shortcut will then receive
          the stable Sploot API auth response: <code className="text-foreground">{'{"error":"Unauthorized"}'}</code>.
        </p>
      </section>
    </main>
  );
}

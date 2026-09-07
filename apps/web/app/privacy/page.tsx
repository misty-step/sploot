import type { Metadata } from "next";
import { PublicPageHeader } from "@/components/public-page-header";

export const metadata: Metadata = {
  title: "Privacy Policy - Sploot",
  description: "Privacy policy for Sploot meme library and Chrome extension",
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background">
      <PublicPageHeader current="/privacy" />
      <div className="mx-auto max-w-3xl px-6 py-12">

        <h1
          className="text-4xl md:text-5xl mb-8 tracking-wide"
          style={{ fontFamily: "var(--font-bebas-neue)" }}
        >
          PRIVACY POLICY
        </h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Last updated: January 2025
          </p>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Overview</h2>
            <p>
              Sploot is a personal meme library that lets you save, organize, and search your images using AI-powered semantic search. Your privacy is important to us. This policy explains what data we collect and how we use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">What We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-2">Account Information</h3>
            <p>
              When you create an account, we collect your email address and authentication credentials through our authentication provider, Clerk. This is used solely for account access and security.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-2">Images You Upload</h3>
            <p>
              Images you save to Sploot are stored in your private library. We process these images to generate AI embeddings for semantic search. Your images are:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Stored securely on Vercel Blob storage</li>
              <li>Visible in your authenticated library by default</li>
              <li>Shareable through public links when you choose to share them</li>
              <li>Processed by Replicate to generate AI embeddings for search</li>
              <li>Never used for AI training</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-2">Search Queries</h3>
            <p>
              Your search queries are processed to generate text embeddings for matching against your images. We also store recent search logs with your account ID, query text, result count, and query timing so we can show recent searches, build global popular search suggestions, debug search quality, and improve relevance. Query text used in popular suggestions may be visible to other signed-in users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Chrome Extension</h2>
            <p>
              The Sploot Chrome extension allows you to save images from any website. The extension:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Only activates when you right-click an image and select &quot;Save to Sploot&quot;</li>
              <li>Does not track your browsing history</li>
              <li>Does not collect any data from websites you visit</li>
              <li>Only sends the image you explicitly choose to save to your Sploot library</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-2">Extension Permissions</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>contextMenus</strong>: To add &quot;Save to Sploot&quot; to the right-click menu</li>
              <li><strong>storage</strong>: To maintain your login session</li>
              <li><strong>notifications</strong>: To show success/error messages when saving images</li>
              <li><strong>Host permissions</strong>: To communicate with sploot.app for uploads and authentication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Data Security</h2>
            <p>
              We use industry-standard security practices:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>All data transmitted over HTTPS</li>
              <li>Authentication handled by Clerk (SOC 2 compliant)</li>
              <li>Images stored on Vercel Blob (enterprise-grade security)</li>
              <li>Database hosted on Neon with encryption at rest</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Data Retention</h2>
            <p>
              Your images and account data are retained as long as you maintain an account. You can delete individual images at any time. If you delete your account, all associated data will be permanently removed.
            </p>
            <p>
              Search logs are retained for 30 days and then purged automatically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Clerk</strong>: Authentication (see <a href="https://clerk.com/privacy" className="sploot-public-link" target="_blank" rel="noopener noreferrer">Clerk Privacy Policy</a>)</li>
              <li><strong>DigitalOcean</strong>: Application hosting (see <a href="https://www.digitalocean.com/legal/privacy-policy" className="sploot-public-link" target="_blank" rel="noopener noreferrer">DigitalOcean Privacy Policy</a>)</li>
              <li><strong>Vercel Blob</strong>: Image storage (see <a href="https://vercel.com/legal/privacy-policy" className="sploot-public-link" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a>)</li>
              <li><strong>First-party telemetry</strong>: Authenticated product usage and performance events written to Sploot application logs</li>
              <li><strong>Neon</strong>: Database (see <a href="https://neon.tech/privacy" className="sploot-public-link" target="_blank" rel="noopener noreferrer">Neon Privacy Policy</a>)</li>
              <li><strong>Replicate</strong>: AI embedding generation for image and text search</li>
              <li><strong>Sentry</strong>: Privacy-filtered error and performance diagnostics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your data</li>
              <li>Delete your images</li>
              <li>Delete your account</li>
              <li>Download individual images</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Contact</h2>
            <p>
              For privacy questions or concerns, contact us at{" "}
              <a href="mailto:privacy@sploot.app" className="sploot-public-link">
                privacy@sploot.app
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">Changes</h2>
            <p>
              We may update this policy. Significant changes will be communicated via email or in-app notification.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

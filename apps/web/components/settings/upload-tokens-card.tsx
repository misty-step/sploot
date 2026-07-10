'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface UploadToken {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface MintedToken extends UploadToken {
  token: string;
}

const UPLOAD_ENDPOINT = '/api/upload';

function formatWhen(value: string | null): string {
  if (!value) return 'never used';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function UploadTokensCard() {
  const [tokens, setTokens] = useState<UploadToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [name, setName] = useState('');
  const [minting, setMinting] = useState(false);
  const [justMinted, setJustMinted] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/upload-tokens');
        if (!res.ok) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setTokens(Array.isArray(data.tokens) ? data.tokens : []);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const mint = async () => {
    const trimmed = name.trim();
    if (!trimmed || minting) return;

    setMinting(true);
    setError(null);
    try {
      const res = await fetch('/api/upload-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'could not mint a token');
        return;
      }

      setJustMinted(data as MintedToken);
      setCopied(false);
      setTokens((prev) => [
        { id: data.id, name: data.name, prefix: data.prefix, lastUsedAt: null, createdAt: data.createdAt },
        ...prev,
      ]);
      setName('');
    } catch {
      setError('could not mint a token');
    } finally {
      setMinting(false);
    }
  };

  const revoke = async (id: string) => {
    const previous = tokens;
    // Optimistic: drop it immediately, roll back if the request fails.
    setTokens((current) => current.filter((token) => token.id !== id));
    if (justMinted?.id === id) setJustMinted(null);

    try {
      const res = await fetch(`/api/upload-tokens/${id}`, { method: 'DELETE' });
      if (!res.ok) setTokens(previous);
    } catch {
      setTokens(previous);
    }
  };

  const copyToken = async () => {
    if (!justMinted) return;
    try {
      await navigator.clipboard.writeText(justMinted.token);
      setCopied(true);
    } catch {
      // Clipboard blocked — the value is visible for manual selection.
    }
  };

  return (
    <section id="upload-tokens" className="bg-card border-[3px] border-sploot-ink rounded-[var(--sploot-radius)] sploot-shadow p-5 space-y-4 scroll-mt-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Upload tokens</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Mint a key for the &ldquo;Save to Sploot&rdquo; iPhone shortcut (or any
          uploader). It can <span className="text-foreground">only upload</span> —
          never read or delete your library — and you see the secret exactly once.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') mint();
          }}
          maxLength={64}
          placeholder="name it (e.g. iphone)"
          className="flex-1 min-w-[12rem] bg-background border-[3px] border-sploot-ink rounded-[var(--sploot-radius-pill)] px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button
          onClick={mint}
          disabled={minting || name.trim().length === 0}
          size="sm"
        >
          {minting ? 'minting…' : 'mint token'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {justMinted && (
        <div className="bg-secondary border-[3px] border-sploot-ink rounded-[var(--sploot-radius)] p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            copy it now — this is the only time it&apos;s shown. paste it into your shortcut.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all font-mono text-sm text-foreground">{justMinted.token}</code>
            <Button onClick={copyToken} size="sm">
              {copied ? 'copied' : 'copy'}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">loading your tokens…</p>
      ) : unavailable ? (
        <p className="text-sm text-muted-foreground">tokens aren&apos;t available right now.</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">no tokens yet. mint one to wire up the iPhone shortcut below.</p>
      ) : (
        <ul className="divide-y-2 divide-sploot-ink border-[3px] border-sploot-ink rounded-[var(--sploot-radius)] overflow-hidden">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{token.prefix}…</span> · {formatWhen(token.lastUsedAt)}
                </p>
              </div>
              <Button
                onClick={() => revoke(token.id)}
                variant="destructive"
                size="sm"
              >
                revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
          how to set up the &ldquo;Save to Sploot&rdquo; iPhone shortcut
        </summary>
        <ol className="mt-3 space-y-1.5 text-muted-foreground list-decimal list-inside">
          <li>open the Shortcuts app → <span className="text-foreground">+</span> → add an action.</li>
          <li>
            add <span className="text-foreground">Get Contents of URL</span>, set it to{' '}
            <code className="font-mono text-foreground break-all">{UPLOAD_ENDPOINT}</code> on this site,
            method <span className="text-foreground">POST</span>.
          </li>
          <li>
            add a header <code className="font-mono text-foreground">Authorization</code> ={' '}
            <code className="font-mono text-foreground">Bearer &lt;your token&gt;</code>.
          </li>
          <li>
            request body <span className="text-foreground">Form</span>, add a field{' '}
            <code className="font-mono text-foreground">file</code> set to the Shortcut Input (the shared image).
          </li>
          <li>
            in the shortcut settings, turn on <span className="text-foreground">Show in Share Sheet</span> and
            accept Images. now <span className="text-foreground">Share → Save to Sploot</span> from any app.
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          full recipe: <span className="font-mono">apps/web/docs/shortcuts/save-to-sploot.md</span>
        </p>
      </details>
    </section>
  );
}

/**
 * Evidence packet rendering for the QA verification harness.
 *
 * Pure functions only: the orchestrator (scripts/qa-evidence.ts) gathers
 * results from seed, test, and browser walks, then renders one markdown
 * packet per run under docs/qa/evidence/<date>-<slug>/.
 */

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface EvidenceCheck {
  name: string;
  command: string;
  status: CheckStatus;
  durationMs?: number;
  /** Relative path (within the packet dir) to the full command transcript. */
  transcript?: string;
  /** Short human-readable note: failure summary, skip reason, etc. */
  detail?: string;
}

export interface BrowserWalk {
  route: string;
  viewport: string;
  /** Relative path (within the packet dir) to the captured screenshot. */
  screenshot: string;
  consoleErrors: string[];
  pageErrors: string[];
}

export interface EvidencePacketInput {
  slug: string;
  date: string;
  branch: string;
  commit: string;
  intent: string;
  checks: EvidenceCheck[];
  browser: BrowserWalk[];
  residualRisk: string[];
}

export type Verdict = 'pass' | 'fail';

export function packetVerdict(input: EvidencePacketInput): Verdict {
  const checkFailed = input.checks.some((check) => check.status === 'fail');
  const pageErrored = input.browser.some((walk) => walk.pageErrors.length > 0);
  return checkFailed || pageErrored ? 'fail' : 'pass';
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  skip: 'SKIP',
};

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  return ` (${(durationMs / 1000).toFixed(1)}s)`;
}

function renderCheck(check: EvidenceCheck): string {
  const lines = [
    `### ${STATUS_LABEL[check.status]} — ${check.name}${formatDuration(check.durationMs)}`,
    '',
    '```',
    check.command,
    '```',
  ];
  if (check.detail) {
    lines.push('', check.detail);
  }
  if (check.transcript) {
    lines.push('', `Transcript: [${check.transcript}](${check.transcript})`);
  }
  return lines.join('\n');
}

function renderWalk(walk: BrowserWalk): string {
  const lines = [
    `### ${walk.route} @ ${walk.viewport}`,
    '',
    `![${walk.route} @ ${walk.viewport}](${walk.screenshot})`,
  ];
  if (walk.pageErrors.length > 0) {
    lines.push('', 'Page errors:', ...walk.pageErrors.map((error) => `- ${error}`));
  }
  if (walk.consoleErrors.length > 0) {
    lines.push('', 'Console errors:', ...walk.consoleErrors.map((error) => `- ${error}`));
  }
  if (walk.pageErrors.length === 0 && walk.consoleErrors.length === 0) {
    lines.push('', 'No page or console errors.');
  }
  return lines.join('\n');
}

export function renderEvidencePacket(input: EvidencePacketInput): string {
  const verdict = packetVerdict(input);

  const sections = [
    `# Evidence Packet: ${input.slug}`,
    '',
    `- Date: ${input.date}`,
    `- Branch: \`${input.branch}\``,
    `- Commit: \`${input.commit}\``,
    '',
    '## Intent',
    '',
    input.intent,
    '',
    '## Checks',
    '',
    input.checks.map(renderCheck).join('\n\n'),
    '',
    '## Browser Evidence',
    '',
    input.browser.length > 0
      ? input.browser.map(renderWalk).join('\n\n')
      : 'No browser walks were run.',
    '',
    `## Verdict: ${verdict.toUpperCase()}`,
    ...(() => {
      const consoleErrorCount = input.browser.reduce(
        (count, walk) => count + walk.consoleErrors.length,
        0
      );
      return consoleErrorCount > 0
        ? ['', `⚠ ${consoleErrorCount} console error(s) captured — review the browser evidence before trusting this verdict.`]
        : [];
    })(),
    '',
    '## Residual Risk',
    '',
    input.residualRisk.length > 0
      ? input.residualRisk.map((risk) => `- ${risk}`).join('\n')
      : '- None recorded.',
    '',
  ];

  return sections.join('\n');
}

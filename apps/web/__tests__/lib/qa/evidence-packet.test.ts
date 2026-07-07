import { describe, expect, it } from 'vitest';
import {
  renderEvidencePacket,
  packetVerdict,
  type EvidencePacketInput,
} from '@/lib/qa/evidence-packet';

function baseInput(overrides: Partial<EvidencePacketInput> = {}): EvidencePacketInput {
  return {
    slug: 'share-target',
    date: '2026-06-10',
    branch: 'feat/share-target',
    commit: 'abc1234',
    intent: 'PWA share-target saves shared images into the library.',
    checks: [
      {
        name: 'qa seed',
        command: 'pnpm --filter web qa:seed',
        status: 'pass',
        durationMs: 4200,
      },
      {
        name: 'unit tests',
        command: 'CI=1 pnpm --filter web vitest run __tests__/api/share-target.test.ts',
        status: 'pass',
        durationMs: 9100,
        transcript: 'transcripts/unit-tests.txt',
      },
    ],
    browser: [
      {
        route: '/app',
        viewport: '1440x900',
        screenshot: 'app-1440x900.png',
        consoleErrors: [],
        pageErrors: [],
      },
    ],
    residualRisk: ['Real-device share sheet not exercised; simulated POST only.'],
    ...overrides,
  };
}

describe('packetVerdict', () => {
  it('passes when every check passes and no page errors exist', () => {
    expect(packetVerdict(baseInput())).toBe('pass');
  });

  it('fails when any check fails', () => {
    const input = baseInput();
    input.checks[1] = { ...input.checks[1], status: 'fail' };
    expect(packetVerdict(input)).toBe('fail');
  });

  it('fails when a browser walk captured page errors', () => {
    const input = baseInput();
    input.browser[0] = {
      ...input.browser[0],
      pageErrors: ['TypeError: cannot read properties of undefined'],
    };
    expect(packetVerdict(input)).toBe('fail');
  });

  it('fails when a browser walk landed on the sign-in wall, even with no other errors', () => {
    const input = baseInput();
    input.browser[0] = {
      ...input.browser[0],
      signInWall: true,
    };
    expect(packetVerdict(input)).toBe('fail');
  });
});

describe('renderEvidencePacket', () => {
  it('renders scope, every command with its status, screenshots, and verdict', () => {
    const md = renderEvidencePacket(baseInput());

    expect(md).toContain('# Evidence Packet: share-target');
    expect(md).toContain('2026-06-10');
    expect(md).toContain('feat/share-target');
    expect(md).toContain('abc1234');
    expect(md).toContain('PWA share-target saves shared images into the library.');
    expect(md).toContain('pnpm --filter web qa:seed');
    expect(md).toContain('CI=1 pnpm --filter web vitest run __tests__/api/share-target.test.ts');
    expect(md).toContain('![/app @ 1440x900](app-1440x900.png)');
    expect(md).toContain('transcripts/unit-tests.txt');
    expect(md).toContain('## Verdict: PASS');
    expect(md).toContain('Real-device share sheet not exercised; simulated POST only.');
  });

  it('renders FAIL verdict and surfaces the failing check and page errors', () => {
    const input = baseInput();
    input.checks[1] = {
      ...input.checks[1],
      status: 'fail',
      detail: '1 test failed',
    };
    input.browser[0] = {
      ...input.browser[0],
      consoleErrors: ['Failed to load resource: 404'],
      pageErrors: ['TypeError: boom'],
    };

    const md = renderEvidencePacket(input);

    expect(md).toContain('## Verdict: FAIL');
    expect(md).toContain('1 test failed');
    expect(md).toContain('TypeError: boom');
    expect(md).toContain('Failed to load resource: 404');
    // failing checks must be visually distinguishable from passing ones
    expect(md).toMatch(/fail.*unit tests|unit tests.*fail/i);
  });

  it('keeps a PASS verdict but flags captured console errors loudly', () => {
    const input = baseInput();
    input.browser[0] = {
      ...input.browser[0],
      consoleErrors: ['[error] hydration mismatch', '[error] hydration mismatch'],
    };

    expect(packetVerdict(input)).toBe('pass');
    const md = renderEvidencePacket(input);
    expect(md).toContain('## Verdict: PASS');
    expect(md).toContain('2 console error(s) captured');
  });

  it('renders FAIL and a loud note when a walk landed on the sign-in wall', () => {
    const input = baseInput();
    input.browser[0] = {
      ...input.browser[0],
      signInWall: true,
    };

    const md = renderEvidencePacket(input);

    expect(md).toContain('## Verdict: FAIL');
    expect(md).toMatch(/sign-in wall/i);
  });

  it('renders a skipped check without affecting the verdict', () => {
    const input = baseInput();
    input.checks.push({
      name: 'extension build',
      command: 'pnpm --filter extension build',
      status: 'skip',
      detail: 'not in scope for this change',
    });

    expect(packetVerdict(input)).toBe('pass');
    expect(renderEvidencePacket(input)).toContain('extension build');
  });
});

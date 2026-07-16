import { NextResponse } from 'next/server';
import type { ExportEgressAdmission } from './export-service';

/**
 * Shared HTTP mapping for egress admission refusals, so the part and
 * manifest routes answer identically and the contract in docs/EXPORT.md has
 * exactly one implementation.
 */
export function exportAdmissionErrorResponse(
  admission: Exclude<ExportEgressAdmission, { kind: 'reserved' }>,
): NextResponse {
  if (admission.kind === 'gone') {
    // The session raced away (canceled/superseded/expired) between the
    // access check and admission; the capability is dead either way.
    return NextResponse.json(
      {
        error: 'This export is no longer available. Start a new export from Settings.',
        code: 'export_unavailable',
        retryable: false,
      },
      { status: 410 },
    );
  }
  return NextResponse.json(
    {
      error:
        admission.code === 'export_manifest_too_large'
          ? 'This manifest is too large for durable replay.'
          : admission.code === 'export_egress_exhausted'
          ? 'This export hit its download budget. Start a new export from Settings.'
          : 'Export downloads hit the rolling 24-hour budget. Try again later — your data is never locked away.',
      code: admission.code,
      retryable: admission.code === 'export_egress_window_exhausted',
    },
    { status: admission.code === 'export_manifest_too_large' ? 413 : 429 },
  );
}

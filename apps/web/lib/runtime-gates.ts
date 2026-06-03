import { NextResponse } from 'next/server';
import type { SplootApiError } from '@sploot/common';

export type RuntimeGateName = 'uploads' | 'embeddings';

export interface RuntimeGateDecision {
  name: RuntimeGateName;
  enabled: boolean;
  code: 'uploads_disabled' | 'embeddings_disabled';
  message: string;
}

const DISABLED_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

function envFlagEnabled(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  return !DISABLED_VALUES.has(value.trim().toLowerCase());
}

export function getRuntimeGate(name: RuntimeGateName): RuntimeGateDecision {
  if (name === 'uploads') {
    const enabled = envFlagEnabled(process.env.SPLOOT_UPLOADS_ENABLED);
    return {
      name,
      enabled,
      code: 'uploads_disabled',
      message: 'Uploads are temporarily paused',
    };
  }

  const enabled = envFlagEnabled(process.env.SPLOOT_EMBEDDINGS_ENABLED);
  return {
    name,
    enabled,
    code: 'embeddings_disabled',
    message: 'Embedding generation is temporarily paused',
  };
}

export function runtimeGateError(decision: RuntimeGateDecision): SplootApiError {
  return {
    error: decision.message,
    code: decision.code,
    retryable: true,
    action: {
      type: 'try_later',
      label: 'Try again later',
    },
  };
}

export function runtimeGateResponse(decision: RuntimeGateDecision): NextResponse {
  return NextResponse.json(runtimeGateError(decision), { status: 503 });
}

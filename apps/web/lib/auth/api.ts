import { NextResponse } from 'next/server';

const UNAUTHORIZED_ERROR_MESSAGE = 'Unauthorized';

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') {
      return message;
    }
  }

  return undefined;
}

export function isUnauthorizedAuthError(error: unknown): boolean {
  const message = getErrorMessage(error);
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  return status === 401 || code === 'unauthorized' ||
    message === UNAUTHORIZED_ERROR_MESSAGE ||
    message?.startsWith(`${UNAUTHORIZED_ERROR_MESSAGE} -`) === true;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: UNAUTHORIZED_ERROR_MESSAGE },
    { status: 401 }
  );
}

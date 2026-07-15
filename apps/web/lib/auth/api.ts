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

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

export function isUnauthorizedAuthError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (getErrorStatus(error) === 401) return true;
  return message === UNAUTHORIZED_ERROR_MESSAGE ||
    message?.startsWith(`${UNAUTHORIZED_ERROR_MESSAGE} -`) === true;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: UNAUTHORIZED_ERROR_MESSAGE },
    { status: 401 }
  );
}

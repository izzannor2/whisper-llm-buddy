/**
 * Centralized Error Handling
 * AppError class + handleError() for consistent error normalization, logging, and toast display.
 */

import { emitError } from './error-bus';

export class AppError extends Error {
  code: string;
  context?: unknown;
  recoverable: boolean;

  constructor(code: string, message: string, context?: unknown, recoverable = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
  }
}

/**
 * Normalize any thrown value into an AppError, log it, and show a user-friendly toast.
 */
export function handleError(err: unknown, context?: string): AppError {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof Error) {
    const isTimeout = err.name === 'AbortError' || err.message.includes('timed out');
    const isNetwork = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
    
    appError = new AppError(
      isTimeout ? 'TIMEOUT' : isNetwork ? 'NETWORK' : 'UNKNOWN',
      err.message,
      { originalError: err.name, stack: err.stack, context },
      true
    );
  } else if (typeof err === 'string') {
    appError = new AppError('UNKNOWN', err, { context }, true);
  } else {
    appError = new AppError('UNKNOWN', 'An unexpected error occurred', { raw: err, context }, true);
  }

  // Log
  console.error(`[${appError.code}]${context ? ` (${context})` : ''}: ${appError.message}`, appError.context);

  // Toast
  if (appError.recoverable) {
    toast.warning(appError.message, { duration: 4000 });
  } else {
    toast.error(appError.message, { duration: 6000 });
  }

  // Emit to activity log if available
  if (typeof window !== 'undefined' && (window as any).__activityLog) {
    (window as any).__activityLog({
      type: 'error',
      message: appError.message,
      code: appError.code,
      context,
      timestamp: Date.now(),
    });
  }

  return appError;
}

import { initializePaddle, Paddle } from '@paddle/paddle-js';

// Thrown when checkout cannot work in this environment (no client token).
// Local dev runs without VITE_PADDLE_CLIENT_TOKEN; the paywall catches this
// and shows a "not configured" message instead of a dead button.
export class PaddleNotConfiguredError extends Error {
  constructor() {
    super('VITE_PADDLE_CLIENT_TOKEN is not set — Paddle checkout is disabled in this environment.');
    this.name = 'PaddleNotConfiguredError';
  }
}

// Paddle client tokens are environment-bound (test_* = sandbox, live_* = production),
// so the environment is derived from the token rather than a second env var that
// could disagree with it. Swapping in a test_ token is all sandbox testing needs.
function environmentForToken(token: string): 'sandbox' | 'production' {
  return token.startsWith('test_') ? 'sandbox' : 'production';
}

let paddlePromise: Promise<Paddle> | null = null;

export function getPaddle(): Promise<Paddle> {
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
  if (!token) {
    return Promise.reject(new PaddleNotConfiguredError());
  }

  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      token,
      environment: environmentForToken(token),
    }).then((paddle) => {
      if (!paddle) {
        throw new Error('Paddle.js initialized without returning an instance.');
      }
      return paddle;
    });

    // A failed load (CDN blocked, offline) must not poison every later attempt.
    paddlePromise.catch(() => {
      paddlePromise = null;
    });
  }

  return paddlePromise;
}

// ORIGIN CHECK BUILD ONLY (ios-audit.yml, job "origin"). Injected first into
// dist/index.html of a bundle built against http://127.0.0.1:8787, a stub on
// the runner. It plants a session that is not a real token, so the app opens
// signed in and makes its own API requests through its own code: the request
// the check reads is the app's, not one this file sends.
(function () {
  var now = Math.floor(Date.now() / 1000);
  var session = {
    access_token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjk5OTk5OTk5OTl9.',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 360000,
    refresh_token: 'origin-check',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      email: 'origin-check@example.invalid',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
  // supabase-js names its storage key after the first label of the Supabase
  // host: http://127.0.0.1:8787 -> "sb-127-auth-token".
  localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
})();

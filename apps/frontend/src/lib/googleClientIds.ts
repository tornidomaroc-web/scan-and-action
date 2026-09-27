// ============================================================================
// Google OAuth client ids for the NATIVE Google button (lib/socialAuth.ts).
//
// PUBLIC BY NATURE: a client id ships inside the app, its bundle and, on iOS,
// Info.plist. The client SECRET of the web client lives only in Supabase's
// Google provider and never in this repository. The web sign-in path needs
// neither id (Supabase holds the client); these gate the native button on
// iOS and Android.
//
// Why a source file and not .env.production: that file is read-denied to the
// tooling that maintains this repository, so the values live here, where any
// reader can see them, and an environment variable of the same name still
// wins (socialConfigFromEnv). Created 2026-09-27 in the Google Cloud project
// "Scan and Action" (scan-and-action), clients "Scan & Action Web" and
// "Scan & Action iOS". The reversed iOS id, for the future Info.plist URL
// scheme, is the iOS id with its dot-separated parts reversed:
//   com.googleusercontent.apps.685415837332-qkku264q2q5opi4lg4vrn3kj5js0v9mq
// ============================================================================

export const GOOGLE_WEB_CLIENT_ID = '685415837332-j8jnka3j07i90miskpo6qgoi8qctjvg1.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '685415837332-qkku264q2q5opi4lg4vrn3kj5js0v9mq.apps.googleusercontent.com';

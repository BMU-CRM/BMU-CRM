// The Firebase settings for Google sign-in. They are public by design: Firebase sends
// them to every browser. Each name is written out in full so Next.js can place the
// value into the browser code at build time.
export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

export function getFirebaseConfig(): FirebaseConfig | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? '',
  };
  // Without all four, the Google button is left out rather than shown broken.
  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}

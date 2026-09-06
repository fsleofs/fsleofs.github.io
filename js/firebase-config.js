// Paste the values from Firebase Console → Project settings → General → "Your apps" → SDK setup and configuration.
// These values are meant to be public in a client app; access control is enforced by
// firestore.rules and storage.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// The single admin account is a normal Firebase Auth email/password user.
// Create it once in Firebase Console → Authentication → Users → Add user.
// The admin login screen only asks for a password; this fixed email is used behind the scenes.
export const ADMIN_EMAIL = "admin@fsleo.local";

// Paste the values from Firebase Console → Project settings → General → "Your apps" → SDK setup and configuration.
// These values are meant to be public in a client app; access control is enforced by
// firestore.rules and storage.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: "AIzaSyDJ88aCCsyBVhfzP0vwdmIuW7Oy5-K1gA4",
  authDomain: "fs-leo-9a49d.firebaseapp.com",
  projectId: "fs-leo-9a49d",
  storageBucket: "fs-leo-9a49d.firebasestorage.app",
  messagingSenderId: "38638640395",
  appId: "1:38638640395:web:8fce047ff944d741eed60e",
};

// The single admin account is a normal Firebase Auth email/password user.
// Create it once in Firebase Console → Authentication → Users → Add user.
// The admin login screen only asks for a password; this fixed email is used behind the scenes.
export const ADMIN_EMAIL = "admin@fsleo.local";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Replace placeholders with values from Firebase Console.
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  appId: "YOUR_FIREBASE_APP_ID",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
const microsoftProvider = new OAuthProvider("microsoft.com");

export { auth, googleProvider, githubProvider, microsoftProvider };

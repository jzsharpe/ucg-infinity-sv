// Persistence: Firebase (Google sign-in + Firestore) when configured,
// otherwise browser localStorage ("local mode").
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/12.19.0';
export const isConfigured = !String(firebaseConfig.apiKey || '').startsWith('YOUR_');

let auth, db, fb;

export async function init(onUserChange) {
  if (!isConfigured) {
    onUserChange({ uid: 'local', displayName: 'Local mode', local: true });
    return;
  }
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  fb = { ...authMod, ...fsMod };
  const app = initializeApp(firebaseConfig);
  auth = fb.getAuth(app);
  db = fb.getFirestore(app);
  fb.onAuthStateChanged(auth, (user) => onUserChange(user));
}

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await fb.signInWithPopup(auth, provider);
}

export async function signOut() {
  if (auth) await fb.signOut(auth);
}

// ---- Athletes -------------------------------------------------------------

const LOCAL_KEY = 'sv-athletes';
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
  } catch {
    return [];
  }
};
const writeLocal = (list) => localStorage.setItem(LOCAL_KEY, JSON.stringify(list));

const athletesCol = () => fb.collection(db, 'users', auth.currentUser.uid, 'athletes');

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

export async function listAthletes() {
  if (!isConfigured) return readLocal();
  const snap = await fb.getDocs(athletesCol());
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function saveAthlete(athlete) {
  const data = { ...athlete, updatedAt: Date.now() };
  if (!isConfigured) {
    const list = readLocal().filter((a) => a.id !== data.id);
    writeLocal([...list, data]);
    return data;
  }
  const { id, ...rest } = data;
  await fb.setDoc(fb.doc(athletesCol(), id), rest);
  return data;
}

export async function deleteAthlete(id) {
  if (!isConfigured) {
    writeLocal(readLocal().filter((a) => a.id !== id));
    return;
  }
  await fb.deleteDoc(fb.doc(athletesCol(), id));
}

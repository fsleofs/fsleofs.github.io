import { db, storage } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// ---------- players ----------

export function listenPlayers(cb) {
  const q = query(collection(db, "players"), orderBy("number"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getPlayersOnce() {
  const q = query(collection(db, "players"), orderBy("number"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function addPlayer(data) {
  return addDoc(collection(db, "players"), data);
}

export function updatePlayer(id, data) {
  return updateDoc(doc(db, "players", id), data);
}

export function deletePlayer(id) {
  return deleteDoc(doc(db, "players", id));
}

export async function uploadPlayerPhoto(playerId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const storageRef = ref(storage, `player-photos/${playerId}-${Date.now()}.${ext}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// ---------- matches ----------

export function listenMatches(cb) {
  const q = query(collection(db, "matches"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getMatch(matchId) {
  const snap = await getDoc(doc(db, "matches", matchId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function listenMatch(matchId, cb) {
  return onSnapshot(doc(db, "matches", matchId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function addMatch(data) {
  return addDoc(collection(db, "matches"), data);
}

export function updateMatch(id, data) {
  return updateDoc(doc(db, "matches", id), data);
}

export async function deleteMatch(id) {
  const quarters = await getDocs(collection(db, "matches", id, "quarters"));
  await Promise.all(quarters.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "matches", id));
}

// ---------- match quarters (subcollection) ----------

export function listenQuarters(matchId, cb) {
  const q = query(collection(db, "matches", matchId, "quarters"), orderBy("quarterNumber"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getQuarters(matchId) {
  const q = query(collection(db, "matches", matchId, "quarters"), orderBy("quarterNumber"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function setQuarter(matchId, quarterNumber, data) {
  return setDoc(doc(db, "matches", matchId, "quarters", String(quarterNumber)), data);
}

export async function deleteQuartersFrom(matchId, fromQuarterNumber) {
  const all = await getQuarters(matchId);
  const toDelete = all.filter((q) => q.quarterNumber >= fromQuarterNumber);
  await Promise.all(
    toDelete.map((q) => deleteDoc(doc(db, "matches", matchId, "quarters", q.id)))
  );
}

// ---------- aggregate fetch (for standings / leaderboard / dashboard) ----------

export async function fetchAllMatchesWithQuarters() {
  const matchesSnap = await getDocs(query(collection(db, "matches"), orderBy("date", "desc")));
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const withQuarters = await Promise.all(
    matches.map(async (m) => ({ ...m, quarters: await getQuarters(m.id) }))
  );
  return withQuarters;
}

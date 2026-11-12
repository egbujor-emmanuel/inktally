// Persistence. Assignments + marks live in Firestore (offline-first cache, per-teacher security rules).
// Answer-box images stay ONLY on this device in IndexedDB — they are never uploaded to Firebase.
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { openDB, type IDBPDatabase } from 'idb';
import { auth, db } from '../firebase/app';
import type { Mark, MarkingScheme, Question } from '../domain/types';

export interface Assignment {
  id: string;
  ownerUid: string;
  title: string;
  className: string;
  scheme: MarkingScheme;
  createdAt?: unknown;
}

export interface Submission {
  id: string;
  assignmentId: string;
  ownerUid: string;
  /** Pupil label typed by the teacher (name or register number). Stays in the teacher's own account. */
  pupil: string;
  marks: Mark[];
  createdAt?: unknown;
}

function uid(): string {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Not signed in yet');
  return id;
}

const assignments = () => collection(db, 'assignments');
const submissions = (assignmentId: string) => collection(db, 'assignments', assignmentId, 'submissions');

export async function createAssignment(input: Omit<Assignment, 'id' | 'ownerUid' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(assignments(), { ...input, ownerUid: uid(), createdAt: serverTimestamp() });
  return ref.id;
}

export function watchAssignments(onChange: (items: Assignment[]) => void, onError: (e: Error) => void): Unsubscribe {
  const q = query(assignments(), where('ownerUid', '==', uid()), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment)), onError);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(db, 'assignments', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Assignment) : null;
}

export function watchAssignment(id: string, onChange: (a: Assignment | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'assignments', id), (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Assignment) : null), onError);
}

/** Replaces one question in the scheme (used when a teacher adds an accepted answer). */
export async function updateQuestion(assignment: Assignment, updated: Question): Promise<void> {
  const questions = assignment.scheme.questions.map((q) => (q.q === updated.q ? updated : q));
  await updateDoc(doc(db, 'assignments', assignment.id), { 'scheme.questions': questions });
}

export async function saveScheme(assignmentId: string, scheme: MarkingScheme): Promise<void> {
  await updateDoc(doc(db, 'assignments', assignmentId), { scheme });
}

export async function createSubmission(assignmentId: string, pupil: string, marks: Mark[]): Promise<string> {
  const ref = doc(submissions(assignmentId));
  await setDoc(ref, { assignmentId, ownerUid: uid(), pupil, marks, createdAt: serverTimestamp() });
  return ref.id;
}

export async function saveMarks(assignmentId: string, submissionId: string, marks: Mark[]): Promise<void> {
  await updateDoc(doc(db, 'assignments', assignmentId, 'submissions', submissionId), { marks });
}

export function watchSubmissions(assignmentId: string, onChange: (items: Submission[]) => void, onError: (e: Error) => void): Unsubscribe {
  const q = query(submissions(assignmentId), where('ownerUid', '==', uid()), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Submission)), onError);
}

// ---- Device-only crop storage ----

const CROP_DB = 'redpen-crops';
let cropDb: Promise<IDBPDatabase> | null = null;
function crops(): Promise<IDBPDatabase> {
  cropDb ??= openDB(CROP_DB, 1, { upgrade: (d) => { d.createObjectStore('crops'); } });
  return cropDb;
}
const cropKey = (submissionId: string, q: number) => `${submissionId}:${q}`;

export async function saveCrop(submissionId: string, q: number, blob: Blob): Promise<void> {
  await (await crops()).put('crops', blob, cropKey(submissionId, q));
}

export async function loadCrop(submissionId: string, q: number): Promise<Blob | undefined> {
  return (await crops()).get('crops', cropKey(submissionId, q)) as Promise<Blob | undefined>;
}

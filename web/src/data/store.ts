// Persistence. Assignments + marks live in Firestore (offline-first cache, per-teacher security rules).
// Answer-box images stay ONLY on this device in IndexedDB — they are never uploaded to Firebase.
import {
  collection, deleteDoc, deleteField, getDocs, doc, getDoc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { openDB, type IDBPDatabase } from 'idb';
import { auth, db } from '../firebase/app';
import type { Mark, MarkingScheme, Question } from '../domain/types';
import { countNewHints, mergeHints, type ReadingHint } from '../marking/learning';
import { friendlyCloudError } from '../ai/errors';

export interface Assignment {
  id: string;
  ownerUid: string;
  title: string;
  className: string;
  scheme: MarkingScheme;
  /** Finished assignments stay saved and viewable, just out of the way. */
  status?: 'active' | 'finished';
  /** Handwriting lessons from the cloud check, fed into later on-device reads (marking/learning.ts). */
  readingHints?: ReadingHint[];
  createdAt?: unknown;
}

export interface Submission {
  id: string;
  assignmentId: string;
  ownerUid: string;
  /** Pupil label typed by the teacher (name or register number). Stays in the teacher's own account. */
  pupil: string;
  marks: Mark[];
  /** Teacher's comment for this pupil; editable any time after marking. */
  comment?: string;
  /** Saved offline on a device without on-device AI: marked automatically when the device is back online. */
  queued?: QueuedCapture;
  /** Capture order (client clock, ms); see createSubmission. */
  order?: number;
  createdAt?: unknown;
}

export interface QueuedCapture { mode: 'sheet' | 'page'; page: number }

export const COMMENT_LIMIT = 1000;
export const PUPIL_LIMIT = 80;

function uid(): string {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Not signed in yet');
  return id;
}

const assignments = () => collection(db, 'assignments');

/**
 * Offline-first writes: Firestore applies them to the local cache instantly, but the returned promise
 * only settles when the SERVER confirms. Awaiting it would freeze marking offline, so we queue the write
 * and surface failures (e.g. rules rejections) through an event instead.
 */
export const WRITE_ERROR_EVENT = 'redpen:write-error';
export function queueWrite(write: Promise<unknown>, what: string): void {
  write.catch((error: unknown) => {
    console.error(`[redpen] write failed: ${what}`, error);
    window.dispatchEvent(new CustomEvent(WRITE_ERROR_EVENT, { detail: `Could not save ${what}: ${friendlyCloudError(error).message}` }));
  });
}
const submissions = (assignmentId: string) => collection(db, 'assignments', assignmentId, 'submissions');

export async function createAssignment(input: Omit<Assignment, 'id' | 'ownerUid' | 'createdAt'>): Promise<string> {
  const ref = doc(assignments());
  queueWrite(setDoc(ref, { ...input, ownerUid: uid(), createdAt: serverTimestamp() }), 'the assignment');
  return ref.id;
}

export function watchAssignments(onChange: (items: Assignment[]) => void, onError: (e: Error) => void): Unsubscribe {
  const q = query(assignments(), where('ownerUid', '==', uid()), orderBy('createdAt', 'desc'));
  return resilientSnapshot((fail) => onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment)), fail), onError);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(db, 'assignments', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Assignment) : null;
}

const RESUBSCRIBE_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

/**
 * onSnapshot that survives transient denials: a listener can reach the server before a doc we just
 * created there (writes are queued for offline use), and Firestore then ends the listener. Retry a few
 * times with backoff before reporting the error.
 */
function resilientSnapshot(subscribe: (onError: (e: Error) => void) => Unsubscribe, onError: (e: Error) => void): Unsubscribe {
  let stop: Unsubscribe = () => {};
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const start = () => {
    stop = subscribe((error) => {
      if (closed) return;
      const delay = RESUBSCRIBE_DELAYS_MS[attempt++];
      if (delay === undefined) { onError(friendlyCloudError(error)); return; }
      timer = setTimeout(start, delay);
    });
  };
  start();
  return () => { closed = true; clearTimeout(timer); stop(); };
}

export function watchAssignment(id: string, onChange: (a: Assignment | null) => void, onError: (e: Error) => void): Unsubscribe {
  return resilientSnapshot((fail) => onSnapshot(doc(db, 'assignments', id),
    (snap) => { if (snap.exists()) onChange({ id: snap.id, ...snap.data() } as Assignment); else if (!snap.metadata.fromCache || !navigator.onLine) onChange(null); }, fail), onError);
}

/** Replaces one question in the scheme (used when a teacher adds an accepted answer). */
export async function updateQuestion(assignment: Assignment, updated: Question): Promise<void> {
  const questions = assignment.scheme.questions.map((q) => (q.q === updated.q ? updated : q));
  queueWrite(updateDoc(doc(db, 'assignments', assignment.id), { 'scheme.questions': questions }), 'the edited question');
}

/** Saves what the cloud check taught the device about this class's handwriting ([] forgets it). */
/**
 * Merges freshly learned device misreads into the assignment's newest saved ones (in a transaction, so ones saved meanwhile
 * by another tab or device are kept). Resolves to how many confusions were new. Only runs online (after a cloud check).
 */
export async function addReadingHints(assignmentId: string, fresh: ReadingHint[]): Promise<number> {
  const ref = doc(db, 'assignments', assignmentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const existing = (snap.data()?.readingHints ?? []) as ReadingHint[];
    tx.update(ref, { readingHints: mergeHints(existing, fresh) });
    return countNewHints(existing, fresh);
  });
}

/** Replaces the known misreads (the teacher's "Forget these"). */
export function saveReadingHints(assignmentId: string, hints: ReadingHint[]): void {
  queueWrite(updateDoc(doc(db, 'assignments', assignmentId), { readingHints: hints }), 'what REDPEN learned');
}

export function setAssignmentStatus(id: string, status: 'active' | 'finished'): void {
  queueWrite(updateDoc(doc(db, 'assignments', id), { status }), 'the assignment status');
}

/** Permanently deletes an assignment, all its pupils' marks, and this device's crop images for it. */
export async function deleteAssignment(id: string): Promise<void> {
  const subs = await getDocs(query(submissions(id), where('ownerUid', '==', uid())));
  const db2 = await crops();
  for (const s of subs.docs) {
    const keys = (await db2.getAllKeys('crops')).filter((k) => String(k).startsWith(`${s.id}:`));
    await Promise.all(keys.map((k) => db2.delete('crops', k)));
    queueWrite(deleteDoc(s.ref), 'the student'); // not awaited: deletes must not freeze offline
  }
  queueWrite(deleteDoc(doc(db, 'assignments', id)), 'the assignment');
}

export async function saveScheme(assignmentId: string, scheme: MarkingScheme): Promise<void> {
  queueWrite(updateDoc(doc(db, 'assignments', assignmentId), { scheme }), 'the marking scheme');
}

/** A fresh student-record id, so device-only images can be saved before the record itself is written. */
export function newSubmissionId(assignmentId: string): string { return doc(submissions(assignmentId)).id; }

/**
 * [order] fixes where the student appears in lists: the photo order of a batch (server timestamps of writes made in
 * the same moment can land in any order). Defaults to now.
 */
export async function createSubmission(assignmentId: string, pupil: string, marks: Mark[], queued?: QueuedCapture, id?: string, order = Date.now()): Promise<string> {
  const ref = id ? doc(submissions(assignmentId), id) : doc(submissions(assignmentId));
  const name = pupil.trim().slice(0, PUPIL_LIMIT) || 'Student';
  queueWrite(setDoc(ref, { assignmentId, ownerUid: uid(), pupil: name, marks, order, createdAt: serverTimestamp(), ...(queued ? { queued } : {}) }), 'the student');
  return ref.id;
}

/** Removes a student record that never got marks (e.g. the photo had no corner squares) and its device images. */
export async function deleteSubmission(assignmentId: string, submissionId: string): Promise<void> {
  const db2 = await crops();
  const keys = (await db2.getAllKeys('crops')).filter((k) => String(k).startsWith(`${submissionId}:`));
  await Promise.all(keys.map((k) => db2.delete('crops', k)));
  queueWrite(deleteDoc(doc(db, 'assignments', assignmentId, 'submissions', submissionId)), 'the student');
}

/** A queued student has now been marked: store the marks and take them off the waiting list. */
export function finishQueued(assignmentId: string, submissionId: string, marks: Mark[]): void {
  queueWrite(updateDoc(doc(db, 'assignments', assignmentId, 'submissions', submissionId), { marks, queued: deleteField() }), 'the marks');
}

export async function saveMarks(assignmentId: string, submissionId: string, marks: Mark[]): Promise<void> {
  queueWrite(updateDoc(doc(db, 'assignments', assignmentId, 'submissions', submissionId), { marks }), 'the marks');
}

/** Edits a pupil's record after marking: rename the pupil or add the teacher's comment. */
export function updateSubmission(assignmentId: string, submissionId: string, patch: { pupil?: string; comment?: string }): void {
  const clean: Record<string, string> = {};
  if (patch.pupil !== undefined) clean.pupil = patch.pupil.trim().slice(0, PUPIL_LIMIT) || 'Pupil';
  if (patch.comment !== undefined) clean.comment = patch.comment.trim().slice(0, COMMENT_LIMIT);
  if (!Object.keys(clean).length) return;
  queueWrite(updateDoc(doc(db, 'assignments', assignmentId, 'submissions', submissionId), clean), patch.comment !== undefined ? 'the comment' : 'the pupil name');
}

export function watchSubmissions(assignmentId: string, onChange: (items: Submission[]) => void, onError: (e: Error) => void): Unsubscribe {
  const q = query(submissions(assignmentId), where('ownerUid', '==', uid()), orderBy('createdAt', 'asc'));
  return resilientSnapshot((fail) => onSnapshot(q, (snap) => onChange(inCaptureOrder(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Submission))), fail), onError);
}

/** Students in the order their photos were taken (records saved before [order] existed keep their place, first). */
export function inCaptureOrder(items: Submission[]): Submission[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ---- Device-only crop storage ----

/** Device-only key for a whole exercise-book page photo (q = 0). */
export const PAGE_KEY = 0;
/** Device-only key for the generated marked copy of the pupil's work (q = -1). */
export const MARKED_KEY = -1;
/** Device-only key for the original photo of a student waiting to be marked (offline queue). */
export const PHOTO_KEY = -2;

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

export async function deleteCrop(submissionId: string, q: number): Promise<void> {
  await (await crops()).delete('crops', cropKey(submissionId, q));
}

export async function loadCrop(submissionId: string, q: number): Promise<Blob | undefined> {
  return (await crops()).get('crops', cropKey(submissionId, q)) as Promise<Blob | undefined>;
}

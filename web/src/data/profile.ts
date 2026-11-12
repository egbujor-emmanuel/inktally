// The teacher's institution details: printed on answer sheets, marked copies, the register and the Excel file.
// Works for any institution that marks against a guide: school, college, university, training centre, tutor.
import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/app';
import { queueWrite } from './store';

export interface Profile {
  /** e.g. "Greenfield College" or "Faculty of Science, University of Lagos". */
  institution: string;
  /** Address, contact, term or session: whatever the teacher wants under the name. */
  details: string;
  /** Teacher / examiner name shown next to comments. */
  teacher: string;
}

export const PROFILE_LIMITS: Readonly<Record<keyof Profile, number>> = { institution: 120, details: 240, teacher: 80 };
export const EMPTY_PROFILE: Profile = { institution: '', details: '', teacher: '' };

export function cleanProfile(input: Partial<Profile>): Profile {
  const clip = (key: keyof Profile) => (input[key] ?? '').replace(/\s+/g, ' ').trim().slice(0, PROFILE_LIMITS[key]);
  return { institution: clip('institution'), details: clip('details'), teacher: clip('teacher') };
}

const profileRef = (uid: string) => doc(db, 'users', uid, 'settings', 'profile');

let cached: Profile = EMPTY_PROFILE;

/** Live profile for the signed-in teacher (offline cache first, so it works without a signal). */
export function useProfile(): Profile {
  const [profile, setProfile] = useState<Profile>(cached);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(profileRef(uid), (snap) => {
      cached = snap.exists() ? cleanProfile(snap.data() as Partial<Profile>) : EMPTY_PROFILE;
      setProfile(cached);
    }, () => { /* no profile yet is fine: everything renders without it */ });
  }, []);
  return profile;
}

export function saveProfile(input: Partial<Profile>): Profile {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in yet');
  const profile = cleanProfile(input);
  cached = profile;
  queueWrite(setDoc(profileRef(uid), { ...profile, updatedAt: serverTimestamp() }), 'your school details');
  return profile;
}

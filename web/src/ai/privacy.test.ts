// Private mode: pupils' work never reaches a cloud AI. The network guard is tested on its own (it holds even when the
// SDK falls back to the cloud by itself); the model layer and the cloud check are tested in privacyRouting.test.ts.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { blocksCloudRequest, installPrivacyGuard, isPrivate, PrivateModeError, setPrivate, TEACHER_MATERIAL } from './privacy';

const AI = 'https://firebasevertexai.googleapis.com/v1beta/projects/redpen-hybrid/models/gemini-3.5-flash-lite:generateContent';
const pupilRead = JSON.stringify({ contents: [{ parts: [{ text: 'Transcribe exactly what is handwritten' }, { inlineData: { data: 'iVBOR', mimeType: 'image/png' } }] }] });
const teacherDraft = JSON.stringify({ contents: [{ parts: [{ text: `Marking scheme. ${TEACHER_MATERIAL}` }] }] });

afterEach(() => setPrivate(false));

describe('Private mode keeps pupils’ work off every cloud AI', () => {
  test('off by default; when off, nothing is blocked', () => {
    expect(isPrivate()).toBe(false);
    expect(blocksCloudRequest(AI, pupilRead)).toBe(false);
  });
  test('on: a read of a pupil’s answer is refused; the teacher’s own guide may still draft a key', () => {
    setPrivate(true);
    expect(blocksCloudRequest(AI, pupilRead)).toBe(true);
    expect(blocksCloudRequest(AI, null)).toBe(true);
    expect(blocksCloudRequest(AI, teacherDraft)).toBe(false);
  });
  test('every Gemini endpoint is covered; the teacher’s own database is not an AI', () => {
    setPrivate(true);
    for (const host of ['generativelanguage.googleapis.com', 'us-central1-aiplatform.googleapis.com', 'firebasevertexai.googleapis.com']) {
      expect(blocksCloudRequest(`https://${host}/v1/models/x:generateContent`, pupilRead)).toBe(true);
    }
    expect(blocksCloudRequest('https://firestore.googleapis.com/google.firestore.v1.Firestore/Write', pupilRead)).toBe(false);
  });
  test('the guard refuses before anything is sent, whether the body is a string or a Request', async () => {
    const sent = vi.fn(async () => new Response('{}'));
    const target = { fetch: sent as unknown as typeof fetch };
    installPrivacyGuard(target);
    setPrivate(true);
    await expect(target.fetch(AI, { method: 'POST', body: pupilRead })).rejects.toBeInstanceOf(PrivateModeError);
    await expect(target.fetch(new Request(AI, { method: 'POST', body: pupilRead }))).rejects.toBeInstanceOf(PrivateModeError);
    expect(sent).not.toHaveBeenCalled();
    await target.fetch(AI, { method: 'POST', body: teacherDraft });
    expect(sent).toHaveBeenCalledTimes(1);
  });
  test('switching it off lets the cloud check work again', async () => {
    const sent = vi.fn(async () => new Response('{}'));
    const target = { fetch: sent as unknown as typeof fetch };
    installPrivacyGuard(target);
    setPrivate(true);
    setPrivate(false);
    await target.fetch(AI, { method: 'POST', body: pupilRead });
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

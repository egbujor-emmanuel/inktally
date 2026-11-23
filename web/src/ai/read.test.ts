// The on-device reader must never see the question or the answer key: shown the question, Gemini Nano "corrected"
// a student's 23 into 24 (bench/evidence/nano-whole-page-probe-2026-11-12). This pins what a read request contains.
import { describe, expect, test, vi } from 'vitest';

const sent: unknown[] = [];
vi.mock('../firebase/app', () => ({ ai: {}, remoteConfig: {}, db: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), increment: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(() => Promise.resolve()) }));
vi.mock('firebase/remote-config', async () => {
  const { REMOTE_DEFAULTS } = await import('./config');
  return { getValue: (_rc: unknown, key: string) => ({ asString: () => String((REMOTE_DEFAULTS as Record<string, unknown>)[key] ?? '') }) };
});
vi.mock('firebase/ai', async (orig) => {
  const real = await orig<typeof import('firebase/ai')>();
  return {
    ...real,
    getGenerativeModel: () => ({
      generateContent: (request: unknown) => {
        sent.push(request);
        return Promise.resolve({ response: { text: () => '{"text":"15 + 9 = 23"}', inferenceSource: 'on_device' } });
      },
    }),
  };
});

const { readAnswer } = await import('./read');

describe('what the on-device reader is given', () => {
  test('only the read instruction and the cut-out answer box: no question, no answer key', async () => {
    const crop = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const result = await readAnswer(crop, 'numeric');
    expect(result).toMatchObject({ text: '15 + 9 = 23', source: 'on_device' });
    const request = sent[0] as unknown[];
    expect(request).toHaveLength(2);
    const [prompt, image] = request as [string, { inlineData: { mimeType: string } }];
    expect(typeof prompt).toBe('string');
    expect(prompt).toMatch(/Transcribe exactly what is handwritten/);
    expect(prompt).not.toMatch(/\b24\b|correct answer|marking scheme|expected/i);
    expect(image.inlineData.mimeType).toBe('image/png');
  });
});

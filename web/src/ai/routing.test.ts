// Quota-aware routing across cloud models, per-request error attribution, bounded retries,
// and the batch read falling back when the model leaves an answer out. Firebase is replaced with a fake.
import { beforeEach, describe, expect, test, vi } from 'vitest';

const CONFIG: Record<string, string> = {
  cloud_read_model: 'model-a', cloud_fallback_models: 'model-b,model-c', cloud_author_model: 'model-a',
  read_mode: 'ONLY_IN_CLOUD', read_thinking: 'MINIMAL', author_thinking: 'LOW', batch_cloud_reads: 'true',
  prompt_read_batch: 'Read {count} boxes', prompt_points_batch: '{answer} {points} {reject}',
};
/** Behaviour of the fake cloud per model name. */
let behaviour: Record<string, () => Promise<unknown>> = {};
const calls: string[] = [];

vi.mock('../firebase/app', () => ({ ai: {}, remoteConfig: {}, db: {}, auth: {} }));
vi.mock('firebase/remote-config', () => ({ getValue: (_rc: unknown, key: string) => ({ asString: () => CONFIG[key] ?? '' }) }));
vi.mock('firebase/ai', async (orig) => {
  const real = await orig<typeof import('firebase/ai')>();
  return {
    ...real,
    getGenerativeModel: (_ai: unknown, params: { inCloudParams?: { model: string } }) => {
      const name = params.inCloudParams?.model ?? 'none';
      return { generateContent: () => { calls.push(name); return (behaviour[name] ?? (() => Promise.reject(new Error('no behaviour'))))(); } };
    },
  };
});

const models = await import('./models');
const { withRetry } = await import('./retry');
const reply = (text: string) => () => Promise.resolve({ response: { text: () => text, inferenceSource: 'in_cloud' } });
const quota = (daily = false) => () => Promise.reject(new Error(`[429] RESOURCE_EXHAUSTED quota exceeded${daily ? ' GenerateRequestsPerDay' : ''}`));

beforeEach(() => { behaviour = {}; calls.length = 0; models.resetModelRouting(); vi.useRealTimers(); });

describe('when every model is out of quota or failing (the 23 Nov loop)', () => {
  test('drafting stops with the quota message instead of retrying forever', async () => {
    const overloaded = () => Promise.reject(new Error('[500] Internal error encountered'));
    behaviour = { 'model-a': overloaded, 'model-b': quota(true), 'model-c': quota(true) };
    await expect(models.authorGenerate({} as never, 'x')).rejects.toThrow(/quota|overloaded|too long/i);
    expect(calls.length).toBeLessThan(20);
  }, 60_000);

  test('a quota error on a model already used up does not switch again', async () => {
    behaviour = { 'model-b': quota(true), 'model-c': quota(true) };
    await expect(withRetry(() => models.authorModel({} as never, 'model-b').generateContent('x'))).rejects.toThrow(/429/);
    await expect(withRetry(() => models.authorModel({} as never, 'model-b').generateContent('x'))).rejects.toThrow(/429/);
    expect(calls.length).toBeLessThan(10);
  });
});

describe('quota-aware model routing', () => {
  test('a quota error on the primary model switches to the first fallback at once', async () => {
    behaviour = { 'model-a': quota(), 'model-b': reply('ok') };
    const r = await withRetry(() => models.authorModel({} as never).generateContent('x'));
    expect(r.response.text()).toBe('ok');
    expect(calls).toEqual(['model-a', 'model-b']);
    expect(models.activeCloudModel()).toBe('model-b');
  });

  test('a rate limit expires after a minute; a daily quota lasts for hours', async () => {
    vi.useFakeTimers();
    behaviour = { 'model-a': quota(false), 'model-b': reply('ok') };
    await withRetry(() => models.authorModel({} as never).generateContent('x'));
    vi.advanceTimersByTime(61_000);
    expect(models.activeCloudModel()).toBe('model-a');

    behaviour = { 'model-a': quota(true), 'model-b': reply('ok') };
    await withRetry(() => models.authorModel({} as never).generateContent('x'));
    vi.advanceTimersByTime(6 * 3_600_000);
    expect(models.activeCloudModel()).toBe('model-b');
  });

  test('when every model is out of quota the error surfaces instead of looping forever', async () => {
    behaviour = { 'model-a': quota(true), 'model-b': quota(true), 'model-c': quota(true) };
    await expect(withRetry(() => models.authorModel({} as never).generateContent('x'))).rejects.toThrow(/quota/);
    expect(calls).toEqual(['model-a', 'model-b', 'model-c']);
  });

  test('errors are attributed per request: a failure on one model never marks another as exhausted', async () => {
    behaviour = { 'model-a': reply('ok') };
    const healthy = models.authorModel({} as never); // built while model-a is active
    behaviour['model-a'] = quota();
    const err = await healthy.generateContent('x').catch((e: unknown) => e);
    expect(models.failedModel(err)).toBe('model-a');
    expect(models.handleModelError(new Error('[429] quota'))).toBe(false); // unattributed error: no switch
    expect(models.activeCloudModel()).toBe('model-a');
  });

  test('a model that rejects the thinking level is retried without it', async () => {
    let attempts = 0;
    behaviour = { 'model-a': () => (++attempts === 1 ? Promise.reject(new Error('thinking level MINIMAL is not supported')) : reply('ok')()) };
    const r = await withRetry(() => models.readerModel({} as never).generateContent('x'));
    expect(r.response.text()).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('non-transient errors (App Check, permission) are not retried', async () => {
    behaviour = { 'model-a': () => Promise.reject(new Error('AppCheck token is invalid')) };
    await expect(withRetry(() => models.readerModel({} as never).generateContent('x'))).rejects.toThrow(/AppCheck/);
    expect(calls).toEqual(['model-a']);
  });
});

describe('batched cloud reads', () => {
  test('a missing answer in the batch reply throws, so the caller falls back to one-by-one reads', async () => {
    behaviour = { 'model-a': reply(JSON.stringify({ answers: [{ q: 1, text: '56' }] })) };
    const { markAnswersBatch } = await import('../marking/markAnswer');
    const questions = [
      { q: 1, type: 'numeric' as const, prompt: '', max: 1, accept: [56] },
      { q: 2, type: 'numeric' as const, prompt: '', max: 1, accept: [12] },
    ];
    const blob = new Blob(['x'], { type: 'image/png' });
    await expect(markAnswersBatch(questions, [{ q: 1, type: 'numeric', blob }, { q: 2, type: 'numeric', blob }])).rejects.toThrow(/did not return answer 2/);
  });

  test('a complete batch reply is marked by code, one request for the whole sheet', async () => {
    behaviour = { 'model-a': reply(JSON.stringify({ answers: [{ q: 1, text: '56' }, { q: 2, text: '13' }] })) };
    const { markAnswersBatch } = await import('../marking/markAnswer');
    const questions = [
      { q: 1, type: 'numeric' as const, prompt: '', max: 1, accept: [56] },
      { q: 2, type: 'numeric' as const, prompt: '', max: 1, accept: [12] },
    ];
    const blob = new Blob(['x'], { type: 'image/png' });
    const marks = await markAnswersBatch(questions, [{ q: 1, type: 'numeric', blob }, { q: 2, type: 'numeric', blob }]);
    expect(marks.map((m) => m.awarded)).toEqual([1, 0]);
    expect(calls).toEqual(['model-a']);
  });
});

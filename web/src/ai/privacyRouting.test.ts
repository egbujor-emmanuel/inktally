// Private mode in the model layer: every reading and marking-point check asks for on-device inference only, the cloud
// check does nothing, and only a draft built from the teacher's own material carries the tag the network guard lets
// through. Firebase is replaced with a fake that records what each model was asked for.
import { afterEach, describe, expect, test, vi } from 'vitest';

const asked: { mode?: string; text: string }[] = [];
vi.mock('../firebase/app', () => ({ ai: {}, remoteConfig: {}, db: {}, auth: {} }));
vi.mock('firebase/remote-config', () => ({ getValue: (_rc: unknown, key: string) => ({ asString: () => (key === 'read_mode' ? 'PREFER_ON_DEVICE' : key === 'cloud_read_model' || key === 'cloud_author_model' ? 'model-a' : '') }) }));
vi.mock('firebase/ai', async (orig) => {
  const real = await orig<typeof import('firebase/ai')>();
  return {
    ...real,
    getGenerativeModel: (_ai: unknown, params: { mode?: string }) => ({
      generateContent: (request: unknown) => {
        asked.push({ mode: params.mode, text: JSON.stringify(request) });
        return Promise.resolve({ response: { text: () => '{"questions":[{"q":1,"type":"objective","prompt":"Q1","max":1,"correctOptions":["B"]}],"questionCount":1}', inferenceSource: 'on_device' } });
      },
    }),
  };
});

const { InferenceMode } = await import('firebase/ai');
const models = await import('./models');
const { setPrivate, TEACHER_MATERIAL } = await import('./privacy');
const { cloudCheck } = await import('../marking/cloudCheck');
const { draftScheme } = await import('./scheme');

afterEach(() => { setPrivate(false); asked.length = 0; });

describe('Private mode in the model layer', () => {
  test('reading and marking-point checks ask for on-device inference only', async () => {
    setPrivate(true);
    await models.readerModel({} as never).generateContent('read');
    await models.judgeModel({} as never).generateContent('judge');
    await models.readerModel({} as never, InferenceMode.PREFER_IN_CLOUD).generateContent('read');
    expect(asked.map((a) => a.mode)).toEqual([InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE]);
    expect(models.cloudWillRead()).toBe(false);
  });
  test('with Private mode off the usual hybrid routing returns', async () => {
    await models.readerModel({} as never).generateContent('read');
    expect(asked[0].mode).not.toBe(InferenceMode.ONLY_ON_DEVICE);
  });
  test('the cloud check does nothing: no request is made', async () => {
    setPrivate(true);
    const submission = { id: 's1', pupil: 'A', marks: [{ q: 1, max: 1, read: 'B', readSource: 'on_device', awarded: 1, engine: 'code', status: 'provisional', reasons: [] }] };
    const result = await cloudCheck({ id: 'a1', scheme: { questions: [] } } as never, [submission] as never, { latest: () => [submission] as never });
    expect(result).toEqual({ checked: 0, confirmed: 0, needTeacher: 0 });
    expect(asked).toEqual([]);
  });
  test('a key drafted from the teacher’s own guide is tagged; a key drafted from a pupil’s page never is', async () => {
    await draftScheme({ guideText: '1. B' }, 'Physics', 'SS 2');
    expect(asked.at(-1)?.text).toContain(TEACHER_MATERIAL);
    await draftScheme({ images: [new Blob(['x'], { type: 'image/png' })], isPupilPage: true }, 'Physics', 'SS 2');
    expect(asked.at(-1)?.text).not.toContain(TEACHER_MATERIAL);
  });
});

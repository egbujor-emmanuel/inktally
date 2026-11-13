// Runs the on-device Gemini Nano proof test (OnDeviceNanoTest) on real phones in Firebase Test Lab and prints
// each device's REDPEN_NANO log lines. Usage: node testlab.mjs <app.apk> <androidTest.apk> [modelId:api ...]
// Auth: the Firebase CLI's login (no service-account key needed). Uses the project's free Test Lab quota.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const PROJECT = 'redpen-hybrid';
const BUCKET = 'test-lab-zy3a6t84s56tk-w7wmcky47kvik';
const [appApk, testApk, ...deviceArgs] = process.argv.slice(2);
const devices = (deviceArgs.length ? deviceArgs : ['blazer:36', 'pa1q:36']).map((d) => { const [m, v] = d.split(':'); return { androidModelId: m, androidVersionId: v, locale: 'en', orientation: 'portrait' }; });
const token = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8')).tokens.access_token;
const H = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT };
const run = `redpen/${new Date().toISOString().replace(/[:.]/g, '-')}`;

async function upload(file) {
  const name = `${run}/${basename(file)}`;
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { ...H, 'Content-Type': 'application/vnd.android.package-archive' }, body: readFileSync(file) });
  if (!r.ok) throw new Error(`upload ${file}: ${r.status} ${await r.text()}`);
  return `gs://${BUCKET}/${name}`;
}

const appPath = await upload(appApk);
const testPath = await upload(testApk);
console.log('uploaded', appPath, testPath);
const create = await fetch(`https://testing.googleapis.com/v1/projects/${PROJECT}/testMatrices`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    testSpecification: {
      androidInstrumentationTest: { appApk: { gcsPath: appPath }, testApk: { gcsPath: testPath }, testRunnerClass: 'androidx.test.runner.AndroidJUnitRunner' },
      testTimeout: '2700s', disableVideoRecording: false, disablePerformanceMetrics: true,
    },
    environmentMatrix: { androidDeviceList: { androidDevices: devices } },
    resultStorage: { googleCloudStorage: { gcsPath: `gs://${BUCKET}/${run}/results` } },
  }),
});
const matrix = await create.json();
if (!create.ok) { console.log('create failed', JSON.stringify(matrix, null, 1)); process.exit(1); }
console.log('matrix', matrix.testMatrixId, 'devices', devices.map((d) => d.androidModelId).join(', '));

let m = matrix;
while (!['FINISHED', 'ERROR', 'INVALID'].includes(m.state)) {
  await new Promise((r) => setTimeout(r, 30_000));
  m = await (await fetch(`https://testing.googleapis.com/v1/projects/${PROJECT}/testMatrices/${matrix.testMatrixId}`, { headers: H })).json();
  console.log(new Date().toISOString().slice(11, 19), m.state, (m.testExecutions ?? []).map((e) => `${e.environment.androidDevice.androidModelId}:${e.state}`).join(' '));
}
console.log('outcome', m.outcomeSummary, m.invalidMatrixDetails ?? '');
const list = await (await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(`${run}/results`)}`, { headers: H })).json();
for (const o of list.items ?? []) {
  if (!/logcat$/.test(o.name)) continue;
  const text = await (await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(o.name)}?alt=media`, { headers: H })).text();
  console.log(`\n=== ${o.name}`);
  text.split('\n').filter((l) => l.includes('REDPEN_NANO')).forEach((l) => console.log(l.replace(/^.*REDPEN_NANO\s*:?\s*/, '')));
}
const videos = (list.items ?? []).filter((o) => /\.mp4$/.test(o.name)).map((o) => o.name);
console.log('\nvideos:', videos);
console.log('results: https://console.firebase.google.com/project/redpen-hybrid/testlab/histories');

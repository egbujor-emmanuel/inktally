// Guards the hosting Content-Security-Policy against breaking on-device AI.
// Firebase AI Logic hands images to Gemini Nano via fetch(`data:<mime>;base64,...`) (ChromeAdapterImpl), so connect-src
// must allow data:. A CSP without it made every on-device read fail offline (found on real Nano, 2026-11-14).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

interface HostingSite { target?: string; headers: { source: string; headers: { key: string; value: string }[] }[] }
// Two sites (inktally.web.app and the original address) serve the same build with the same headers.
const sites = [JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8')).hosting].flat() as HostingSite[];
const cspOf = (site: HostingSite) => site.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const csp = cspOf(sites[0]);

test('every site has the same Content-Security-Policy', () => {
  expect(new Set(sites.map(cspOf)).size).toBe(1);
});
const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  test('connect-src allows data: so on-device image reads work', () => {
    expect(directive('connect-src').split(/\s+/)).toContain('data:');
  });

  test('stays strict elsewhere: no unsafe-eval, frames and objects blocked', () => {
    expect(csp).not.toContain('unsafe-eval');
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
  });
});

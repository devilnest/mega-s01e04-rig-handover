import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const night = '2026-10-28';
const temporaryDirectories: string[] = [];

async function makeApp(log?: string) {
  const runsDir = await mkdtemp(path.join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirectories.push(runsDir);
  if (log !== undefined) await writeFile(path.join(runsDir, `${night}.jsonl`), log, 'utf8');

  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

function event(at: string, job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('serves matching HTML and JSON with sorted complete rows and warnings', async () => {
    const log = [
      event('2026-10-28T23:10:00+01:00', 'zeta', 'fail', 'ops', 'disk full'),
      event('2026-10-28T22:00:00+01:00', 'alpha', 'retry', null, 'first attempt'),
      event('2026-10-28T22:01:00+01:00', 'alpha', 'retry', null, 'second attempt'),
      event('2026-10-28T22:02:00+01:00', 'alpha', 'retry', null, 'third attempt'),
      event('2026-10-28T22:03:00+01:00', 'alpha', 'ok', null),
    ].join('\n');
    const app = await makeApp(log);

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const json = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual({
      night,
      rows: [
        {
          job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: 'third attempt',
          firstTime: '2026-10-28T22:00:00+01:00', lastTime: '2026-10-28T22:03:00+01:00',
        },
        {
          job: 'zeta', owner: 'ops', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full',
          firstTime: '2026-10-28T23:10:00+01:00', lastTime: '2026-10-28T23:10:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 3, fail: 1 },
    });
    expect(html).toContain(`<h1>digest · ${night}</h1>`);
    expect(html).toContain('—');
    expect(html).toContain('high retries');
    expect(html).toContain('class="warn">fail</td>');
    expect(html).toContain('class="warn">attention</span>');
    expect(html).toContain('disk full');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('2026-10-28T22:00:00+01:00');
    expect(html).toContain('2026-10-28T23:10:00+01:00');
  });

  it('returns 404 when the night file is missing', async () => {
    const app = await makeApp();

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('keeps the reader order for mixed-case and punctuation job names', async () => {
    const jobs = ['zeta', 'Alpha', '_task', 'alpha'];
    const app = await makeApp(jobs.map((job) => event('2026-10-28T20:00:00+01:00', job, 'ok', null)).join('\n'));
    const json = await (await app.request(`/api/digest/${night}`)).json();
    const html = await (await app.request(`/digest/${night}`)).text();
    expect(json.rows.map((row: { job: string }) => row.job)).toEqual(['Alpha', '_task', 'alpha', 'zeta']);
    const positions = json.rows.map((row: { job: string }) => html.indexOf(`<td>${row.job}</td>`));
    expect(positions.every((position: number) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a: number, b: number) => a - b));
  });

  it('renders an empty night as nothing ran and returns an empty JSON digest', async () => {
    const app = await makeApp('');

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();

    expect(pageResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps valid rows when a log line is malformed and reports the bad line', async () => {
    const log = `${event('2026-10-28T21:00:00+01:00', 'still-readable', 'ok', null)}\n{not json`;
    const app = await makeApp(log);

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const json = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(html).toContain('still-readable');
    expect(html).toContain('1 bad line');
    expect(jsonResponse.status).toBe(200);
    expect(json.badLines).toBe(1);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].job).toBe('still-readable');
    expect(json.rows[0].owner).toBeNull();
  });

  it('escapes user fields in HTML while preserving them in JSON', async () => {
    const job = '<script>alert(1)</script>';
    const owner = '<b>operator</b>';
    const error = '<img src=x onerror=alert(1)>';
    const app = await makeApp(event('2026-10-28T21:00:00+01:00', job, 'fail', owner, error));

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const json = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(html).not.toContain(job);
    expect(html).not.toContain(owner);
    expect(html).not.toContain(error);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;operator&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(jsonResponse.status).toBe(200);
    expect(json.rows[0]).toMatchObject({ job, owner, lastError: error });
  });
});

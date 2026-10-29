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
          job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
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
});

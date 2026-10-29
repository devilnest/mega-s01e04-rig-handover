import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const temporaryDirs: string[] = [];
function runsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  temporaryDirs.push(dir);
  return dir;
}
function writeNight(dir: string, events: unknown[]): void {
  writeFileSync(join(dir, `${night}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'));
}
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real fixture without dropping retries, null owners or earlier errors', () => {
    const result = readNight(fileURLToPath(new URL('../runs/', import.meta.url)), night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
      firstTime: '2026-10-29T05:41:09+01:00', lastTime: '2026-10-29T05:41:09+01:00',
    });
    expect(result?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstTime: '2026-10-29T01:30:00+01:00',
      lastTime: '2026-10-29T01:37:00+01:00',
    });
    expect(result?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(result?.rows[3]).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('counts malformed JSON and invalid fields, but ignores blank lines', () => {
    const dir = runsDir();
    const valid = { at: '2026-10-28T20:00:00+01:00', job: 'job', status: 'ok', owner: null };
    const invalid: unknown[] = [
      null, [], 42, 'text', {},
      { ...valid, at: 42 }, { ...valid, at: 'tomorrow' },
      { ...valid, at: '2026-02-30T20:00:00+01:00' },
      { ...valid, at: '2026-10-28T20:00:00' }, { ...valid, at: '2026-10-28T24:00:00Z' },
      { ...valid, job: null }, { ...valid, job: '  ' },
      { ...valid, status: 'success' }, { ...valid, owner: 2 },
      { at: valid.at, job: valid.job, status: valid.status },
      { ...valid, error: null }, { ...valid, error: {} },
    ];
    const content = [...invalid, valid].map((event) => JSON.stringify(event)).join('\r\n');
    writeFileSync(join(dir, `${night}.jsonl`), `\r\n \t\r\n{invalid\r\n${content}\r\n`);
    expect(readNight(dir, night)).toEqual({
      night, badLines: invalid.length + 1, counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{ job: 'job', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstTime: valid.at, lastTime: valid.at }],
    });
  });

  it('uses actual instants on shuffled input and preserves each timestamp offset', () => {
    const dir = runsDir();
    writeNight(dir, [
      { at: '2026-10-28T23:30:00-02:00', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-29T01:00:00+01:00', job: 'job', status: 'retry', owner: 'middle', error: 'latest error' },
      { at: '2026-10-29T02:00:00+03:00', job: 'job', status: 'fail', owner: 'first', error: 'older error' },
    ]);
    expect(readNight(dir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{ job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
        firstTime: '2026-10-29T02:00:00+03:00', lastTime: '2026-10-28T23:30:00-02:00' }],
    });
  });

  it('breaks equal-instant latest-event and latest-error ties using the later line', () => {
    const dir = runsDir();
    writeNight(dir, [
      { at: '2026-10-28T20:00:00Z', job: 'job', status: 'fail', owner: 'old', error: 'old error' },
      { at: '2026-10-28T21:00:00+01:00', job: 'job', status: 'retry', owner: 'new', error: 'new error' },
      { at: '2026-10-28T22:00:00+02:00', job: 'job', status: 'ok', owner: null },
    ]);
    expect(readNight(dir, night)?.rows[0]).toEqual({
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'new error',
      firstTime: '2026-10-28T20:00:00Z', lastTime: '2026-10-28T22:00:00+02:00',
    });
  });

  it.each(['', '\n \t\r\n'])('returns an empty digest for an empty or blank file (%j)', (content) => {
    const dir = runsDir();
    writeFileSync(join(dir, `${night}.jsonl`), content);
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('returns null for a missing night or missing runs directory', () => {
    const dir = runsDir();
    expect(readNight(dir, night)).toBeNull();
    expect(readNight(join(dir, 'missing'), night)).toBeNull();
  });

  it.each(['../2026-10-28', '..\\2026-10-28', '/2026-10-28', 'C:\\2026-10-28',
    '2026-10-28.jsonl', '2026-10-28/../2026-10-28', '%2e%2e%2f2026-10-28',
    '2026-02-29', '2026-13-01', '2026-10-00', '2026-10-28\0', '2026-10-28\n'])
  ('rejects invalid nights and path traversal (%j)', (invalidNight) => {
    expect(readNight(runsDir(), invalidNight)).toBeNull();
  });

  it('propagates filesystem errors other than missing files', () => {
    const dir = runsDir();
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});

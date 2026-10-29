import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  instant: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value.at)
    || !isNight(value.at.slice(0, 10))) return null;
  const instant = Date.parse(value.at);
  if (!Number.isFinite(instant)) return null;
  if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null;
  if (!('status' in value)
    || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null;
  let error: string | undefined;
  if ('error' in value) {
    if (typeof value.error !== 'string') return null;
    error = value.error;
  }
  return {
    at: value.at, instant, job: value.job, status: value.status, owner: value.owner,
    error,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const jobs = new Map<string, { row: DigestRow; first: number; last: number; errorAt: number }>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (!event) {
      badLines++;
      continue;
    }
    counts[event.status]++;
    let job = jobs.get(event.job);
    if (!job) {
      job = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0,
          lastStatus: event.status, lastError: null, firstTime: event.at, lastTime: event.at,
        },
        first: event.instant, last: event.instant, errorAt: -Infinity,
      };
      jobs.set(event.job, job);
    }
    job.row.runs++;
    if (event.status === 'retry') job.row.retries++;
    if (event.instant < job.first) {
      job.first = event.instant;
      job.row.firstTime = event.at;
    }
    // Ties use the later line for the latest event and latest error.
    if (event.instant >= job.last) {
      job.last = event.instant;
      job.row.lastTime = event.at;
      job.row.lastStatus = event.status;
      job.row.owner = event.owner;
    }
    if (event.error !== undefined && event.instant >= job.errorAt) {
      job.errorAt = event.instant;
      job.row.lastError = event.error;
    }
  }
  const rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines, counts };
};

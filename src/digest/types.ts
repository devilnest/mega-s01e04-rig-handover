// Shared contract: each consumer uses the same parsed night, row order and event counts.
export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

export type DigestCounts = Record<DigestStatus, number>;

export type DigestNight = {
  night: string;
  // Ascending job order, shared by HTML and JSON.
  rows: DigestRow[];
  badLines: number;
  counts: DigestCounts;
};

// readNight(runsDir, night): null means a missing/invalid night; an empty file has rows: [].
// Invalid JSON or invalid event fields increase badLines; original timestamp offsets survive.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;

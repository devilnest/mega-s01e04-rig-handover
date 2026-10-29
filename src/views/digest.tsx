import type { DigestNight, DigestRow } from '../digest/types.js';

function DigestRowView({ row }: { row: DigestRow }) {
  const needsAttention = row.retries >= 3 || row.lastStatus === 'fail';

  return (
    <tr>
      <td>{row.job}</td>
      <td>{row.owner ?? '—'}</td>
      <td>{row.runs}</td>
      <td class={row.retries >= 3 ? 'warn' : undefined}>
        {row.retries}{row.retries >= 3 ? ' · high retries' : ''}
      </td>
      <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
      <td>{row.lastError ?? '—'}</td>
      <td>{row.firstTime}</td>
      <td>{row.lastTime}</td>
      <td>{needsAttention ? <span class="warn">attention</span> : '—'}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  const rows = digest.rows;

  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">{digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'} in the run log</p>
      ) : null}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
              <th>attention</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => <DigestRowView row={row} />)}</tbody>
        </table>
      )}
    </>
  );
}

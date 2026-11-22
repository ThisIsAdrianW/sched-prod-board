import { fetchIncidents, ack } from './api.js';

const POLL_MS = 2000;
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-testid="status"]');
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = document.querySelector('[data-testid="confirm-text"]');
const confirmAck = document.querySelector('[data-testid="confirm-ack"]');
const confirmCancel = document.querySelector('[data-testid="confirm-cancel"]');
let confirming = null; // the incident id the person clicked Ack on, fixed at click time

const byId = new Map(); // id -> incident (merged, so a delta or a full page both work)
const acked = new Set();
const pending = new Set();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// R5: the viewer's own zone and locale (dd/mm for EU locales, mm/dd for en-US).
const fmt = new Intl.DateTimeFormat(navigator.language || undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
});
const localTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
};

function render() {
  const items = [...byId.values()].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  empty.hidden = items.length > 0;
  list.innerHTML = items
    .map((i) => {
      const done = acked.has(i.id);
      return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
        <span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        ${
          done
            ? '<span data-testid="acked" class="acked">acked</span>'
            : `<button type="button" data-testid="ack" ${pending.has(i.id) ? 'disabled' : ''}>Ack</button>`
        }
      </li>`;
    })
    .join('');
}

// Ack asks first. The confirm lives outside the list, so a refresh never moves or closes it,
// and it names the incident id that was under the pointer when the person clicked.
function openConfirm(id) {
  const i = byId.get(id);
  confirming = id;
  confirmText.textContent = `Ack ${id}${i ? ' · ' + i.service + ' · ' + i.summary : ''}?`;
  confirmBox.hidden = false;
  confirmAck.focus();
}
function closeConfirm() {
  confirming = null;
  confirmBox.hidden = true;
}

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.closest('[data-testid="incident-row"]').dataset.id;
  if (pending.has(id) || acked.has(id)) return;
  openConfirm(id);
});

confirmCancel.addEventListener('click', closeConfirm);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirming) closeConfirm();
});

confirmAck.addEventListener('click', async () => {
  const id = confirming;
  if (!id) return;
  closeConfirm();
  pending.add(id);
  render();
  try {
    await ack(id);
    acked.add(id);
    status.textContent = '';
  } catch (err) {
    status.textContent = `Ack failed for ${id}: ${err.message}`;
  } finally {
    pending.delete(id);
    render();
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) byId.set(i.id, i);
    status.textContent = '';
    render();
  } catch (err) {
    status.textContent = `Refresh failed: ${err.message}`;
  } finally {
    loader.hidden = true; // R3: gone once the first answer is in (or failed, with the message shown)
  }
}

await refresh();
setInterval(refresh, POLL_MS); // R4

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

// The list is updated in place: a row that is already on the board is never rebuilt or moved, so a new
// incident only adds a row at the top and the row under the pointer keeps its element.
const rowEls = new Map(); // id -> <li>

function makeRow(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.setAttribute('data-testid', 'incident-row');
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  li.innerHTML = `<span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        <span class="act"></span>`;
  return li;
}

function syncAction(li, id) {
  const state = acked.has(id) ? 'acked' : pending.has(id) ? 'pending' : 'idle';
  if (li.dataset.state === state) return;
  li.dataset.state = state;
  const act = li.querySelector('.act');
  act.innerHTML =
    state === 'acked'
      ? '<span data-testid="acked" class="acked">acked</span>'
      : `<button type="button" data-testid="ack" ${state === 'pending' ? 'disabled' : ''}>Ack</button>`;
}

function render() {
  const items = [...byId.values()].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  empty.hidden = items.length > 0;
  items.forEach((i, k) => {
    let li = rowEls.get(i.id);
    if (!li) {
      li = makeRow(i);
      rowEls.set(i.id, li);
    }
    if (list.children[k] !== li) list.insertBefore(li, list.children[k] || null);
    syncAction(li, i.id);
  });
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

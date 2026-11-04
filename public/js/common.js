async function api(url, options = {}) {
  const config = { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options };
  if (options.body) config.body = JSON.stringify(options.body);
  const res = await fetch(url, config);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong.');
    err.errors = data.errors || null;
    throw err;
  }
  return data;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message, type = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.className = 'show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ''), 3000);
}

function showAlert(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = 'alert show alert-' + type;
}

function formatMoney(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// Utilidades compartidas por el sitio, el inicio de sesión y el panel.

export const LOGO = `<path fill="var(--purple)" d="M17 4h14a2 2 0 0 1 2 2v9h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v9a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2v-9H6a2 2 0 0 1-2-2V17a2 2 0 0 1 2-2h9V6a2 2 0 0 1 2-2z"/>
<path fill="#fff" d="M24 35.5c-7-5.6-10.5-9-10.5-12.6a5.4 5.4 0 0 1 10.5-1.8 5.4 5.4 0 0 1 10.5 1.8c0 3.6-3.5 7-10.5 12.6z"/>
<g fill="var(--wine)"><ellipse cx="24" cy="27.6" rx="3.6" ry="3"/><circle cx="19.6" cy="23.6" r="1.5"/><circle cx="22.4" cy="21.4" r="1.5"/><circle cx="25.6" cy="21.4" r="1.5"/><circle cx="28.4" cy="23.6" r="1.5"/></g>`;

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/** Escapa texto para insertarlo en HTML (todo dato que viene de la API pasa por aquí). */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ic = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export function paintLogos(root = document) {
  $$('[data-logo]', root).forEach((s) => { s.innerHTML = LOGO; });
}

/** fetch a la API con JSON; lanza Error con el mensaje del servidor. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'No se pudo completar la acción. Revisa tu conexión.');
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(text, kind = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.innerHTML = `${ic(kind === 'error' ? 'alert' : 'check')}<span></span>`;
  $('span', el).textContent = text;
  el.classList.toggle('toast-error', kind === 'error');
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const dayName = (s) => DIAS[parseYmd(s).getDay()];
export const shortDay = (s) => DIAS_C[parseYmd(s).getDay()];
export const longDate = (s) => { const d = parseYmd(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const longDateYear = (s) => `${longDate(s)} de ${parseYmd(s).getFullYear()}`;
export const formatPhone = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : (t || ''); };
export const initials = (n) => String(n || '').replace(/^MVZ\s+/, '').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

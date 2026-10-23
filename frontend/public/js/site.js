// Sitio informativo (RF-03, RF-04, RF-05) y cliente del asistente (RF-06 a RF-11).
import { $, $$, esc, ic, api, paintLogos } from './common.js';

paintLogos();

// ---------- Información de la clínica ----------
async function loadInfo() {
  try {
    const info = await api('/public/info');
    const groups = [...new Set(info.servicios.map((s) => s.grupo))];
    $('#svc-groups').innerHTML = groups.map((g) => `
      <div class="svc-group"><h3>${esc(g)}</h3>
        ${info.servicios.filter((s) => s.grupo === g).map((s) => `
          <div class="svc"><div class="svc-ic">${ic(esc(s.icono))}</div><div><h4>${esc(s.nombre)}</h4><p>${esc(s.descripcion)}</p></div></div>`).join('')}
      </div>`).join('');
    $('#svc-groups').removeAttribute('aria-busy');

    const byDay = (d) => info.horarios.find((h) => h.dia_semana === d);
    const rango = (h) => (h && h.abierto ? `${h.apertura} a ${h.cierre}` : 'Cerrado');
    const semana = [1, 2, 3, 4, 5].map((d) => rango(byDay(d)));
    const rows = semana.every((r) => r === semana[0])
      ? [['Lunes a viernes', semana[0]]]
      : [1, 2, 3, 4, 5].map((d) => [byDay(d).dia, rango(byDay(d))]);
    rows.push(['Sábado', rango(byDay(6))], ['Domingo', rango(byDay(0))]);
    $('#site-hours').innerHTML = rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
    const lunes = byDay(1);
    $('[data-bind="horario-corto"]').textContent = lunes && lunes.abierto ? `Lun a sáb desde las ${lunes.apertura}` : 'Consulta nuestro horario';
    $('[data-bind="telefono"]').textContent = info.telefono;
    $('[data-bind="direccion"]').textContent = info.direccion;
    if (info.whatsappUrl) $('[data-bind-href="whatsapp"]').href = info.whatsappUrl;
  } catch {
    $('#svc-groups').innerHTML = '<p class="load-error">No pudimos cargar los servicios. Recarga la página en un momento.</p>';
  }
}
loadInfo();

// ---------- Asistente ----------
const chat = $('#chat');
const body = $('#chat-body');
const input = $('#chat-in');
let sessionId = null;
let busy = false;

function scroll() { body.scrollTop = body.scrollHeight; }

function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  m.innerHTML = esc(text).replace(/\n/g, '<br>');
  body.append(m);
  scroll();
}

function clearChoices() { $$('.chips', body).forEach((c) => c.remove()); }

function typing(on) {
  const t = $('.typing', body);
  if (on && !t) {
    const el = document.createElement('div');
    el.className = 'msg bot typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    body.append(el);
    scroll();
  } else if (!on && t) t.remove();
}

async function send(payload, echo) {
  if (busy) return;
  busy = true;
  clearChoices();
  if (echo) addMsg(echo, 'me');
  typing(true);
  try {
    const r = await api('/public/chat', { method: 'POST', body: { sessionId, ...payload } });
    sessionId = r.sessionId;
    typing(false);
    r.messages.forEach((t) => addMsg(t, 'bot'));
    const box = document.createElement('div');
    box.className = 'chips';
    for (const a of r.actions || []) {
      if (a.type === 'whatsapp' && a.url) {
        const link = document.createElement('a');
        link.className = 'btn btn-wa btn-sm';
        link.href = a.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `${ic('wa')}${esc(a.label)}`;
        box.append(link);
      }
    }
    for (const o of r.options || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = o.label;
      b.addEventListener('click', () => send({ optionId: o.id }, o.label));
      box.append(b);
    }
    if (box.children.length) { body.append(box); scroll(); }
    if (r.input) {
      input.placeholder = r.input.placeholder || 'Escribe tu mensaje…';
      input.inputMode = r.input.type === 'tel' ? 'tel' : 'text';
      input.focus();
    } else {
      input.placeholder = 'Escribe tu mensaje…';
      input.inputMode = 'text';
    }
  } catch (err) {
    typing(false);
    const n = document.createElement('div');
    n.className = 'msg note';
    n.textContent = err.message;
    body.append(n);
    scroll();
  } finally {
    busy = false;
  }
}

function openChat(mode) {
  chat.classList.add('open');
  $('#chat-fab').style.display = 'none';
  if (!sessionId) {
    send({}).then(() => {
      if (mode === 'cita') send({ optionId: 'menu:cita' }, 'Agendar una cita');
      if (mode === 'faq') send({ optionId: 'menu:faq' }, 'Preguntas frecuentes');
    });
  } else if (mode === 'cita') send({ optionId: 'menu:cita' }, 'Agendar una cita');
  else if (mode === 'faq') send({ optionId: 'menu:faq' }, 'Preguntas frecuentes');
  setTimeout(() => input.focus(), 50);
}

$$('[data-open-chat]').forEach((b) => b.addEventListener('click', () => openChat(b.dataset.openChat)));
$('#chat-x').addEventListener('click', () => { chat.classList.remove('open'); $('#chat-fab').style.display = ''; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chat.classList.contains('open')) $('#chat-x').click(); });
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  send({ text: v }, v);
});

// Panel administrativo (UC-01, UC-04, UC-05; RF-02, RF-09 a RF-18).
import {
  $, $$, esc, ic, api, toast, paintLogos, ymd, addDays, parseYmd, longDate, longDateYear, shortDay, formatPhone, initials,
} from '../common.js';

paintLogos();

const ESTADO = {
  pendiente: ['Pendiente', 'b-pend'], confirmada: ['Confirmada', 'b-conf'], atendida: ['Atendida', 'b-aten'],
  cancelada: ['Cancelada', 'b-canc'], reprogramada: ['Reprogramada', 'b-repr'],
};
const SOL = {
  nueva: ['Nueva', 'b-new'], urgente: ['Urgente', 'b-urg'], requiere_atencion: ['Requiere atención', 'b-pend'],
  registrada: ['Registrada', 'b-aten'], resuelta: ['Resuelta', 'b-aten'],
};
const badge = (map, k) => `<span class="badge ${(map[k] || ['', ''])[1]}">${esc((map[k] || [k])[0])}</span>`;
const petIc = (e) => (e === 'Ave' ? 'bird' : 'paw');
const TITLES = {
  inicio: 'Inicio', citas: 'Citas', solicitudes: 'Solicitudes del chat', propietarios: 'Propietarios y mascotas',
  horarios: 'Horarios y disponibilidad', contenido: 'Contenido del sitio', usuarios: 'Usuarios y roles',
};
const view = $('#view');
let ME = null;
let SERVICIOS = null;

// ---------- Modal ----------
function openModal(title, bodyHtml, footHtml) {
  $('#modal').innerHTML = `<div class="modal-h"><h2 id="m-title">${esc(title)}</h2><button class="btn-icon" data-close aria-label="Cerrar">${ic('x')}</button></div>
    <div class="modal-b">${bodyHtml}</div>${footHtml ? `<div class="modal-f">${footHtml}</div>` : ''}`;
  $('#scrim').classList.add('on');
  setTimeout(() => { const f = $('#modal input, #modal select, #modal textarea'); (f || $('#modal [data-close]')).focus(); }, 30);
}
const closeModal = () => $('#scrim').classList.remove('on');
$('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
function modalError(text) {
  let a = $('#modal .alert');
  if (!a) { a = document.createElement('div'); a.className = 'alert'; a.setAttribute('role', 'alert'); $('#modal .modal-b').prepend(a); }
  a.innerHTML = `${ic('alert')}<span></span>`;
  $('span', a).textContent = text;
  a.classList.add('on');
}
/** Botón que muestra «Guardando…» mientras corre la acción. */
async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try { await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------- Arranque y navegación ----------
async function boot() {
  try {
    ME = await api('/auth/me');
  } catch {
    location.replace('/login');
    return;
  }
  $('#s-admin').classList.add('on');
  $('#me-name').textContent = ME.nombre;
  $('#me-av').textContent = initials(ME.nombre);
  $('#me-role').textContent = ME.rol === 'admin' ? 'Administrador' : 'Personal operativo';
  $('#me-role').className = `role ${ME.rol === 'admin' ? 'admin' : 'op'}`;
  $$('[data-role="admin"]').forEach((el) => { el.hidden = ME.rol !== 'admin'; });
  $('#today').textContent = longDateYear(ymd());
  window.addEventListener('hashchange', route);
  route();
  refreshCount();
  setInterval(refreshCount, 60000);
}

$('#logout').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.replace('/login');
});

async function refreshCount() {
  try {
    const list = await api('/solicitudes?abiertas=1');
    const n = list.length;
    const el = $('#nav-count');
    el.textContent = n;
    el.hidden = !n;
  } catch { /* sin sesión: lo maneja la vista */ }
}

async function route() {
  let name = (location.hash.replace(/^#\//, '') || 'inicio').split('?')[0];
  if (!TITLES[name]) name = 'inicio';
  if (ME.rol !== 'admin' && (name === 'contenido' || name === 'usuarios')) name = 'inicio';
  $$('.nav-item[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === name));
  $('#v-title').textContent = TITLES[name];
  document.title = `${TITLES[name]} — Vida Animal II`;
  view.innerHTML = '<div class="loading">Cargando…</div>';
  try {
    await VIEWS[name]();
  } catch (err) {
    if (err.status === 401) { location.replace('/login'); return; }
    view.innerHTML = `<div class="empty">${ic('alert')}<h3>No se pudo cargar esta sección</h3><p>${esc(err.message)}</p><button class="btn btn-ghost btn-sm" id="retry">Reintentar</button></div>`;
    $('#retry').onclick = route;
  }
}

async function servicios() {
  if (!SERVICIOS) SERVICIOS = (await api('/public/info')).servicios;
  return SERVICIOS;
}

// =====================================================================
// INICIO
// =====================================================================
async function viewInicio() {
  const r = await api('/resumen');
  const ahora = new Date();
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const toMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const next = r.agenda.find((c) => c.estado !== 'cancelada' && toMin(c.hora) + 30 > ahoraMin);
  view.innerHTML = `
    <div class="kpis">
      <a class="kpi" href="#/citas"><span class="kpi-ic">${ic('cal')}</span><div><b>${r.citasHoy}</b><span>Citas hoy</span></div></a>
      <a class="kpi warn-k" href="#/citas"><span class="kpi-ic">${ic('clock')}</span><div><b>${r.porConfirmar}</b><span>Por confirmar</span></div></a>
      <a class="kpi" href="#/solicitudes"><span class="kpi-ic">${ic('chat')}</span><div><b>${r.solicitudes.citas}</b><span>Citas pedidas por chat</span></div></a>
      <a class="kpi alert-k" href="#/solicitudes"><span class="kpi-ic">${ic('alert')}</span><div><b>${r.solicitudes.canalizaciones}</b><span>Requieren atención</span></div></a>
    </div>
    <div class="dash">
      <div class="panel">
        <div class="panel-h"><h2>Agenda de hoy</h2><div class="sp"><a class="btn btn-ghost btn-sm" href="#/citas">Ver todas las citas</a></div></div>
        ${r.agenda.length ? `<ul class="tl">${r.agenda.map((c) => `
          <li class="${next && c.id === next.id ? 'now' : ''}"><time>${esc(c.hora)}</time>
            <div class="who"><b>${esc(c.mascota)}</b> <span class="src">${ic(petIc(c.especie))}${esc(c.especie)}</span><small>${esc(c.servicio)} con ${esc(c.propietario)}</small></div>
            ${badge(ESTADO, c.estado)}</li>`).join('')}</ul>`
        : `<div class="empty">${ic('cal')}<h3>Sin citas para hoy</h3><p>Las citas que se registren aparecerán aquí.</p></div>`}
      </div>
      <div class="panel">
        <div class="panel-h"><h2>Requieren atención</h2></div>
        ${r.atencion.length ? `<ul class="attn">${r.atencion.map((s) => `
          <li><div class="r1">${s.nombre ? `<b>${esc(s.nombre)}</b>` : `<b>${esc(s.folio)}</b>`}${badge(SOL, s.estado)}</div>
            <p>${esc(s.tema || '')}</p><a class="btn btn-ghost btn-sm" href="#/solicitudes?id=${s.id}">Atender</a></li>`).join('')}</ul>`
        : `<div class="empty">${ic('check')}<h3>Todo al día</h3><p>No hay conversaciones esperando al personal.</p></div>`}
      </div>
    </div>`;
}

// =====================================================================
// CITAS
// =====================================================================
const CV = { fecha: ymd(), st: 'todas', modo: 'lista' };

function weekStart(fecha) {
  const d = parseYmd(fecha);
  const dow = d.getDay() || 7; // lunes = 1
  return addDays(fecha, 1 - dow);
}

async function viewCitas() {
  view.innerHTML = `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Vista">
        <button data-cv="lista" class="${CV.modo === 'lista' ? 'on' : ''}">${ic('list')}Lista</button>
        <button data-cv="semana" class="${CV.modo === 'semana' ? 'on' : ''}">${ic('grid')}Semana</button>
      </div>
      <div class="datenav">
        <button class="btn-icon" data-dn="-1" aria-label="Anterior">${ic('left')}</button>
        <span id="dn-label"></span>
        <button class="btn-icon" data-dn="1" aria-label="Siguiente">${ic('right')}</button>
        <button class="btn btn-ghost btn-sm" id="dn-hoy">Hoy</button>
      </div>
      <div class="seg" id="st-filter">
        ${['todas', 'pendiente', 'confirmada', 'cancelada'].map((s) => `<button data-st="${s}" class="${CV.st === s ? 'on' : ''}">${s === 'todas' ? 'Todas' : `${ESTADO[s][0]}s`}</button>`).join('')}
      </div>
      <div class="tb-r"><button class="btn btn-purple" id="new-appt">${ic('plus')}Nueva cita</button></div>
    </div>
    <div id="cv-body"></div>`;
  $$('[data-cv]').forEach((b) => { b.onclick = () => { CV.modo = b.dataset.cv; viewCitas(); }; });
  $$('[data-dn]').forEach((b) => { b.onclick = () => { CV.fecha = addDays(CV.fecha, Number(b.dataset.dn) * (CV.modo === 'semana' ? 7 : 1)); drawCitas(); }; });
  $('#dn-hoy').onclick = () => { CV.fecha = ymd(); drawCitas(); };
  $$('#st-filter button').forEach((b) => { b.onclick = () => { CV.st = b.dataset.st; $$('#st-filter button').forEach((x) => x.classList.toggle('on', x === b)); drawCitas(); }; });
  $('#new-appt').onclick = () => newAppointmentModal();
  await drawCitas();
}

async function drawCitas() {
  const out = $('#cv-body');
  if (!out) return;
  if (CV.modo === 'lista') {
    $('#dn-label').textContent = longDate(CV.fecha);
    const q = new URLSearchParams({ desde: CV.fecha, hasta: CV.fecha });
    if (CV.st !== 'todas') q.set('estado', CV.st);
    const list = await api(`/citas?${q}`);
    out.innerHTML = `<div class="panel table-wrap"><table class="t">
      <thead><tr><th>Hora</th><th>Mascota</th><th>Servicio</th><th>Propietario</th><th>Origen</th><th>Estado</th><th class="ta-r">Acciones</th></tr></thead>
      <tbody>${list.length ? list.map(rowCita).join('') : `<tr><td colspan="7"><div class="empty">${ic('cal')}<h3>Sin citas en este filtro</h3><p>Cambia el día o el estado, o registra una cita nueva.</p></div></td></tr>`}</tbody></table></div>`;
  } else {
    const ini = weekStart(CV.fecha);
    const dias = [0, 1, 2, 3, 4, 5].map((i) => addDays(ini, i));
    $('#dn-label').textContent = `Semana del ${longDate(ini)}`;
    const [list, h] = await Promise.all([api(`/citas?desde=${dias[0]}&hasta=${dias[5]}`), api('/horarios')]);
    const abiertos = h.dias.filter((d) => d.abierto);
    const toMin = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
    const open = Math.min(...abiertos.map((d) => toMin(d.apertura)), 540);
    const close = Math.max(...abiertos.map((d) => toMin(d.cierre)), 1140);
    const step = h.reglas.duracion_espacio_min;
    const hoy = ymd();
    const visibles = list.filter((c) => CV.st === 'todas' || c.estado === CV.st);
    let g = '<div class="wk-h"></div>' + dias.map((f) => `<div class="wk-h ${f === hoy ? 'today' : ''}">${shortDay(f)}<small>${parseYmd(f).getDate()}</small></div>`).join('');
    for (let m = open; m < close; m += step) {
      const hh = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      g += `<div class="wk-t">${m % 60 === 0 ? hh : ''}</div>`;
      for (const f of dias) {
        const dow = parseYmd(f).getDay();
        const hd = h.dias.find((d) => d.dia_semana === dow);
        const closed = !hd || !hd.abierto || m < toMin(hd.apertura) || m >= toMin(hd.cierre);
        const here = visibles.filter((c) => c.fecha === f && c.hora === hh);
        g += `<div class="wk-c ${closed ? 'closed' : ''}">${here.map((c) => `<button class="ev ${ESTADO[c.estado][1]}" data-a="ver" data-id="${c.id}" style="height:${Math.max(1, Math.ceil(c.duracion_min / step)) * 52 - 6}px"><b>${esc(c.hora)} ${esc(c.mascota)}</b>${esc(c.servicio)}</button>`).join('')}</div>`;
      }
    }
    out.innerHTML = `<div class="week">${g}</div>`;
  }
  $$('[data-a]', out).forEach((b) => { b.onclick = () => citaAction(b.dataset.a, Number(b.dataset.id)); });
}

function rowCita(c) {
  const done = c.estado === 'atendida' || c.estado === 'cancelada';
  return `<tr class="${c.estado === 'cancelada' ? 'cx' : ''}">
    <td class="num">${esc(c.hora)}</td>
    <td><b>${esc(c.mascota)}</b> <span class="src">${ic(petIc(c.especie))}${esc(c.especie)}</span></td>
    <td>${esc(c.servicio)}</td>
    <td>${esc(c.propietario)}<br><span class="src">${esc(formatPhone(c.telefono))}</span></td>
    <td><span class="src">${ic(c.origen === 'chat' ? 'chat' : 'user')}${c.origen === 'chat' ? 'Asistente' : 'Personal'}</span></td>
    <td>${badge(ESTADO, c.estado)}</td>
    <td><div class="acts">
      ${c.estado === 'pendiente' ? `<button class="btn btn-ghost btn-sm" data-a="confirmar" data-id="${c.id}">Confirmar</button>` : ''}
      ${['confirmada', 'reprogramada'].includes(c.estado) ? `<button class="btn btn-ghost btn-sm" data-a="atendida" data-id="${c.id}">Atendida</button>` : ''}
      ${done ? '' : `<button class="btn-icon" title="Reprogramar" aria-label="Reprogramar" data-a="reprogramar" data-id="${c.id}">${ic('edit')}</button>
      <button class="btn-icon" title="Cancelar" aria-label="Cancelar" data-a="cancelar" data-id="${c.id}">${ic('x')}</button>`}
    </div></td></tr>`;
}

async function citaAction(a, id) {
  try {
    if (a === 'confirmar' || a === 'atendida') {
      const estado = a === 'confirmar' ? 'confirmada' : 'atendida';
      const c = await api(`/citas/${id}/estado`, { method: 'PATCH', body: { estado } });
      toast(`Cita de ${c.mascota} ${estado === 'confirmada' ? 'confirmada' : 'marcada como atendida'}`);
      drawCitas();
      refreshCount();
      return;
    }
    const c = await api(`/citas/${id}`);
    if (a === 'cancelar') cancelModal(c);
    else if (a === 'reprogramar') rescheduleModal(c);
    else if (a === 'ver') {
      if (['cancelada', 'atendida'].includes(c.estado)) toast(`${c.mascota}: cita ${ESTADO[c.estado][0].toLowerCase()}`);
      else rescheduleModal(c);
    }
  } catch (err) { toast(err.message, 'error'); }
}

const ctx = (c) => `<div class="mini-ctx"><b>${esc(c.mascota)}</b>, ${esc(c.servicio)}<br>${esc(longDate(c.fecha))}, ${esc(c.hora)}. ${esc(c.propietario)}</div>`;

function cancelModal(c) {
  openModal('Cancelar cita', `${ctx(c)}
    <div class="field"><label for="cx-m">Motivo de la cancelación</label><select id="cx-m"><option>El propietario lo solicitó</option><option>No se presentó</option><option>Médico no disponible</option><option>Otro</option></select></div>
    <p class="hint">Avisa al propietario por WhatsApp: <a href="https://wa.me/52${esc(c.telefono)}" target="_blank" rel="noopener">${esc(formatPhone(c.telefono))}</a></p>`,
  '<button class="btn btn-ghost" data-close>Conservar cita</button><button class="btn btn-danger" id="cx-ok">Cancelar cita</button>');
  $('#cx-ok').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      await api(`/citas/${c.id}/cancelar`, { method: 'POST', body: { motivo: $('#cx-m').value } });
      closeModal();
      toast(`Cita cancelada. Las ${c.hora} quedaron disponibles.`);
      drawCitas();
    } catch (err) { modalError(err.message); }
  });
}

/** Rejilla de horarios del día; marca como ocupados los que no están disponibles. */
async function slotPicker(container, fecha, servicioId, ignorar, onPick, selected) {
  container.innerHTML = '<div class="loading">Buscando horarios…</div>';
  const q = new URLSearchParams({ fecha, servicio_id: servicioId });
  if (ignorar) q.set('ignorar', ignorar);
  const day = await api(`/disponibilidad?${q}`);
  if (!day.abierto) { container.innerHTML = `<p class="hint">${esc(day.motivo || 'La clínica no abre este día.')}</p>`; return; }
  if (!day.slots.some((s) => s.disponible)) {
    container.innerHTML = `<p class="hint">No quedan horarios libres este día. Elige otro día.</p>`;
    return;
  }
  container.innerHTML = `<div class="slots">${day.slots.map((s) => `<button type="button" class="slot ${s.disponible ? '' : 'busy'} ${s.hora === selected ? 'on' : ''}" data-slot="${s.hora}" ${s.disponible ? '' : 'aria-disabled="true" title="No disponible"'}>${s.hora}</button>`).join('')}</div>`;
  $$('.slot', container).forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('busy')) { modalError(`Las ${b.dataset.slot} no están disponibles. Elige un horario libre.`); return; }
      const a = $('#modal .alert'); if (a) a.classList.remove('on');
      $$('.slot', container).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(b.dataset.slot);
    };
  });
}

function rescheduleModal(c) {
  let pick = null;
  openModal('Reprogramar cita', `${ctx(c)}
    <div class="field"><label for="rp-d">Nuevo día</label><input type="date" id="rp-d" value="${esc(c.fecha)}" min="${ymd()}"></div>
    <div class="field"><label>Horario</label><div id="rp-slots"></div></div>`,
  '<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="rp-ok">Guardar cambio</button>');
  const draw = () => slotPicker($('#rp-slots'), $('#rp-d').value, c.servicio_id, c.id, (h) => { pick = h; }).catch((err) => modalError(err.message));
  $('#rp-d').onchange = () => { pick = null; draw(); };
  draw();
  $('#rp-ok').onclick = (e) => {
    if (!pick) { modalError('Elige un horario para la cita.'); return; }
    busy(e.currentTarget, async () => {
      try {
        const r = await api(`/citas/${c.id}/reprogramar`, { method: 'POST', body: { fecha: $('#rp-d').value, hora: pick } });
        closeModal();
        toast(`Cita de ${r.mascota} reprogramada para el ${longDate(r.fecha).toLowerCase()} a las ${r.hora}`);
        CV.fecha = r.fecha;
        drawCitas();
      } catch (err) { modalError(err.message); draw(); }
    });
  };
}

async function newAppointmentModal() {
  const [owners, svcs] = await Promise.all([api('/propietarios'), servicios()]);
  if (!owners.length) { toast('Primero registra al propietario en «Propietarios y mascotas».', 'error'); return; }
  let pick = null;
  openModal('Nueva cita', `
    <div class="field"><label for="na-o">Propietario</label><select id="na-o">${owners.map((o) => `<option value="${o.id}">${esc(o.nombre)} (${esc(formatPhone(o.telefono))})</option>`).join('')}</select></div>
    <div class="grid2">
      <div class="field"><label for="na-p">Mascota</label><select id="na-p"></select></div>
      <div class="field"><label for="na-s">Servicio</label><select id="na-s">${svcs.filter((s) => s.agendable).map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="na-d">Día</label><input type="date" id="na-d" value="${CV.fecha < ymd() ? ymd() : CV.fecha}" min="${ymd()}"></div>
    <div class="field"><label>Horario</label><div id="na-slots"></div></div>`,
  '<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="na-ok">Registrar cita</button>');
  const pets = () => {
    const o = owners.find((x) => x.id === Number($('#na-o').value));
    $('#na-p').innerHTML = o.mascotas.length ? o.mascotas.map((m) => `<option value="${m.id}">${esc(m.nombre)} (${esc(m.especie)})</option>`).join('') : '<option value="">Sin mascotas registradas</option>';
  };
  const draw = () => { pick = null; slotPicker($('#na-slots'), $('#na-d').value, $('#na-s').value, null, (h) => { pick = h; }).catch((err) => modalError(err.message)); };
  pets(); draw();
  $('#na-o').onchange = pets;
  $('#na-s').onchange = draw;
  $('#na-d').onchange = draw;
  $('#na-ok').onclick = (e) => {
    if (!$('#na-p').value) { modalError('Ese propietario no tiene mascotas registradas.'); return; }
    if (!pick) { modalError('Elige un horario libre para registrar la cita.'); return; }
    busy(e.currentTarget, async () => {
      try {
        const c = await api('/citas', { method: 'POST', body: { propietario_id: Number($('#na-o').value), mascota_id: Number($('#na-p').value), servicio_id: Number($('#na-s').value), fecha: $('#na-d').value, hora: pick } });
        closeModal();
        toast(`Cita registrada: ${c.mascota}, ${longDate(c.fecha).toLowerCase()} a las ${c.hora}`);
        CV.fecha = c.fecha;
        if (location.hash.startsWith('#/citas')) drawCitas(); else location.hash = '#/citas';
      } catch (err) { modalError(err.message); draw(); }
    });
  };
}

// =====================================================================
// SOLICITUDES DEL CHAT
// =====================================================================
const SV = { todas: false, sel: null };

async function viewSolicitudes() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('id')) SV.sel = Number(q.get('id'));
  view.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="sol-filter"><button data-sf="0" class="${SV.todas ? '' : 'on'}">Abiertas</button><button data-sf="1" class="${SV.todas ? 'on' : ''}">Todas</button></div>
      <p class="muted">Conversaciones del asistente que necesitan acción del personal.</p>
    </div>
    <div class="inbox"><div class="panel"><ul class="ilist" id="ilist"></ul></div><div class="panel" id="idetail"></div></div>`;
  $$('#sol-filter button').forEach((b) => { b.onclick = () => { SV.todas = b.dataset.sf === '1'; viewSolicitudes(); }; });
  await drawSolicitudes();
}

async function drawSolicitudes() {
  const list = await api(`/solicitudes${SV.todas ? '' : '?abiertas=1'}`);
  if (!list.find((s) => s.id === SV.sel)) SV.sel = list[0] && list[0].id;
  $('#ilist').innerHTML = list.length ? list.map((s) => `
    <li><button class="${s.id === SV.sel ? 'on' : ''}" data-r="${s.id}">
      <div class="r1"><b>${esc(s.nombre || s.folio)}</b>${badge(SOL, s.estado)}<small>${esc(new Date(s.creado_en.replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }))}</small></div>
      <p>${s.tipo === 'cita' ? `${ic('cal', 'ic ic-sm')} Cita: ${esc(s.servicio || '')}${s.fecha ? `, ${esc(longDate(s.fecha))} ${esc(s.hora)}` : ''}` : esc(s.tema || '')}</p>
    </button></li>`).join('')
    : `<li class="empty">${ic('check')}<h3>Sin pendientes</h3><p>Las nuevas solicitudes del asistente aparecerán aquí.</p></li>`;
  $$('#ilist [data-r]').forEach((b) => { b.onclick = () => { SV.sel = Number(b.dataset.r); drawSolicitudes(); }; });
  const det = $('#idetail');
  if (!SV.sel) { det.innerHTML = `<div class="empty">${ic('chat')}<h3>Selecciona una conversación</h3></div>`; return; }
  const s = await api(`/solicitudes/${SV.sel}`);
  const abierta = ['nueva', 'urgente', 'requiere_atencion'].includes(s.estado);
  const tel = String(s.telefono || '').replace(/\D/g, '');
  det.innerHTML = `
    <div class="panel-h"><h2>${s.tipo === 'cita' ? 'Solicitud de cita' : 'Canalización al personal'}</h2><span class="src">Folio ${esc(s.folio)}</span></div>
    <div class="ireq">
      <div><b>Propietario</b>${esc(s.nombre || '—')}</div><div><b>WhatsApp</b>${esc(s.telefono || '—')}</div>
      <div><b>Mascota</b>${esc(s.mascota ? `${s.mascota} (${s.especie})` : '—')}</div>
      <div><b>${s.tipo === 'cita' ? 'Horario pedido' : 'Tema'}</b>${s.tipo === 'cita' ? esc(s.fecha ? `${longDate(s.fecha)}, ${s.hora}` : '—') : esc(s.tema || '—')}</div>
    </div>
    <div class="convo">${(s.conversacion || []).map(([who, t]) => `<div class="msg ${who === 'me' ? 'me' : 'bot'}">${esc(t).replace(/\n/g, '<br>')}</div>`).join('')}</div>
    <div class="iacts">
      ${abierta ? (s.tipo === 'cita'
    ? `<button class="btn btn-purple" id="rq-ok">${ic('check')}Confirmar cita en la agenda</button>`
    : `<button class="btn btn-ghost" id="rq-ok">${ic('check')}Marcar como resuelta</button>`)
    : `${badge(SOL, s.estado)}<span class="muted">No requiere más acciones.</span>`}
      ${tel ? `<a class="btn btn-wa" href="https://wa.me/52${tel.slice(-10)}" target="_blank" rel="noopener">${ic('wa')}Escribir por WhatsApp</a>` : ''}
    </div>`;
  const ok = $('#rq-ok');
  if (ok) {
    ok.onclick = (e) => busy(e.currentTarget, async () => {
      try {
        await api(`/solicitudes/${s.id}/resolver`, { method: 'POST' });
        toast(s.tipo === 'cita' ? `Cita de ${s.mascota} confirmada en la agenda` : 'Conversación marcada como resuelta');
        refreshCount();
        drawSolicitudes();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
}

// =====================================================================
// PROPIETARIOS Y MASCOTAS
// =====================================================================
const OV = { q: '', sel: null };
let searchTimer;

async function viewPropietarios() {
  view.innerHTML = `
    <div class="toolbar">
      <label class="search">${ic('search')}<input id="o-search" placeholder="Buscar por propietario, mascota o teléfono" value="${esc(OV.q)}"></label>
      <div class="tb-r"><button class="btn btn-purple" id="new-owner">${ic('plus')}Registrar propietario</button></div>
    </div>
    <div class="owners"><div class="panel"><ul class="olist" id="olist"></ul></div><div class="panel" id="odetail"></div></div>`;
  $('#o-search').oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { OV.q = e.target.value; drawOwners(); }, 250); };
  $('#new-owner').onclick = () => ownerModal(null);
  await drawOwners();
}

async function drawOwners() {
  const list = await api(`/propietarios?q=${encodeURIComponent(OV.q)}`);
  if (!list.find((o) => o.id === OV.sel)) OV.sel = list[0] && list[0].id;
  $('#olist').innerHTML = list.length ? list.map((o) => `
    <li><button class="${o.id === OV.sel ? 'on' : ''}" data-o="${o.id}"><span class="avatar">${esc(initials(o.nombre))}</span>
      <span><b>${esc(o.nombre)}</b><small>${esc(o.mascotas.map((m) => m.nombre).join(', ') || 'Sin mascotas')}, ${esc(formatPhone(o.telefono))}</small></span></button></li>`).join('')
    : `<li class="empty">${ic('search')}<h3>Sin resultados${OV.q ? ` para «${esc(OV.q)}»` : ''}</h3><p>Revisa la ortografía o registra al propietario.</p></li>`;
  $$('#olist [data-o]').forEach((b) => { b.onclick = () => { OV.sel = Number(b.dataset.o); drawOwners(); }; });
  const det = $('#odetail');
  if (!OV.sel) {
    det.innerHTML = `<div class="empty">${ic('users')}<h3>No hay un registro seleccionado</h3><p>Busca otro nombre o registra un propietario nuevo.</p></div>`;
    return;
  }
  const o = await api(`/propietarios/${OV.sel}`);
  det.innerHTML = `
    <div class="odetail-h"><span class="avatar">${esc(initials(o.nombre))}</span><div><h2>${esc(o.nombre)}</h2><span class="src">Cliente desde ${esc(new Date(o.creado_en.replace(' ', 'T')).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))}</span></div>
      <div class="sp"><button class="btn btn-ghost btn-sm" id="ed-o">${ic('edit')}Editar datos</button></div></div>
    <div class="facts"><div><b>WhatsApp</b>${esc(formatPhone(o.telefono))}</div><div><b>Correo</b>${esc(o.correo || '—')}</div><div><b>Citas registradas</b>${o.citas.length}</div></div>
    <div class="pets">${o.mascotas.map((p) => `
      <div class="pet"><span class="pet-ic">${ic(petIc(p.especie))}</span><div><h4>${esc(p.nombre)}</h4>
        <dl><dt>Especie</dt><dd>${esc(p.especie)}${p.raza ? `, ${esc(p.raza)}` : ''}</dd><dt>Edad</dt><dd>${esc(p.edad || '—')}</dd><dt>Sexo</dt><dd>${esc(p.sexo || '—')}</dd><dt>Peso</dt><dd>${esc(p.peso || '—')}</dd></dl></div>
        <button class="btn-icon" aria-label="Editar ${esc(p.nombre)}" data-ep="${p.id}">${ic('edit')}</button></div>`).join('')}
      <button class="pet pet-add" id="add-pet">${ic('plus')}Agregar mascota</button></div>
    <h3 class="sub-h">Historial de citas</h3>
    <div class="table-wrap hist"><table class="t"><tbody>${o.citas.length ? o.citas.map((c) => `<tr><td class="num">${esc(shortDay(c.fecha))} ${parseYmd(c.fecha).getDate()}/${parseYmd(c.fecha).getMonth() + 1}, ${esc(c.hora)}</td><td>${esc(c.mascota)}</td><td>${esc(c.servicio)}</td><td>${badge(ESTADO, c.estado)}</td></tr>`).join('') : '<tr><td class="muted">Sin citas registradas.</td></tr>'}</tbody></table></div>`;
  $('#ed-o').onclick = () => ownerModal(o);
  $('#add-pet').onclick = () => petModal(o, null);
  $$('[data-ep]').forEach((b) => { b.onclick = () => petModal(o, o.mascotas.find((p) => p.id === Number(b.dataset.ep))); });
}

const ESPECIES = ['Perro', 'Gato', 'Conejo', 'Ave', 'Otra'];
const opt = (list, sel) => list.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

function ownerModal(o) {
  const isNew = !o;
  o = o || { nombre: '', telefono: '', correo: '' };
  openModal(isNew ? 'Registrar propietario' : 'Editar propietario', `
    <div class="field"><label for="eo-n">Nombre completo</label><input id="eo-n" value="${esc(o.nombre)}" maxlength="120"></div>
    <div class="grid2"><div class="field"><label for="eo-t">WhatsApp</label><input id="eo-t" value="${esc(formatPhone(o.telefono))}" placeholder="656 123 4567" inputmode="tel"></div>
      <div class="field"><label for="eo-m">Correo (opcional)</label><input id="eo-m" type="email" value="${esc(o.correo || '')}"></div></div>
    ${isNew ? `<div class="grid2"><div class="field"><label for="eo-p">Nombre de la mascota</label><input id="eo-p" maxlength="60"></div>
      <div class="field"><label for="eo-e">Especie</label><select id="eo-e">${opt(ESPECIES)}</select></div></div>` : ''}`,
  `<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="eo-ok">${isNew ? 'Registrar propietario' : 'Guardar cambios'}</button>`);
  $('#eo-ok').onclick = (e) => busy(e.currentTarget, async () => {
    const body = { nombre: $('#eo-n').value, telefono: $('#eo-t').value, correo: $('#eo-m').value };
    if (isNew && $('#eo-p').value.trim()) body.mascota = { nombre: $('#eo-p').value, especie: $('#eo-e').value };
    try {
      const r = isNew ? await api('/propietarios', { method: 'POST', body }) : await api(`/propietarios/${o.id}`, { method: 'PUT', body });
      closeModal();
      OV.sel = r.id;
      if (isNew) { OV.q = ''; const s = $('#o-search'); if (s) s.value = ''; }
      toast(isNew ? 'Propietario registrado' : 'Datos del propietario actualizados');
      drawOwners();
    } catch (err) { modalError(err.message); }
  });
}

function petModal(o, p) {
  const isNew = !p;
  p = p || { nombre: '', especie: 'Perro', raza: '', edad: '', sexo: '', peso: '' };
  openModal(isNew ? `Agregar mascota de ${o.nombre}` : `Editar a ${p.nombre}`, `
    <div class="grid2"><div class="field"><label for="ep-n">Nombre</label><input id="ep-n" value="${esc(p.nombre)}" maxlength="60"></div>
      <div class="field"><label for="ep-e">Especie</label><select id="ep-e">${opt(ESPECIES, p.especie)}</select></div></div>
    <div class="grid2"><div class="field"><label for="ep-r">Raza</label><input id="ep-r" value="${esc(p.raza || '')}"></div>
      <div class="field"><label for="ep-ed">Edad</label><input id="ep-ed" value="${esc(p.edad || '')}" placeholder="Ej. 2 años"></div></div>
    <div class="grid2"><div class="field"><label for="ep-s">Sexo</label><select id="ep-s"><option value="">Sin dato</option>${opt(['Macho', 'Hembra'], p.sexo)}</select></div>
      <div class="field"><label for="ep-p">Peso</label><input id="ep-p" value="${esc(p.peso || '')}" placeholder="Ej. 4.5 kg o 38 g"><span class="hint">Usa gramos para aves y especies pequeñas.</span></div></div>`,
  `<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="ep-ok">${isNew ? 'Agregar mascota' : 'Guardar cambios'}</button>`);
  $('#ep-ok').onclick = (e) => busy(e.currentTarget, async () => {
    const body = { nombre: $('#ep-n').value, especie: $('#ep-e').value, raza: $('#ep-r').value, edad: $('#ep-ed').value, sexo: $('#ep-s').value, peso: $('#ep-p').value };
    try {
      if (isNew) await api(`/propietarios/${o.id}/mascotas`, { method: 'POST', body });
      else await api(`/mascotas/${p.id}`, { method: 'PUT', body });
      closeModal();
      toast(isNew ? `${body.nombre} agregado` : `Datos de ${body.nombre} actualizados`);
      drawOwners();
    } catch (err) { modalError(err.message); }
  });
}

// =====================================================================
// HORARIOS Y DISPONIBILIDAD
// =====================================================================
const HORAS = [];
for (let m = 7 * 60; m <= 21 * 60; m += 30) HORAS.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function viewHorarios() {
  const h = await api('/horarios');
  const isAdmin = ME.rol === 'admin';
  const dis = isAdmin ? '' : 'disabled';
  const sel = (v) => `<select ${dis}>${HORAS.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const dias = [1, 2, 3, 4, 5, 6, 0].map((d) => h.dias.find((x) => x.dia_semana === d));
  view.innerHTML = `
    ${isAdmin ? '' : `<div class="readonly-note">${ic('shield')}Solo el administrador puede cambiar horarios. Puedes consultarlos.</div>`}
    <div class="sched">
      <div class="panel">
        <div class="panel-h"><h2>Horario de atención</h2><div class="sp"><span class="muted">Se muestra en el sitio y define los horarios del asistente</span></div></div>
        <div id="days">${dias.map((d) => `
          <div class="day-row" data-d="${d.dia_semana}"><b>${NOMBRES[d.dia_semana]}</b>
            <button class="sw" role="switch" aria-checked="${d.abierto}" aria-label="Abrir ${NOMBRES[d.dia_semana]}" ${dis}></button>
            <label class="hr-l ${d.abierto ? '' : 'off'}">Abre ${sel(d.apertura || '09:00')}</label>
            <label class="hr-l ${d.abierto ? '' : 'off'}">Cierra ${sel(d.cierre || '19:00')}</label>
          </div>`).join('')}</div>
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Reglas de agenda</h2></div>
          <div class="panel-b kv">
            <div class="field"><label for="h-dur">Duración de cada espacio</label><select id="h-dur" ${dis}>${[15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${v === h.reglas.duracion_espacio_min ? 'selected' : ''}>${v} minutos</option>`).join('')}</select></div>
            <div class="field"><label for="h-cap">Citas al mismo tiempo</label><select id="h-cap" ${dis}>${[1, 2, 3, 4, 5, 6].map((v) => `<option ${v === h.reglas.citas_simultaneas ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="hint">Al llegar al límite, el horario deja de mostrarse en el asistente.</span></div>
            <div class="field"><label for="h-adv">Anticipación mínima para agendar</label><select id="h-adv" ${dis}>${[[0, 'Sin mínimo'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [1440, '1 día']].map(([v, l]) => `<option value="${v}" ${v === h.reglas.anticipacion_min ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          </div></div>
        <div class="panel"><div class="panel-h"><h2>Días sin servicio</h2>${isAdmin ? `<div class="sp"><button class="btn btn-ghost btn-sm" id="add-off">${ic('plus')}Agregar</button></div>` : ''}</div>
          <div class="panel-b"><ul class="off-list">${h.inhabiles.length ? h.inhabiles.map((o) => `<li>${ic('cal')}<b>${esc(longDateYear(o.fecha))}</b><span>${esc(o.motivo)}</span>${isAdmin ? `<button class="btn-icon btn-bare" aria-label="Quitar" data-off="${o.id}">${ic('x')}</button>` : ''}</li>`).join('') : '<li class="muted">No hay días sin servicio próximos.</li>'}</ul></div></div>
        ${isAdmin ? `<button class="btn btn-purple save-h" id="save-h">${ic('check')}Guardar horarios</button>` : ''}
      </div>
    </div>`;
  if (!isAdmin) return;
  $$('#days .sw').forEach((s) => {
    s.onclick = () => {
      const on = s.getAttribute('aria-checked') !== 'true';
      s.setAttribute('aria-checked', String(on));
      $$('.hr-l', s.closest('.day-row')).forEach((l) => l.classList.toggle('off', !on));
    };
  });
  $('#save-h').onclick = (e) => busy(e.currentTarget, async () => {
    const body = {
      dias: $$('#days .day-row').map((r) => {
        const [a, c] = $$('select', r).map((x) => x.value);
        return { dia_semana: Number(r.dataset.d), abierto: $('.sw', r).getAttribute('aria-checked') === 'true', apertura: a, cierre: c };
      }),
      reglas: { duracion_espacio_min: Number($('#h-dur').value), citas_simultaneas: Number($('#h-cap').value), anticipacion_min: Number($('#h-adv').value) },
    };
    try { await api('/horarios', { method: 'PUT', body }); toast('Horarios guardados. El sitio y el asistente ya usan el nuevo horario.'); } catch (err) { toast(err.message, 'error'); }
  });
  $$('[data-off]').forEach((b) => {
    b.onclick = async () => {
      try { await api(`/horarios/inhabiles/${b.dataset.off}`, { method: 'DELETE' }); toast('Día sin servicio quitado'); viewHorarios(); } catch (err) { toast(err.message, 'error'); }
    };
  });
  $('#add-off').onclick = () => {
    openModal('Agregar día sin servicio', `<div class="field"><label for="of-f">Fecha</label><input id="of-f" type="date" min="${ymd()}"></div><div class="field"><label for="of-m">Motivo</label><input id="of-m" maxlength="120" placeholder="Ej. Día festivo"></div>`,
      '<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="of-ok">Agregar día</button>');
    $('#of-ok').onclick = (e) => busy(e.currentTarget, async () => {
      try { await api('/horarios/inhabiles', { method: 'POST', body: { fecha: $('#of-f').value, motivo: $('#of-m').value } }); closeModal(); toast('Día sin servicio agregado'); viewHorarios(); } catch (err) { modalError(err.message); }
    });
  };
}

// =====================================================================
// CONTENIDO DEL SITIO (solo administrador)
// =====================================================================
async function viewContenido() {
  const c = await api('/contenido');
  view.innerHTML = `
    <div class="cms">
      <div class="panel"><div class="panel-h"><h2>Servicios publicados</h2><div class="sp"><a class="btn btn-ghost btn-sm" href="/#servicios" target="_blank" rel="noopener">Ver en el sitio</a></div></div>
        ${c.servicios.map((s) => `<div class="cms-row"><span class="svc-ic svc-ic-sm">${ic(esc(s.icono))}</span><div class="grow"><b>${esc(s.nombre)}</b><small>${esc(s.grupo)}${s.agendable ? '' : ', no se agenda por cita'}</small></div>
          <button class="btn-icon" aria-label="Editar ${esc(s.nombre)}" data-es="${s.id}">${ic('edit')}</button>
          <button class="sw" role="switch" aria-checked="${!!s.visible}" aria-label="Mostrar ${esc(s.nombre)} en el sitio" data-vs="${s.id}"></button></div>`).join('')}
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Datos de contacto</h2></div><div class="panel-b">
          <div class="field"><label for="c-tel">Teléfono</label><input id="c-tel" value="${esc(formatPhone(c.contacto.telefono))}" inputmode="tel"></div>
          <div class="field"><label for="c-wa">WhatsApp (con lada de país)</label><input id="c-wa" value="${esc(c.contacto.whatsapp || '')}" placeholder="526561234567" inputmode="tel"></div>
          <div class="field"><label for="c-dir">Dirección</label><input id="c-dir" value="${esc(c.contacto.direccion)}"></div>
          <button class="btn btn-purple btn-sm" id="save-c">${ic('check')}Guardar contacto</button></div></div>
        <div class="panel"><div class="panel-h"><h2>Preguntas frecuentes del asistente</h2><div class="sp"><button class="btn btn-ghost btn-sm" id="add-faq">${ic('plus')}Agregar</button></div></div>
          ${c.faq.map((f) => `<div class="faq ${f.activa ? '' : 'off'}"><div class="grow"><b>${esc(f.pregunta)}</b><p>${esc(f.respuesta)}</p></div><button class="btn-icon" aria-label="Editar pregunta" data-ef="${f.id}">${ic('edit')}</button></div>`).join('') || '<p class="panel-b muted">Aún no hay preguntas.</p>'}
        </div>
      </div>
    </div>`;
  $$('[data-vs]').forEach((b) => {
    b.onclick = async () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      try { await api(`/servicios/${b.dataset.vs}`, { method: 'PUT', body: { visible: on } }); b.setAttribute('aria-checked', String(on)); SERVICIOS = null; toast(on ? 'Servicio visible en el sitio' : 'Servicio oculto del sitio'); } catch (err) { toast(err.message, 'error'); }
    };
  });
  $$('[data-es]').forEach((b) => {
    b.onclick = () => {
      const s = c.servicios.find((x) => x.id === Number(b.dataset.es));
      openModal('Editar servicio', `<div class="field"><label for="es-n">Nombre</label><input id="es-n" value="${esc(s.nombre)}" maxlength="80"></div>
        <div class="field"><label for="es-d">Descripción para el sitio</label><textarea id="es-d" rows="3" maxlength="300">${esc(s.descripcion)}</textarea><span class="hint">Una o dos frases. Así aparece en la sección de servicios.</span></div>
        <label class="check"><input type="checkbox" id="es-a" ${s.agendable ? 'checked' : ''}> Se puede agendar por cita en el asistente</label>`,
      '<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="es-ok">Guardar servicio</button>');
      $('#es-ok').onclick = (e) => busy(e.currentTarget, async () => {
        try { await api(`/servicios/${s.id}`, { method: 'PUT', body: { nombre: $('#es-n').value, descripcion: $('#es-d').value, agendable: $('#es-a').checked } }); closeModal(); SERVICIOS = null; toast('Servicio actualizado en el sitio'); viewContenido(); } catch (err) { modalError(err.message); }
      });
    };
  });
  $('#save-c').onclick = (e) => busy(e.currentTarget, async () => {
    try { await api('/contacto', { method: 'PUT', body: { telefono: $('#c-tel').value, whatsapp: $('#c-wa').value, direccion: $('#c-dir').value } }); toast('Datos de contacto actualizados en el sitio'); } catch (err) { toast(err.message, 'error'); }
  });
  const faqModal = (f) => {
    const isNew = !f;
    f = f || { pregunta: '', respuesta: '', activa: 1 };
    openModal(isNew ? 'Nueva pregunta frecuente' : 'Editar pregunta frecuente', `<div class="field"><label for="fq-p">Pregunta</label><input id="fq-p" value="${esc(f.pregunta)}" maxlength="160"></div>
      <div class="field"><label for="fq-r">Respuesta del asistente</label><textarea id="fq-r" rows="3" maxlength="500">${esc(f.respuesta)}</textarea></div>
      ${isNew ? '' : `<label class="check"><input type="checkbox" id="fq-a" ${f.activa ? 'checked' : ''}> Mostrar en el asistente</label>`}`,
    `${isNew ? '' : '<button class="btn btn-ghost btn-danger-text" id="fq-del">Eliminar</button>'}<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="fq-ok">${isNew ? 'Agregar pregunta' : 'Guardar cambios'}</button>`);
    $('#fq-ok').onclick = (e) => busy(e.currentTarget, async () => {
      const body = { pregunta: $('#fq-p').value, respuesta: $('#fq-r').value, activa: isNew ? true : $('#fq-a').checked };
      try { await api(isNew ? '/faq' : `/faq/${f.id}`, { method: isNew ? 'POST' : 'PUT', body }); closeModal(); toast(isNew ? 'Pregunta agregada al asistente' : 'Pregunta actualizada'); viewContenido(); } catch (err) { modalError(err.message); }
    });
    if (!isNew) {
      $('#fq-del').onclick = async () => {
        try { await api(`/faq/${f.id}`, { method: 'DELETE' }); closeModal(); toast('Pregunta eliminada'); viewContenido(); } catch (err) { modalError(err.message); }
      };
    }
  };
  $('#add-faq').onclick = () => faqModal(null);
  $$('[data-ef]').forEach((b) => { b.onclick = () => faqModal(c.faq.find((x) => x.id === Number(b.dataset.ef))); });
}

// =====================================================================
// USUARIOS Y ROLES (solo administrador)
// =====================================================================
const PERMS = [
  ['Consultar agenda y citas', 1, 1], ['Registrar, modificar y cancelar citas', 1, 1], ['Atender solicitudes del chat', 1, 1],
  ['Consultar y actualizar propietarios y mascotas', 1, 1], ['Cambiar horarios y disponibilidad', 1, 0],
  ['Editar contenido del sitio y preguntas frecuentes', 1, 0], ['Administrar usuarios y roles', 1, 0],
];

async function viewUsuarios() {
  const users = await api('/usuarios');
  view.innerHTML = `
    <div class="toolbar"><div class="tb-r"><button class="btn btn-purple" id="new-user">${ic('plus')}Agregar usuario</button></div></div>
    <div class="panel table-wrap mb"><table class="t"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Acceso activo</th><th></th></tr></thead>
      <tbody>${users.map((u) => `<tr class="${u.activo ? '' : 'cx'}">
        <td><div class="u-cell"><span class="avatar avatar-sm">${esc(initials(u.nombre))}</span><b>${esc(u.nombre)}</b></div></td><td>${esc(u.usuario)}</td>
        <td><span class="role ${u.rol === 'admin' ? 'admin' : 'op'}">${u.rol === 'admin' ? 'Administrador' : 'Personal operativo'}</span></td>
        <td>${u.ultimo_acceso ? esc(new Date(u.ultimo_acceso.replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })) : '<span class="muted">Sin acceso aún</span>'}</td>
        <td><button class="sw" role="switch" aria-checked="${!!u.activo}" aria-label="Acceso de ${esc(u.nombre)}" data-us="${u.id}" ${u.id === ME.id ? 'disabled title="No puedes desactivar tu propia cuenta"' : ''}></button></td>
        <td><div class="acts"><button class="btn-icon" aria-label="Editar ${esc(u.nombre)}" data-eu="${u.id}">${ic('edit')}</button></div></td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><div class="panel-h"><h2>Permisos por rol</h2></div><div class="table-wrap"><table class="perm">
      <thead><tr><th>Permiso</th><th>Administrador</th><th>Personal operativo</th></tr></thead>
      <tbody>${PERMS.map(([p, a, o]) => `<tr><td>${p}</td>${[a, o].map((v) => `<td class="${v ? 'yes' : 'no'}">${ic(v ? 'check' : 'x')}<span class="sr">${v ? 'Sí' : 'No'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  $$('[data-us]').forEach((b) => {
    b.onclick = async () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      try { await api(`/usuarios/${b.dataset.us}`, { method: 'PATCH', body: { activo: on } }); toast(on ? 'Acceso activado' : 'Acceso desactivado'); viewUsuarios(); } catch (err) { toast(err.message, 'error'); }
    };
  });
  const userModal = (u) => {
    const isNew = !u;
    u = u || { nombre: '', usuario: '', rol: 'operativo' };
    openModal(isNew ? 'Agregar usuario' : `Editar a ${u.nombre}`, `
      <div class="field"><label for="nu-n">Nombre completo</label><input id="nu-n" value="${esc(u.nombre)}" placeholder="MVZ Nombre Apellido"></div>
      <div class="grid2"><div class="field"><label for="nu-u">Usuario</label><input id="nu-u" value="${esc(u.usuario)}" ${isNew ? '' : 'disabled'} autocapitalize="none" placeholder="napellido"></div>
        <div class="field"><label for="nu-r">Rol</label><select id="nu-r" ${u.id === ME.id ? 'disabled' : ''}><option value="operativo" ${u.rol === 'operativo' ? 'selected' : ''}>Personal operativo</option><option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option></select></div></div>
      <div class="field"><label for="nu-p">${isNew ? 'Contraseña inicial' : 'Nueva contraseña (opcional)'}</label><input id="nu-p" type="password" autocomplete="new-password" minlength="8"><span class="hint">Mínimo 8 caracteres. Compártela en persona y pide que la cambie después.</span></div>`,
    `<button class="btn btn-ghost" data-close>Descartar</button><button class="btn btn-purple" id="nu-ok">${isNew ? 'Agregar usuario' : 'Guardar cambios'}</button>`);
    $('#nu-ok').onclick = (e) => busy(e.currentTarget, async () => {
      const body = { nombre: $('#nu-n').value };
      if (u.id !== ME.id) body.rol = $('#nu-r').value;
      if ($('#nu-p').value) body.password = $('#nu-p').value;
      try {
        if (isNew) await api('/usuarios', { method: 'POST', body: { ...body, usuario: $('#nu-u').value } });
        else await api(`/usuarios/${u.id}`, { method: 'PATCH', body });
        closeModal();
        toast(isNew ? `${body.nombre} agregado` : 'Usuario actualizado');
        viewUsuarios();
      } catch (err) { modalError(err.message); }
    });
  };
  $('#new-user').onclick = () => userModal(null);
  $$('[data-eu]').forEach((b) => { b.onclick = () => userModal(users.find((x) => x.id === Number(b.dataset.eu))); });
}

const VIEWS = {
  inicio: viewInicio, citas: viewCitas, solicitudes: viewSolicitudes, propietarios: viewPropietarios,
  horarios: viewHorarios, contenido: viewContenido, usuarios: viewUsuarios,
};

boot();

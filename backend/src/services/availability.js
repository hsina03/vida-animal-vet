/**
 * Disponibilidad de horarios (RF-12, RF-15, RNF-05).
 *
 * Una cita ocupa tantos espacios como requiera la duración de su servicio
 * (p. ej. estética = 60 min = 2 espacios de 30). Un espacio está disponible
 * si hay menos citas activas que el límite de «citas al mismo tiempo».
 */
const db = require('../db');
const { getSettings } = require('./settings');
const { HttpError, parseYmd, toMinutes, fromMinutes } = require('../utils');

const ACTIVE = "estado <> 'cancelada'";

async function loadDay(run, fecha, ignoreCitaId) {
  const d = parseYmd(fecha);
  if (!d) throw new HttpError(400, 'La fecha no es válida.');
  const [horario] = await run('SELECT abierto, apertura, cierre FROM horarios WHERE dia_semana = ?', [d.getDay()]);
  const [inhabil] = await run('SELECT motivo FROM dias_inhabiles WHERE fecha = ?', [fecha]);
  const citas = await run(
    `SELECT c.id, c.hora, s.duracion_min
       FROM citas c JOIN servicios s ON s.id = c.servicio_id
      WHERE c.fecha = ? AND ${ACTIVE} AND c.id <> ?`,
    [fecha, ignoreCitaId || 0],
  );
  return { day: d, horario, inhabil, citas };
}

function computeSlots({ horario, inhabil, citas }, settings, fecha, now, duracionServicio) {
  const step = settings.duracion_espacio_min;
  if (inhabil) return { fecha, abierto: false, motivo: inhabil.motivo, slots: [] };
  if (!horario || !horario.abierto || !horario.apertura || !horario.cierre) {
    return { fecha, abierto: false, motivo: 'La clínica no abre este día.', slots: [] };
  }
  const open = toMinutes(horario.apertura);
  const close = toMinutes(horario.cierre);

  // Ocupación por espacio
  const ocupados = new Map();
  for (const c of citas) {
    const start = toMinutes(c.hora);
    const span = Math.max(1, Math.ceil(c.duracion_min / step));
    for (let i = 0; i < span; i += 1) {
      const k = start + i * step;
      ocupados.set(k, (ocupados.get(k) || 0) + 1);
    }
  }

  // Momento mínimo para agendar (ahora + anticipación)
  const minStart = now.getTime() + settings.anticipacion_min * 60000;
  const [y, m, dd] = fecha.split('-').map(Number);
  const need = Math.max(1, Math.ceil((duracionServicio || step) / step));

  const slots = [];
  for (let t = open; t + step <= close; t += step) {
    const slotDate = new Date(y, m - 1, dd, Math.floor(t / 60), t % 60).getTime();
    const libres = settings.citas_simultaneas - (ocupados.get(t) || 0);
    let disponible = slotDate >= minStart && t + need * step <= close;
    for (let i = 0; i < need && disponible; i += 1) {
      if ((ocupados.get(t + i * step) || 0) >= settings.citas_simultaneas) disponible = false;
    }
    slots.push({ hora: fromMinutes(t), libres: Math.max(0, libres), disponible });
  }
  return { fecha, abierto: true, apertura: fromMinutes(open), cierre: fromMinutes(close), slots };
}

/** Horarios de un día. `servicioId` hace que se considere la duración del servicio. */
async function getDaySlots(fecha, { servicioId, ignoreCitaId, now = new Date() } = {}) {
  const run = (sql, p) => db.query(sql, p);
  const data = await loadDay(run, fecha, ignoreCitaId);
  const settings = await getSettings();
  let duracion;
  if (servicioId) {
    const [s] = await db.query('SELECT duracion_min FROM servicios WHERE id = ?', [servicioId]);
    duracion = s && s.duracion_min;
  }
  return computeSlots(data, settings, fecha, now, duracion);
}

/**
 * Verifica, dentro de una transacción, que el horario siga libre.
 * Bloquea las citas del día (SELECT ... FOR UPDATE) para que dos personas
 * no puedan tomar el mismo espacio al mismo tiempo (RNF-05).
 */
async function assertSlotFree(conn, { fecha, hora, servicioId, ignoreCitaId, now = new Date() }) {
  const run = (sql, p) => conn.execute(sql, p).then(([r]) => r);
  // Candado único de agenda: las altas y cambios de citas se registran de una en una,
  // así dos personas (o el asistente y el personal) no pueden tomar el último lugar a la vez.
  await run("SELECT clave FROM configuracion WHERE clave = 'citas_simultaneas' FOR UPDATE");
  const data = await loadDay(run, fecha, ignoreCitaId);
  const settings = await getSettings(conn);
  const [s] = await run('SELECT duracion_min FROM servicios WHERE id = ?', [servicioId]);
  if (!s) throw new HttpError(400, 'El servicio no existe.');
  const day = computeSlots(data, settings, fecha, now, s.duracion_min);
  if (!day.abierto) throw new HttpError(409, day.motivo || 'La clínica no abre este día.');
  const hhmm = fromMinutes(toMinutes(hora));
  const slot = day.slots.find((x) => x.hora === hhmm);
  if (!slot) throw new HttpError(409, `Las ${hhmm} están fuera del horario de atención.`);
  if (!slot.disponible) throw new HttpError(409, `Las ${hhmm} ya no están disponibles. Elige otro horario.`);
  return hhmm;
}

module.exports = { getDaySlots, assertSlotFree, computeSlots };

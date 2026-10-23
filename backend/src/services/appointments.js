/** Citas (RF-11 a RF-14, RNF-05). */
const db = require('../db');
const { assertSlotFree } = require('./availability');
const { HttpError, parseYmd, toMinutes, optionalText } = require('../utils');

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'reprogramada'];

const SELECT = `
  SELECT c.id, c.fecha, TIME_FORMAT(c.hora, '%H:%i') AS hora, c.estado, c.origen, c.motivo_cancelacion, c.notas,
         s.id AS servicio_id, s.nombre AS servicio, s.duracion_min,
         m.id AS mascota_id, m.nombre AS mascota, m.especie,
         p.id AS propietario_id, p.nombre AS propietario, p.telefono
    FROM citas c
    JOIN servicios s ON s.id = c.servicio_id
    JOIN mascotas m ON m.id = c.mascota_id
    JOIN propietarios p ON p.id = c.propietario_id`;

function checkDateTime(fecha, hora) {
  if (!parseYmd(fecha)) throw new HttpError(400, 'La fecha no es válida (usa AAAA-MM-DD).');
  if (toMinutes(hora) === null) throw new HttpError(400, 'La hora no es válida (usa HH:MM).');
}

async function list({ desde, hasta, estado } = {}) {
  const where = [];
  const params = [];
  if (desde) { where.push('c.fecha >= ?'); params.push(desde); }
  if (hasta) { where.push('c.fecha <= ?'); params.push(hasta); }
  if (estado) {
    if (!ESTADOS.includes(estado)) throw new HttpError(400, 'Estado desconocido.');
    where.push('c.estado = ?'); params.push(estado);
  }
  return db.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.fecha, c.hora`, params);
}

async function getById(id, conn) {
  const rows = conn ? (await conn.execute(`${SELECT} WHERE c.id = ?`, [id]))[0] : await db.query(`${SELECT} WHERE c.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'No existe esa cita.');
  return rows[0];
}

/** Registra una cita validando disponibilidad dentro de la transacción. */
async function createInTx(conn, { propietarioId, mascotaId, servicioId, fecha, hora, origen = 'personal', estado = 'confirmada', usuarioId = null, notas = null }) {
  checkDateTime(fecha, hora);
  const [[pet]] = await conn.execute('SELECT id FROM mascotas WHERE id = ? AND propietario_id = ?', [mascotaId, propietarioId]);
  if (!pet) throw new HttpError(400, 'La mascota no pertenece a ese propietario.');
  const [[svc]] = await conn.execute('SELECT id, agendable FROM servicios WHERE id = ?', [servicioId]);
  if (!svc) throw new HttpError(400, 'El servicio no existe.');
  if (!svc.agendable) throw new HttpError(400, 'Ese servicio no se agenda por cita.');
  const hhmm = await assertSlotFree(conn, { fecha, hora, servicioId });
  const [r] = await conn.execute(
    `INSERT INTO citas (propietario_id, mascota_id, servicio_id, fecha, hora, estado, origen, creado_por, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [propietarioId, mascotaId, servicioId, fecha, hhmm, estado, origen, usuarioId, notas],
  );
  return r.insertId;
}

async function create(body, usuarioId) {
  const id = await db.transaction((conn) => createInTx(conn, {
    propietarioId: Number(body.propietario_id),
    mascotaId: Number(body.mascota_id),
    servicioId: Number(body.servicio_id),
    fecha: body.fecha,
    hora: body.hora,
    usuarioId,
    notas: optionalText(body.notas, 300),
  }));
  return getById(id);
}

async function reschedule(id, { fecha, hora }) {
  checkDateTime(fecha, hora);
  await db.transaction(async (conn) => {
    const cita = await getById(id, conn);
    if (['cancelada', 'atendida'].includes(cita.estado)) throw new HttpError(409, `No se puede reprogramar una cita ${cita.estado}.`);
    const hhmm = await assertSlotFree(conn, { fecha, hora, servicioId: cita.servicio_id, ignoreCitaId: id });
    await conn.execute("UPDATE citas SET fecha = ?, hora = ?, estado = 'reprogramada' WHERE id = ?", [fecha, hhmm, id]);
  });
  return getById(id);
}

async function cancel(id, motivo) {
  const cita = await getById(id);
  if (cita.estado === 'cancelada') throw new HttpError(409, 'La cita ya estaba cancelada.');
  if (cita.estado === 'atendida') throw new HttpError(409, 'No se puede cancelar una cita que ya se atendió.');
  await db.query("UPDATE citas SET estado = 'cancelada', motivo_cancelacion = ? WHERE id = ?", [optionalText(motivo, 120) || 'Sin motivo', id]);
  return getById(id);
}

const TRANSITIONS = {
  pendiente: ['confirmada', 'atendida'],
  confirmada: ['atendida'],
  reprogramada: ['confirmada', 'atendida'],
};

async function setStatus(id, estado) {
  if (!['confirmada', 'atendida'].includes(estado)) throw new HttpError(400, 'Usa «confirmada» o «atendida». Para cancelar o reprogramar hay acciones propias.');
  const cita = await getById(id);
  if (!(TRANSITIONS[cita.estado] || []).includes(estado)) throw new HttpError(409, `No se puede pasar de ${cita.estado} a ${estado}.`);
  await db.transaction(async (conn) => {
    await conn.execute('UPDATE citas SET estado = ? WHERE id = ?', [estado, id]);
    // Si la cita vino del asistente, su solicitud queda registrada
    if (estado === 'confirmada') await conn.execute("UPDATE solicitudes SET estado = 'registrada' WHERE cita_id = ? AND estado = 'nueva'", [id]);
  });
  return getById(id);
}

module.exports = { list, getById, create, createInTx, reschedule, cancel, setStatus, ESTADOS };

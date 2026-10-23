/** Solicitudes del asistente (RF-09, RF-10). */
const db = require('../db');
const owners = require('./owners');
const appointments = require('./appointments');
const { HttpError } = require('../utils');

const ABIERTAS = ['nueva', 'urgente', 'requiere_atencion'];

const tempFolio = () => `TMP-${Math.random().toString(36).slice(2, 10)}`;

/** El folio se deriva del id autoincremental, así nunca se repite aunque lleguen dos solicitudes a la vez. */
async function assignFolio(conn, id) {
  const folio = `SOL-${String(id).padStart(4, '0')}`;
  await conn.execute('UPDATE solicitudes SET folio = ? WHERE id = ?', [folio, id]);
  return folio;
}

/** Cita pedida por el asistente: reserva el horario como «pendiente» y deja la solicitud para el personal. */
async function createBookingFromChat({ nombre, telefono, mascota, especie, servicioId, fecha, hora, conversacion }) {
  return db.transaction(async (conn) => {
    const { ownerId, petId } = await owners.findOrCreateForBooking(conn, { nombre, telefono, mascota, especie });
    const citaId = await appointments.createInTx(conn, {
      propietarioId: ownerId, mascotaId: petId, servicioId, fecha, hora, origen: 'chat', estado: 'pendiente',
    });
    const [r] = await conn.execute(
      `INSERT INTO solicitudes (folio, tipo, estado, nombre, telefono, mascota, especie, servicio_id, cita_id, conversacion)
       VALUES (?, 'cita', 'nueva', ?, ?, ?, ?, ?, ?, ?)`,
      [tempFolio(), nombre, telefono, mascota, especie, servicioId, citaId, JSON.stringify(conversacion || [])],
    );
    const folio = await assignFolio(conn, r.insertId);
    return { folio, citaId };
  });
}

/** Conversación que el asistente no pudo resolver y pasa al personal. */
async function createHandoff({ tema, urgente, conversacion, nombre, telefono }) {
  return db.transaction(async (conn) => {
    const [r] = await conn.execute(
      `INSERT INTO solicitudes (folio, tipo, estado, nombre, telefono, tema, conversacion)
       VALUES (?, 'canalizacion', ?, ?, ?, ?, ?)`,
      [tempFolio(), urgente ? 'urgente' : 'requiere_atencion', nombre || null, telefono || null, (tema || '').slice(0, 200), JSON.stringify(conversacion || [])],
    );
    const folio = await assignFolio(conn, r.insertId);
    return { folio };
  });
}

async function list({ abiertas } = {}) {
  const rows = await db.query(
    `SELECT s.id, s.folio, s.tipo, s.estado, s.nombre, s.telefono, s.mascota, s.especie, s.tema, s.cita_id,
            s.creado_en, sv.nombre AS servicio, c.fecha, TIME_FORMAT(c.hora, '%H:%i') AS hora, c.estado AS estado_cita
       FROM solicitudes s
       LEFT JOIN servicios sv ON sv.id = s.servicio_id
       LEFT JOIN citas c ON c.id = s.cita_id
       ${abiertas ? `WHERE s.estado IN (${ABIERTAS.map(() => '?').join(',')})` : ''}
      ORDER BY FIELD(s.estado, 'urgente', 'requiere_atencion', 'nueva', 'registrada', 'resuelta'), s.creado_en DESC
      LIMIT 200`,
    abiertas ? ABIERTAS : [],
  );
  return rows;
}

async function getById(id) {
  const [row] = await db.query(
    `SELECT s.*, sv.nombre AS servicio, c.fecha, TIME_FORMAT(c.hora, '%H:%i') AS hora, c.estado AS estado_cita
       FROM solicitudes s LEFT JOIN servicios sv ON sv.id = s.servicio_id LEFT JOIN citas c ON c.id = s.cita_id
      WHERE s.id = ?`,
    [id],
  );
  if (!row) throw new HttpError(404, 'No existe esa solicitud.');
  if (typeof row.conversacion === 'string') row.conversacion = JSON.parse(row.conversacion);
  return row;
}

async function resolve(id) {
  const s = await getById(id);
  if (!ABIERTAS.includes(s.estado)) throw new HttpError(409, 'La solicitud ya no está abierta.');
  if (s.tipo === 'cita' && s.cita_id) {
    // Registrar en la agenda = confirmar la cita reservada
    if (s.estado_cita === 'pendiente') await appointments.setStatus(s.cita_id, 'confirmada');
    await db.query("UPDATE solicitudes SET estado = 'registrada' WHERE id = ?", [id]);
  } else {
    await db.query("UPDATE solicitudes SET estado = 'resuelta' WHERE id = ?", [id]);
  }
  return getById(id);
}

async function countOpen() {
  const [row] = await db.query(
    `SELECT SUM(tipo = 'cita' AND estado = 'nueva') AS citas, SUM(tipo = 'canalizacion' AND estado IN ('urgente','requiere_atencion')) AS canalizaciones
       FROM solicitudes`,
  );
  return { citas: Number(row.citas) || 0, canalizaciones: Number(row.canalizaciones) || 0 };
}

module.exports = { createBookingFromChat, createHandoff, list, getById, resolve, countOpen };

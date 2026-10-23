/** Horarios (RF-15), contenido del sitio (RF-03 a RF-05, RF-07), usuarios (RF-02) y resumen del día. */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { getSettings, setSettings } = require('../services/settings');
const appointments = require('../services/appointments');
const requests = require('../services/requests');
const { wrap, HttpError, toMinutes, parseYmd, requireText, normalizePhone, ymd } = require('../utils');

const router = express.Router();
const admin = requireRole('admin');
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
  return n;
};

// ---------- Resumen del día ----------
router.get('/resumen', wrap(async (req, res) => {
  const hoy = ymd();
  const citas = await appointments.list({ desde: hoy, hasta: hoy });
  const [pend] = await db.query("SELECT COUNT(*) AS n FROM citas WHERE estado = 'pendiente' AND fecha >= ?", [hoy]);
  const abiertas = (await requests.list({ abiertas: true })).filter((s) => s.tipo === 'canalizacion');
  res.json({
    fecha: hoy,
    citasHoy: citas.filter((c) => c.estado !== 'cancelada').length,
    porConfirmar: Number(pend.n),
    solicitudes: await requests.countOpen(),
    agenda: citas,
    atencion: abiertas,
  });
}));

// ---------- Horarios y disponibilidad ----------
router.get('/horarios', wrap(async (req, res) => {
  const dias = await db.query("SELECT dia_semana, abierto, TIME_FORMAT(apertura, '%H:%i') AS apertura, TIME_FORMAT(cierre, '%H:%i') AS cierre FROM horarios ORDER BY dia_semana");
  const s = await getSettings();
  const inhabiles = await db.query('SELECT id, fecha, motivo FROM dias_inhabiles WHERE fecha >= CURDATE() ORDER BY fecha');
  res.json({
    dias: dias.map((d) => ({ ...d, abierto: !!d.abierto })),
    reglas: { duracion_espacio_min: s.duracion_espacio_min, citas_simultaneas: s.citas_simultaneas, anticipacion_min: s.anticipacion_min },
    inhabiles,
  });
}));

router.put('/horarios', admin, wrap(async (req, res) => {
  const { dias = [], reglas = {} } = req.body || {};
  if (!Array.isArray(dias)) throw new HttpError(400, 'Formato de horarios inválido.');
  for (const d of dias) {
    const dia = Number(d.dia_semana);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw new HttpError(400, 'Día de la semana inválido.');
    if (d.abierto) {
      const a = toMinutes(d.apertura);
      const c = toMinutes(d.cierre);
      if (a === null || c === null || a >= c) throw new HttpError(400, 'La hora de apertura debe ser antes que la de cierre.');
    }
  }
  const allowed = { duracion_espacio_min: [15, 20, 30, 45, 60], citas_simultaneas: [1, 2, 3, 4, 5, 6], anticipacion_min: [0, 60, 120, 240, 1440] };
  const toSave = {};
  for (const [k, values] of Object.entries(allowed)) {
    if (reglas[k] === undefined) continue;
    const v = Number(reglas[k]);
    if (!values.includes(v)) throw new HttpError(400, `Valor no permitido para ${k}.`);
    toSave[k] = v;
  }
  await db.transaction(async (conn) => {
    for (const d of dias) {
      await conn.execute('UPDATE horarios SET abierto = ?, apertura = ?, cierre = ? WHERE dia_semana = ?', [d.abierto ? 1 : 0, d.abierto ? d.apertura : null, d.abierto ? d.cierre : null, Number(d.dia_semana)]);
    }
  });
  await setSettings(toSave);
  res.json({ ok: true });
}));

router.post('/horarios/inhabiles', admin, wrap(async (req, res) => {
  const fecha = (req.body || {}).fecha;
  if (!parseYmd(fecha)) throw new HttpError(400, 'Indica una fecha válida.');
  const motivo = requireText((req.body || {}).motivo, 'motivo');
  try {
    await db.query('INSERT INTO dias_inhabiles (fecha, motivo) VALUES (?, ?)', [fecha, motivo]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Esa fecha ya está marcada como día sin servicio.');
    throw e;
  }
  res.status(201).json({ ok: true });
}));

router.delete('/horarios/inhabiles/:id', admin, wrap(async (req, res) => {
  await db.query('DELETE FROM dias_inhabiles WHERE id = ?', [id(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- Contenido del sitio ----------
router.get('/contenido', admin, wrap(async (req, res) => {
  const servicios = await db.query('SELECT id, clave, nombre, grupo, descripcion, icono, duracion_min, agendable, visible, orden FROM servicios ORDER BY orden, id');
  const faq = await db.query('SELECT id, pregunta, respuesta, activa, orden FROM preguntas_frecuentes ORDER BY orden, id');
  const s = await getSettings();
  res.json({ servicios, faq, contacto: { telefono: s.telefono, whatsapp: s.whatsapp, direccion: s.direccion } });
}));

router.put('/servicios/:id', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const fields = {};
  if (b.nombre !== undefined) fields.nombre = requireText(b.nombre, 'nombre', 80);
  if (b.descripcion !== undefined) fields.descripcion = requireText(b.descripcion, 'descripción', 300);
  if (b.visible !== undefined) fields.visible = b.visible ? 1 : 0;
  if (b.agendable !== undefined) fields.agendable = b.agendable ? 1 : 0;
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No hay cambios que guardar.');
  const r = await db.query(`UPDATE servicios SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'No existe ese servicio.');
  res.json({ ok: true });
}));

router.put('/contacto', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const telefono = normalizePhone(b.telefono);
  if (!telefono) throw new HttpError(400, 'El teléfono debe tener 10 dígitos.');
  const whatsapp = b.whatsapp ? String(b.whatsapp).replace(/\D/g, '') : `52${telefono}`;
  await setSettings({ telefono, whatsapp, direccion: requireText(b.direccion, 'dirección', 200) });
  res.json({ ok: true });
}));

router.post('/faq', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const r = await db.query('INSERT INTO preguntas_frecuentes (pregunta, respuesta, orden) VALUES (?, ?, 99)', [requireText(b.pregunta, 'pregunta', 160), requireText(b.respuesta, 'respuesta', 500)]);
  res.status(201).json({ id: r.insertId });
}));

router.put('/faq/:id', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const r = await db.query('UPDATE preguntas_frecuentes SET pregunta = ?, respuesta = ?, activa = ? WHERE id = ?', [requireText(b.pregunta, 'pregunta', 160), requireText(b.respuesta, 'respuesta', 500), b.activa === false ? 0 : 1, id(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'No existe esa pregunta.');
  res.json({ ok: true });
}));

router.delete('/faq/:id', admin, wrap(async (req, res) => {
  await db.query('DELETE FROM preguntas_frecuentes WHERE id = ?', [id(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- Usuarios y roles ----------
const ROLES = ['admin', 'operativo'];

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  return pw;
}

router.get('/usuarios', admin, wrap(async (req, res) => {
  res.json(await db.query('SELECT id, nombre, usuario, rol, activo, ultimo_acceso FROM usuarios ORDER BY rol, nombre'));
}));

router.post('/usuarios', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const usuario = requireText(b.usuario, 'usuario', 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new HttpError(400, 'El usuario solo puede tener letras, números, punto o guion.');
  const rol = ROLES.includes(b.rol) ? b.rol : 'operativo';
  const hash = await bcrypt.hash(checkPassword(b.password), 10);
  try {
    const r = await db.query('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)', [requireText(b.nombre, 'nombre'), usuario, hash, rol]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ya existe un usuario con ese nombre de acceso.');
    throw e;
  }
}));

router.patch('/usuarios/:id', admin, wrap(async (req, res) => {
  const targetId = id(req.params.id);
  const b = req.body || {};
  if (targetId === req.user.id && (b.activo === false || (b.rol && b.rol !== 'admin'))) {
    throw new HttpError(409, 'No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.');
  }
  const fields = {};
  if (b.nombre !== undefined) fields.nombre = requireText(b.nombre, 'nombre');
  if (b.rol !== undefined) {
    if (!ROLES.includes(b.rol)) throw new HttpError(400, 'Rol desconocido.');
    fields.rol = b.rol;
  }
  if (b.activo !== undefined) fields.activo = b.activo ? 1 : 0;
  if (b.password !== undefined) fields.password_hash = await bcrypt.hash(checkPassword(b.password), 10);
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No hay cambios que guardar.');
  const r = await db.query(`UPDATE usuarios SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), targetId]);
  if (!r.affectedRows) throw new HttpError(404, 'No existe ese usuario.');
  res.json({ ok: true });
}));

module.exports = router;

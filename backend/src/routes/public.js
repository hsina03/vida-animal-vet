/** Información pública del sitio (RF-03, RF-04, RF-05) y chat del asistente (RF-06 a RF-11). */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { handle } = require('@vida-animal/chatbot');
const db = require('../db');
const { getSettings } = require('../services/settings');
const { getDaySlots } = require('../services/availability');
const requests = require('../services/requests');
const { wrap, ymd, addDays, shortDateLabel, formatPhone, DIAS, HttpError } = require('../utils');

const router = express.Router();

async function publicInfo() {
  const settings = await getSettings();
  const horarios = await db.query("SELECT dia_semana, abierto, TIME_FORMAT(apertura, '%H:%i') AS apertura, TIME_FORMAT(cierre, '%H:%i') AS cierre FROM horarios ORDER BY dia_semana");
  const servicios = await db.query('SELECT id, clave, nombre, grupo, descripcion, icono, agendable FROM servicios WHERE visible = 1 ORDER BY orden, id');
  const whatsapp = String(settings.whatsapp || '').replace(/\D/g, '');
  return {
    clinica: settings.clinica_nombre || 'Vida Animal II',
    telefono: settings.telefono,
    direccion: settings.direccion,
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp}` : null,
    horarios: horarios.map((h) => ({ ...h, dia: DIAS[h.dia_semana], abierto: !!h.abierto })),
    horarioTexto: horarioTexto(horarios),
    servicios,
  };
}

/** «Atendemos de lunes a viernes de 9:00 a 19:00 y sábado de 9:00 a 15:00.» */
function horarioTexto(horarios) {
  const groups = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const h = horarios.find((x) => x.dia_semana === d);
    if (!h || !h.abierto) continue;
    const span = `${h.apertura.replace(/^0/, '')} a ${h.cierre.replace(/^0/, '')}`;
    const last = groups[groups.length - 1];
    if (last && last.span === span && last.to === (d + 6) % 7) last.to = d;
    else groups.push({ from: d, to: d, span });
  }
  if (!groups.length) return 'Por ahora no tenemos horario de atención publicado.';
  const parts = groups.map((g) => (g.from === g.to ? `${DIAS[g.from].toLowerCase()} de ${g.span}` : `${DIAS[g.from].toLowerCase()} a ${DIAS[g.to].toLowerCase()} de ${g.span}`));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  return `Atendemos de ${list}.`;
}

router.get('/info', wrap(async (req, res) => {
  const info = await publicInfo();
  info.telefono = formatPhone(String(info.telefono || '').replace(/\D/g, '')) || info.telefono;
  res.json(info);
}));

// ---------- Chat ----------
const SESSION_TTL = 30 * 60 * 1000;
const MAX_SESSIONS = 5000;
const sessions = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > SESSION_TTL) sessions.delete(id);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
}

const chatDeps = {
  getServices: () => db.query('SELECT id, clave, nombre, agendable FROM servicios WHERE visible = 1 ORDER BY orden, id'),
  getFaq: () => db.query('SELECT id, pregunta, respuesta FROM preguntas_frecuentes WHERE activa = 1 ORDER BY orden, id'),
  getInfo: publicInfo,
  async getDays(servicioId) {
    const out = [];
    const today = ymd();
    for (let i = 0; i < 21 && out.length < 5; i += 1) {
      const fecha = addDays(today, i);
      const day = await getDaySlots(fecha, { servicioId });
      if (day.abierto && day.slots.some((s) => s.disponible)) out.push({ fecha, label: shortDateLabel(fecha) });
    }
    return out;
  },
  async getSlots(fecha, servicioId) {
    const day = await getDaySlots(fecha, { servicioId });
    return day.slots.filter((s) => s.disponible).map((s) => ({ hora: s.hora }));
  },
  book: (data) => requests.createBookingFromChat(data),
  handoff: (data) => requests.createHandoff(data),
};

const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados mensajes. Espera un momento e inténtalo de nuevo.' } });

router.post('/chat', chatLimiter, wrap(async (req, res) => {
  sweep();
  const { sessionId, optionId, text } = req.body || {};
  if (text !== undefined && typeof text !== 'string') throw new HttpError(400, 'Mensaje inválido.');
  if (optionId !== undefined && typeof optionId !== 'string') throw new HttpError(400, 'Opción inválida.');
  let id = typeof sessionId === 'string' && sessions.has(sessionId) ? sessionId : null;
  const prev = id ? sessions.get(id).state : undefined;
  const { state, reply } = await handle(prev, { optionId, text }, chatDeps);
  if (!id) id = crypto.randomUUID();
  sessions.set(id, { state, at: Date.now() });
  res.json({ sessionId: id, ...reply });
}));

module.exports = { router, publicInfo, horarioTexto, chatDeps, _sessions: sessions };

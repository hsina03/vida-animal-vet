/** Error con código HTTP y mensaje pensado para mostrarse al usuario. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de una fecha en la zona horaria del proceso (TZ). */
function ymd(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Interpreta 'YYYY-MM-DD' como fecha local a medianoche. */
function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ymd(d) === str ? d : null;
}

function addDays(str, n) {
  const d = parseYmd(str);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche. */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fromMinutes(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Normaliza un teléfono mexicano a 10 dígitos. Devuelve null si no es válido. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? ten : null;
}

function formatPhone(ten) {
  if (!ten || ten.length !== 10) return ten || '';
  return `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'Vie 23 oct' */
function shortDateLabel(str) {
  const d = parseYmd(str);
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** 'viernes 23 de octubre' */
function longDateLabel(str) {
  const d = parseYmd(str);
  return `${DIAS[d.getDay()].toLowerCase()} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Validación sencilla de campos de texto obligatorios. */
function requireText(value, field, max = 120) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new HttpError(400, `Falta el campo «${field}».`);
  if (v.length > max) throw new HttpError(400, `El campo «${field}» es demasiado largo.`);
  return v;
}

function optionalText(value, max = 120) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.length > max) throw new HttpError(400, 'Uno de los campos es demasiado largo.');
  return v;
}

/** Envuelve un handler async para que los errores lleguen al middleware de errores. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError, ymd, parseYmd, addDays, toMinutes, fromMinutes, normalizePhone, formatPhone,
  shortDateLabel, longDateLabel, DIAS, requireText, optionalText, wrap,
};

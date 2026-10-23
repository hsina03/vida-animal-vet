/** Sesión del personal y control de acceso por rol (RF-01, RF-02, RNF-01). */
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../utils');

const COOKIE = 'va_session';

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, rol: user.rol }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.env === 'production',
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Exige sesión válida y cuenta activa; deja el usuario en req.user. */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) throw new HttpError(401, 'Inicia sesión para continuar.');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo.');
    }
    const [user] = await db.query('SELECT id, nombre, usuario, rol, activo FROM usuarios WHERE id = ?', [payload.sub]);
    if (!user || !user.activo) {
      clearSession(res);
      throw new HttpError(401, 'Tu cuenta ya no tiene acceso. Pide al administrador que la reactive.');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.rol)) return next(new HttpError(403, 'Solo el administrador puede hacer este cambio.'));
  return next();
};

module.exports = { setSession, clearSession, requireAuth, requireRole, COOKIE };

/** UC-01 Inicio de sesión y control de acceso (RF-01, RF-02). */
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { setSession, clearSession, requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../utils');

const router = express.Router();
// Hash de relleno para comparar aunque el usuario no exista (mismo tiempo de respuesta)
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' },
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const usuario = typeof req.body.usuario === 'string' ? req.body.usuario.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!usuario || !password) throw new HttpError(400, 'Escribe tu usuario y tu contraseña para continuar.');
  const [user] = await db.query('SELECT id, nombre, usuario, rol, activo, password_hash FROM usuarios WHERE usuario = ?', [usuario]);
  // Se compara aunque no exista el usuario para no revelar cuáles existen por el tiempo de respuesta
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'El usuario o la contraseña no coinciden. Revísalos e inténtalo de nuevo.');
  if (!user.activo) throw new HttpError(403, 'Esta cuenta está desactivada. Pide al administrador que reactive tu acceso.');
  await db.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);
  setSession(res, user);
  res.json({ id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol });
}));

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const { id, nombre, usuario, rol } = req.user;
  res.json({ id, nombre, usuario, rol });
});

module.exports = router;

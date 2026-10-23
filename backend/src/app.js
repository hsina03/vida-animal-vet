const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { router: publicRouter } = require('./routes/public');
const authRouter = require('./routes/auth');
const citasRouter = require('./routes/citas');
const propietariosRouter = require('./routes/propietarios');
const configuracionRouter = require('./routes/configuracion');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // API pública (sitio y asistente)
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);

  // API del panel: todo requiere sesión
  app.use('/api', requireAuth, citasRouter, propietariosRouter, configuracionRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  // Frontend
  app.use(express.static(config.frontendDir, { extensions: ['html'], redirect: false }));
  app.get('/admin*', (req, res) => res.sendFile(path.join(config.frontendDir, 'admin', 'index.html')));

  // Errores: mensajes claros para el usuario, sin filtrar detalles internos
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: status >= 500 ? 'Ocurrió un error en el servidor. Inténtalo de nuevo.' : err.message });
  });

  return app;
}

module.exports = { createApp };

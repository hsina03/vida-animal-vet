const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.TZ) process.env.TZ = 'America/Ciudad_Juarez';

const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'vida',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vida_animal',
  },
  jwtSecret: process.env.JWT_SECRET,
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  frontendDir: path.join(__dirname, '..', '..', 'frontend', 'public'),
};

if (!config.jwtSecret || config.jwtSecret.length < 16) {
  if (config.env === 'production') {
    throw new Error('JWT_SECRET debe tener al menos 16 caracteres en producción.');
  }
  config.jwtSecret = 'solo-para-desarrollo-local-cambiar';
}

module.exports = config;

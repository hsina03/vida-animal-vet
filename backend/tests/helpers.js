// Utilidades compartidas por las pruebas del backend.
// Las pruebas usan su propia base de datos (DB_NAME_TEST, por omisión vida_animal_test)
// y la recrean desde cero antes de cada archivo para que sean repetibles.
const path = require('path');
const { execFileSync } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'vida_animal_test';
process.env.SEED_ADMIN_PASSWORD = 'prueba-admin-123';
process.env.SEED_STAFF_PASSWORD = 'prueba-staff-123';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/db');
const { ymd, addDays } = require('../src/utils');

const PASSWORDS = { admin: process.env.SEED_ADMIN_PASSWORD, lrios: process.env.SEED_STAFF_PASSWORD };

async function resetDatabase() {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'db-setup.js'), '--sin-demo', '--quiet'], {
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  // Sin días festivos del seed para que «el siguiente día hábil» siempre esté abierto
  await db.query('DELETE FROM dias_inhabiles');
}

/** Agente de supertest con la sesión ya iniciada. */
async function loginAs(app, usuario) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ usuario, password: PASSWORDS[usuario] });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${usuario}: ${res.status}`);
  return agent;
}

/** Siguiente día hábil (lunes a viernes) a partir de mañana, en formato YYYY-MM-DD. */
function nextWeekday(from = ymd()) {
  let d = addDays(from, 1);
  for (;;) {
    const dow = new Date(`${d}T12:00:00`).getDay();
    if (dow >= 1 && dow <= 5) return d;
    d = addDays(d, 1);
  }
}

module.exports = { request, createApp, db, resetDatabase, loginAs, nextWeekday, PASSWORDS };

#!/usr/bin/env node
/**
 * Crea (o reinicia) la base de datos de Vida Animal II.
 *
 *   npm run db:setup              → crea la base, las tablas, los datos iniciales y los usuarios
 *   npm run db:setup -- --sin-demo → igual, pero sin citas ni solicitudes de ejemplo
 *
 * ATENCIÓN: borra las tablas existentes. Úsalo solo para desarrollo o la primera instalación.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { utcOffset } = require('../src/db');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { ymd, addDays, parseYmd } = require('../src/utils');

const sinDemo = process.argv.includes('--sin-demo');
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

const randomPassword = () => crypto.randomBytes(9).toString('base64url');

/** Próximo día hábil (lun-sáb) a partir de hoy + n. */
function workday(n) {
  let f = addDays(ymd(), n);
  while (parseYmd(f).getDay() === 0) f = addDays(f, 1);
  return f;
}

async function main() {
  const { database, ...server } = config.db;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME solo puede tener letras, números y guion bajo.');
  const conn = await mysql.createConnection({ ...server, multipleStatements: true, charset: 'utf8mb4' });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await conn.query(`USE \`${database}\``);
  await conn.query('SET time_zone = ?', [utcOffset()]);

  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8');
  await conn.query(read('schema.sql'));
  await conn.query(read('seed.sql'));
  log(`✔ Base de datos «${database}» creada con sus tablas y datos iniciales.`);

  const adminPass = process.env.SEED_ADMIN_PASSWORD || randomPassword();
  const staffPass = process.env.SEED_STAFF_PASSWORD || randomPassword();
  await conn.execute(
    'INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1), (?, ?, ?, ?, 0)',
    [
      'Administración Vida Animal II', 'admin', await bcrypt.hash(adminPass, 10), 'admin',
      'MVZ Laura Ríos', 'lrios', await bcrypt.hash(staffPass, 10), 'operativo',
      'MVZ Ernesto Silva', 'esilva', await bcrypt.hash(staffPass, 10), 'operativo',
    ],
  );

  if (!sinDemo) {
    // Citas de ejemplo alrededor de hoy para que el panel no se vea vacío
    const hoy = ymd();
    const manana = workday(1);
    const citas = [
      [1, 1, 1, hoy, '09:00', 'atendida', 'chat'],
      [2, 3, 2, hoy, '09:30', 'atendida', 'personal'],
      [3, 4, 5, hoy, '10:30', 'confirmada', 'chat'],
      [4, 5, 1, hoy, '11:30', 'confirmada', 'personal'],
      [5, 6, 3, hoy, '12:00', 'pendiente', 'chat'],
      [6, 7, 2, manana, '09:00', 'confirmada', 'chat'],
      [1, 2, 5, manana, '11:00', 'pendiente', 'chat'],
    ];
    for (const [p, m, s, f, h, e, o] of citas) {
      await conn.execute('INSERT INTO citas (propietario_id, mascota_id, servicio_id, fecha, hora, estado, origen) VALUES (?, ?, ?, ?, ?, ?, ?)', [p, m, s, f, h, e, o]);
    }
    const conv = (pairs) => JSON.stringify(pairs);
    await conn.execute(
      `INSERT INTO solicitudes (folio, tipo, estado, nombre, telefono, mascota, especie, servicio_id, cita_id, conversacion) VALUES
       ('SOL-0001', 'cita', 'nueva', 'Ana Lucía Pérez', '656 290 6614', 'Rocky', 'Perro', 3, 5, ?),
       ('SOL-0002', 'cita', 'nueva', 'Sofía Hernández', '656 214 7790', 'Nala', 'Perro', 5, 7, ?)`,
      [
        conv([['bot', '¿Qué servicio necesitas?'], ['me', 'Cirugías y procedimientos'], ['bot', 'Para cirugías primero agendamos una valoración con el médico.']]),
        conv([['bot', '¿Qué servicio necesitas?'], ['me', 'Estética'], ['bot', 'Elige el día:']]),
      ],
    );
    await conn.execute(
      `INSERT INTO solicitudes (folio, tipo, estado, nombre, telefono, tema, conversacion) VALUES
       ('SOL-0003', 'canalizacion', 'urgente', NULL, NULL, 'mi perro se comió un pedazo de chocolate qué hago', ?)`,
      [conv([['bot', '¿Qué necesitas?'], ['me', 'mi perro se comió un pedazo de chocolate qué hago'], ['bot', 'Como puede tratarse de una urgencia, avisé al personal.']])],
    );
    log('✔ Citas y solicitudes de ejemplo agregadas (usa --sin-demo para omitirlas).');
  }
  await conn.end();

  log('\nUsuarios del panel (guárdalos; las contraseñas aleatorias solo se muestran ahora):');
  log(`  admin  → ${process.env.SEED_ADMIN_PASSWORD ? '(contraseña de SEED_ADMIN_PASSWORD)' : adminPass}   rol: Administrador`);
  log(`  lrios  → ${process.env.SEED_STAFF_PASSWORD ? '(contraseña de SEED_STAFF_PASSWORD)' : staffPass}   rol: Personal operativo`);
  log('  esilva → misma contraseña que lrios, pero desactivada (para probar el aviso de cuenta inactiva)');
}

main().catch((err) => {
  console.error('✖ No se pudo preparar la base de datos:', err.message);
  if (err.code === 'ECONNREFUSED') console.error('  ¿Está encendido MySQL y son correctos DB_HOST/DB_PORT en backend/.env?');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('  Revisa DB_USER y DB_PASSWORD en backend/.env.');
  process.exit(1);
});

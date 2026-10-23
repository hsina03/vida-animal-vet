const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      // Fechas y horas como texto ('2026-10-22', '09:30:00') para no mover días por zona horaria
      dateStrings: true,
      charset: 'utf8mb4',
    });
    // Que CURRENT_TIMESTAMP de MySQL use la misma zona que la clínica (TZ del proceso)
    pool.on('connection', (conn) => { conn.query('SET time_zone = ?', [utcOffset()]); });
  }
  return pool;
}

/** Desfase actual de la zona del proceso, en formato '-06:00'. */
function utcOffset(date = new Date()) {
  const m = -date.getTimezoneOffset();
  const a = Math.abs(m);
  return `${m < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Ejecuta fn(conn) dentro de una transacción. */
async function transaction(fn) {
  const conn = await getPool().getConnection();
  try {
    // READ COMMITTED: cada lectura ve lo último confirmado, así la revisión de cupo
    // que corre después de tomar el candado no usa una foto vieja de la agenda.
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { getPool, query, transaction, close, utcOffset };

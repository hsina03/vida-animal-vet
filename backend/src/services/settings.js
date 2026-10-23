const db = require('../db');

const NUMERIC = ['duracion_espacio_min', 'citas_simultaneas', 'anticipacion_min'];

async function getSettings(conn) {
  const run = conn ? (sql) => conn.execute(sql).then(([r]) => r) : (sql) => db.query(sql);
  const rows = await run('SELECT clave, valor FROM configuracion');
  const out = {};
  for (const { clave, valor } of rows) out[clave] = NUMERIC.includes(clave) ? Number(valor) : valor;
  out.duracion_espacio_min = out.duracion_espacio_min || 30;
  out.citas_simultaneas = out.citas_simultaneas || 1;
  out.anticipacion_min = out.anticipacion_min ?? 0;
  return out;
}

async function setSettings(values) {
  const entries = Object.entries(values);
  for (const [clave, valor] of entries) {
    await db.query(
      'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
      [clave, String(valor)],
    );
  }
}

module.exports = { getSettings, setSettings };

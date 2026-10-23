/** Propietarios y mascotas (RF-16, RF-17, RF-18). */
const db = require('../db');
const { HttpError, normalizePhone, requireText, optionalText } = require('../utils');

const SEXOS = ['Macho', 'Hembra'];

function cleanOwner(body) {
  const nombre = requireText(body.nombre, 'nombre');
  const telefono = normalizePhone(body.telefono);
  if (!telefono) throw new HttpError(400, 'El WhatsApp debe tener 10 dígitos, por ejemplo 656 123 4567.');
  const correo = optionalText(body.correo, 120);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'El correo no tiene un formato válido.');
  return { nombre, telefono, correo };
}

function cleanPet(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.nombre !== undefined) out.nombre = requireText(body.nombre, 'nombre de la mascota', 60);
  if (!partial || body.especie !== undefined) out.especie = requireText(body.especie, 'especie', 30);
  for (const k of ['raza', 'edad', 'peso']) if (body[k] !== undefined) out[k] = optionalText(body[k], 60);
  if (body.sexo !== undefined) {
    out.sexo = body.sexo ? String(body.sexo) : null;
    if (out.sexo && !SEXOS.includes(out.sexo)) throw new HttpError(400, 'El sexo debe ser Macho o Hembra.');
  }
  return out;
}

async function search(q) {
  const term = (q || '').trim();
  let rows;
  if (!term) {
    rows = await db.query('SELECT id, nombre, telefono, correo, creado_en FROM propietarios ORDER BY nombre LIMIT 200');
  } else {
    const like = `%${term}%`;
    const digits = term.replace(/\D/g, '');
    rows = await db.query(
      `SELECT DISTINCT p.id, p.nombre, p.telefono, p.correo, p.creado_en
         FROM propietarios p LEFT JOIN mascotas m ON m.propietario_id = p.id
        WHERE p.nombre LIKE ? OR m.nombre LIKE ? OR (? <> '' AND p.telefono LIKE ?)
        ORDER BY p.nombre LIMIT 200`,
      [like, like, digits, `%${digits}%`],
    );
  }
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const pets = await db.query(
    `SELECT id, propietario_id, nombre, especie FROM mascotas WHERE propietario_id IN (${ids.map(() => '?').join(',')}) ORDER BY nombre`,
    ids,
  );
  return rows.map((r) => ({ ...r, mascotas: pets.filter((p) => p.propietario_id === r.id) }));
}

async function getById(id) {
  const [owner] = await db.query('SELECT id, nombre, telefono, correo, creado_en FROM propietarios WHERE id = ?', [id]);
  if (!owner) throw new HttpError(404, 'No existe ese propietario.');
  owner.mascotas = await db.query(
    'SELECT id, nombre, especie, raza, edad, sexo, peso FROM mascotas WHERE propietario_id = ? ORDER BY nombre',
    [id],
  );
  owner.citas = await db.query(
    `SELECT c.id, c.fecha, TIME_FORMAT(c.hora, '%H:%i') AS hora, c.estado, s.nombre AS servicio, m.nombre AS mascota
       FROM citas c JOIN servicios s ON s.id = c.servicio_id JOIN mascotas m ON m.id = c.mascota_id
      WHERE c.propietario_id = ? ORDER BY c.fecha DESC, c.hora DESC LIMIT 50`,
    [id],
  );
  return owner;
}

async function create(body) {
  const owner = cleanOwner(body);
  const [dup] = await db.query('SELECT id FROM propietarios WHERE telefono = ?', [owner.telefono]);
  if (dup) throw new HttpError(409, 'Ya hay un propietario registrado con ese WhatsApp.');
  return db.transaction(async (conn) => {
    const [r] = await conn.execute('INSERT INTO propietarios (nombre, telefono, correo) VALUES (?, ?, ?)', [owner.nombre, owner.telefono, owner.correo]);
    if (body.mascota && body.mascota.nombre) {
      const pet = cleanPet(body.mascota);
      await conn.execute(
        'INSERT INTO mascotas (propietario_id, nombre, especie, raza, edad, sexo, peso) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [r.insertId, pet.nombre, pet.especie, pet.raza || null, pet.edad || null, pet.sexo || null, pet.peso || null],
      );
    }
    return r.insertId;
  });
}

async function update(id, body) {
  const owner = cleanOwner(body);
  const [dup] = await db.query('SELECT id FROM propietarios WHERE telefono = ? AND id <> ?', [owner.telefono, id]);
  if (dup) throw new HttpError(409, 'Otro propietario ya usa ese WhatsApp.');
  const r = await db.query('UPDATE propietarios SET nombre = ?, telefono = ?, correo = ? WHERE id = ?', [owner.nombre, owner.telefono, owner.correo, id]);
  if (!r.affectedRows) throw new HttpError(404, 'No existe ese propietario.');
}

async function addPet(ownerId, body) {
  const pet = cleanPet(body);
  const [owner] = await db.query('SELECT id FROM propietarios WHERE id = ?', [ownerId]);
  if (!owner) throw new HttpError(404, 'No existe ese propietario.');
  const r = await db.query(
    'INSERT INTO mascotas (propietario_id, nombre, especie, raza, edad, sexo, peso) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ownerId, pet.nombre, pet.especie, pet.raza || null, pet.edad || null, pet.sexo || null, pet.peso || null],
  );
  return r.insertId;
}

async function updatePet(petId, body) {
  const pet = cleanPet(body, { partial: true });
  const keys = Object.keys(pet);
  if (!keys.length) throw new HttpError(400, 'No hay cambios que guardar.');
  const r = await db.query(
    `UPDATE mascotas SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => pet[k] ?? null), petId],
  );
  if (!r.affectedRows) throw new HttpError(404, 'No existe esa mascota.');
}

/** Para el chatbot: busca al propietario por WhatsApp o lo registra; igual con la mascota. */
async function findOrCreateForBooking(conn, { nombre, telefono, mascota, especie }) {
  const tel = normalizePhone(telefono);
  if (!tel) throw new HttpError(400, 'El WhatsApp debe tener 10 dígitos.');
  const [[owner]] = await conn.execute('SELECT id FROM propietarios WHERE telefono = ?', [tel]);
  let ownerId = owner && owner.id;
  if (!ownerId) {
    const [r] = await conn.execute('INSERT INTO propietarios (nombre, telefono) VALUES (?, ?)', [requireText(nombre, 'nombre'), tel]);
    ownerId = r.insertId;
  }
  const petName = requireText(mascota, 'nombre de la mascota', 60);
  const [[pet]] = await conn.execute('SELECT id FROM mascotas WHERE propietario_id = ? AND nombre = ?', [ownerId, petName]);
  let petId = pet && pet.id;
  if (!petId) {
    const [r] = await conn.execute('INSERT INTO mascotas (propietario_id, nombre, especie) VALUES (?, ?, ?)', [ownerId, petName, requireText(especie, 'especie', 30)]);
    petId = r.insertId;
  }
  return { ownerId, petId };
}

module.exports = { search, getById, create, update, addPet, updatePet, findOrCreateForBooking };

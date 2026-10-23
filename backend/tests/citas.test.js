const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, db, resetDatabase, loginAs, nextWeekday } = require('./helpers');

let app; let admin; let fecha; let consulta; let owners;
before(async () => {
  await resetDatabase();
  app = createApp();
  admin = await loginAs(app, 'admin');
  fecha = nextWeekday();
  const info = await admin.get('/api/public/info');
  consulta = info.body.servicios.find((s) => s.clave === 'consulta');
  owners = (await admin.get('/api/propietarios')).body;
});
after(() => db.close());

const nueva = (i, hora = '10:00') => ({
  propietario_id: owners[i].id, mascota_id: owners[i].mascotas[0].id, servicio_id: consulta.id, fecha, hora,
});

test('la disponibilidad respeta el horario del día (RF-09)', async () => {
  const res = await admin.get(`/api/disponibilidad?fecha=${fecha}&servicio_id=${consulta.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.abierto, true);
  assert.equal(res.body.slots[0].hora, '09:00');
  assert.ok(res.body.slots.every((s) => s.hora < '19:00'));
});

test('no permite más citas simultáneas que la capacidad configurada (RNF-05)', async () => {
  assert.equal((await admin.post('/api/citas').send(nueva(0))).status, 201);
  assert.equal((await admin.post('/api/citas').send(nueva(1))).status, 201);
  const third = await admin.post('/api/citas').send(nueva(2));
  assert.equal(third.status, 409);
  assert.match(third.body.error, /disponible/);
  const day = await admin.get(`/api/disponibilidad?fecha=${fecha}&servicio_id=${consulta.id}`);
  assert.equal(day.body.slots.find((s) => s.hora === '10:00').disponible, false);
});

test('dos registros al mismo tiempo no rebasan la capacidad', async () => {
  const results = await Promise.all([2, 3, 4].map((i) => admin.post('/api/citas').send(nueva(i, '12:00'))));
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 201, 409]);
});

test('cancelar libera el horario y guarda el motivo (RF-12)', async () => {
  const list = (await admin.get(`/api/citas?desde=${fecha}&hasta=${fecha}`)).body.filter((c) => c.hora === '10:00');
  const res = await admin.post(`/api/citas/${list[0].id}/cancelar`).send({ motivo: 'El propietario lo solicitó' });
  assert.equal(res.status, 200);
  assert.equal(res.body.estado, 'cancelada');
  assert.equal((await admin.post('/api/citas').send(nueva(2))).status, 201);
});

test('reprogramar mueve la cita y valida el nuevo horario (RF-11)', async () => {
  const c = (await admin.get(`/api/citas?desde=${fecha}&hasta=${fecha}`)).body.find((x) => x.estado !== 'cancelada');
  const ok = await admin.post(`/api/citas/${c.id}/reprogramar`).send({ fecha, hora: '15:00' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.hora, '15:00');
  assert.equal(ok.body.estado, 'reprogramada');
  const closed = await admin.post(`/api/citas/${c.id}/reprogramar`).send({ fecha, hora: '20:00' });
  assert.equal(closed.status, 409);
});

test('solo permite cambios de estado válidos', async () => {
  const [c] = (await admin.get(`/api/citas?desde=${fecha}&hasta=${fecha}&estado=cancelada`)).body;
  const res = await admin.patch(`/api/citas/${c.id}/estado`).send({ estado: 'confirmada' });
  assert.equal(res.status, 409);
});

test('no acepta una mascota de otro propietario', async () => {
  const body = { ...nueva(0, '16:00'), mascota_id: owners[1].mascotas[0].id };
  assert.equal((await admin.post('/api/citas').send(body)).status, 400);
});

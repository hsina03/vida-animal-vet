const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { request, createApp, db, resetDatabase, loginAs } = require('./helpers');

let app;
before(async () => { await resetDatabase(); app = createApp(); });
after(() => db.close());

/** Envía un turno al asistente y devuelve la respuesta. */
async function send(sessionId, body) {
  const res = await request(app).post('/api/public/chat').send({ sessionId, ...body });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}
const pick = (r, prefix) => {
  const o = r.options.find((x) => x.id.startsWith(prefix));
  assert.ok(o, `Se esperaba una opción ${prefix}; llegaron ${r.options.map((x) => x.id).join(', ')}`);
  return { optionId: o.id };
};

test('el sitio público expone la información de la clínica (RF-03, RF-04)', async () => {
  const res = await request(app).get('/api/public/info');
  assert.equal(res.status, 200);
  assert.ok(res.body.servicios.length >= 5);
  assert.ok(res.body.horarioTexto);
  assert.match(res.body.whatsappUrl, /^https:\/\/wa\.me\//);
});

test('agendar por el asistente deja la cita pendiente y una solicitud para el personal (UC-02)', async () => {
  let r = await send(undefined, {});
  const sid = r.sessionId;
  r = await send(sid, { optionId: 'menu:cita' });
  r = await send(sid, pick(r, 'svc:'));
  r = await send(sid, { text: 'Firulais' });
  r = await send(sid, pick(r, 'esp:Perro'));
  r = await send(sid, pick(r, 'dia:'));
  r = await send(sid, pick(r, 'hora:'));
  r = await send(sid, { text: 'Prueba Automática' });
  r = await send(sid, { text: '656 999 1234' });
  r = await send(sid, pick(r, 'resumen:ok'));
  const all = r.messages.join(' ');
  assert.match(all, /SOL-\d{4}/);

  const admin = await loginAs(app, 'admin');
  const [sol] = (await admin.get('/api/solicitudes?abiertas=1')).body.filter((s) => s.tipo === 'cita');
  assert.equal(sol.nombre, 'Prueba Automática');
  const detalle = (await admin.get(`/api/solicitudes/${sol.id}`)).body;
  assert.ok(Array.isArray(detalle.conversacion) && detalle.conversacion.length > 4);

  const cita = (await admin.get(`/api/citas/${detalle.cita_id}`)).body;
  assert.equal(cita.estado, 'pendiente');
  assert.equal(cita.origen, 'chat');

  assert.equal((await admin.post(`/api/solicitudes/${sol.id}/resolver`)).status, 200);
  assert.equal((await admin.get(`/api/citas/${detalle.cita_id}`)).body.estado, 'confirmada');
  assert.equal((await admin.get('/api/solicitudes?abiertas=1')).body.some((s) => s.id === sol.id), false);
});

test('una urgencia escrita se canaliza al personal como urgente (UC-03)', async () => {
  const r0 = await send(undefined, {});
  const r = await send(r0.sessionId, { text: 'mi gato no respira bien, es urgente' });
  assert.ok(r.actions && r.actions.some((a) => a.type === 'whatsapp'));
  const admin = await loginAs(app, 'admin');
  const list = (await admin.get('/api/solicitudes?abiertas=1')).body;
  assert.ok(list.some((s) => s.tipo === 'canalizacion' && s.estado === 'urgente'));
});

test('valida el tipo de los datos que recibe', async () => {
  const res = await request(app).post('/api/public/chat').send({ text: { $gt: '' } });
  assert.equal(res.status, 400);
});

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { request, createApp, db, resetDatabase, loginAs, PASSWORDS } = require('./helpers');

let app;
before(async () => { await resetDatabase(); app = createApp(); });
after(() => db.close());

test('rechaza credenciales incorrectas con un mensaje claro (RF-01)', async () => {
  const res = await request(app).post('/api/auth/login').send({ usuario: 'admin', password: 'no-es' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /no coinciden/);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('una cuenta desactivada no puede entrar', async () => {
  const res = await request(app).post('/api/auth/login').send({ usuario: 'esilva', password: PASSWORDS.lrios });
  assert.equal(res.status, 403);
});

test('inicia sesión con cookie httpOnly y responde /me', async () => {
  const res = await request(app).post('/api/auth/login').send({ usuario: 'admin', password: PASSWORDS.admin });
  assert.equal(res.status, 200);
  const cookie = res.headers['set-cookie'].join(';');
  assert.match(cookie, /va_session=/);
  assert.match(cookie, /HttpOnly/i);
  const me = await request(app).get('/api/auth/me').set('Cookie', res.headers['set-cookie']);
  assert.equal(me.status, 200);
  assert.equal(me.body.rol, 'admin');
  assert.equal(me.body.password_hash, undefined);
});

test('las rutas del panel exigen sesión (RNF-04)', async () => {
  for (const url of ['/api/resumen', '/api/citas', '/api/propietarios', '/api/solicitudes', '/api/usuarios']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 401, url);
  }
});

test('el personal operativo no puede cambiar horarios, contenido ni usuarios (RF-02)', async () => {
  const op = await loginAs(app, 'lrios');
  assert.equal((await op.get('/api/horarios')).status, 200, 'sí puede consultar horarios');
  assert.equal((await op.put('/api/horarios').send({ dias: [], reglas: {} })).status, 403);
  assert.equal((await op.get('/api/usuarios')).status, 403);
  assert.equal((await op.put('/api/contacto').send({ telefono: '6560000000' })).status, 403);
});

test('el administrador no puede desactivar su propia cuenta', async () => {
  const admin = await loginAs(app, 'admin');
  const me = await admin.get('/api/auth/me');
  const res = await admin.patch(`/api/usuarios/${me.body.id}`).send({ activo: false });
  assert.equal(res.status, 409);
});

test('cerrar sesión invalida la cookie', async () => {
  const admin = await loginAs(app, 'admin');
  assert.equal((await admin.post('/api/auth/logout')).status, 200);
  assert.equal((await admin.get('/api/auth/me')).status, 401);
});

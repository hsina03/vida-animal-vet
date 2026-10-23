const test = require('node:test');
const assert = require('node:assert');
const { handle } = require('../src/engine');

function fakeDeps(overrides = {}) {
  const calls = { book: [], handoff: [] };
  const deps = {
    getServices: async () => [
      { id: 1, clave: 'consulta', nombre: 'Consulta general', agendable: 1 },
      { id: 3, clave: 'cirugia', nombre: 'Cirugías y procedimientos', agendable: 1 },
      { id: 8, clave: 'tienda', nombre: 'Medicamentos y productos', agendable: 0 },
    ],
    getFaq: async () => [{ id: 4, pregunta: '¿Cuánto cuesta una consulta?', respuesta: 'Depende del servicio.' }],
    getInfo: async () => ({ direccion: 'Plaza del Sol', horarioTexto: 'Lunes a viernes de 9:00 a 19:00.', whatsappUrl: 'https://wa.me/520000000000' }),
    getDays: async () => [{ fecha: '2026-10-23', label: 'Vie 23 oct' }],
    getSlots: async () => [{ hora: '10:00' }, { hora: '10:30' }],
    book: async (d) => { calls.book.push(d); return { folio: 'SOL-0001' }; },
    handoff: async (d) => { calls.handoff.push(d); return { folio: 'SOL-0002' }; },
    ...overrides,
  };
  return { deps, calls };
}

async function run(deps, steps) {
  let state;
  let reply;
  for (const input of steps) ({ state, reply } = await handle(state, input, deps));
  return { state, reply };
}

const pick = (reply, label) => ({ optionId: reply.options.find((o) => o.label === label).id });

test('saluda y muestra el menú', async () => {
  const { deps } = fakeDeps();
  const { reply } = await handle(undefined, {}, deps);
  assert.match(reply.messages[0], /asistente de Vida Animal II/);
  assert.deepStrictEqual(reply.options.map((o) => o.label), ['Agendar una cita', 'Preguntas frecuentes', 'Horario y ubicación', 'Hablar con el personal']);
});

test('agenda una cita completa y la registra con los datos capturados', async () => {
  const { deps, calls } = fakeDeps();
  let r = await handle(undefined, {}, deps);
  r = await handle(r.state, pick(r.reply, 'Agendar una cita'), deps);
  assert.ok(!r.reply.options.some((o) => o.label === 'Medicamentos y productos'), 'no ofrece servicios no agendables');
  r = await handle(r.state, pick(r.reply, 'Consulta general'), deps);
  r = await handle(r.state, { text: 'firulais' }, deps);
  assert.match(r.reply.messages[0], /Firulais/);
  r = await handle(r.state, pick(r.reply, 'Perro'), deps);
  r = await handle(r.state, pick(r.reply, 'Vie 23 oct'), deps);
  r = await handle(r.state, pick(r.reply, '10:30'), deps);
  r = await handle(r.state, { text: 'Nadia López' }, deps);
  r = await handle(r.state, { text: '123' }, deps);
  assert.match(r.reply.messages[0], /10 dígitos/);
  r = await handle(r.state, { text: '656-123-4567' }, deps);
  assert.match(r.reply.messages[0], /Revisa los datos/);
  r = await handle(r.state, pick(r.reply, 'Confirmar solicitud'), deps);
  assert.match(r.reply.messages[0], /SOL-0001/);
  assert.strictEqual(calls.book.length, 1);
  assert.deepStrictEqual(
    { ...calls.book[0], conversacion: undefined },
    { nombre: 'Nadia López', telefono: '656 123 4567', mascota: 'Firulais', especie: 'Perro', servicioId: 1, fecha: '2026-10-23', hora: '10:30', conversacion: undefined },
  );
  assert.ok(calls.book[0].conversacion.length > 5, 'guarda la conversación');
});

test('si el horario se ocupa al confirmar, ofrece los que siguen libres (UC-04)', async () => {
  let first = true;
  const { deps } = fakeDeps({
    book: async () => {
      if (first) { first = false; const e = new Error('Las 10:30 ya no están disponibles.'); e.status = 409; throw e; }
      return { folio: 'SOL-0009' };
    },
  });
  let s = await handle(undefined, {}, deps);
  s = await handle(s.state, { optionId: 'menu:cita' }, deps);
  s = await handle(s.state, { optionId: 'svc:1' }, deps);
  s = await handle(s.state, { text: 'Max' }, deps);
  s = await handle(s.state, { optionId: 'esp:Perro' }, deps);
  s = await handle(s.state, { optionId: 'dia:2026-10-23' }, deps);
  s = await handle(s.state, { optionId: 'hora:10:30' }, deps);
  s = await handle(s.state, { text: 'Ana Pérez' }, deps);
  s = await handle(s.state, { text: '6561234567' }, deps);
  s = await handle(s.state, { optionId: 'resumen:ok' }, deps);
  assert.match(s.reply.messages[0], /ya no están disponibles/);
  assert.strictEqual(s.state.step, 'cita:hora');
  s = await handle(s.state, { optionId: 'hora:10:00' }, deps);
  assert.match(s.reply.messages[0], /Revisa los datos/, 'conserva nombre y teléfono');
  s = await handle(s.state, { optionId: 'resumen:ok' }, deps);
  assert.match(s.reply.messages[0], /SOL-0009/);
});

test('detecta una posible urgencia y canaliza con el personal (RF-10)', async () => {
  const { deps, calls } = fakeDeps();
  const { reply } = await run(deps, [{}, { text: 'mi perro se comió chocolate qué hago' }]);
  assert.strictEqual(calls.handoff.length, 1);
  assert.strictEqual(calls.handoff[0].urgente, true);
  assert.strictEqual(reply.actions[0].type, 'whatsapp');
});

test('si no entiende dos veces, canaliza con el personal (UC-03)', async () => {
  const { deps, calls } = fakeDeps();
  let r = await run(deps, [{}, { text: 'asdf' }]);
  assert.match(r.reply.messages[0], /No entendí/);
  r = await handle(r.state, { text: 'qwerty' }, deps);
  assert.strictEqual(calls.handoff.length, 1);
});

test('responde preguntas frecuentes', async () => {
  const { deps } = fakeDeps();
  const { reply } = await run(deps, [{}, { optionId: 'menu:faq' }, { optionId: 'faq:4' }]);
  assert.strictEqual(reply.messages[0], 'Depende del servicio.');
});

test('ignora opciones que no se ofrecieron', async () => {
  const { deps, calls } = fakeDeps();
  const { reply } = await run(deps, [{}, { optionId: 'resumen:ok' }]);
  assert.strictEqual(calls.book.length, 0);
  assert.ok(reply.options.length > 0);
});

test('acepta el atajo «Agendar una cita» aunque esté a mitad de otra conversación', async () => {
  const { deps } = fakeDeps();
  const { reply, state } = await run(deps, [{}, { optionId: 'menu:faq' }, { optionId: 'menu:cita' }]);
  assert.strictEqual(state.step, 'cita:servicio');
  assert.match(reply.messages[0], /Qué servicio/);
});

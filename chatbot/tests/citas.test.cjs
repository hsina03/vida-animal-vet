// Ejecutar con Node.js: node tests/citas.test.cjs. Todos los datos son ficticios.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../chatbot-citas.js"), "utf8"), context);
const { createFlow } = context.window.VidaAnimalAppointments;
const fixedNow = () => new Date("2026-11-04T18:00:00Z"); // 11:00 en Ciudad Juárez.
const sample = ["Persona Ejemplo", "6560001234", "Luna", "Perro", "Mestiza", "3 años", "consulta", "05/11/2026", "4:30 pm", "Revisión general"];
let passed = 0;
function test(name, run) {
  try { run(); passed += 1; }
  catch (error) { throw new Error(`Falló: ${name}`, { cause: error }); }
}
function flowTo(count, options = {}) {
  const flow = createFlow({ now: fixedNow, ...options });
  flow.start();
  sample.slice(0, count).forEach((value) => flow.handle(value));
  return flow;
}

test("Inicio y reingreso conservan el borrador", () => {
  const flow = createFlow({ now: fixedNow });
  assert.equal(flow.isActive(), false);
  assert.match(flow.start().text, /datos ficticios/);
  flow.handle(sample[0]);
  assert.match(flow.start().text, /teléfono/);
  assert.equal(flow.getDraft().owner_name, sample[0]);
  assert.equal(flow.getMetadata().inputMode, "tel");
});

test("Flujo completo, resumen y confirmación explícita sin enviar", () => {
  const flow = flowTo(9);
  const review = flow.handle(sample[9]);
  assert.match(review.text, /Revisa los datos[\s\S]*05\/11\/2026[\s\S]*16:30/);
  assert.equal(flow.isActive(), true);
  assert.equal(flow.getDraft().status, undefined);
  assert.match(flow.handle("listo").text, /confirmación explícita/);
  assert.equal(flow.isActive(), true);
  assert.ok(review.actions.some((action) => action.label === "Finalizar prueba"));
  assert.match(flow.handle("confirmar").text, /No se envió ni registró[\s\S]*no hay una cita confirmada/);
  assert.equal(flow.isActive(), false);
  assert.equal(Object.keys(flow.getDraft()).length, 0);
  assert.equal(flow.handle("confirmar"), null);
});

test("Nombre completo y texto sin HTML", () => {
  const flow = flowTo(0);
  for (const value of ["Ana", "123 456", "<b>Ana López</b>", " "]) {
    flow.handle(value);
    assert.equal(flow.getDraft().owner_name, undefined);
  }
  flow.handle("María O'Neill-López");
  assert.equal(flow.getDraft().owner_name, "María O'Neill-López");
});

test("Teléfonos: formato mexicano y rechazo de entradas inválidas", () => {
  for (const invalid of ["abc6560001234", "123", "+16560001234", "+6560001234", "0000000000", "6560001234 ext 1"]) {
    const flow = flowTo(1);
    flow.handle(invalid);
    assert.equal(flow.getDraft().owner_phone, undefined, invalid);
  }
  for (const valid of ["6560001234", "+52 (656) 000-1234", "52 656 000 1234"]) {
    const flow = flowTo(1);
    flow.handle(valid);
    assert.equal(flow.getDraft().owner_phone, "+526560001234");
  }
});

test("Campos opcionales y especie válida", () => {
  const flow = flowTo(3);
  flow.handle("123");
  assert.equal(flow.getDraft().pet_species, undefined);
  flow.handle("Conejo");
  flow.handle("no sé");
  flow.handle("omitir");
  assert.equal(flow.getDraft().pet_breed, null);
  assert.equal(flow.getDraft().pet_age, null);
  assert.equal(flow.getDraft().pet_species, "Conejo");
});

test("Edad con unidad y aproximaciones", () => {
  for (const invalid of ["3", "-2 años", "muchos", "4 horas"]) {
    const flow = flowTo(5);
    flow.handle(invalid);
    assert.equal(flow.getDraft().pet_age, undefined, invalid);
  }
  for (const valid of ["2,5 años", "aproximadamente 6 meses", "2 semanas"]) {
    const flow = flowTo(5);
    flow.handle(valid);
    assert.equal(flow.getDraft().pet_age, valid);
  }
});

test("Servicios conocidos y selección numérica", () => {
  const flow = flowTo(6);
  flow.handle("radiografías");
  assert.equal(flow.getDraft().service, undefined);
  flow.handle("6");
  assert.equal(flow.getDraft().service, "Hospedaje");
});

test("Fechas reales, pasadas, formatos y año bisiesto", () => {
  for (const invalid of ["31/02/2027", "2027-02-29", "2026-13-01", "03/11/2026", "05/11/26"]) {
    const flow = flowTo(7);
    flow.handle(invalid);
    assert.equal(flow.getDraft().desired_date, undefined, invalid);
  }
  for (const [raw, iso] of [["29/02/2028", "2028-02-29"], ["2026-11-05", "2026-11-05"], ["mañana", "2026-11-05"], ["hoy", "2026-11-04"]]) {
    const flow = flowTo(7);
    flow.handle(raw);
    assert.equal(flow.getDraft().desired_date, iso);
  }
});

test("Hora preferida válida, sin confundir disponibilidad", () => {
  for (const invalid of ["24:00", "12:60", "4", "13 pm", "00 am"]) {
    const flow = flowTo(8);
    flow.handle(invalid);
    assert.equal(flow.getDraft().preferred_time, undefined, invalid);
  }
  for (const [raw, time] of [["12 am", "00:00"], ["12 pm", "12:00"], ["4:30 p. m.", "16:30"], ["9:05", "09:05"]]) {
    const flow = flowTo(8);
    flow.handle(raw);
    assert.equal(flow.getDraft().preferred_time, time);
  }
  const today = flowTo(7);
  today.handle("hoy");
  today.handle("10:59");
  assert.equal(today.getDraft().preferred_time, undefined);
  today.handle("11:00");
  assert.equal(today.getDraft().preferred_time, undefined);
  today.handle("11:01");
  assert.equal(today.getDraft().preferred_time, "11:01");
});

test("Corregir desde resumen por nombre, número o clave", () => {
  const flow = flowTo(10);
  flow.handle("corregir");
  assert.equal(flow.resume().actions.length, 12);
  flow.handle("corregir teléfono");
  assert.match(flow.handle("6560004321").text, /Revisa los datos/);
  assert.equal(flow.getDraft().owner_phone, "+526560004321");
  flow.handle("corregir 3");
  flow.handle("Nube");
  assert.equal(flow.getDraft().pet_name, "Nube");
  flow.handle("corregir pet_breed");
  flow.handle("omitir");
  assert.equal(flow.getDraft().pet_breed, null);
  const copy = flow.getDraft();
  copy.pet_name = "Cambio externo";
  assert.equal(flow.getDraft().pet_name, "Nube");
});

test("Atrás, ayuda y corrección antes del resumen", () => {
  const flow = flowTo(0);
  assert.match(flow.handle("atrás").text, /no hay un dato anterior/);
  assert.match(flow.handle("corregir").text, /al menos un dato/);
  flow.handle(sample[0]);
  flow.handle("atrás");
  flow.handle("Otra Persona");
  assert.match(flow.resume().text, /teléfono/);
  flow.handle("corregir");
  assert.match(flow.handle("inexistente").text, /Elige un dato/);
  assert.match(flow.handle("continuar").text, /teléfono/);
  assert.match(flow.handle("ayuda").text, /Responde al dato/);
  assert.equal(flow.getDraft().owner_name, "Otra Persona");
});

test("Cancelación de borradores en cualquier punto", () => {
  for (const count of [0, 4, 10]) {
    const flow = flowTo(count);
    assert.match(flow.handle("cancelar").text, /No se ha enviado ni registrado/);
    assert.equal(flow.isActive(), false);
    assert.equal(Object.keys(flow.getDraft()).length, 0);
    assert.equal(flow.resume().showMenu, true);
  }
  const flow = flowTo(10);
  flow.handle("corregir");
  flow.handle("cancelar");
  assert.equal(flow.isActive(), false);
  const informal = flowTo(2);
  assert.match(informal.handle("cancelar cita").text, /Cancelé el borrador/);
  assert.equal(informal.isActive(), false);
});

test("Campos obligatorios configurables", () => {
  const flow = flowTo(1, { requiredFields: { owner_phone: false, pet_breed: true } });
  flow.handle("omitir");
  assert.equal(flow.getDraft().owner_phone, null);
  flow.handle("Luna");
  flow.handle("Perro");
  assert.match(flow.handle("omitir").text, /obligatorio/);
  flow.handle("Mestiza");
  assert.equal(flow.getDraft().pet_breed, "Mestiza");
  assert.throws(() => createFlow({ requiredFields: { desconocido: true } }), /no válida/);
});

test("Cambiar la fecha invalida una hora que ya pasó", () => {
  const flow = flowTo(10);
  flow.handle("corregir hora");
  flow.handle("09:00"); // Válida para mañana.
  flow.handle("corregir fecha");
  assert.match(flow.handle("hoy").text, /hora preferida ya pasó/);
  assert.equal(flow.getDraft().preferred_time, undefined);
  assert.equal(flow.getDraft().reason, sample[9]);
  assert.match(flow.handle("18:00").text, /Revisa los datos/);
});

test("Confirmar vuelve a comprobar fecha y hora actuales", () => {
  let now = fixedNow();
  const flow = flowTo(10, { now: () => now });
  now = new Date("2026-11-06T18:00:00Z");
  assert.match(flow.handle("confirmar").text, /fecha del borrador ya pasó/);
  assert.equal(flow.isActive(), true);
  assert.equal(flow.getDraft().desired_date, undefined);
  assert.equal(flow.getDraft().preferred_time, undefined);
});

test("Límites de motivo de visita", () => {
  const flow = flowTo(9);
  flow.handle("x".repeat(501));
  assert.equal(flow.getDraft().reason, undefined);
  flow.handle("x".repeat(500));
  assert.equal(flow.getDraft().reason.length, 500);
});

console.log(`PASS: ${passed} escenarios del flujo de citas (datos ficticios, validaciones y correcciones).`);

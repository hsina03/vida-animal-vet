// Pruebas sin dependencias: node tests/faq.test.cjs (si tienes Node.js instalado).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "chatbot-faq.js"), "utf8"), context);
const { resolveReply, normalizeText } = context.window.VidaAnimalFAQ;

// Cada caso comprueba la intención esperada por un cliente, no una expresión regular.
const cases = [
  ["¿Qué servicios ofrecen?", "servicios"],
  ["Quisiera conocer sus servicios", "servicios"],
  ["¿Hacen consultas?", "consulta"],
  ["¿Vacunan perros?", "vacunacion"],
  ["Hola, ¿tienen vacunas para gatos?", "vacunacion"],
  ["¿Tienen servicio de estética?", "estetica"],
  ["¿Tienen servicio de baño y corte?", "estetica"],
  ["¿Bañan mascotas?", "estetica"],
  ["¿Puedo dejar hospedada a mi mascota?", "hospedaje"],
  ["¿Tienen pensión?", "hospedaje"],
  ["¿Realizan cirugías?", "cirugia"],
  ["¿Operan mascotas?", "cirugia"],
  ["¿Ofrecen hospitalización?", "hospitalizacion"],
  ["¿Qué estudios complementarios hacen?", "estudios"],
  ["¿Tienen cremación?", "cremacion"],
  ["¿Tienen vacunas y baño?", "vacunacion+estetica"],
  ["¿Cuánto cuesta una consulta?", "precios"],
  ["Precio de una vacuna", "precios"],
  ["¿Cuánto cobran por el baño?", "precios"],
  ["¿Y cuánto sale?", "precios"],
  ["¿Tienen tarifas de hospedaje?", "precios"],
  // Formas cotidianas de preguntar, sin acentos ni puntuación formal.
  ["cual es el costo de las consultas?", "precios"],
  ["tiene  hospedaje para mascotas?", "hospedaje"],
  ["hola buenas, cual es el costo de una consulta", "precios"],
  ["en cuanto anda la consulta?", "precios"],
  ["en cuanto salen las vacunas", "precios"],
  ["cuanto me cobran por vacunar?", "precios"],
  ["cuanto nos cobran por el hospedaje", "precios"],
  ["cuanto es por bañar a mi perro", "precios"],
  ["a como la consulta?", "precios"],
  ["a como estan las vacunas?", "precios"],
  ["oye, tienen pension para perritos?", "hospedaje"],
  ["puedo dejar a mi perrito unos dias?", "hospedaje"],
  ["quiero dejarles a mi gatita mientras viajo", "hospedaje"],
  ["puedo dejar a mi mascota por la noche?", "hospedaje"],
  ["cuanto me cobran por dejar a mi perrito unos dias", "precios"],
  ["puedo dejar a mi perrito para una consulta", "consulta"],
  ["quiero dejar a mi gato para una cirugia", "cirugia"],
  ["¿Dónde están ubicados?", "ubicacion"],
  ["¿Cómo llego?", "ubicacion"],
  ["¿Me pasan su dirección?", "ubicacion"],
  ["¿Dónde puedo encontrarlos?", "ubicacion"],
  ["¿Cuál es su horario?", "horarios"],
  ["¿A qué hora abren?", "horarios"],
  ["¿Atienden los sábados?", "horarios"],
  ["¿Trabajan en días festivos?", "horarios"],
  ["¿Están abiertos las 24 horas?", "horarios"],
  ["¿Dónde están y cuál es su horario?", "ubicacion"],
  ["¿Cómo contacto a un veterinario?", "contacto"],
  ["Quiero hablar con una persona", "contacto"],
  ["Quiero hablar con alguien", "contacto"],
  ["¿Me comunicas con un veterinario?", "contacto"],
  ["¿Tienen teléfono o WhatsApp?", "contacto"],
  ["¿Cómo puedo agendar?", "citas"],
  ["Quiero reservar una consulta", "citas"],
  ["¿Cómo cancelo mi cita?", "gestionCitas"],
  ["quiero reagendar mi cita", "gestionCitas"],
  ["como cambio mi cita", "gestionCitas"],
  ["¿Hay citas disponibles mañana?", "disponibilidad"],
  ["¿Pueden vacunar a mi gato hoy?", "disponibilidad"],
  ["¿Tienen hospedaje disponible?", "disponibilidad"],
  ["¿Venden medicamentos?", "productos"],
  ["¿Tienen croquetas?", "productos"],
  ["¿Qué productos venden?", "productos"],
  ["¿Qué medicamento le doy?", "orientacionClinica"],
  ["¿Qué le puedo dar para el dolor?", "orientacionClinica"],
  ["Necesito una dosis de medicina", "orientacionClinica"],
  ["Mi perro tiene diarrea", "orientacionClinica"],
  ["¿Atienden emergencias?", "emergencia"],
  ["Mi mascota no puede respirar, ¿cuánto cuesta?", "emergencia"],
  ["Está convulsionando", "emergencia"],
  ["Mi gato fue atropellado", "emergencia"],
  ["Creo que comió veneno", "emergencia"],
  ["Tiene sangrado abundante", "emergencia"],
  ["Está sangrando mucho", "emergencia"],
  ["Mi perro no está respirando", "emergencia"],
  ["Mi mascota está inconsciente", "emergencia"],
  ["¡HOLA!", "saludo"],
  ["Muchas gracias", "gracias"],
  ["Hasta pronto", "despedida"],
  ["MENÚ", "menu"],
  ["Preguntas frecuentes", "preguntas"],
  // No confirmar procedimientos o especies que no aparecen en la entrevista.
  ["¿Hacen radiografías?", "desconocido"],
  ["¿Atienden reptiles?", "desconocido"],
  ["¿Ofrecen eutanasia?", "desconocido"],
  ["¿Tienen servicio a domicilio?", "desconocido"],
  ["¿Tienen servicio de limpieza dental?", "desconocido"],
  ["¿Tienen servicio de radiografías?", "desconocido"],
  ["Hola, ¿tienen estacionamiento?", "desconocido"],
  ["¿Puedo pagar con tarjeta?", "desconocido"],
  ["Mi mascota se hizo un corte", "desconocido"],
  ["¿Qué es una vacuna?", "vacunacion"],
  ["<img src=x onerror=alert(1)>", "desconocido"]
];

for (const [question, expectedIntent] of cases) {
  const result = resolveReply(question);
  assert.equal(result.intent, expectedIntent, question);
  assert.equal(typeof result.text, "string", question);
  assert.ok(result.text.length > 0, question);
  assert.equal(typeof result.showMenu, "boolean", question);
  assert.equal(result.urgent, expectedIntent === "emergencia", question);
}

assert.equal(normalizeText("  ¿VACUNACIÓN?  "), "vacunacion");
assert.match(resolveReply("¿Dónde están y cuál es su horario?").text, /Plaza del Sol[\s\S]*horarios[\s\S]*pendientes/);
assert.match(resolveReply("Precio de una vacuna").text, /no contamos con una lista de precios autorizada/);
assert.match(resolveReply("¿Tienen teléfono?").text, /pendientes de confirmación/);
assert.match(resolveReply("¿Hay citas mañana?").text, /No se ha reservado ni confirmado/);
assert.match(resolveReply("¿Cómo puedo agendar?").text, /no se ha creado ninguna solicitud/);
assert.match(resolveReply("¿Vacunan conejos?").text, /confirmar[\s\S]*especies/);
assert.match(resolveReply("¿Atienden emergencias?").text, /No tenemos confirmado/);
assert.match(resolveReply("¿Están abiertos las 24 horas?").text, /No tenemos confirmado/);
assert.equal(resolveReply("Esto no se entiende").showMenu, true);

// Evitar que la integración olvide cargar el módulo antes de la interfaz.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)" defer>/g)].map((match) => match[1]);
assert.deepEqual(scripts, ["chatbot-faq.js", "chatbot-citas.js", "chatbot.js"]);
for (const file of scripts) assert.ok(fs.existsSync(path.join(root, file)));
new vm.Script(fs.readFileSync(path.join(root, "chatbot.js"), "utf8"));
console.log(`PASS: ${cases.length} preguntas, restricciones de información e integración de scripts.`);

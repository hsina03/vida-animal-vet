/**
 * Motor de conversación del asistente de Vida Animal II (RF-06 a RF-10, UC-03).
 *
 * Es una máquina de estados sin dependencias: recibe el estado actual de la
 * conversación y la entrada del usuario, y devuelve la respuesta y el nuevo
 * estado. Todo el acceso a datos llega por `deps`, así el mismo motor sirve
 * para el chat del sitio web y, más adelante, para un canal de WhatsApp.
 *
 * deps = {
 *   getServices(): Promise<[{ id, clave, nombre, agendable }]>,
 *   getFaq():      Promise<[{ id, pregunta, respuesta }]>,
 *   getInfo():     Promise<{ horarioTexto, direccion, whatsappUrl }>,
 *   getDays(servicioId): Promise<[{ fecha, label }]>,      // días con horarios libres
 *   getSlots(fecha, servicioId): Promise<[{ hora }]>,      // solo horarios libres
 *   book(data):    Promise<{ folio }>,  // lanza un error con status 409 si el horario se ocupó
 *   handoff(data): Promise<{ folio }>,
 * }
 */

const ESPECIES = ['Perro', 'Gato', 'Conejo', 'Ave', 'Otra'];
const URGENTE = /(urgen|emergen|envenen|veneno|chocolate|sangr|no respira|atropell|convuls|desmay|se comi[oó]|golpe)/i;

const MENU = [
  { id: 'menu:cita', label: 'Agendar una cita' },
  { id: 'menu:faq', label: 'Preguntas frecuentes' },
  { id: 'menu:horario', label: 'Horario y ubicación' },
  { id: 'menu:humano', label: 'Hablar con el personal' },
];
const MAS = [
  { id: 'menu:cita', label: 'Agendar una cita' },
  { id: 'menu:faq', label: 'Otra pregunta' },
  { id: 'menu:humano', label: 'Hablar con el personal' },
];

const initialState = () => ({ step: 'inicio', data: {}, transcript: [], misses: 0 });

function capitalize(s) {
  const t = String(s || '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function onlyDigits(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * @param {object} state  estado previo (o undefined para iniciar)
 * @param {{ optionId?: string, text?: string }} input
 * @param {object} deps
 * @returns {Promise<{ state, reply: { messages: string[], options: {id,label}[], input: null|{type,placeholder}, actions: object[] } }>}
 */
async function handle(prev, input = {}, deps) {
  const state = prev ? { ...prev, data: { ...prev.data }, transcript: [...prev.transcript] } : initialState();
  const reply = { messages: [], options: [], input: null, actions: [] };
  const say = (text) => { reply.messages.push(text); state.transcript.push(['bot', text]); };
  const ask = (type, placeholder) => { reply.input = { type, placeholder }; };

  // Lo que eligió o escribió la persona queda en la conversación
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, 300) : '';
  let optionId = input.optionId || null;
  if (optionId) {
    // Las opciones del menú principal siempre son válidas (p. ej. el botón «Agendar cita» del sitio)
    const global = [...MENU, { id: 'menu:inicio', label: 'Volver al inicio' }, { id: 'menu:fin', label: 'No, gracias' }];
    const label = ((prev && prev.lastOptions) || []).find((o) => o.id === optionId)?.label
      || global.find((o) => o.id === optionId)?.label;
    if (!label) optionId = null; // opción que ya no aplica: se ignora
    else state.transcript.push(['me', label]);
  } else if (text) {
    state.transcript.push(['me', text]);
  }

  // ---------- pasos ----------
  const showMenu = (first) => {
    state.step = 'menu';
    if (first) say('¡Hola! Soy el asistente de Vida Animal II. Puedo ayudarte a agendar una cita o resolver tus dudas.');
    say('¿Qué necesitas?');
    reply.options = MENU;
  };
  const showMore = () => { state.step = 'menu'; say('¿Te ayudo con algo más?'); reply.options = MAS; };

  const startBooking = async () => {
    state.step = 'cita:servicio';
    state.data = {};
    const servicios = (await deps.getServices()).filter((s) => s.agendable);
    say('Con gusto. ¿Qué servicio necesitas?');
    reply.options = [...servicios.map((s) => ({ id: `svc:${s.id}`, label: s.nombre })), { id: 'svc:otro', label: 'Otro' }];
  };

  const offerDays = async () => {
    state.step = 'cita:dia';
    const days = await deps.getDays(state.data.servicioId);
    if (!days.length) {
      say('Por ahora no hay horarios libres en los próximos días. Te comunico con el personal para buscarte un espacio.');
      return handoff('No encontró horarios libres para agendar', false);
    }
    say('Elige el día:');
    reply.options = days.map((d) => ({ id: `dia:${d.fecha}`, label: d.label }));
    return undefined;
  };

  const offerSlots = async (intro) => {
    state.step = 'cita:hora';
    const slots = await deps.getSlots(state.data.fecha, state.data.servicioId);
    if (!slots.length) {
      say('Ese día ya no tiene horarios libres. Elige otro, por favor.');
      return offerDays();
    }
    say(intro || `Estos son los horarios libres para ${state.data.diaLabel}:`);
    reply.options = slots.map((s) => ({ id: `hora:${s.hora}`, label: s.hora }));
    return undefined;
  };

  const showSummary = () => {
    state.step = 'cita:resumen';
    const d = state.data;
    say(`Revisa los datos de tu cita:\nServicio: ${d.servicio}\nMascota: ${d.mascota} (${d.especie})\nFecha: ${d.diaLabel}, ${d.hora}\nPropietario: ${d.nombre}\nWhatsApp: ${d.telefono}`);
    reply.options = [{ id: 'resumen:ok', label: 'Confirmar solicitud' }, { id: 'resumen:editar', label: 'Cambiar datos' }];
  };

  const handoff = async (tema, urgente) => {
    state.step = 'humano';
    const info = await deps.getInfo();
    const { folio } = await deps.handoff({ tema, urgente, conversacion: state.transcript });
    say(urgente
      ? `Como puede tratarse de una urgencia, avisé al personal (folio ${folio}). Escríbenos por WhatsApp ahora mismo para preparar su atención.`
      : `Te comunico con el personal de la clínica (folio ${folio}). Puedes continuar por WhatsApp; ten a la mano el nombre de tu mascota.`);
    reply.actions = [{ type: 'whatsapp', label: 'Continuar en WhatsApp', url: info.whatsappUrl }];
    reply.options = [{ id: 'menu:inicio', label: 'Volver al inicio' }];
  };

  const showFaq = async () => {
    state.step = 'faq';
    const faq = await deps.getFaq();
    say('Estas son las preguntas más comunes:');
    reply.options = [...faq.map((f) => ({ id: `faq:${f.id}`, label: f.pregunta })), { id: 'faq:otra', label: 'Mi pregunta no está aquí' }];
  };

  const showHours = async () => {
    const info = await deps.getInfo();
    say(`Estamos en ${info.direccion}. ${info.horarioTexto}`);
    showMore();
  };

  // ---------- opciones globales ----------
  if (!prev || optionId === 'menu:inicio') { showMenu(!prev); return finish(); }
  if (optionId === 'menu:cita') { await startBooking(); return finish(); }
  if (optionId === 'menu:faq') { await showFaq(); return finish(); }
  if (optionId === 'menu:horario') { await showHours(); return finish(); }
  if (optionId === 'menu:humano') { await handoff('Pidió hablar con el personal', false); return finish(); }
  if (optionId === 'menu:fin') { state.step = 'fin'; say('¡Gracias por escribirnos! Aquí estaremos cuando nos necesites.'); reply.options = [{ id: 'menu:inicio', label: 'Volver al inicio' }]; return finish(); }

  // ---------- según el paso ----------
  switch (state.step) {
    case 'cita:servicio': {
      if (optionId === 'svc:otro') { await handoff('Busca un servicio que no está en la lista', false); break; }
      const id = optionId && Number(optionId.split(':')[1]);
      const svc = id && (await deps.getServices()).find((s) => s.id === id && s.agendable);
      if (!svc) { say('Elige uno de los servicios de la lista, por favor.'); await startBooking(); break; }
      state.data.servicioId = svc.id;
      state.data.servicio = svc.nombre;
      if (svc.clave === 'cirugia') say('Para cirugías primero agendamos una valoración con el médico.');
      state.step = 'cita:mascota';
      say('¿Cómo se llama tu mascota?');
      ask('text', 'Nombre de tu mascota');
      break;
    }
    case 'cita:mascota': {
      if (!text || text.length > 60) { say('Escribe el nombre de tu mascota, por favor.'); ask('text', 'Nombre de tu mascota'); break; }
      state.data.mascota = capitalize(text);
      state.step = 'cita:especie';
      say(`¿Qué especie es ${state.data.mascota}?`);
      reply.options = ESPECIES.map((e) => ({ id: `esp:${e}`, label: e }));
      break;
    }
    case 'cita:especie': {
      const esp = optionId && optionId.split(':')[1];
      if (!ESPECIES.includes(esp)) { say('Elige una especie de la lista.'); reply.options = ESPECIES.map((e) => ({ id: `esp:${e}`, label: e })); break; }
      state.data.especie = esp;
      await offerDays();
      break;
    }
    case 'cita:dia': {
      const fecha = optionId && optionId.slice(4);
      const label = (prev.lastOptions || []).find((o) => o.id === optionId)?.label;
      if (!fecha || !label) { await offerDays(); break; }
      state.data.fecha = fecha;
      state.data.diaLabel = label;
      await offerSlots();
      break;
    }
    case 'cita:hora': {
      const hora = optionId && optionId.slice(5);
      if (!hora) { await offerSlots(); break; }
      state.data.hora = hora;
      if (state.data.nombre && state.data.telefono) { showSummary(); break; }
      state.step = 'cita:nombre';
      say('¿A nombre de quién registro la cita?');
      ask('text', 'Tu nombre completo');
      break;
    }
    case 'cita:nombre': {
      if (!text || text.length < 3) { say('Escribe tu nombre completo, por favor.'); ask('text', 'Tu nombre completo'); break; }
      state.data.nombre = text.replace(/\s+/g, ' ');
      state.step = 'cita:telefono';
      say('¿A qué número de WhatsApp te confirmamos?');
      ask('tel', 'Ej. 656 123 4567');
      break;
    }
    case 'cita:telefono': {
      const tel = onlyDigits(text);
      if (tel.length !== 10) { say('El número debe tener 10 dígitos. Escríbelo de nuevo, por ejemplo 656 123 4567.'); ask('tel', 'Ej. 656 123 4567'); break; }
      state.data.telefono = `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}`;
      showSummary();
      break;
    }
    case 'cita:resumen': {
      if (optionId === 'resumen:editar') { state.data.nombre = undefined; state.data.telefono = undefined; await startBooking(); break; }
      if (optionId !== 'resumen:ok') { showSummary(); break; }
      try {
        const d = state.data;
        const { folio } = await deps.book({
          nombre: d.nombre, telefono: d.telefono, mascota: d.mascota, especie: d.especie,
          servicioId: d.servicioId, fecha: d.fecha, hora: d.hora, conversacion: state.transcript,
        });
        state.step = 'cita:lista';
        say(`Listo, ${d.nombre.split(' ')[0]}. Tu solicitud quedó registrada con el folio ${folio}. El personal te confirmará la cita por WhatsApp.`);
        say('¿Te ayudo con algo más?');
        reply.options = [{ id: 'menu:inicio', label: 'Volver al inicio' }, { id: 'menu:fin', label: 'No, gracias' }];
        state.data = {};
      } catch (err) {
        if (err && err.status === 409) {
          // UC-04, excepción «horario ocupado»
          await offerSlots(`${err.message || 'Ese horario ya no está disponible.'} Estos siguen libres:`);
        } else {
          throw err;
        }
      }
      break;
    }
    case 'faq': {
      if (optionId === 'faq:otra') { await handoff('Tiene una pregunta que no está en la lista', false); break; }
      const id = optionId && Number(optionId.split(':')[1]);
      const item = id && (await deps.getFaq()).find((f) => f.id === id);
      if (!item) { await showFaq(); break; }
      say(item.respuesta);
      showMore();
      break;
    }
    default: {
      // Texto libre en el menú u otro paso sin entrada esperada
      if (!text) { showMenu(false); break; }
      if (URGENTE.test(text)) { await handoff(text, true); break; }
      if (/(cita|agendar|agenda|reservar|consulta)/i.test(text)) { await startBooking(); break; }
      if (/(horario|hora|ubic|d[oó]nde|direcci)/i.test(text)) { await showHours(); break; }
      if (/(precio|cu[aá]nto|costo|cobran)/i.test(text)) {
        const faq = await deps.getFaq();
        const costo = faq.find((f) => /cuesta|costo|precio/i.test(f.pregunta));
        if (costo) { say(costo.respuesta); showMore(); break; }
      }
      state.misses += 1;
      if (state.misses >= 2) { await handoff(text, false); break; }
      // UC-03, excepción «consulta no entendida»
      say('No entendí tu mensaje. Elige una opción o habla directamente con el personal.');
      reply.options = MENU;
      state.step = 'menu';
    }
  }
  return finish();

  function finish() {
    state.lastOptions = reply.options;
    return { state, reply };
  }
}

module.exports = { handle, initialState, ESPECIES, URGENTE };

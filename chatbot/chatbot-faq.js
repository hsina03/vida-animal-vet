(() => {
  "use strict";

  // Base de conocimiento de la entrevista. No implica disponibilidad de agenda.
  // Este módulo no depende del DOM, no guarda datos y puede probarse por separado.
  const replies = {
    servicios: "Ofrecemos consultas médicas generales, vacunación, cirugías y procedimientos clínicos, hospitalización, estética (baño y corte), hospedaje, venta de medicamentos y productos, estudios complementarios y cremación.\n\nEl personal debe confirmar los detalles y la disponibilidad de cada servicio.",
    precios: "Todavía no contamos con una lista de precios autorizada por la clínica. El personal deberá confirmar el costo del servicio que necesitas.\n\nPuedes elegir «Contactar al personal» para consultar la información de contacto disponible.",
    horarios: "Los horarios de atención de la sucursal Plaza del Sol están pendientes de confirmación. No puedo asegurar que esté abierta hoy, en fin de semana o en un día festivo. Consulta con el personal antes de acudir.",
    ubicacion: "La sucursal está en Plaza del Sol, en Ciudad Juárez, Chihuahua. La dirección exacta y el enlace oficial del mapa están pendientes de confirmación.",
    productos: "La clínica ofrece venta de medicamentos y productos para mascotas. Todavía no contamos con un catálogo, precios ni existencias confirmadas.\n\nConsulta con el personal el producto que necesitas. No puedo recomendar ni prescribir medicamentos.",
    contacto: "Con gusto te orientaría para hablar con el personal. El teléfono y el enlace oficial de WhatsApp todavía están pendientes de confirmación.\n\nPor ahora este chat no puede transferirte con una persona ni enviarle mensajes. Si ya tienes un contacto oficial de la clínica, utiliza ese medio.",
    citas: "Podemos preparar un borrador de solicitud de cita paso a paso. Usa datos ficticios: por ahora no se envía información al personal y no se ha creado ninguna solicitud. La fecha y la hora deberán ser confirmadas por el personal.",
    gestionCitas: "Este chat todavía no puede consultar, modificar ni cancelar citas existentes. No se ha hecho ningún cambio en tu cita. Comunícate con el personal mediante un contacto oficial que ya tengas; el teléfono y WhatsApp siguen pendientes de confirmación aquí.",
    disponibilidad: "No tengo acceso a una agenda ni a disponibilidad en tiempo real. El personal debe confirmar los espacios, las fechas y las horas para el servicio que necesitas. No se ha reservado ni confirmado ninguna cita.",
    preguntas: "Puedes preguntarme, por ejemplo:\n• ¿Qué servicios ofrecen?\n• ¿Vacunan perros?\n• ¿Tienen baño y corte?\n• ¿Cuánto cuesta una consulta?\n• ¿Dónde están y cuál es su horario?\n• ¿Cómo puedo agendar?\n• ¿Cómo contacto a un veterinario?\n\nSi falta información confirmada, te lo indicaré. También puedes volver al menú principal.",
    saludo: "¡Hola! Qué gusto saludarte. 🐾 Puedes preguntarme por los servicios, precios, horarios o ubicación. ¿En qué podemos ayudarte?",
    gracias: "¡Con gusto! 🐾 Si necesitas algo más, escribe «menú» para ver las opciones.",
    despedida: "¡Hasta pronto! Gracias por visitar Vida Animal II. Aquí puedes volver a consultar el menú cuando lo necesites.",
    emergencia: "Si crees que tu mascota está en peligro, contacta inmediatamente a un profesional veterinario o acude a un centro veterinario que pueda atenderla. No esperes una respuesta de este chat.\n\nNo puedo diagnosticar ni indicar medicamentos. No tenemos confirmado que Vida Animal II atienda urgencias ni que opere las 24 horas, y su contacto oficial todavía está pendiente de confirmación.",
    orientacionClinica: "No puedo diagnosticar, recomendar tratamientos ni indicar medicamentos o dosis. Un profesional veterinario debe valorar a tu mascota.\n\nContacta al personal mediante un contacto oficial que ya tengas. El teléfono y WhatsApp de la clínica todavía están pendientes de confirmación en este chat. Si crees que tu mascota está en peligro, busca atención veterinaria inmediata.",
    desconocido: "No tengo información confirmada para responder esa pregunta. Puedes consultar los servicios, precios, horarios, ubicación o productos, o elegir «Contactar al personal».\n\n¿Sobre cuál de esos temas te gustaría preguntar?"
  };

  const services = [
    { id: "consulta", pattern: /\bconsultas?\b/, text: "La clínica ofrece consultas médicas generales. El personal debe confirmar los detalles y la disponibilidad de atención." },
    { id: "vacunacion", pattern: /\b(vacunas?|vacunacion|vacunan|vacunar|vacunaciones)\b/, text: "La clínica ofrece vacunación. El personal debe confirmar las vacunas disponibles, las especies atendidas y los requisitos para tu mascota." },
    { id: "cirugia", pattern: /\b(cirugias?|operaciones|operacion|operan|operar|procedimientos clinicos)\b/, text: "La clínica ofrece cirugías y procedimientos clínicos. El personal veterinario debe valorar el caso y confirmar qué procedimiento puede realizarse." },
    { id: "hospitalizacion", pattern: /\b(hospitalizacion|hospitalizan|hospitalizar|hospitalizaciones|internamiento|internar)\b/, text: "La clínica ofrece hospitalización. El personal debe valorar el caso y confirmar los requisitos y la disponibilidad." },
    { id: "estetica", pattern: /\b(estetica|peluqueria|banos?|banar|banan|corte de pelo)\b/, text: "La clínica ofrece estética para mascotas: baño y corte. El personal debe confirmar los requisitos, el precio y la disponibilidad." },
    { id: "hospedaje", pattern: /\b(hospedaje|hospedar|hospedada|hospedado|hospedan|pension|hotel)\b/, text: "La clínica ofrece hospedaje de mascotas. El personal debe confirmar las condiciones, los requisitos y los espacios disponibles para las fechas que necesitas." },
    { id: "estudios", pattern: /\b(estudios complementarios|estudios|analisis|examenes)\b/, text: "La clínica ofrece estudios complementarios. No tenemos confirmada la lista de estudios específicos; el personal debe confirmar si realiza el que necesitas y sus requisitos." },
    { id: "cremacion", pattern: /\b(cremacion|cremaciones|cremar|creman|incineracion)\b/, text: "La clínica ofrece servicio de cremación. Lamento si estás pasando por una pérdida. El personal puede orientarte sobre el proceso, las opciones y los costos, que todavía no están confirmados aquí." }
  ];

  const aliases = {
    servicios: ["servicios", "consultar servicios"],
    precios: ["precios", "consultar precios"],
    ubicacion: ["horarios y ubicacion"],
    productos: ["productos", "informacion de productos"],
    contacto: ["contacto", "contactar al personal", "hablar con una persona", "whatsapp"],
    citas: ["citas", "cita", "agendar", "agendar una cita"],
    preguntas: ["preguntas frecuentes", "preguntas", "ayuda"],
    saludo: ["hola", "buenos dias", "buenas tardes", "buenas noches"],
    gracias: ["gracias", "muchas gracias"],
    despedida: ["adios", "hasta luego", "hasta pronto"]
  };

  function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function answer(intent, text = replies[intent]) {
    return { intent, text, showMenu: ["saludo", "preguntas", "desconocido"].includes(intent), urgent: intent === "emergencia" };
  }

  function resolveReply(rawText) {
    const text = normalizeText(rawText);

    // La urgencia prevalece sobre precios, saludos y otras opciones del mensaje.
    if (/\b(emergencias?|urgencias?|convulsion(?:es|a|ando)?|intoxicacion|intoxicado|intoxicada|envenenamiento|envenenado|envenenada|atropellad[oa]|inconsciente)\b/.test(text)
        || /\b(no respira|no esta respirando|no puede respirar|le cuesta respirar|dificultad para respirar|se esta ahogando|sangra mucho|sangrando mucho|sangrado abundante|comio veneno|ingirio veneno)\b/.test(text)) {
      return answer("emergencia");
    }
    if (["menu", "menu principal", "inicio", "volver"].includes(text)) {
      return { intent: "menu", text: "Claro, estas son las opciones. ¿En qué podemos ayudarte?", showMenu: true, urgent: false };
    }

    // No convertir una petición clínica en una respuesta de venta o de servicios.
    if (/\b(diagnostico|diagnosticar|recetar|dosis|dosificacion|tratamiento|medicar|sintomas|vomita|vomitando|diarrea|enfermo|enferma|dolor)\b/.test(text)
        || /\b(que le doy|que le puedo dar|que puedo darle|que medicamento|cuanto le doy|cuanta medicina)\b/.test(text)) {
      return answer("orientacionClinica");
    }

    const exactIntent = Object.keys(aliases).find((intent) => aliases[intent].includes(text));
    if (exactIntent === "ubicacion") return answer("ubicacion", `${replies.ubicacion}\n\n${replies.horarios}`);
    if (exactIntent) return answer(exactIntent);

    // Prioridad explícita: «precio de una vacuna» pregunta por precio, no por el servicio.
    if (/\b(precios?|costos?|cuesta|cuestan|cotizacion|tarifas?)\b/.test(text)
        || /\bcuanto (me |nos )?(cobran|cobra|cobras|sale|salen|vale|valen|es|seria)\b/.test(text)
        || /\ben cuanto (anda|andan|sale|salen|esta|estan)\b/.test(text)
        || /\ba como (la|el|las|los|sale|salen|esta|estan)\b/.test(text)) {
      return answer("precios");
    }
    if (/\b(24\s*(horas|hrs|h)|todo el dia|toda la noche)\b/.test(text)) {
      return answer("horarios", `${replies.horarios}\n\nNo tenemos confirmado un servicio de atención las 24 horas.`);
    }

    const asksLocation = /\b(donde estan|donde se encuentran|donde quedan|donde puedo encontrarlos|ubicacion|ubicad[oa]s?|direccion|mapa|como llego|como llegar|plaza del sol)\b/.test(text);
    const asksHours = /\b(horarios?|abren|cierran|a que hora|que dias atienden|estan abiertos|esta abierta|abierto hoy)\b/.test(text)
      || /\b(atienden|trabajan|abren) (el |los |en )?(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|fin de semana|dias festivos)\b/.test(text);
    if (asksLocation && asksHours) return answer("ubicacion", `${replies.ubicacion}\n\n${replies.horarios}`);
    if (asksLocation) return answer("ubicacion");
    if (asksHours) return answer("horarios");

    if (/\b(contacto|contactar|contactarme|telefono|telefonico|whatsapp|llamar|comunicarme)\b/.test(text)
        || /\b(hablar|comunicar|comunicas|contacto) (con|a) (un |una |el |la )?(veterinario|veterinaria|persona|humano|humana|personal|alguien)\b/.test(text)) {
      return answer("contacto");
    }

    // «Dejar a mi perrito unos días» alude a hospedaje; dejarlo para una
    // consulta o cirugía no debe clasificarse automáticamente como hospedaje.
    const asksPetStay = /\b(dejar|dejo|dejarles)\b/.test(text)
      && /\b(mascotas?|perr(o|a|ito|ita)s?|gat(o|a|ito|ita)s?)\b/.test(text)
      && /\b(unos dias|varios dias|por la noche|mientras viajo|mientras salgo de viaje|cuando salga de viaje)\b/.test(text);
    const matchedServices = services.filter((service) => service.pattern.test(text)
      || (service.id === "hospedaje" && asksPetStay));
    const mentionsAppointment = /\b(citas?|agendar|reservar|programar|reprogramar|cancelar)\b/.test(text);
    if (mentionsAppointment && /\b(cancelar|cancelo|cancelacion|reprogramar|reprogramo|reagendar|cambiar|cambio|modificar|modifico|mover|anular)\b/.test(text)) return answer("gestionCitas");
    const asksAvailability = /\b(disponibilidad|disponibles?|cupo|espacios?|lugar|hoy|manana|esta tarde|esta noche)\b/.test(text);
    if (asksAvailability && (matchedServices.length || mentionsAppointment)) return answer("disponibilidad");
    if (mentionsAppointment) return answer("citas");
    if (/\b(productos?|medicamentos?|medicinas?|alimentos?|croquetas|accesorios|farmacia)\b/.test(text)) return answer("productos");

    // Reconocer una categoría general no confirma cada procedimiento o especie.
    if (matchedServices.length > 2) return answer("servicios");
    if (matchedServices.length) return answer(matchedServices.map((service) => service.id).join("+"), matchedServices.map((service) => service.text).join("\n\n"));
    if (/\bservicios\b|\bque (ofrecen|hacen)\b/.test(text)) return answer("servicios");
    if (/\bpreguntas frecuentes\b/.test(text)) return answer("preguntas");

    // Los saludos no deben ocultar una pregunta que aún no sabemos responder.
    return answer("desconocido");
  }

  window.VidaAnimalFAQ = Object.freeze({ resolveReply, normalizeText });
})();

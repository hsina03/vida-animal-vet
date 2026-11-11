(() => {
  "use strict";

  // Flujo local e independiente de la interfaz. No utiliza red ni almacenamiento.
  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const services = [
    { label: "Consulta general", aliases: ["consulta", "consultas", "consulta medica"] },
    { label: "Vacunación", aliases: ["vacuna", "vacunas", "vacunar"] },
    { label: "Cirugías y procedimientos clínicos", aliases: ["cirugia", "cirugias", "operacion"] },
    { label: "Hospitalización", aliases: ["hospitalizar", "internamiento"] },
    { label: "Estética: baño y corte", aliases: ["estetica", "bano", "bano y corte", "peluqueria"] },
    { label: "Hospedaje", aliases: ["pension", "hotel"] },
    { label: "Medicamentos y productos", aliases: ["productos", "medicamentos"] },
    { label: "Estudios complementarios", aliases: ["estudios", "analisis"] },
    { label: "Cremación", aliases: ["cremar"] }
  ];

  const fields = [
    { key: "owner_name", label: "Nombre del propietario", required: true, kind: "fullName", prompt: "¿Cuál es tu nombre completo?", placeholder: "Nombre y apellido", aliases: ["nombre propietario", "propietario", "mi nombre"] },
    { key: "owner_phone", label: "Teléfono", required: true, kind: "phone", prompt: "¿Cuál es tu teléfono de contacto? Escribe 10 dígitos de México; también puedes incluir +52.", placeholder: "10 dígitos, con +52 opcional", aliases: ["telefono", "numero", "celular"] },
    { key: "pet_name", label: "Nombre de la mascota", required: true, kind: "name", prompt: "¿Cómo se llama tu mascota?", placeholder: "Nombre de tu mascota", aliases: ["mascota", "nombre mascota"] },
    { key: "pet_species", label: "Especie", required: true, kind: "species", prompt: "¿De qué especie es? Por ejemplo: perro, gato o conejo. El personal confirmará si puede atenderla.", placeholder: "Especie de tu mascota", aliases: ["especie"] },
    { key: "pet_breed", label: "Raza", required: false, kind: "text", prompt: "¿Cuál es su raza? También puedes indicar «mestizo».", placeholder: "Raza de tu mascota", aliases: ["raza"] },
    { key: "pet_age", label: "Edad aproximada", required: false, kind: "age", prompt: "¿Qué edad aproximada tiene? Indica una unidad; por ejemplo: «3 años» o «6 meses».", placeholder: "Edad con unidad", aliases: ["edad"] },
    { key: "service", label: "Servicio solicitado", required: true, kind: "service", prompt: "¿Qué servicio necesitas? Elige una opción o escribe su nombre.", placeholder: "Nombre o número del servicio", aliases: ["servicio"] },
    { key: "desired_date", label: "Fecha deseada", required: true, kind: "date", prompt: "¿Qué fecha prefieres? Usa DD/MM/AAAA o AAAA-MM-DD. También puedes escribir «hoy» o «mañana». Es una preferencia, no una fecha disponible confirmada.", placeholder: "DD/MM/AAAA, hoy o mañana", aliases: ["fecha", "dia"] },
    { key: "preferred_time", label: "Hora preferida", required: true, kind: "time", prompt: "¿Qué hora prefieres? Usa HH:MM en formato de 24 horas, como «16:30», o escribe «4:30 pm». El personal debe confirmar el horario de atención y la disponibilidad.", placeholder: "Ejemplo: 16:30 o 4:30 pm", aliases: ["hora", "horario"] },
    { key: "reason", label: "Motivo de la visita", required: false, kind: "reason", prompt: "¿Cuál es el motivo de la visita? Puedes describirlo brevemente. Este chat no realiza diagnósticos.", placeholder: "Motivo breve", aliases: ["motivo"] }
  ].map((field) => Object.freeze(field));

  function clinicClock(now) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Ciudad_Juarez", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
  }

  function parseDate(raw, today) {
    const relative = normalize(raw);
    if (relative === "hoy") return today;
    if (relative === "manana") {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().slice(0, 10);
    }
    let parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      const local = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!local) return null;
      parts = [raw, local[3], local[2].padStart(2, "0"), local[1].padStart(2, "0")];
    }
    const date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    const iso = `${parts[1]}-${parts[2]}-${parts[3]}`;
    return date.toISOString().slice(0, 10) === iso ? iso : null;
  }

  function parseTime(raw) {
    const text = raw.toLowerCase().replace(/[.\s]/g, "");
    const ampm = text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
    if (ampm) {
      const hour = Number(ampm[1]);
      const minute = Number(ampm[2] || 0);
      if (hour < 1 || hour > 12 || minute > 59) return null;
      return `${String((hour % 12) + (ampm[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const full = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!full || Number(full[1]) > 23 || Number(full[2]) > 59) return null;
    return `${full[1].padStart(2, "0")}:${full[2]}`;
  }

  function createFlow({ requiredFields = {}, now = () => new Date() } = {}) {
    for (const [key, required] of Object.entries(requiredFields)) {
      if (!fields.some((field) => field.key === key) || typeof required !== "boolean") {
        throw new Error(`Configuración de campo no válida: ${key}`);
      }
    }
    const schema = fields.map((field) => ({ ...field, required: requiredFields[field.key] ?? field.required }));
    let phase = "idle";
    let draft = {};
    let editingKey = null;
    const active = () => phase !== "idle";
    const nextField = () => schema.find((field) => !Object.hasOwn(draft, field.key));
    const currentField = () => phase === "editValue" ? schema.find((field) => field.key === editingKey) : nextField();
    const clock = () => clinicClock(now());
    const shortDate = (value) => value ? value.split("-").reverse().join("/") : "No indicado";

    function metadata() {
      const field = ["collecting", "editValue"].includes(phase) ? currentField() : null;
      return {
        active: active(),
        progress: !active() ? "" : phase === "review" ? "Revisa tu borrador · sin enviar" : phase === "editChoice" ? "Elige el dato que quieres corregir" : `${phase === "editValue" ? "Corrigiendo" : "Dato"} ${schema.indexOf(field) + 1} de ${schema.length}: ${field.label}${field.required ? "" : " (opcional)"}`,
        placeholder: field?.placeholder || "Confirmar, corregir o cancelar",
        inputMode: field?.kind === "phone" ? "tel" : "text"
      };
    }

    function actions() {
      if (!active()) return [];
      const controls = [{ label: "Cancelar borrador", value: "cancelar" }];
      if (phase === "review") return [
        { label: "Finalizar prueba", value: "confirmar" },
        { label: "Corregir un dato", value: "corregir" }, ...controls
      ];
      if (phase === "editChoice") return schema.filter((field) => Object.hasOwn(draft, field.key))
        .map((field) => ({ label: field.label, value: `corregir ${field.key}` })).concat([{ label: "Continuar", value: "continuar" }], controls);
      const field = currentField();
      const choices = field.kind === "service" ? services.map((service) => ({ label: service.label, value: service.label }))
        : field.kind === "species" ? [{ label: "Perro", value: "Perro" }, { label: "Gato", value: "Gato" }] : [];
      if (!field.required) choices.push({ label: "Omitir este dato", value: "omitir" });
      if (Object.keys(draft).length) choices.push({ label: "Corregir un dato", value: "corregir" });
      return choices.concat(controls);
    }

    function respond(text, showMenu = false) {
      return { text, showMenu, urgent: false, actions: actions(), appointment: metadata() };
    }

    function prompt() {
      const field = currentField();
      const optional = !field.required ? " Puedes escribir «omitir» si no tienes este dato." : "";
      return `${field.prompt}${optional}`;
    }

    function summary() {
      const lines = schema.map((field, index) => `${index + 1}. ${field.label}: ${field.kind === "date" ? shortDate(draft[field.key]) : draft[field.key] ?? "No indicado"}`);
      return `Revisa los datos de tu borrador:\n\n${lines.join("\n")}\n\nLa fecha y la hora son preferencias sujetas a revisión del personal.\n\nEscribe «confirmar» para finalizar la prueba, «corregir» para cambiar un dato o «cancelar» para descartar el borrador. En esta demostración no se enviará ni registrará una solicitud.`;
    }

    function advance(prefix = "") {
      phase = nextField() ? "collecting" : "review";
      editingKey = null;
      return respond(`${prefix}${phase === "review" ? summary() : prompt()}`);
    }

    function validate(field, raw) {
      const text = raw.trim().replace(/\s+/g, " ");
      const normalized = normalize(text);
      if (["omitir", "no se", "no lo se", "desconozco", "no aplica"].includes(normalized)) {
        return field.required ? { error: "Este dato es obligatorio por ahora. Escríbelo para continuar." } : { value: null };
      }
      const maxLength = field.kind === "reason" ? 500 : 100;
      if (!text || text.length > maxLength || /[<>\u0000-\u001f]/.test(text)) return { error: `Escribe un dato válido de hasta ${maxLength} caracteres, sin etiquetas HTML.` };
      if (field.kind === "fullName" && (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]+$/u.test(text) || text.split(" ").length < 2)) {
        return { error: "Escribe tu nombre y al menos un apellido; puedes usar acentos, apóstrofos o guiones." };
      }
      if (field.kind === "phone") {
        if (!/^\+?[\d\s().-]+$/.test(text)) return { error: "Escribe un teléfono de México: 10 dígitos, con +52 opcional. No incluyas letras ni extensiones." };
        const digits = text.replace(/\D/g, "");
        if (!(digits.length === 10 && !text.startsWith("+")) && !(digits.length === 12 && digits.startsWith("52"))) return { error: "El teléfono debe contener 10 dígitos, o 12 si incluye el prefijo 52." };
        if (/^(\d)\1{9}$/.test(digits.slice(-10))) return { error: "El teléfono no puede tener todos sus dígitos iguales. Revisa el número." };
        return { value: `+52${digits.slice(-10)}` };
      }
      if (["name", "species", "text"].includes(field.kind) && !/[\p{L}\p{N}]/u.test(text)) return { error: "Escribe un nombre o una descripción legible." };
      if (field.kind === "species" && !/^[\p{L}\p{M}][\p{L}\p{M}\s-]*$/u.test(text)) return { error: "Escribe la especie con palabras, por ejemplo «perro», «gato» o «conejo»." };
      const ageText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (field.kind === "age" && !/^(aprox(?:imadamente)?\s+)?\d{1,3}(?:[.,]\d{1,2})?\s*(anos?|mes(?:es)?|semanas?|dias?)$/.test(ageText)) {
        return { error: "Indica una edad aproximada con su unidad, como «3 años» o «6 meses», o escribe «omitir» si es opcional." };
      }
      if (field.kind === "service") {
        const service = services.find((item, index) => String(index + 1) === text || [normalize(item.label), ...item.aliases].includes(normalized));
        return service ? { value: service.label } : { error: "Elige uno de los servicios listados, por nombre o por número. El personal debe confirmar los detalles de atención." };
      }
      if (field.kind === "date") {
        const date = parseDate(text, clock().date);
        if (!date) return { error: "La fecha no es válida. Usa DD/MM/AAAA o AAAA-MM-DD, o escribe «hoy» o «mañana»." };
        if (date < clock().date) return { error: "La fecha debe ser hoy o una fecha futura en Ciudad Juárez." };
        return { value: date };
      }
      if (field.kind === "time") {
        const time = parseTime(text);
        if (!time) return { error: "Usa una hora válida, como «16:30» o «4:30 pm». Si escribes solo la hora, agrega am o pm." };
        if (draft.desired_date === clock().date && time <= clock().time) return { error: "Para hoy, elige una hora posterior a la hora actual de Ciudad Juárez. Esto no confirma disponibilidad." };
        return { value: time };
      }
      return { value: text };
    }

    function invalidatePastPreferences() {
      const current = clock();
      if (draft.desired_date && draft.desired_date < current.date) {
        delete draft.desired_date;
        delete draft.preferred_time;
        return "La fecha del borrador ya pasó. Indica una nueva preferencia.\n\n";
      }
      if (draft.desired_date === current.date && draft.preferred_time && draft.preferred_time <= current.time) {
        delete draft.preferred_time;
        return "La hora preferida ya pasó. Elige otra hora; el personal deberá confirmar la disponibilidad.\n\n";
      }
      return "";
    }

    function resume() {
      if (!active()) return respond("No hay un borrador en curso. Puedes elegir «Agendar una cita» para comenzar.", true);
      if (phase === "editChoice") return respond("Selecciona un dato para corregir, o escribe «continuar» para volver a tu borrador.");
      return respond(phase === "review" ? summary() : prompt());
    }

    function start() {
      if (active()) return resume();
      draft = {};
      phase = "collecting";
      return respond(`Vamos a preparar un borrador de solicitud de cita. 🐾\n\nEsta es una demostración: usa datos ficticios. Los datos solo se mantienen en esta página mientras está abierta; recargarla elimina el borrador y la conversación. No se envía información al personal. Puedes escribir «corregir», «atrás», «ayuda» o «cancelar».\n\n${prompt()}`);
    }

    function handle(rawText) {
      if (!active()) return null;
      const text = rawText.trim();
      const command = normalize(text);
      if (["cancelar", "cancelar borrador", "cancelar solicitud", "cancelar cita", "descartar", "salir", "no quiero continuar"].includes(command)) {
        draft = {};
        phase = "idle";
        editingKey = null;
        return respond("Cancelé el borrador. No se ha enviado ni registrado ninguna solicitud. Los mensajes anteriores siguen visibles hasta recargar la página.", true);
      }
      if (["ayuda", "continuar", "continuar borrador"].includes(command)) {
        if (phase === "editChoice" && command !== "ayuda") return advance();
        const result = resume();
        if (command === "ayuda") result.text = `Responde al dato solicitado. Usa «omitir» solo para campos opcionales, «corregir» para cambiar un dato o «cancelar» para salir.\n\n${result.text}`;
        return result;
      }
      if (command === "atras") {
        const currentIndex = phase === "review" ? schema.length : schema.indexOf(currentField());
        const previous = schema.slice(0, Math.max(0, currentIndex)).filter((field) => Object.hasOwn(draft, field.key)).at(-1);
        if (!previous) return respond(`Todavía no hay un dato anterior que cambiar.\n\n${phase === "editChoice" ? "Elige un dato para corregir." : prompt()}`);
        editingKey = previous.key;
        phase = "editValue";
        return respond(`Vamos a corregir ${previous.label.toLowerCase()}.\n\n${prompt()}`);
      }
      if (command === "corregir" || command.startsWith("corregir ")) {
        const requested = command.slice(8).trim();
        const field = schema.find((item, index) => [String(index + 1), normalize(item.key), normalize(item.label), ...item.aliases].includes(requested));
        if (field && Object.hasOwn(draft, field.key)) {
          editingKey = field.key;
          phase = "editValue";
          return respond(`Vamos a corregir ${field.label.toLowerCase()}.\n\n${prompt()}`);
        }
        if (!Object.keys(draft).length) return respond(`Primero necesitamos al menos un dato para poder corregirlo.\n\n${prompt()}`);
        phase = "editChoice";
        return respond(`¿Qué dato quieres corregir? Puedes pulsar una opción o escribir «corregir teléfono», «corregir raza» o el número del resumen con «corregir». Solo puedes modificar datos que ya proporcionaste.`);
      }
      if (phase === "editChoice") return respond("Elige un dato con los botones o escribe, por ejemplo, «corregir teléfono». Para retomar el borrador, escribe «continuar».");
      if (phase === "review") {
        if (!["confirmar", "si", "si confirmar", "finalizar prueba"].includes(command)) return respond(`Necesito tu confirmación explícita. Puedes escribir «confirmar», «corregir» o «cancelar».\n\n${summary()}`);
        const stale = invalidatePastPreferences();
        if (stale) return advance(stale);
        draft = {};
        phase = "idle";
        return respond("Terminaste la prueba del flujo de citas. No se envió ni registró ninguna solicitud y no hay una cita confirmada.\n\nCuando conectemos el sistema, la solicitud deberá quedar pendiente de revisión del personal. Los mensajes de esta prueba siguen visibles hasta recargar la página.", true);
      }
      const field = currentField();
      const validation = validate(field, text);
      if (validation.error) return respond(`${validation.error}\n\n${prompt()}`);
      draft[field.key] = validation.value;
      const stale = invalidatePastPreferences();
      return advance(stale);
    }

    return Object.freeze({ start, handle, resume, isActive: active, getDraft: () => ({ ...draft }), getMetadata: metadata });
  }

  window.VidaAnimalAppointments = Object.freeze({ createFlow });
})();

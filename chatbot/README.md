# Chatbot

Motor de conversación del asistente de Vida Animal II. Es una máquina de estados sin dependencias ni acceso a red: recibe el estado anterior y lo que eligió o escribió la persona, y devuelve el nuevo estado y la respuesta.

```js
const { handle } = require('@vida-animal/chatbot');
const { state, reply } = await handle(prevState, { optionId, text }, deps);
// reply = { messages: [...], options: [{ id, label }], input: { placeholder } | null, actions: [...] }
```

`deps` lo pone el backend (`backend/src/routes/public.js`): servicios, días y horarios libres, preguntas frecuentes y las funciones que registran la solicitud. Por eso el mismo motor puede conectarse después a WhatsApp Business sin cambiar la conversación.

## Qué sabe hacer

- **Agendar cita** (UC-02): servicio → nombre y especie de la mascota → día → horario → nombre y WhatsApp del propietario → resumen. Si el horario se ocupó mientras tanto, ofrece otros sin volver a pedir los datos.
- **Preguntas frecuentes** y **horario y ubicación**, con el contenido que el administrador edita en el panel.
- **Canalizar al personal** (UC-03): a petición, cuando detecta una posible urgencia o cuando no entiende dos veces seguidas. Deja la solicitud en el panel y ofrece el enlace de WhatsApp.

## Pruebas

```bash
cd chatbot && npm test
```

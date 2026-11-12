# Chatbot

Asistente del sitio de Vida Animal II: una **máquina de estados** en Python, sin IA externa, que responde con opciones para tocar y campos de texto.

## Qué hace

- **Agendar cita:** servicio → nombre y especie de la mascota → día → horario libre → nombre y WhatsApp del propietario → resumen → confirmar. Al confirmar, la cita queda «pendiente» y se crea una solicitud con folio (SOL-0001) para el personal.
- **Preguntas frecuentes y horario/ubicación,** que se editan desde el panel.
- **Canalizar al personal** si la persona lo pide, si detecta una urgencia («urgente», «no respira», «sangra», «envenenó», «se comió chocolate») o si no entiende dos veces seguidas. Crea una solicitud urgente o «requiere atención» y ofrece el enlace de WhatsApp.

## Archivos

| Ruta | Contenido |
|---|---|
| `asistente/maquina.py` | La máquina de estados (`Asistente.iniciar` y `Asistente.procesar`) |
| `asistente/texto.py` | Normalización del texto y detección de urgencias, peticiones de hablar con el personal e intenciones |
| `tests/test_chatbot.py` | Pruebas de los flujos |

El asistente usa los modelos y reglas de agenda del [backend](../backend), que lo publica en `POST /api/chat/iniciar` y `POST /api/chat/mensaje`. Las pruebas se corren desde `backend/` con `pytest`.

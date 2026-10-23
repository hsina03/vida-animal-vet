# Backend

API en Node.js + Express sobre MySQL 8. También sirve los archivos de `frontend/public`, así que un solo proceso levanta el sitio, el asistente y el panel.

Las instrucciones para correrlo están en el [README raíz](../README.md#cómo-correrlo-en-tu-computadora).

## Carpetas

| Ruta | Qué contiene |
|---|---|
| `db/schema.sql` | Tablas: usuarios, propietarios, mascotas, servicios, horarios, días sin servicio, configuración, preguntas frecuentes, citas y solicitudes del chat |
| `db/seed.sql` | Datos iniciales: servicios de la clínica, horario, reglas de agenda y propietarios de ejemplo |
| `scripts/db-setup.js` | Crea la base, carga esquema y datos, crea los usuarios del panel (`--sin-demo` omite citas y solicitudes de ejemplo) |
| `src/services/` | Reglas de negocio: disponibilidad, citas, propietarios, solicitudes y configuración |
| `src/routes/` | Rutas HTTP; solo validan entrada y llaman a los servicios |
| `src/middleware/auth.js` | Sesión (cookie httpOnly con JWT), `requireAuth` y `requireRole` |
| `tests/` | Pruebas con `node:test` y Supertest contra una base de pruebas |

## Reglas de agenda

- Cada día se divide en espacios de `duracion_espacio_min` (30 min por omisión). Un servicio más largo ocupa varios espacios seguidos.
- En un mismo espacio caben hasta `citas_simultaneas` citas (2 por omisión). Al llenarse deja de ofrecerse en el asistente y en el panel.
- No se ofrecen horarios con menos de `anticipacion_min` minutos de anticipación, ni días marcados como sin servicio.
- Al registrar o reprogramar, la revisión de cupo corre dentro de una transacción con un candado de agenda, así dos registros simultáneos no pueden tomar el mismo último lugar (RNF-05). Hay una prueba para esto en `tests/citas.test.js`.
- Las citas que llegan por el asistente quedan **pendientes** con una solicitud en el panel; el personal las confirma desde «Solicitudes del chat».

## API

Todas las respuestas son JSON. Los errores llegan como `{ "error": "mensaje para mostrar" }`.

**Públicas** (`/api/public`)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/info` | Datos de la clínica, horario y servicios visibles |
| POST | `/chat` | Un turno del asistente: `{ sessionId?, optionId?, text? }` |

**Sesión** (`/api/auth`): `POST /login`, `POST /logout`, `GET /me`.

**Panel** (`/api`, requieren sesión; las marcadas con ★ solo el administrador)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/resumen` | Indicadores y agenda del día |
| GET | `/disponibilidad?fecha=&servicio_id=&ignorar=` | Horarios de un día con su cupo |
| GET, POST | `/citas` | Listar (`desde`, `hasta`, `estado`) y registrar |
| GET | `/citas/:id` | Detalle |
| POST | `/citas/:id/reprogramar`, `/citas/:id/cancelar` | Cambiar horario o cancelar con motivo |
| PATCH | `/citas/:id/estado` | Confirmar o marcar como atendida |
| GET, POST | `/propietarios` | Buscar (`q`) y registrar (con mascota opcional) |
| GET, PUT | `/propietarios/:id` | Detalle con mascotas e historial; editar |
| POST | `/propietarios/:id/mascotas` | Agregar mascota |
| PUT | `/mascotas/:id` | Editar mascota |
| GET | `/solicitudes?abiertas=1`, `/solicitudes/:id` | Solicitudes del asistente con la conversación |
| POST | `/solicitudes/:id/resolver` | Confirmar la cita pedida o marcar como resuelta |
| GET | `/horarios` | Horario semanal, reglas y días sin servicio |
| PUT ★ | `/horarios` | Guardar horario y reglas |
| POST, DELETE ★ | `/horarios/inhabiles[/:id]` | Días sin servicio |
| GET ★ | `/contenido` | Servicios, contacto y preguntas frecuentes |
| PUT ★ | `/servicios/:id`, `/contacto` | Editar contenido del sitio |
| POST, PUT, DELETE ★ | `/faq[/:id]` | Preguntas frecuentes del asistente |
| GET, POST ★ | `/usuarios` | Usuarios del panel |
| PATCH ★ | `/usuarios/:id` | Nombre, rol, contraseña o acceso activo |

## Variables de entorno

Ver `.env.example`. En producción `JWT_SECRET` es obligatorio (mínimo 16 caracteres). `TZ` debe ser `America/Ciudad_Juarez` para que «hoy» y la anticipación coincidan con la clínica; la conexión a MySQL usa la misma zona.

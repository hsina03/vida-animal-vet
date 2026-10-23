# Backend

Base de datos MySQL 8 de Vida Animal II. La API que la usa llega en el PR de VA2-15.

## Preparar la base

Necesitas Node.js 20.10+ y MySQL 8 encendido.

1. Crea un usuario de MySQL (una sola vez):
   ```sql
   CREATE USER 'vida'@'localhost' IDENTIFIED BY 'elige-una-contraseña';
   GRANT ALL PRIVILEGES ON vida_animal.* TO 'vida'@'localhost';
   ```
2. Copia `.env.example` a `.env` y llena `DB_PASSWORD`.
3. Desde esta carpeta:
   ```bash
   npm install
   npm run db:setup
   ```
   Crea la base, carga el esquema y los datos, y muestra los usuarios del panel. Si no defines `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD`, las contraseñas son aleatorias y **solo se muestran esa vez**. `--sin-demo` omite las citas y solicitudes de ejemplo. Volver a correrlo borra y recrea las tablas.

## Archivos

| Ruta | Qué contiene |
|---|---|
| `db/schema.sql` | Tablas: usuarios, propietarios, mascotas, servicios, horarios, días sin servicio, configuración, preguntas frecuentes, citas y solicitudes del chat |
| `db/seed.sql` | Servicios de la clínica, horario, reglas de agenda (espacios de 30 min, 2 citas simultáneas, 2 h de anticipación), preguntas frecuentes y propietarios de ejemplo |
| `scripts/db-setup.js` | Crea la base y los usuarios (contraseñas con bcrypt) |
| `src/config.js`, `src/db.js`, `src/utils.js` | Configuración, conexión a MySQL (en la zona horaria de la clínica) y utilidades de fechas y teléfonos |

## Decisiones del esquema

- Fechas y horas se leen como texto (`dateStrings`) para que un día no se recorra por zona horaria; la conexión usa la zona de `TZ` (`America/Ciudad_Juarez`).
- `propietarios.telefono` es único y de 10 dígitos: es como se identifica a un cliente que llega por el asistente.
- `mascotas.peso` es texto para admitir gramos en aves y especies pequeñas.
- `citas.origen` distingue citas del asistente (`chat`, quedan pendientes) de las que registra el personal.
- `solicitudes` guarda la conversación completa (JSON) y un folio `SOL-0001` para darle seguimiento.

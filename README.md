# Vida Animal II — Sistema de Gestión Veterinaria

Solución tecnológica integral (sitio web + chatbot + panel administrativo) para optimizar la atención a clientes y la gestión de citas de la clínica veterinaria **Vida Animal**, sucursal II (Plaza del Sol, Ciudad Juárez, Chihuahua).

## Contexto

Actualmente la sucursal gestiona sus citas de forma manual a través de WhatsApp: los propietarios escriben directamente a los médicos veterinarios, quienes deben atender consultas y coordinar horarios entre una consulta y otra. Esto genera retrasos, errores de agenda y, en ocasiones, pérdida de clientes por falta de respuesta oportuna.

Este proyecto busca automatizar la atención inicial y la programación de citas, centralizar la información de pacientes, propietarios y servicios, y reducir la carga administrativa del personal veterinario para que pueda enfocarse en la atención clínica.

> El detalle completo del contexto, la problemática y la propuesta de solución está documentado en [`docs/fase-1-resumen.md`](docs/fase-1-resumen.md), a partir del entregable de Fase 1 del curso.

## Módulos del sistema

1. **Sitio web** — información de la clínica, servicios (consultas, vacunación, cirugías, estética, hospedaje, cremación, etc.), ubicación/contacto y acceso al chatbot.
2. **Chatbot y programación de citas** — atención inicial vía WhatsApp, respuestas a preguntas frecuentes, recolección de datos de propietario/mascota, registro de citas y canalización a personal humano cuando sea necesario.
3. **Panel administrativo** — acceso por rol para el personal de la clínica: gestión de citas, consulta de propietarios/mascotas, disponibilidad de horarios y administración general de la información del sistema.

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | HTML, CSS y JavaScript (módulos ES, sin paso de compilación) |
| Backend / API | Node.js 20+ con Express 4 |
| Base de datos | MySQL 8 |
| Chatbot / mensajería | Asistente propio en el sitio (paquete `chatbot/`) con canalización a WhatsApp |
| Sesiones | Cookie httpOnly con JWT; contraseñas con bcrypt |
| Pruebas | `node:test` + Supertest, en GitHub Actions con MySQL |

> El chatbot vive en el sitio web. Cuando la conversación lo requiere (urgencia, duda que no sabe resolver) da el enlace de WhatsApp de la clínica y deja la solicitud en el panel. Conectarlo a la API de WhatsApp Business queda como siguiente etapa: el motor (`chatbot/src/engine.js`) no depende del canal.

## Cómo correrlo en tu computadora

Necesitas **Node.js 20.10 o superior** y **MySQL 8** encendido.

1. Instala las dependencias desde la raíz del repositorio:
   ```bash
   npm install
   ```
2. Crea un usuario de MySQL para el proyecto (una sola vez):
   ```sql
   CREATE USER 'vida'@'localhost' IDENTIFIED BY 'elige-una-contraseña';
   GRANT ALL PRIVILEGES ON vida_animal.* TO 'vida'@'localhost';
   GRANT ALL PRIVILEGES ON vida_animal_test.* TO 'vida'@'localhost';
   ```
3. Copia `backend/.env.example` a `backend/.env` y llena `DB_PASSWORD` y `JWT_SECRET` (una frase larga y aleatoria).
4. Crea las tablas y los datos de ejemplo:
   ```bash
   npm run db:setup
   ```
   Al terminar muestra los usuarios del panel. Si no definiste `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD`, las contraseñas se generan al azar y **solo se muestran esa vez**. Volver a correrlo borra y recrea la base.
5. Enciende el servidor:
   ```bash
   npm run dev      # se reinicia al guardar cambios
   ```
   - Sitio público y asistente: http://localhost:3000
   - Panel administrativo: http://localhost:3000/admin

### Pruebas

```bash
npm test
```

Corre las pruebas del motor del chatbot y las de la API. Las de la API usan una base aparte (`vida_animal_test`) que se recrea en cada corrida, así que no tocan tus datos. Las mismas pruebas corren en cada Pull Request (`.github/workflows/ci.yml`).

## Estructura del repositorio

```
.
├── frontend/public/   # Sitio, inicio de sesión y panel (lo sirve el backend)
├── backend/           # API Express, esquema y datos de ejemplo de MySQL, pruebas
├── chatbot/           # Motor de conversación del asistente (sin dependencias)
├── docs/              # Documentación del proyecto (fases, actas, diagramas)
└── .github/           # Plantillas de issues y PR, integración continua
```

Cada carpeta tiene un `README.md` con el detalle de su parte.

## Equipo

| Integrante | Matrícula |
|---|---|
| Uriel Vicente González Valadez | 193373 |
| Nadia Margarita López Esparza | 234045 |
| Reyli Emmanuel Zavala González | 223221 |
| Abril Márquez De la O | 238488 |
| Leonardo Hernández Sandoval | 234027 |

**Materia:** Administración y Evaluación de Proyectos de Tecnologías de Información
**Profesor:** Abraham López Nájera
**Institución:** Universidad Autónoma de Ciudad Juárez — Instituto de Ingeniería y Tecnología

## Cómo contribuir

Antes de empezar a trabajar, lee [`CONTRIBUTING.md`](CONTRIBUTING.md): ahí está el flujo de ramas, la convención de commits y el proceso de Pull Request que usaremos como equipo.

## Licencia / uso

Proyecto académico desarrollado para la clínica Vida Animal II en el marco del curso de Administración y Evaluación de Proyectos de TI (UACJ). Uso restringido a fines académicos; los derechos sobre el contenido pertenecen a sus autores y a la clínica.

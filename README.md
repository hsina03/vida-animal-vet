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

_Por definir por el equipo._ Cuando se elija, actualizar esta sección, el `.gitignore` y la estructura de carpetas según corresponda.

| Componente | Tecnología |
|---|---|
| Frontend | *pendiente* |
| Backend / API | *pendiente* |
| Base de datos | *pendiente* |
| Chatbot / mensajería | *pendiente* |

## Estructura del repositorio

```
.
├── frontend/     # Sitio web / interfaz de usuario
├── backend/      # API y lógica de negocio
├── chatbot/      # Integración de chatbot y programación de citas
├── docs/         # Documentación del proyecto (fases, actas, diagramas)
└── .github/      # Plantillas de issues y pull requests
```

Cada carpeta tiene un `README.md` propio que se irá completando conforme se defina el stack.

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

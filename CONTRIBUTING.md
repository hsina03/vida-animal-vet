# Guía de contribución

Este documento describe cómo trabajaremos como equipo en este repositorio.

## Flujo de ramas

- `main` — rama estable. Siempre debe reflejar una versión funcional del proyecto. No se hacen commits directos aquí salvo configuración inicial.
- `feature/<nombre-corto>` — nueva funcionalidad (ej. `feature/chatbot-whatsapp`, `feature/panel-citas`).
- `fix/<nombre-corto>` — corrección de errores (ej. `fix/validacion-formulario`).
- `docs/<nombre-corto>` — cambios de documentación.

Crea tu rama a partir de `main` actualizado:

```bash
git checkout main
git pull
git checkout -b feature/nombre-de-tu-tarea
```

## Convención de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/):

```
<tipo>: <descripción breve>
```

Tipos más comunes: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

Ejemplos:
- `feat: agregar formulario de registro de mascota`
- `fix: corregir validación de horario en agenda de citas`
- `docs: actualizar README con instrucciones de instalación`

## Pull Requests

1. Sube tu rama y abre un Pull Request hacia `main`.
2. Describe qué hace el cambio y, si aplica, enlaza el issue relacionado (`Closes #12`).
3. Pide revisión de al menos un integrante del equipo antes de fusionar.
4. Resuelve los comentarios de revisión antes de hacer merge.
5. Elimina la rama después de fusionar.

## Issues

Usa las plantillas disponibles al crear un issue (`Bug`, `Feature`, `Tarea`) para mantener la información organizada. Etiqueta los issues por módulo cuando sea posible (`web`, `chatbot`, `admin`, `docs`).

## Estilo de código

Pendiente de definir una vez elegido el stack tecnológico. Cuando se decida, documentar aquí el formateador/linter que usará el equipo (ej. Prettier, ESLint, Black, etc.) para mantener consistencia.

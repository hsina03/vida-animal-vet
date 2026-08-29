# Guía de primeros pasos con GitHub

Esta guía es para quien nunca ha usado Git ni GitHub. Explica lo mínimo necesario para poder trabajar en este repositorio sin perderse.

## Conceptos básicos

- **Git**: programa que corre en tu computadora y lleva el historial de cambios de un proyecto.
- **GitHub**: la página web donde vive la copia central de este proyecto (el "repositorio" o "repo"), donde todo el equipo comparte su trabajo.
- **Commit**: una "foto" guardada de tus avances, con un mensaje corto que dice qué hiciste.
- **Rama (branch)**: una copia de trabajo separada del proyecto, donde puedes hacer cambios sin afectar la versión principal (`main`) ni el trabajo de tus compañeros.
- **Pull Request (PR)**: una solicitud para integrar los cambios de tu rama a `main`, que alguien más del equipo revisa antes de aceptar.

## Preparación (una sola vez por persona)

1. Instala Git: [git-scm.com](https://git-scm.com/downloads).
2. Crea una cuenta en [github.com](https://github.com) si no tienes.
3. Pide que te agreguen como colaborador del repositorio (o simplemente clónalo, ya que es público).
4. Si nunca has usado la terminal, instala **[GitHub Desktop](https://desktop.github.com/)**. Hace todo lo de esta guía con botones en vez de comandos — es la forma más fácil de empezar.
5. **Clona** el repositorio (descarga una copia completa a tu computadora):
   - En GitHub Desktop: `File > Clone Repository`, pega `https://github.com/hsina03/vida-animal-vet.git`.
   - En terminal: `git clone https://github.com/hsina03/vida-animal-vet.git`.

## El ciclo de trabajo del día a día

Cada vez que te sientes a trabajar en el proyecto, sigue estos pasos en orden:

### 1. Actualiza tu copia (`pull`)

Antes de empezar, trae los cambios más recientes que subieron tus compañeros.

- GitHub Desktop: botón **"Fetch origin"** y luego **"Pull origin"**.
- Terminal: `git pull`.

Si te saltas este paso, puedes terminar trabajando sobre una versión vieja del proyecto.

### 2. Crea una rama para tu tarea

Nunca trabajes directamente sobre `main`. Crea una rama con un nombre que describa lo que vas a hacer, siguiendo la convención de [`CONTRIBUTING.md`](../CONTRIBUTING.md) (por ejemplo `feature/chatbot-whatsapp`, `fix/validacion-formulario`).

- GitHub Desktop: botón **"New Branch"**, ponle nombre y crea.
- Terminal: `git checkout -b feature/nombre-de-tu-tarea`.

### 3. Trabaja y guarda avances (commits)

Conforme avances, ve guardando tu progreso en commits pequeños y frecuentes, no todo junto al final.

- GitHub Desktop: en la pestaña **"Changes"** verás los archivos modificados. Escribe un mensaje corto (ver convención abajo) y da clic en **"Commit to [tu rama]"**.
- Terminal: `git add .` y luego `git commit -m "feat: descripción breve"`.

**Convención de mensajes** (ver también `CONTRIBUTING.md`): empieza con `feat:` (funcionalidad nueva), `fix:` (corrección), `docs:` (documentación), `style:`, `refactor:` o `test:`, seguido de una descripción breve en español. Ejemplo: `feat: agregar formulario de registro de mascota`.

### 4. Sube tu rama a GitHub (`push`)

Esto sube tu rama —solo tu rama, no toca `main`— para que los demás la puedan ver.

- GitHub Desktop: botón **"Push origin"**.
- Terminal: `git push`. La primera vez que subes una rama nueva, usa `git push -u origin nombre-de-tu-rama`.

### 5. Abre un Pull Request

En la página del repositorio en GitHub aparecerá un botón **"Compare & pull request"** cuando subas una rama nueva. Descríbe brevemente qué hiciste y en qué issue se relaciona (si aplica) y envíalo a revisión.

### 6. Revisión y fusión (merge)

Alguien más del equipo revisa el PR, comenta si algo debe ajustarse y, una vez aprobado, se da clic en **"Merge pull request"**. A partir de ahí, tus cambios ya son parte de `main` y todos los demás los verán la próxima vez que hagan `pull`.

## Las dos reglas de oro

1. **Nunca trabajes directo sobre `main`.** Siempre crea tu rama primero.
2. **Haz `pull` antes de empezar a trabajar cada vez.** Evita conflictos con el trabajo de tus compañeros.

## ¿Y si algo sale mal?

Si git marca un "conflicto" al hacer `pull` o al abrir un PR, no entres en pánico: significa que dos personas cambiaron la misma parte de un archivo. Avísale al equipo en el chat del grupo y resuélvanlo juntos antes de continuar — es normal que pase, especialmente al inicio.

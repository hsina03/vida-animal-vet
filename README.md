# Vida Animal II — Sistema de Gestión Veterinaria

Sitio web, asistente de citas (chatbot) y panel administrativo para la clínica veterinaria **Vida Animal**, sucursal II (Plaza del Sol, Ciudad Juárez, Chihuahua).

Proyecto académico de la materia *Administración y Evaluación de Proyectos de Tecnologías de Información* (UACJ). El contexto y la propuesta están en [`docs/fase-1-resumen.md`](docs/fase-1-resumen.md) y el diseño original de Figma en [`prototipo/`](prototipo/).

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Sitio público** (`/`) | Inicio, servicios, cómo agendar, nosotros, ubicación y contacto. Los servicios, el horario, el teléfono y la dirección se leen de la base de datos. Botón de WhatsApp de la clínica. |
| **Asistente** (dentro del sitio) | Agenda citas (servicio → mascota → día → horario libre → propietario → resumen → confirmar). Responde preguntas frecuentes y da horario y ubicación. Canaliza al personal si se pide, si detecta una urgencia o si no entiende dos veces seguidas. |
| **Inicio de sesión** (`/login`) | Mensajes claros para datos incorrectos o una cuenta desactivada. Bloquea la cuenta 15 minutos después de 5 intentos fallidos. |
| **Panel** (`/panel`) | Inicio, Citas (lista y semana), Solicitudes del chat, Propietarios y mascotas, Horarios, Contenido del sitio y Usuarios. Tiene dos roles: Administrador y Personal operativo. El servidor revisa el rol en cada petición. |

### Reglas de la agenda

- Espacios de 30 minutos, con un máximo de 2 citas por espacio y al menos 2 horas de anticipación para citas pedidas por el chat. Las tres reglas se configuran en **Horarios y disponibilidad**.
- Un servicio largo ocupa varios espacios seguidos. Por ejemplo, estética dura 60 minutos y ocupa 2 espacios.
- No se ofrecen horarios en días cerrados ni en días sin servicio.
- Hospitalización, medicamentos y cremación no se agendan por cita.
- La revisión de cupo y el registro de la cita van en la misma transacción, con un candado, para que dos personas no tomen el último lugar al mismo tiempo. La prueba `test_doble_reserva_concurrente_solo_una_toma_el_ultimo_lugar` lo comprueba.
- Zona horaria: `America/Ciudad_Juarez`.

## Tecnologías

| Componente | Tecnología |
|---|---|
| Backend | Python 3.11 o más nuevo, FastAPI |
| Base de datos | SQLite en desarrollo, con SQLAlchemy y migraciones con Alembic. Para usar MySQL basta con cambiar la cadena de conexión. |
| Frontend | Plantillas Jinja2 y JavaScript sin frameworks, con el CSS del prototipo |
| Seguridad | Contraseñas con bcrypt (passlib), sesión en cookie httpOnly firmada, protección CSRF y escape automático de datos |
| Pruebas | pytest y el TestClient de FastAPI |

## Instalación paso a paso

Estas instrucciones son para **Windows con PowerShell**. Las de macOS y Linux están al final de cada paso.

### 1. Requisitos

- **Python 3.11 o más nuevo.** Revisa tu versión con:

  ```bash
  py --version
  ```

  Si no lo tienes, descárgalo de [python.org](https://www.python.org/downloads/). Durante la instalación marca la casilla **"Add Python to PATH"**.
- **Git**, para clonar el repositorio.

### 2. Clonar el repositorio y entrar a la carpeta

```bash
git clone <url-del-repositorio>
```

```bash
cd VidaAnimal
```

### 3. Crear y activar el entorno virtual

El entorno virtual es una carpeta (`.venv`) donde se instalan las librerías del proyecto sin mezclarlas con otras.

```bash
py -3 -m venv .venv
```

```bash
.venv\Scripts\Activate.ps1
```

Si PowerShell dice que la ejecución de scripts está deshabilitada, ejecuta esto una sola vez y vuelve a activar:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Sabrás que el entorno está activo porque la línea de la terminal empieza con `(.venv)`. Cada vez que abras una terminal nueva tienes que volver a activarlo.

> macOS / Linux: `python3 -m venv .venv` y luego `source .venv/bin/activate`

### 4. Instalar las dependencias

```bash
pip install -r requirements.txt
```

### 5. Crear el archivo `.env`

El archivo `.env` guarda las claves secretas. **Nunca lo subas a GitHub**; ya está en `.gitignore`.

```bash
copy .env.example .env
```

> macOS / Linux: `cp .env.example .env`

Abre `.env` con un editor y cambia:

- `SECRET_KEY`: una clave larga y aleatoria. Puedes generar una con:

  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

- `ADMIN_PASSWORD` y `OPERATIVO_PASSWORD`: las contraseñas de las dos cuentas que se crearán, de al menos 8 caracteres.

### 6. Preparar la base de datos

Crea las tablas con las migraciones:

```bash
alembic upgrade head
```

Después carga los catálogos, las dos cuentas y los datos de ejemplo (propietarios, mascotas, citas y solicitudes):

```bash
python seed.py
```

Con esto se crea el archivo `vida_animal.db`. Si en algún momento quieres empezar de cero:

```bash
python seed.py --reiniciar
```

### 7. Iniciar el servidor

```bash
uvicorn app.main:app --reload
```

Abre en el navegador:

- Sitio público: <http://localhost:8000>
- Panel: <http://localhost:8000/login>. Entra con `ADMIN_USUARIO` / `ADMIN_PASSWORD` (administrador) o con `OPERATIVO_USUARIO` / `OPERATIVO_PASSWORD` (personal operativo), tal como los pusiste en `.env`.

`--reload` reinicia el servidor cada vez que guardas un cambio en el código. Para detenerlo presiona `Ctrl + C`.

### 8. Correr las pruebas

```bash
pytest
```

Las pruebas usan su propia base temporal y no tocan `vida_animal.db`. Tardan alrededor de un minuto y medio porque cifrar contraseñas con bcrypt es lento a propósito. Para ver el nombre de cada prueba:

```bash
pytest -v
```

| Archivo | Qué comprueba |
|---|---|
| `tests/test_auth.py` | Inicio de sesión correcto, incorrecto, cuenta desactivada, límite de intentos, contraseña temporal y CSRF |
| `tests/test_permisos.py` | Permisos por rol, incluso cuando alguien envía la petición sin usar los botones |
| `tests/test_agenda.py` | Espacios, cupo, servicios largos, anticipación, días sin servicio, cancelar, reprogramar y doble reserva simultánea |
| `tests/test_chatbot.py` | Flujos del asistente: agendar, urgencias, canalización y preguntas frecuentes |
| `tests/test_panel_citas.py` | Acciones del panel y el flujo completo: agendar por el chat y confirmar en el panel |
| `tests/test_migraciones.py` | Que la migración de Alembic coincida con los modelos |

## Estructura del proyecto

```
.
├── app/
│   ├── main.py              # crea la aplicación FastAPI
│   ├── config.py            # lee las variables de .env
│   ├── database.py          # conexión a la base de datos
│   ├── models.py            # tablas
│   ├── security.py          # contraseñas, sesión, roles y CSRF
│   ├── datos_iniciales.py   # servicios, horario y preguntas iniciales
│   ├── services/            # reglas de negocio (agenda, citas, solicitudes…)
│   ├── chatbot/             # asistente: máquina de estados sin IA externa
│   ├── routers/             # rutas del sitio, del chat y del panel
│   ├── templates/           # plantillas Jinja2
│   └── static/              # CSS, JavaScript e imágenes
├── migrations/              # migraciones de Alembic
├── tests/                   # pruebas con pytest
├── prototipo/               # prototipo original de Figma (no se modifica)
├── docs/                    # documentación del curso
├── seed.py                  # datos iniciales y de ejemplo
├── requirements.txt
└── .env.example
```

## Cambiar a MySQL

1. Instala el controlador:

   ```bash
   pip install pymysql
   ```

2. Crea la base en MySQL, por ejemplo con `CREATE DATABASE vida_animal CHARACTER SET utf8mb4;`.
3. En `.env`, cambia la cadena de conexión:

   ```
   DATABASE_URL=mysql+pymysql://usuario:contraseña@localhost:3306/vida_animal
   ```

4. Ejecuta `alembic upgrade head` y `python seed.py`.

## Cambios en la base de datos

Si modificas `app/models.py`, genera una migración nueva y aplícala:

```bash
alembic revision --autogenerate -m "describe el cambio"
```

```bash
alembic upgrade head
```

## Problemas comunes

| Mensaje | Solución |
|---|---|
| `No module named 'fastapi'` | El entorno virtual no está activo. Repite el paso 3. |
| `Revisa tu archivo .env: la contraseña…` | Falta `ADMIN_PASSWORD` u `OPERATIVO_PASSWORD` en `.env`, o tiene menos de 8 caracteres. |
| `no such table` | Falta crear las tablas. Ejecuta `alembic upgrade head`. |
| `Address already in use` | Ya hay un servidor en el puerto 8000. Ciérralo o usa `uvicorn app.main:app --reload --port 8001`. |

## Notas

- **WhatsApp:** el sistema no envía mensajes solo, porque eso requiere la API de WhatsApp Business. Los botones abren WhatsApp con el mensaje ya escrito para que el personal lo envíe.
- **Teléfono de la clínica:** viene como `656 000 0000`. Cámbialo en **Panel → Contenido del sitio → Datos de contacto**.
- **Usuarios nuevos:** el administrador les asigna una contraseña temporal y el sistema les pide cambiarla en su primer acceso.

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

Antes de empezar, lee [`CONTRIBUTING.md`](CONTRIBUTING.md): ahí están el flujo de ramas, la convención de commits y el proceso de Pull Request.

## Licencia y uso

Proyecto académico desarrollado para la clínica Vida Animal II. Uso restringido a fines académicos; los derechos sobre el contenido pertenecen a sus autores y a la clínica.

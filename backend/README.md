# Backend

API y lógica de negocio de Vida Animal II, hecha con **FastAPI**, **SQLAlchemy** y **Alembic**.

## Qué hay aquí

| Ruta | Contenido |
|---|---|
| `app/models.py` | Tablas: usuarios, propietarios, mascotas, servicios, horario, citas, solicitudes y conversaciones del chat |
| `app/services/agenda.py` | Reglas de agenda: espacios, cupo, anticipación, días sin servicio y reserva con candado contra dobles reservas |
| `app/services/` | Citas, solicitudes (folios SOL-0001), propietarios, ajustes y datos públicos del sitio |
| `app/routers/` | Sitio público, API del asistente (`/api/chat`), inicio de sesión y las secciones del panel |
| `app/security.py` | Contraseñas con bcrypt, sesión en cookie httpOnly firmada, roles y CSRF |
| `migrations/` | Migraciones de Alembic: crean la base en SQLite o MySQL |
| `seed.py` | Catálogos, cuentas del personal (contraseñas del `.env`) y datos de ejemplo |
| `tests/` | Pruebas con pytest |
| `DDL_base_script.sql` | Script MySQL de referencia del DER (no lo usa la app) |

Las plantillas y el CSS están en [`../frontend`](../frontend) y el asistente en [`../chatbot`](../chatbot).

## Uso rápido

Con el entorno virtual activo y **dentro de esta carpeta**:

```bash
pip install -r requirements.txt
```

```bash
alembic upgrade head
```

```bash
python seed.py
```

```bash
uvicorn app.main:app --reload
```

```bash
pytest
```

Antes de `seed.py`, copia `.env.example` como `.env` y pon tus contraseñas. Las instrucciones completas están en el [README principal](../README.md).

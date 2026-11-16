# Publicar el sistema en internet con una base de datos permanente

Esta guía deja el sistema funcionando en internet para que la clínica lo use desde cualquier computadora o celular, sin que se pierdan los datos.

## Por qué cambia la base de datos

En desarrollo el sistema guarda todo en un archivo SQLite (`vida_animal.db`). Ese archivo sirve en una computadora, pero los servicios de hosting gratuitos **borran los archivos del servidor cada vez que se reinicia o se vuelve a publicar**. Si se usara SQLite ahí, se perderían las citas, los expedientes y los cobros.

Por eso, en internet el sistema usa **PostgreSQL en Neon**, un servicio de base de datos que guarda los datos de forma permanente aunque el servidor se reinicie. Las fotos de las mascotas también se guardan dentro de la base, por la misma razón.

| Pieza | Servicio | Costo |
|---|---|---|
| Servidor web (la página y el panel) | Render, plan Free | $0 |
| Base de datos permanente | Neon, plan Free (1 GB) | $0 |
| Dominio propio (opcional) | El que se compró en la fase 2 | $200 al año |

> **Importante:** no uses la base de datos PostgreSQL de Render en el plan gratuito, porque se elimina a los 30 días. Usa Neon.

Limitación del plan gratuito de Render: si nadie entra durante 15 minutos, el servidor se duerme y la siguiente visita tarda cerca de un minuto en abrir. Los datos no se pierden. Si la clínica quiere que siempre abra rápido, se puede cambiar el servicio al plan Starter de Render (alrededor de 7 dólares al mes).

## 1. Crear la base de datos en Neon

1. Entra a <https://neon.com> y crea una cuenta (puedes entrar con GitHub). No pide tarjeta.
2. Crea un proyecto llamado `vida-animal`. En la región elige **AWS US East** o la más cercana.
3. En el proyecto da clic en **Connect** y copia la **connection string**. Se ve así:

   ```
   postgresql://neondb_owner:XXXXXXXX@ep-algo-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

   Guárdala; es la contraseña de la base. No la subas a GitHub.

## 2. Publicar el sistema en Render

1. Entra a <https://render.com> y crea una cuenta con GitHub.
2. Da clic en **New → Blueprint** y elige el repositorio `vida-animal-vet` y la rama que tiene el código (por ejemplo `main`). Render lee el archivo `render.yaml` del proyecto.
3. Render pide los valores que faltan:
   - `DATABASE_URL`: pega la connection string de Neon.
   - `ADMIN_PASSWORD`: la contraseña del administrador (al menos 8 caracteres).
   - `OPERATIVO_PASSWORD`: la contraseña del personal operativo.
4. Da clic en **Apply**. La primera vez tarda unos minutos. Render instala todo, crea las tablas en Neon y las dos cuentas.
5. Cuando diga **Live**, abre la dirección que da Render (por ejemplo `https://vida-animal-ii.onrender.com`). El panel está en `/login`.

Cada vez que se suba un cambio a esa rama en GitHub, Render vuelve a publicar el sistema solo. Los datos se conservan porque viven en Neon.

## 3. Primeros pasos en el sistema real

1. Entra como administrador.
2. En **Contenido del sitio**, revisa los datos de contacto y pon el **precio de cada servicio** (botón de editar de cada servicio). Esos precios son los que usa la caja.
3. En **Inventario**, da de alta los productos y medicamentos con su existencia inicial, mínimo, costo y precio.
4. En **Usuarios y roles**, crea una cuenta para cada persona del equipo de la clínica.
5. En **Horarios y disponibilidad**, revisa el horario y agrega los días sin servicio o con horario especial.

## 4. Usar el dominio de la clínica (opcional)

En Render, dentro del servicio, ve a **Settings → Custom Domains**, agrega el dominio (por ejemplo `vidaanimal2.com`) y copia los registros DNS que te indica en el panel del proveedor donde se compró el dominio.

## 5. Respaldos

Neon guarda la base de forma permanente, pero conviene tener una copia propia. Una vez a la semana, en una computadora con el proyecto:

1. En el archivo `.env`, cambia temporalmente `DATABASE_URL` por la connection string de Neon.
2. Ejecuta:

   ```bash
   python scripts/respaldar.py
   ```

3. Se crea un archivo en la carpeta `respaldos/` con toda la información. Guárdalo en un lugar seguro (contiene datos personales de los clientes) y regresa `DATABASE_URL` a SQLite.

## 6. Probar en tu computadora con la base de Neon (opcional)

Si quieres revisar los datos reales desde tu computadora, pon la connection string de Neon en `DATABASE_URL` del `.env` y ejecuta `uvicorn app.main:app --reload`. **Cuidado:** todo lo que hagas afecta los datos reales de la clínica. Para practicar usa SQLite.

## Problemas comunes

| Mensaje o situación | Solución |
|---|---|
| El sitio tarda en abrir la primera vez | El servidor gratuito estaba dormido. Espera un minuto; los datos siguen ahí. |
| `Revisa tu archivo .env: la contraseña…` en los registros de Render | Falta `ADMIN_PASSWORD` u `OPERATIVO_PASSWORD` en Render, o tienen menos de 8 caracteres. Corrígelas en **Environment** y vuelve a publicar. |
| `could not translate host name` o `password authentication failed` | Revisa que `DATABASE_URL` sea exactamente la connection string de Neon, con `?sslmode=require` al final. |
| La sesión se cierra al iniciar | Revisa que `COOKIE_SEGURA` esté en `true` y que entres con `https://`. |

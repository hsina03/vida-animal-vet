# Frontend

HTML, CSS y JavaScript sin paso de compilación. El backend sirve esta carpeta, así que no hace falta levantar nada aparte: con `npm run dev` en la raíz ya se ven las páginas.

| Página | Archivo | Qué hace |
|---|---|---|
| Sitio público | `public/index.html` + `js/site.js` | Servicios, horario y contacto (los lee de `/api/public/info`) y el asistente para agendar |
| Inicio de sesión | `public/login.html` + `js/login.js` | Acceso del personal |
| Panel | `public/admin/index.html` + `js/admin/app.js` | Inicio, citas (lista y semana), solicitudes del chat, propietarios y mascotas, horarios, contenido del sitio y usuarios |

- `css/styles.css` viene del prototipo de alta fidelidad (Figma) con la paleta del logo; `css/app.css` tiene los complementos del sistema.
- `js/common.js` reúne utilidades: llamadas a la API (`api()`), avisos (`toast()`), fechas, teléfonos y `esc()` para pintar datos sin riesgo de inyección.
- Los íconos son un sprite SVG dentro de cada HTML (`<use href="#i-cal">`).
- El panel se navega con el hash de la URL (`/admin#/citas`) y oculta las secciones de administrador al personal operativo; el backend vuelve a validar el rol en cada petición.

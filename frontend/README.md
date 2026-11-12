# Frontend

Interfaz de Vida Animal II: plantillas **Jinja2** que sirve el backend y **JavaScript sin frameworks**. Conserva el diseño, los colores y la tipografía del [prototipo de Figma](../prototipo).

## Archivos

| Ruta | Contenido |
|---|---|
| `templates/sitio/inicio.html` | Sitio público: inicio, servicios, cómo agendar, nosotros, ubicación, contacto y la ventana del asistente |
| `templates/login.html`, `cambiar_password.html` | Inicio de sesión del personal y cambio de contraseña |
| `templates/panel/` | Panel: inicio, citas (lista y semana), solicitudes, propietarios, horarios, contenido y usuarios |
| `static/css/estilos.css` | Estilos tomados del prototipo, con ajustes para celular |
| `static/js/sitio.js` | Asistente del sitio (habla con `/api/chat`) |
| `static/js/panel.js` | Ventanas del panel, selector de horarios y avisos |
| `static/img/` | Logo y foto del inicio |

Los datos (servicios, horario, contacto, citas) vienen de la base de datos; ninguno está escrito a mano en las plantillas. Para verlo, inicia el servidor desde [`../backend`](../backend).

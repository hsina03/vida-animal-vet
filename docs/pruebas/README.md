# Pruebas del Sistema para Vida Animal II

Este documento explica qué se prueba, cómo correr las pruebas y dónde queda la evidencia.

## Qué se prueba

Las pruebas son automáticas: usan **pytest** y el `TestClient` de FastAPI, que simula el navegador. Cada prueba crea su propia base de datos temporal, así que no tocan `vida_animal.db`.

| Archivo | Qué comprueba |
|---|---|
| `tests/test_auth.py` | Inicio de sesión correcto e incorrecto, cuenta desactivada, límite de intentos, contraseña temporal y CSRF |
| `tests/test_permisos.py` | Permisos por rol (Administrador y Personal operativo) |
| `tests/test_agenda.py` | Espacios de 30 minutos, cupo, servicios largos, anticipación, días sin servicio, cancelar, reprogramar y doble reserva simultánea |
| `tests/test_chatbot.py` | Asistente: agendar, urgencias, canalización y preguntas frecuentes |
| `tests/test_panel_citas.py` | Acciones del panel y flujo completo: agendar por el chat y confirmar en el panel |
| `tests/test_migraciones.py` | Que la migración de Alembic coincida con los modelos |
| `tests/test_casos_de_prueba.py` | Casos CP-10, CP-13 y CP-14 de la matriz de la Fase 3 (agenda del día, edición de propietarios y mascotas, tiempo de respuesta) |

## Matriz de casos de prueba (Fase 3) y pruebas que los comprueban

| Caso | Requerimiento | Prueba | Prueba automática |
|---|---|---|---|
| CP-01 | RF-01 | Iniciar sesión con usuario y contraseña válidos | `test_auth.py::test_inicio_correcto` |
| CP-02 | RF-01 | Iniciar sesión con contraseña incorrecta | `test_auth.py::test_contrasena_incorrecta`, `test_limite_de_intentos` |
| CP-03 | RF-02 | Entrar a una función no permitida para el rol | `test_permisos.py::test_operativo_no_entra_a_secciones_de_administrador`, `test_operativo_no_puede_cambiar_configuracion_aunque_envie_la_peticion` |
| CP-04 | RF-03 a RF-05 | Página web con servicios, ubicación y contacto | `test_panel_citas.py::test_sitio_publico_lee_datos_de_la_base` (la vista en celular se revisa a mano) |
| CP-05 | RF-06, RF-07 | Preguntar al chatbot por horarios y servicios | `test_chatbot.py::test_preguntas_frecuentes_se_leen_de_la_base`, `test_horario_y_ubicacion` |
| CP-06 | RF-08, RF-09 | Solicitar una cita desde el chatbot | `test_chatbot.py::test_flujo_completo_de_agendar`, `test_reutiliza_propietario_y_mascota_por_telefono` |
| CP-07 | RF-11, RF-12 | Registrar una cita en un horario disponible | `test_chatbot.py::test_flujo_completo_de_agendar`, `test_panel_citas.py::test_registrar_cita_desde_el_panel` |
| CP-08 | RF-12 | Solicitar una cita en un horario ocupado | `test_chatbot.py::test_horario_ocupado_mientras_se_confirma`, `test_panel_citas.py::test_registrar_en_horario_lleno_muestra_error`, `test_agenda.py::test_doble_reserva_concurrente_solo_una_toma_el_ultimo_lugar` |
| CP-09 | RF-10 | Indicar una urgencia en el chatbot | `test_chatbot.py::test_detecta_urgencias`, `test_canaliza_si_lo_pide_y_guarda_contacto` |
| CP-10 | RF-13 | Consultar la agenda del día en el panel | `test_casos_de_prueba.py::test_cp10_agenda_del_dia_lista_solo_las_citas_de_ese_dia` |
| CP-11 | RF-14 | Confirmar, modificar y cancelar una cita | `test_panel_citas.py::test_confirmar_y_marcar_atendida`, `test_reprogramar`, `test_cancelar_con_motivo` |
| CP-12 | RF-15 | Cambiar el horario de atención | `test_permisos.py::test_administrador_cambia_horario_y_se_refleja_en_el_sitio`, `test_agenda.py::test_dia_sin_servicio` |
| CP-13 | RF-16 a RF-18 | Consultar y actualizar un propietario y su mascota | `test_panel_citas.py::test_busqueda_de_propietarios`, `test_casos_de_prueba.py::test_cp13_*` |
| CP-14 | RNF | Tiempo de respuesta del chatbot y de la agenda | `test_casos_de_prueba.py::test_cp14_*` (límite de 2 segundos) |

Además hay pruebas de seguridad: protección CSRF (`test_login_sin_token_csrf_se_rechaza`, `test_peticion_sin_csrf_se_rechaza`) y escape de datos en pantalla (`test_los_datos_se_escapan_en_pantalla`).

## Cómo correr las pruebas

Con el entorno virtual activo y desde la carpeta del proyecto:

```bash
pytest -v
```

Para correrlas **y guardar la evidencia**:

```bash
python scripts/correr_pruebas.py
```

Esto crea en `docs/pruebas/evidencia/`:

| Archivo | Contenido |
|---|---|
| `resultado-pruebas.txt` | La salida completa de pytest, prueba por prueba |
| `reporte-pruebas.xml` | Reporte en formato JUnit |
| `resumen.md` | Fecha, equipo, totales y una tabla con el resultado de cada prueba |

## Pruebas automáticas en GitHub

El archivo `.github/workflows/pruebas.yml` hace que GitHub corra las pruebas cada vez que alguien sube código o abre un Pull Request:

- En la pestaña **Actions** del repositorio aparece cada ejecución con su resultado.
- Junto a cada commit aparece una palomita verde (todas pasaron) o una X roja (alguna falló).
- En la página de cada ejecución se muestra el resumen y se puede descargar la evidencia (**Artifacts → evidencia-pruebas**).

Los pasos para subir todo a GitHub están en [`como-subir-a-github.md`](como-subir-a-github.md).

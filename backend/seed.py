"""Prepara la base con los catálogos, las cuentas del personal y datos de ejemplo.

Uso:
    python seed.py              agrega lo que falte (no borra nada)
    python seed.py --reiniciar  borra la base de desarrollo y la vuelve a crear

Las contraseñas de las cuentas se toman de ADMIN_PASSWORD y OPERATIVO_PASSWORD en .env.
"""
import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app import tiempo
from app.config import obtener_ajustes
from app.database import Base, SessionLocal, engine
from app.datos_iniciales import cargar_catalogos
from app.errores import ErrorNegocio
from app.models import (ATENDIDA, CANCELADA, CONFIRMADA, ROL_ADMIN, ROL_OPERATIVO, SOL_ATENCION, SOL_NUEVA,
                        SOL_URGENTE, TIPO_CANALIZACION, TIPO_CITA, Cita, Conversacion, DiaSinServicio,
                        MensajeChat, Mascota, Propietario, Servicio, Usuario)
from app.security import hash_password, validar_password_nueva
from app.services import agenda, solicitudes

PROPIETARIOS = [
    ("Sofía Hernández", "6562147790", "sofia.hdz@correo.com",
     [("Max", "Perro", "Labrador", "4 años", "Macho", "31 kg"), ("Nala", "Perro", "Golden retriever", "2 años", "Hembra", "26 kg")]),
    ("Carlos Ramírez", "6563810042", "c.ramirez@correo.com", [("Luna", "Gato", "Mestizo", "1 año", "Hembra", "3.8 kg")]),
    ("Mariana Torres", "6561095521", "mariana.t@correo.com", [("Coco", "Perro", "Poodle", "6 años", "Macho", "7 kg")]),
    ("Jorge Medina", "6564473318", "", [("Kiwi", "Ave", "Periquito australiano", "2 años", "Macho", "38 g")]),
    ("Ana Lucía Pérez", "6562906614", "analu.perez@correo.com", [("Rocky", "Perro", "Pitbull", "3 años", "Macho", "24 kg")]),
    ("Fernanda Ruiz", "6565328807", "fer.ruiz@correo.com", [("Mishi", "Gato", "Siamés", "5 meses", "Hembra", "1.9 kg")]),
    ("Ricardo Gómez", "6561182290", "rgomez@correo.com", [("Toby", "Perro", "Chihuahua", "8 años", "Macho", "2.6 kg")]),
    ("Daniela Castro", "6566754013", "dani.castro@correo.com", [("Pelusa", "Conejo", "Belier", "1 año", "Hembra", "1.6 kg")]),
]

USUARIOS_EJEMPLO = [  # cuentas adicionales para mostrar la sección de usuarios
    ("MVZ Daniel Ochoa", "dochoa", True),
    ("MVZ Ernesto Silva", "esilva", False),
]

DIAS_FESTIVOS = [  # (mes, día, motivo)
    (11, 16, "Día de la Revolución"), (12, 12, "Día de la Virgen de Guadalupe"),
    (12, 25, "Navidad"), (1, 1, "Año Nuevo"),
]


def crear_cuentas(db) -> None:
    ajustes = obtener_ajustes()
    for usuario, nombre, password, rol in (
            (ajustes.admin_usuario, ajustes.admin_nombre, ajustes.admin_password, ROL_ADMIN),
            (ajustes.operativo_usuario, ajustes.operativo_nombre, ajustes.operativo_password, ROL_OPERATIVO)):
        error = validar_password_nueva(password)
        if error:
            sys.exit(f"Revisa tu archivo .env: la contraseña de «{usuario}» no es válida. {error}")
        if db.scalar(select(Usuario).where(Usuario.usuario == usuario.lower())):
            print(f"  · La cuenta «{usuario}» ya existe; no se modificó.")
            continue
        db.add(Usuario(nombre=nombre, usuario=usuario.lower(), rol=rol, password_hash=hash_password(password)))
        print(f"  · Cuenta «{usuario}» creada ({'administrador' if rol == ROL_ADMIN else 'personal operativo'}).")
    for nombre, usuario, activo in USUARIOS_EJEMPLO:
        if not db.scalar(select(Usuario).where(Usuario.usuario == usuario)):
            # Contraseña aleatoria: son cuentas de muestra, el administrador puede restablecerlas
            db.add(Usuario(nombre=nombre, usuario=usuario, rol=ROL_OPERATIVO, activo=activo,
                           password_hash=hash_password(f"{random.random()}-{random.random()}")))
    db.commit()


def crear_datos_ejemplo(db) -> None:
    if db.scalar(select(Propietario.id).limit(1)):
        print("  · Ya hay propietarios registrados; no se agregaron datos de ejemplo.")
        return
    hoy = tiempo.hoy()
    for mes, dia, motivo in DIAS_FESTIVOS:
        anio = hoy.year if (mes, dia) >= (hoy.month, hoy.day) else hoy.year + 1
        db.add(DiaSinServicio(fecha=date(anio, mes, dia), motivo=motivo))

    mascotas = []
    for nombre, telefono, correo, lista in PROPIETARIOS:
        propietario = Propietario(nombre=nombre, telefono=telefono, correo=correo,
                                  creado=tiempo.ahora() - timedelta(days=random.randint(20, 400)))
        for m in lista:
            propietario.mascotas.append(Mascota(nombre=m[0], especie=m[1], raza=m[2], edad=m[3], sexo=m[4], peso=m[5]))
        db.add(propietario)
        mascotas.extend(propietario.mascotas)
    db.commit()

    servicios = {s.clave: s for s in db.scalars(select(Servicio))}
    admin = db.scalar(select(Usuario).where(Usuario.rol == ROL_ADMIN))
    plan = [  # (días desde hoy, hora, minuto, índice de mascota, servicio, estado, origen)
        (-2, 10, 0, 7, "estudios", ATENDIDA, "personal"), (-2, 12, 30, 2, "consulta", ATENDIDA, "chat"),
        (-1, 9, 30, 0, "vacunacion", ATENDIDA, "chat"), (-1, 15, 0, 3, "consulta", ATENDIDA, "personal"),
        (0, 9, 0, 0, "consulta", ATENDIDA, "chat"), (0, 10, 30, 3, "estetica", CONFIRMADA, "chat"),
        (0, 11, 30, 4, "consulta", CONFIRMADA, "personal"), (0, 13, 0, 6, "vacunacion", "pendiente", "chat"),
        (0, 16, 0, 7, "consulta", CONFIRMADA, "personal"), (0, 17, 30, 1, "estetica", "pendiente", "chat"),
        (0, 18, 0, 8, "consulta", CANCELADA, "chat"),
        (1, 9, 0, 6, "consulta", CONFIRMADA, "chat"), (1, 11, 0, 1, "vacunacion", CONFIRMADA, "personal"),
        (1, 16, 30, 7, "estetica", "pendiente", "chat"), (2, 10, 0, 0, "estetica", "pendiente", "chat"),
        (2, 12, 0, 2, "vacunacion", CONFIRMADA, "personal"), (3, 12, 0, 5, "cirugia", "pendiente", "chat"),
    ]
    creadas = []
    for dias, hora, minuto, i_mascota, clave, estado, origen in plan:
        fecha = hoy + timedelta(days=dias)
        if agenda.motivo_sin_servicio(db, fecha):
            continue
        inicio = datetime.combine(fecha, time(hora, minuto))
        try:
            # Las citas pasadas se registran directo; las futuras pasan por las reglas de agenda
            if inicio < tiempo.ahora():
                cita = Cita(mascota=mascotas[i_mascota], servicio=servicios[clave], inicio=inicio,
                            fin=inicio + timedelta(minutes=servicios[clave].duracion_min), estado=estado, origen=origen)
                db.add(cita)
            else:
                cita = agenda.reservar(db, mascota=mascotas[i_mascota], servicio=servicios[clave], inicio=inicio,
                                       origen="personal", estado=estado, usuario=admin)
                cita.origen = origen
            if estado == CANCELADA:
                cita.motivo_cancelacion = "El propietario lo solicitó"
            db.commit()
            creadas.append(cita)
        except ErrorNegocio:
            db.rollback()

    # Solicitudes del chat de ejemplo
    for cita in creadas:
        if cita.origen == "chat" and cita.estado == "pendiente" and cita.inicio >= tiempo.ahora():
            m, p = cita.mascota, cita.mascota.propietario
            conversacion = _conversacion(db, [
                ("bot", "¡Hola! Soy el asistente de Vida Animal II. Puedo ayudarte a agendar una cita o resolver tus dudas."),
                ("usuario", "Agendar una cita"), ("bot", "Con gusto. ¿Qué servicio necesitas?"),
                ("usuario", cita.servicio.nombre), ("bot", "¿Cómo se llama tu mascota?"), ("usuario", m.nombre),
                ("bot", f"¿Qué especie es {m.nombre}?"), ("usuario", m.especie),
                ("bot", f"Estos son los horarios libres para el {tiempo.fecha_larga(cita.inicio.date(), False).lower()}:"),
                ("usuario", tiempo.hora_txt(cita.inicio)), ("bot", "¿A nombre de quién registro la cita?"),
                ("usuario", p.nombre), ("bot", "¿A qué número de WhatsApp te confirmamos? Escribe los 10 dígitos."),
                ("usuario", p.telefono), ("bot", "Revisa los datos de tu cita:"), ("usuario", "Confirmar solicitud"),
            ])
            s = solicitudes.crear(db, tipo=TIPO_CITA, estado=SOL_NUEVA, motivo=f"Cita de {cita.servicio.nombre}",
                                  nombre=p.nombre, telefono=p.telefono, mascota_txt=f"{m.nombre} ({m.especie})",
                                  cita=cita, conversacion=conversacion)
            conversacion.mensajes.append(MensajeChat(
                autor="bot", texto=f"Listo, {p.nombre.split()[0]}. Tu solicitud quedó registrada con el folio {s.folio}. "
                                   "El personal te confirmará la cita por WhatsApp."))

    conversacion = _conversacion(db, [
        ("bot", "¡Hola! Soy el asistente de Vida Animal II. Puedo ayudarte a agendar una cita o resolver tus dudas."),
        ("usuario", "mi perro se comió un pedazo de chocolate"),
        ("bot", "Por lo que me cuentas, puede tratarse de una urgencia. Ya avisé al personal."),
        ("usuario", "Luis Ortega"), ("usuario", "656 228 9046"),
    ])
    solicitudes.crear(db, tipo=TIPO_CANALIZACION, estado=SOL_URGENTE, motivo="Posible urgencia detectada en el mensaje",
                      nombre="Luis Ortega", telefono="6562289046", mascota_txt="Bruno (Perro)", conversacion=conversacion)
    conversacion = _conversacion(db, [
        ("bot", "¡Hola! Soy el asistente de Vida Animal II. Puedo ayudarte a agendar una cita o resolver tus dudas."),
        ("usuario", "Preguntas frecuentes"), ("bot", "Estas son las preguntas más comunes:"),
        ("usuario", "Mi pregunta no está aquí"),
        ("bot", "Te comunico con el personal de la clínica. Ya les avisé y puedes escribirles por WhatsApp."),
        ("usuario", "¿Tienen servicio de cremación a domicilio?"),
    ])
    solicitudes.crear(db, tipo=TIPO_CANALIZACION, estado=SOL_ATENCION, motivo="Su pregunta no está en las frecuentes",
                      nombre="Gabriela León", telefono="6564507781", conversacion=conversacion)
    db.commit()
    print(f"  · {len(PROPIETARIOS)} propietarios, {len(mascotas)} mascotas y {len(creadas)} citas de ejemplo.")


def _conversacion(db, mensajes) -> Conversacion:
    conversacion = Conversacion(token=f"ejemplo-{random.getrandbits(64):x}", estado="fin")
    for autor, texto in mensajes:
        conversacion.mensajes.append(MensajeChat(autor=autor, texto=texto))
    db.add(conversacion)
    db.flush()
    return conversacion


def main() -> None:
    if "--reiniciar" in sys.argv:
        if not obtener_ajustes().database_url.startswith("sqlite"):
            sys.exit("--reiniciar solo está permitido con la base SQLite de desarrollo.")
        print("Borrando la base de desarrollo…")
        Base.metadata.drop_all(engine)
        from alembic import command
        from alembic.config import Config
        command.stamp(Config("alembic.ini"), "base", purge=True)
        command.upgrade(Config("alembic.ini"), "head")
    db = SessionLocal()
    try:
        print("Cargando catálogos (servicios, horario, reglas y preguntas frecuentes)…")
        cargar_catalogos(db)
        print("Creando cuentas del personal…")
        crear_cuentas(db)
        print("Agregando datos de ejemplo…")
        crear_datos_ejemplo(db)
        print("Listo. Ya puedes iniciar el servidor.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

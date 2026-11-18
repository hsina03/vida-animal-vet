"""Catálogos base: servicios, horario, reglas de agenda y preguntas frecuentes.

Se usan desde seed.py y desde las pruebas. Solo agregan lo que falta.
"""
from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ajuste, BloqueoAgenda, HorarioDia, PreguntaFrecuente, Servicio
from app.services import ajustes

SERVICIOS = [
    # clave, nombre, descripción, grupo, icono, duración, agendable
    ("consulta", "Consulta general",
     "Revisión completa, diagnóstico y tratamiento para perros, gatos y otras especies.",
     "Salud", "i-steth", 30, True),
    ("vacunacion", "Vacunación y medicina preventiva",
     "Esquemas de vacunas, desparasitación y control de cachorros y adultos.",
     "Salud", "i-syr", 30, True),
    ("cirugia", "Cirugías y procedimientos",
     "Esterilizaciones y procedimientos clínicos, con valoración previa.",
     "Salud", "i-pulse", 30, True),
    ("estudios", "Estudios complementarios",
     "Apoyo diagnóstico para confirmar lo que observamos en consulta.",
     "Salud", "i-flask", 30, True),
    ("estetica", "Estética",
     "Baño, corte de pelo y uñas, limpieza de oídos.",
     "Cuidado y estancia", "i-scis", 60, True),
    ("hospitalizacion", "Hospitalización",
     "Seguimiento médico de pacientes que necesitan quedarse en observación.",
     "Cuidado y estancia", "i-bed", 30, False),
    ("hospedaje", "Hospedaje",
     "Tu mascota se queda con nosotros mientras viajas, bajo vigilancia veterinaria.",
     "Cuidado y estancia", "i-house", 30, True),
    ("medicamentos", "Medicamentos y productos",
     "Alimento, medicamentos y accesorios recomendados por nuestros médicos.",
     "Tienda y acompañamiento", "i-pill", 30, False),
    ("cremacion", "Cremación",
     "Acompañamiento respetuoso para despedir a tu compañero.",
     "Tienda y acompañamiento", "i-feather", 30, False),
]

HORARIO = [  # lunes a domingo
    (True, time(9), time(19)), (True, time(9), time(19)), (True, time(9), time(19)),
    (True, time(9), time(19)), (True, time(9), time(19)), (True, time(9), time(15)),
    (False, None, None),
]

PREGUNTAS = [
    ("¿Necesito cita para estética?",
     "Sí. Los baños y cortes se agendan para asegurar un espacio de una hora. Puedes agendar desde aquí."),
    ("¿Atienden urgencias?",
     "Si tu mascota tiene una urgencia, escríbenos por WhatsApp antes de llegar para preparar su atención."),
    ("¿Qué especies atienden?",
     "Perros y gatos, y también conejos, aves y otras especies pequeñas. Pregúntanos por la tuya."),
    ("¿Cuánto cuesta una consulta?",
     "El costo depende del servicio y del peso de tu mascota. El personal te informa al confirmar tu cita."),
]


def cargar_catalogos(db: Session) -> None:
    existentes = set(db.scalars(select(Servicio.clave)))
    for orden, (clave, nombre, desc, grupo, icono, duracion, agendable) in enumerate(SERVICIOS):
        if clave not in existentes:
            db.add(Servicio(clave=clave, nombre=nombre, descripcion=desc, grupo=grupo, icono=icono,
                            duracion_min=duracion, agendable=agendable, visible=True, orden=orden))

    for dia, (abierto, apertura, cierre) in enumerate(HORARIO):
        if db.get(HorarioDia, dia) is None:
            db.add(HorarioDia(dia_semana=dia, abierto=abierto, apertura=apertura, cierre=cierre))

    if db.scalar(select(PreguntaFrecuente.id).limit(1)) is None:
        for orden, (pregunta, respuesta) in enumerate(PREGUNTAS):
            db.add(PreguntaFrecuente(pregunta=pregunta, respuesta=respuesta, orden=orden))

    for clave, valor in ajustes.VALORES_INICIALES.items():
        if db.get(Ajuste, clave) is None:
            db.add(Ajuste(clave=clave, valor=valor))

    if db.get(BloqueoAgenda, 1) is None:
        db.add(BloqueoAgenda(id=1, contador=0))
    db.commit()

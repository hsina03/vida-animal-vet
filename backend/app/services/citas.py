"""Acciones sobre citas: confirmar, cancelar, reprogramar y marcar como atendida."""
from datetime import datetime

from sqlalchemy.orm import Session

from app import tiempo
from app.models import (ATENDIDA, CANCELADA, CONFIRMADA, PENDIENTE, REPROGRAMADA, Cita,
                        HistorialCita, Usuario)
from app.services import agenda, solicitudes
from app.errores import ErrorNegocio

MOTIVOS_CANCELACION = ["El propietario lo solicitó", "No se presentó", "Médico no disponible", "Otro"]


def puede_confirmar(cita: Cita) -> bool:
    return cita.estado in (PENDIENTE, REPROGRAMADA)


def puede_modificar(cita: Cita) -> bool:
    return cita.estado in (PENDIENTE, CONFIRMADA, REPROGRAMADA)


def puede_atender(cita: Cita) -> bool:
    return puede_modificar(cita) and cita.inicio.date() <= tiempo.hoy()


def confirmar(db: Session, cita: Cita, usuario: Usuario) -> None:
    if not puede_confirmar(cita):
        raise ErrorNegocio(f"La cita está {cita.estado_txt.lower()} y no se puede confirmar.")
    cita.estado = CONFIRMADA
    db.add(HistorialCita(cita=cita, accion="confirmada", usuario=usuario, detalle="Cita confirmada"))
    solicitudes.resolver_de_cita(db, cita, usuario)
    db.commit()


def cancelar(db: Session, cita: Cita, motivo: str, usuario: Usuario) -> None:
    motivo = (motivo or "").strip()
    if not motivo:
        raise ErrorNegocio("Escribe el motivo de la cancelación.")
    if not puede_modificar(cita):
        raise ErrorNegocio(f"La cita está {cita.estado_txt.lower()} y no se puede cancelar.")
    cita.estado = CANCELADA
    cita.motivo_cancelacion = motivo[:200]
    db.add(HistorialCita(cita=cita, accion="cancelada", usuario=usuario, detalle=f"Motivo: {motivo}"))
    solicitudes.resolver_de_cita(db, cita, usuario)
    db.commit()


def reprogramar(db: Session, cita: Cita, nuevo_inicio: datetime, usuario: Usuario) -> None:
    if not puede_modificar(cita):
        raise ErrorNegocio(f"La cita está {cita.estado_txt.lower()} y no se puede reprogramar.")
    if nuevo_inicio == cita.inicio:
        raise ErrorNegocio("Elige un horario distinto al actual.")
    try:
        agenda.mover(db, cita, nuevo_inicio, usuario)
    except ErrorNegocio:
        db.rollback()
        raise
    cita.estado = REPROGRAMADA
    db.commit()


def marcar_atendida(db: Session, cita: Cita, usuario: Usuario) -> None:
    if not puede_atender(cita):
        raise ErrorNegocio("Solo se pueden marcar como atendidas las citas de hoy o de días anteriores que sigan activas.")
    cita.estado = ATENDIDA
    db.add(HistorialCita(cita=cita, accion="atendida", usuario=usuario, detalle="Cita atendida"))
    solicitudes.resolver_de_cita(db, cita, usuario)
    db.commit()

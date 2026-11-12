"""Solicitudes del chat para el personal (folios SOL-0001)."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import tiempo
from app.models import SOL_RESUELTA, TIPO_CITA, Cita, Conversacion, Solicitud, Usuario


def crear(db: Session, *, tipo: str, estado: str, motivo: str = "", nombre: str = "", telefono: str = "",
          mascota_txt: str = "", cita: Cita | None = None, conversacion: Conversacion | None = None) -> Solicitud:
    solicitud = Solicitud(tipo=tipo, estado=estado, motivo=motivo, nombre_contacto=nombre, telefono=telefono,
                          mascota_txt=mascota_txt, cita=cita, conversacion=conversacion)
    db.add(solicitud)
    db.flush()
    solicitud.folio = f"SOL-{solicitud.id:04d}"
    db.flush()
    return solicitud


def resolver(db: Session, solicitud: Solicitud, usuario: Usuario | None) -> None:
    if solicitud.estado != SOL_RESUELTA:
        solicitud.estado = SOL_RESUELTA
        solicitud.resuelta_en = tiempo.ahora()
        solicitud.resuelta_por = usuario


def resolver_de_cita(db: Session, cita: Cita, usuario: Usuario | None) -> None:
    """Al confirmar una cita pedida por chat, su solicitud queda resuelta."""
    for solicitud in db.scalars(select(Solicitud).where(Solicitud.cita_id == cita.id,
                                                        Solicitud.tipo == TIPO_CITA)):
        resolver(db, solicitud, usuario)


def contar_abiertas(db: Session) -> int:
    return db.scalar(select(func.count(Solicitud.id)).where(Solicitud.estado != SOL_RESUELTA)) or 0

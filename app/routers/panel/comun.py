"""Ayudantes compartidos por las secciones del panel."""
from datetime import date

from fastapi import Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import tiempo
from app.models import Cita, Mascota, Propietario, Servicio, Usuario
from app.security import verificar_csrf
from app.services import citas, solicitudes
from app.templating import flash

CSRF = Depends(verificar_csrf)
CARGA_CITA = (joinedload(Cita.mascota).joinedload(Mascota.propietario), joinedload(Cita.servicio))

TITULOS = {
    "inicio": "Inicio", "citas": "Citas", "solicitudes": "Solicitudes del chat",
    "propietarios": "Propietarios y mascotas", "horarios": "Horarios y disponibilidad",
    "contenido": "Contenido del sitio", "usuarios": "Usuarios y roles",
}


def contexto(db: Session, yo: Usuario, seccion: str, **extra) -> dict:
    return {"yo": yo, "seccion": seccion, "titulo": TITULOS[seccion], "hoy": tiempo.hoy(),
            "solicitudes_abiertas": solicitudes.contar_abiertas(db), **extra}


def ruta_segura(url: str | None, por_defecto: str) -> str:
    if url and url.startswith("/panel") and not url.startswith("//"):
        return url
    return por_defecto


def volver(request: Request, url: str, texto: str | None = None, tipo: str = "ok") -> RedirectResponse:
    if texto:
        flash(request, texto, tipo)
    return RedirectResponse(url, status_code=303)


def leer_fecha(texto: str | None, por_defecto: date | None = None) -> date | None:
    try:
        return date.fromisoformat(texto) if texto else por_defecto
    except ValueError:
        return por_defecto


def datos_modales(db: Session) -> dict:
    """Listas que necesitan las ventanas de nueva cita, reprogramar y cancelar."""
    return {
        "servicios_agendables": list(db.scalars(select(Servicio).where(Servicio.agendable.is_(True))
                                                .order_by(Servicio.orden))),
        "propietarios": list(db.scalars(select(Propietario).order_by(Propietario.nombre))),
        "motivos": citas.MOTIVOS_CANCELACION,
    }

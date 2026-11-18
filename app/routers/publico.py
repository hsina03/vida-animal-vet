"""Sitio público: inicio, servicios, cómo agendar, nosotros, ubicación y contacto."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Servicio
from app.services import sitio
from app.templating import render

router = APIRouter()


@router.get("/")
def inicio(request: Request, db: Session = Depends(get_db)):
    grupos: dict[str, list[Servicio]] = {}
    for servicio in db.scalars(select(Servicio).where(Servicio.visible.is_(True))
                               .order_by(Servicio.orden, Servicio.id)):
        grupos.setdefault(servicio.grupo, []).append(servicio)
    return render(request, "sitio/inicio.html", {
        "grupos": grupos,
        "horario": sitio.resumen_horario(db),
        "horario_corto": sitio.horario_corto(db),
        "contacto": sitio.contacto(db),
    })

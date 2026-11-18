"""Panel: inicio con citas de hoy, citas por confirmar y solicitudes del chat."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app import tiempo
from app.database import get_db
from app.models import (CANCELADA, PENDIENTE, REPROGRAMADA, SOL_NUEVA, SOL_RESUELTA, TIPO_CANALIZACION,
                        TIPO_CITA, Cita, Solicitud, Usuario)
from app.routers.panel.comun import CARGA_CITA, contexto, datos_modales
from app.security import requiere_usuario
from app.services import citas as acciones
from app.templating import render

router = APIRouter()


@router.get("/panel")
def inicio(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    hoy = tiempo.hoy()
    manana = datetime.combine(hoy + timedelta(days=1), datetime.min.time())
    inicio_hoy = datetime.combine(hoy, datetime.min.time())
    citas_hoy = list(db.scalars(select(Cita).options(*CARGA_CITA)
                                .where(Cita.inicio >= inicio_hoy, Cita.inicio < manana).order_by(Cita.inicio)))
    por_confirmar = list(db.scalars(select(Cita).options(*CARGA_CITA)
                                    .where(Cita.estado.in_((PENDIENTE, REPROGRAMADA)), Cita.inicio >= inicio_hoy)
                                    .order_by(Cita.inicio).limit(8)))
    total_por_confirmar = db.scalar(select(func.count(Cita.id)).where(
        Cita.estado.in_((PENDIENTE, REPROGRAMADA)), Cita.inicio >= inicio_hoy))
    atencion = list(db.scalars(select(Solicitud).options(joinedload(Solicitud.conversacion))
                               .where(Solicitud.tipo == TIPO_CANALIZACION, Solicitud.estado != SOL_RESUELTA)
                               .order_by(Solicitud.estado.desc(), Solicitud.creado.desc())))
    pedidas_chat = db.scalar(select(func.count(Solicitud.id)).where(
        Solicitud.tipo == TIPO_CITA, Solicitud.estado == SOL_NUEVA))

    # La cita "actual" es la primera activa que aún no termina
    ahora = tiempo.ahora()
    actual = next((c.id for c in citas_hoy if c.estado != CANCELADA and c.fin > ahora), None)
    return render(request, "panel/inicio.html", contexto(
        db, yo, "inicio", citas_hoy=citas_hoy, por_confirmar=por_confirmar,
        total_por_confirmar=total_por_confirmar, atencion=atencion, pedidas_chat=pedidas_chat,
        activas_hoy=sum(1 for c in citas_hoy if c.estado != CANCELADA), actual=actual,
        puede_citas=acciones, **datos_modales(db)))

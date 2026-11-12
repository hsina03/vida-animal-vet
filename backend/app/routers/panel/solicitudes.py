"""Panel: solicitudes del chat con la conversación completa."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.errores import ErrorNegocio
from app.models import SOL_RESUELTA, Cita, Conversacion, Mascota, Solicitud, Usuario
from app.routers.panel.comun import CSRF, contexto, datos_modales, volver
from app.security import requiere_usuario
from app.services import citas as acciones, sitio, solicitudes
from app.templating import render

router = APIRouter()
# Opciones del asistente que no sirven como vista previa de lo que escribió la persona
OPCIONES_MENU = {"Agendar una cita", "Preguntas frecuentes", "Horario y ubicación", "Hablar con el personal",
                 "Mi pregunta no está aquí", "Otro o no estoy seguro"}


@router.get("/panel/solicitudes")
def lista(request: Request, filtro: str = "abiertas", sel: int | None = None, db: Session = Depends(get_db),
          yo: Usuario = Depends(requiere_usuario)):
    consulta = select(Solicitud).options(joinedload(Solicitud.cita)).order_by(Solicitud.creado.desc(), Solicitud.id.desc())
    if filtro != "todas":
        filtro = "abiertas"
        consulta = consulta.where(Solicitud.estado != SOL_RESUELTA)
    lista_sol = list(db.scalars(consulta.limit(200)))
    actual = db.get(Solicitud, sel) if sel else (lista_sol[0] if lista_sol else None)
    detalle = {}
    if actual:
        if actual.cita_id:
            actual = db.scalar(select(Solicitud).where(Solicitud.id == actual.id).options(
                joinedload(Solicitud.cita).joinedload(Cita.mascota).joinedload(Mascota.propietario),
                joinedload(Solicitud.cita).joinedload(Cita.servicio)))
        if actual.conversacion_id:
            conversacion = db.get(Conversacion, actual.conversacion_id)
            detalle["mensajes"] = conversacion.mensajes if conversacion else []
        if actual.telefono:
            detalle["whatsapp"] = sitio.whatsapp_url(
                db, f"Hola{', ' + actual.nombre_contacto.split()[0] if actual.nombre_contacto else ''}, "
                    f"te escribimos de Vida Animal II por tu solicitud {actual.folio}.", telefono=actual.telefono)
    # Primer mensaje que escribió la persona, para la vista previa de la lista
    vistas = {}
    for s in lista_sol:
        if s.conversacion_id and s.tipo != "cita":
            vistas[s.id] = next((m.texto for m in s.conversacion.mensajes
                                 if m.autor == "usuario" and m.texto not in OPCIONES_MENU), s.motivo)
    return render(request, "panel/solicitudes.html", contexto(
        db, yo, "solicitudes", solicitudes=lista_sol, actual=actual, filtro=filtro, vistas=vistas,
        puede=acciones, **detalle, **datos_modales(db)))


def _solicitud(db: Session, solicitud_id: int) -> Solicitud:
    solicitud = db.get(Solicitud, solicitud_id)
    if not solicitud:
        raise HTTPException(404, "La solicitud no existe.")
    return solicitud


@router.post("/panel/solicitudes/{solicitud_id}/resolver", dependencies=[CSRF])
def resolver(request: Request, solicitud_id: int, db: Session = Depends(get_db),
             yo: Usuario = Depends(requiere_usuario)):
    solicitud = _solicitud(db, solicitud_id)
    solicitudes.resolver(db, solicitud, yo)
    db.commit()
    return volver(request, f"/panel/solicitudes?sel={solicitud.id}&filtro=todas",
                  f"Solicitud {solicitud.folio} marcada como resuelta.")


@router.post("/panel/solicitudes/{solicitud_id}/confirmar", dependencies=[CSRF])
def confirmar_cita(request: Request, solicitud_id: int, db: Session = Depends(get_db),
                   yo: Usuario = Depends(requiere_usuario)):
    solicitud = _solicitud(db, solicitud_id)
    destino = f"/panel/solicitudes?sel={solicitud.id}&filtro=todas"
    if not solicitud.cita:
        return volver(request, destino, "Esta solicitud no tiene una cita para confirmar.", "error")
    try:
        acciones.confirmar(db, solicitud.cita, yo)
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    return volver(request, destino, f"Cita de {solicitud.cita.mascota.nombre} confirmada en la agenda.")

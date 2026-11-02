"""Panel: horario por día, reglas de agenda y días sin servicio.

Todo el personal puede consultar; solo el administrador puede cambiar.
"""
from datetime import time

from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import tiempo
from app.database import get_db
from app.models import DiaSinServicio, HorarioDia, Usuario
from app.routers.panel.comun import CSRF, contexto, leer_fecha, volver
from app.security import requiere_admin, requiere_usuario
from app.services import agenda
from app.services import ajustes as aj
from app.templating import render

router = APIRouter()

HORAS = [time(h, m) for h in range(6, 23) for m in (0, 30)][:-1]
ESPACIOS = [15, 20, 30, 45, 60]
CUPOS = [1, 2, 3, 4, 5, 6]
ANTICIPACIONES = [(0, "Sin mínimo"), (60, "1 hora"), (120, "2 horas"), (240, "4 horas"), (1440, "1 día")]


@router.get("/panel/horarios")
def ver(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    dias = {h.dia_semana: h for h in db.scalars(select(HorarioDia))}
    sin_servicio = list(db.scalars(select(DiaSinServicio).where(DiaSinServicio.fecha >= tiempo.hoy())
                                   .order_by(DiaSinServicio.fecha)))
    return render(request, "panel/horarios.html", contexto(
        db, yo, "horarios", dias=[(i, nombre, dias.get(i)) for i, nombre in enumerate(tiempo.DIAS)],
        horas=HORAS, espacios=ESPACIOS, cupos=CUPOS, anticipaciones=ANTICIPACIONES,
        reglas=agenda.reglas(db), sin_servicio=sin_servicio, solo_lectura=not yo.es_admin))


def _hora(texto: str) -> time | None:
    try:
        hora, minuto = (int(x) for x in texto.split(":"))
        return time(hora, minuto)
    except (ValueError, AttributeError):
        return None


@router.post("/panel/horarios", dependencies=[CSRF])
async def guardar(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    form = await request.form()
    cambios = []
    for i, nombre in enumerate(tiempo.DIAS):
        abierto = form.get(f"abierto_{i}") == "1"
        apertura, cierre = _hora(form.get(f"apertura_{i}", "")), _hora(form.get(f"cierre_{i}", ""))
        if abierto and (not apertura or not cierre or apertura >= cierre):
            return volver(request, "/panel/horarios",
                          f"Revisa el {nombre}: la hora de cierre debe ser después de la apertura.", "error")
        cambios.append((i, abierto, apertura, cierre))

    try:
        espacio = int(form.get("espacio", 30))
        cupo = int(form.get("cupo", 2))
        anticipacion = int(form.get("anticipacion", 120))
    except ValueError:
        return volver(request, "/panel/horarios", "Revisa las reglas de agenda.", "error")
    if espacio not in ESPACIOS or cupo not in CUPOS or anticipacion not in dict(ANTICIPACIONES):
        return volver(request, "/panel/horarios", "Revisa las reglas de agenda.", "error")

    for i, abierto, apertura, cierre in cambios:
        dia = db.get(HorarioDia, i) or HorarioDia(dia_semana=i)
        dia.abierto = abierto
        if abierto:
            dia.apertura, dia.cierre = apertura, cierre
        db.add(dia)
    aj.guardar(db, "duracion_espacio_min", espacio)
    aj.guardar(db, "cupo_por_espacio", cupo)
    aj.guardar(db, "anticipacion_min", anticipacion)
    db.commit()
    return volver(request, "/panel/horarios", "Horarios guardados. El sitio y el asistente ya usan el nuevo horario.")


@router.post("/panel/horarios/dias-sin-servicio", dependencies=[CSRF])
def agregar_dia(request: Request, fecha: str = Form(""), motivo: str = Form(""), db: Session = Depends(get_db),
                yo: Usuario = Depends(requiere_admin)):
    dia = leer_fecha(fecha)
    if not dia or dia < tiempo.hoy():
        return volver(request, "/panel/horarios", "Elige una fecha de hoy en adelante.", "error")
    db.add(DiaSinServicio(fecha=dia, motivo=motivo.strip()[:120]))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return volver(request, "/panel/horarios", "Ese día ya estaba registrado sin servicio.", "error")
    return volver(request, "/panel/horarios", f"El {tiempo.fecha_larga(dia).lower()} quedó sin servicio.")


@router.post("/panel/horarios/dias-sin-servicio/{dia_id}/eliminar", dependencies=[CSRF])
def quitar_dia(request: Request, dia_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    dia = db.get(DiaSinServicio, dia_id)
    if dia:
        db.delete(dia)
        db.commit()
    return volver(request, "/panel/horarios", "Día sin servicio quitado.")

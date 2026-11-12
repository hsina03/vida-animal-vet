"""Panel: citas en vista de lista y de semana, y sus acciones."""
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tiempo
from app.database import get_db
from app.errores import ErrorNegocio
from app.models import (CANCELADA, CONFIRMADA, ESTADOS_CITA, Cita, HorarioDia, Mascota, Propietario,
                        Servicio, Usuario)
from app.routers.panel.comun import CARGA_CITA, CSRF, contexto, datos_modales, leer_fecha, ruta_segura, volver
from app.security import requiere_usuario
from app.services import agenda, citas as acciones
from app.templating import render

router = APIRouter()
FILTROS = ["todas", "pendiente", "confirmada", "reprogramada", "atendida", "cancelada"]


def _cita(db: Session, cita_id: int) -> Cita:
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(404, "La cita no existe.")
    return cita


def _inicio(fecha_txt: str, hora_txt: str) -> datetime:
    fecha = leer_fecha(fecha_txt)
    try:
        hora, minuto = (int(x) for x in hora_txt.split(":"))
        return datetime.combine(fecha, time(hora, minuto))
    except (TypeError, ValueError):
        raise ErrorNegocio("Elige el día y un horario libre para la cita.")


def _semana(db: Session, lunes):
    dias = [lunes + timedelta(days=i) for i in range(7)]
    horarios = {h.dia_semana: h for h in db.scalars(select(HorarioDia))}
    rangos = {d: agenda.horario_del_dia(db, d) for d in dias}
    # Domingo solo aparece si abre o tiene citas
    desde = datetime.combine(lunes, time(0))
    hasta = desde + timedelta(days=7)
    citas = list(db.scalars(select(Cita).options(*CARGA_CITA).where(
        Cita.inicio >= desde, Cita.inicio < hasta, Cita.estado != CANCELADA).order_by(Cita.inicio)))
    if not rangos[dias[6]] and not any(c.inicio.date() == dias[6] for c in citas):
        dias = dias[:6]

    abiertos = [h for h in horarios.values() if h.abierto and h.apertura and h.cierre]
    primera = min((h.apertura for h in abiertos), default=time(9))
    ultima = max((h.cierre for h in abiertos), default=time(19))
    for c in citas:
        primera = min(primera, c.inicio.time())
        ultima = max(ultima, c.fin.time())
    paso = timedelta(minutes=agenda.reglas(db).espacio_min)
    filas = []
    momento = datetime.combine(lunes, primera)
    while momento.time() < ultima and momento.date() == lunes:
        filas.append(momento.time())
        momento += paso

    celdas = {}
    for d in dias:
        for t in filas:
            inicio = datetime.combine(d, t)
            rango = rangos[d]
            cerrada = not rango or not (rango[0] <= inicio < rango[1])
            eventos = [c for c in citas if inicio <= c.inicio < inicio + paso]
            celdas[(d, t)] = (cerrada, eventos)
    return dias, filas, celdas, paso


@router.get("/panel/citas")
def lista(request: Request, vista: str = "lista", fecha: str | None = None, estado: str = "todas",
          marcar: int | None = None, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    dia = leer_fecha(fecha, tiempo.hoy())
    estado = estado if estado in FILTROS else "todas"
    ctx = contexto(db, yo, "citas", vista=vista, dia=dia, estado=estado, filtros=FILTROS,
                   estados=ESTADOS_CITA, marcar=marcar, puede=acciones, **datos_modales(db))
    if vista == "semana":
        lunes = dia - timedelta(days=dia.weekday())
        dias, filas, celdas, paso = _semana(db, lunes)
        ctx.update(lunes=lunes, dias=dias, filas=filas, celdas=celdas, paso_min=int(paso.total_seconds() // 60))
    else:
        desde = datetime.combine(dia, time(0))
        consulta = select(Cita).options(*CARGA_CITA).where(Cita.inicio >= desde, Cita.inicio < desde + timedelta(days=1))
        if estado != "todas":
            consulta = consulta.where(Cita.estado == estado)
        ctx.update(citas=list(db.scalars(consulta.order_by(Cita.inicio))),
                   motivo_cerrado=agenda.motivo_sin_servicio(db, dia))
    return render(request, "panel/citas.html", ctx)


@router.post("/panel/citas", dependencies=[CSRF])
def nueva(request: Request, mascota_id: int = Form(0), servicio_id: int = Form(0), fecha: str = Form(""),
          hora: str = Form(""), notas: str = Form(""), volver_a: str = Form("/panel/citas"),
          db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    destino = ruta_segura(volver_a, "/panel/citas")
    mascota, servicio = db.get(Mascota, mascota_id), db.get(Servicio, servicio_id)
    if not mascota or not servicio:
        return volver(request, destino, "Elige el propietario, la mascota y el servicio.", "error")
    try:
        cita = agenda.reservar(db, mascota=mascota, servicio=servicio, inicio=_inicio(fecha, hora),
                               origen="personal", estado=CONFIRMADA, usuario=yo, notas=notas.strip()[:500])
        db.commit()
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, destino, error.mensaje, "error")
    return volver(request, f"/panel/citas?fecha={cita.inicio.date().isoformat()}&marcar={cita.id}",
                  f"Cita registrada: {mascota.nombre}, {tiempo.fecha_larga(cita.inicio.date(), False).lower()} "
                  f"a las {tiempo.hora_txt(cita.inicio)}.")


def _accion(request: Request, db: Session, cita_id: int, volver_a: str, hacer, mensaje):
    cita = _cita(db, cita_id)
    destino = ruta_segura(volver_a, f"/panel/citas?fecha={cita.inicio.date().isoformat()}")
    try:
        hacer(cita)
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    return volver(request, destino, mensaje(cita))


@router.post("/panel/citas/{cita_id}/confirmar", dependencies=[CSRF])
def confirmar(request: Request, cita_id: int, volver_a: str = Form(""), db: Session = Depends(get_db),
              yo: Usuario = Depends(requiere_usuario)):
    return _accion(request, db, cita_id, volver_a, lambda c: acciones.confirmar(db, c, yo),
                   lambda c: f"Cita de {c.mascota.nombre} confirmada.")


@router.post("/panel/citas/{cita_id}/atendida", dependencies=[CSRF])
def atendida(request: Request, cita_id: int, volver_a: str = Form(""), db: Session = Depends(get_db),
             yo: Usuario = Depends(requiere_usuario)):
    return _accion(request, db, cita_id, volver_a, lambda c: acciones.marcar_atendida(db, c, yo),
                   lambda c: f"Cita de {c.mascota.nombre} marcada como atendida.")


@router.post("/panel/citas/{cita_id}/cancelar", dependencies=[CSRF])
def cancelar(request: Request, cita_id: int, motivo: str = Form(""), detalle: str = Form(""),
             volver_a: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    texto = motivo.strip()
    if detalle.strip():
        texto = f"{texto}: {detalle.strip()}" if texto and texto != "Otro" else detalle.strip()
    if texto == "Otro":
        texto = ""
    return _accion(request, db, cita_id, volver_a, lambda c: acciones.cancelar(db, c, texto, yo),
                   lambda c: f"Cita cancelada. Las {tiempo.hora_txt(c.inicio)} quedaron disponibles.")


@router.post("/panel/citas/{cita_id}/reprogramar", dependencies=[CSRF])
def reprogramar(request: Request, cita_id: int, fecha: str = Form(""), hora: str = Form(""),
                volver_a: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    def hacer(c):
        acciones.reprogramar(db, c, _inicio(fecha, hora), yo)
    return _accion(request, db, cita_id, volver_a, hacer,
                   lambda c: f"Cita de {c.mascota.nombre} reprogramada para el "
                             f"{tiempo.fecha_larga(c.inicio.date(), False).lower()} a las {tiempo.hora_txt(c.inicio)}.")


# ---------------------------------------------------------------- API para las ventanas del panel

@router.get("/panel/api/disponibilidad")
def disponibilidad(fecha: str, servicio_id: int, excluir: int | None = None, db: Session = Depends(get_db),
                   yo: Usuario = Depends(requiere_usuario)):
    dia, servicio = leer_fecha(fecha), db.get(Servicio, servicio_id)
    if not dia or not servicio:
        raise HTTPException(400, "Elige un día y un servicio.")
    if not servicio.agendable:
        return {"cerrado": f"{servicio.nombre} no se agenda por cita.", "horarios": []}
    motivo = agenda.motivo_sin_servicio(db, dia)
    horarios = agenda.horarios_del_dia(db, dia, servicio, para_chat=False, excluir_cita_id=excluir)
    return {"cerrado": motivo,
            "horarios": [{"hora": h.hora, "libre": h.libre, "motivo": h.motivo} for h in horarios]}


@router.get("/panel/api/propietarios/{propietario_id}/mascotas")
def mascotas(propietario_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    propietario = db.get(Propietario, propietario_id)
    if not propietario:
        raise HTTPException(404, "El propietario no existe.")
    return {"mascotas": [{"id": m.id, "nombre": m.nombre, "especie": m.especie} for m in propietario.mascotas]}

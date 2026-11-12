"""Panel: propietarios y mascotas (búsqueda, alta, edición e historial de citas)."""
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.errores import ErrorNegocio
from app.models import ESPECIES, Cita, Mascota, Propietario, Usuario
from app.routers.panel.comun import CSRF, contexto, volver
from app.security import requiere_usuario
from app.services import propietarios as servicio
from app.templating import render

router = APIRouter()


@router.get("/panel/propietarios")
def lista(request: Request, q: str = "", sel: int | None = None, db: Session = Depends(get_db),
          yo: Usuario = Depends(requiere_usuario)):
    encontrados = servicio.buscar(db, q[:80])
    actual = None
    if sel:
        actual = db.get(Propietario, sel)
    if not actual and encontrados:
        actual = encontrados[0]
    historial = []
    if actual:
        ids = [m.id for m in actual.mascotas]
        if ids:
            historial = list(db.scalars(select(Cita).options(joinedload(Cita.servicio), joinedload(Cita.mascota))
                                        .where(Cita.mascota_id.in_(ids)).order_by(Cita.inicio.desc()).limit(50)))
    return render(request, "panel/propietarios.html", contexto(
        db, yo, "propietarios", q=q, propietarios=encontrados, actual=actual, historial=historial,
        especies=ESPECIES))


def _datos_mascota(form) -> dict:
    return {k: form.get(f"mascota_{k}", "") for k in ("nombre", "especie", "raza", "edad", "sexo", "peso")}


@router.post("/panel/propietarios", dependencies=[CSRF])
async def alta(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    form = await request.form()
    try:
        nombre, telefono, correo = servicio.validar_propietario(db, form.get("nombre"), form.get("telefono"),
                                                                form.get("correo"))
        datos = servicio.validar_mascota(_datos_mascota(form))
    except ErrorNegocio as error:
        return volver(request, "/panel/propietarios", error.mensaje, "error")
    propietario = Propietario(nombre=nombre, telefono=telefono, correo=correo)
    propietario.mascotas.append(Mascota(**datos))
    db.add(propietario)
    db.commit()
    return volver(request, f"/panel/propietarios?sel={propietario.id}", f"{nombre} quedó registrado.")


def _propietario(db: Session, propietario_id: int) -> Propietario:
    propietario = db.get(Propietario, propietario_id)
    if not propietario:
        raise HTTPException(404, "El propietario no existe.")
    return propietario


@router.post("/panel/propietarios/{propietario_id}", dependencies=[CSRF])
def editar(request: Request, propietario_id: int, nombre: str = Form(""), telefono: str = Form(""),
           correo: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    propietario = _propietario(db, propietario_id)
    destino = f"/panel/propietarios?sel={propietario.id}"
    try:
        propietario.nombre, propietario.telefono, propietario.correo = servicio.validar_propietario(
            db, nombre, telefono, correo, excluir_id=propietario.id)
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    db.commit()
    return volver(request, destino, "Datos del propietario actualizados.")


@router.post("/panel/propietarios/{propietario_id}/mascotas", dependencies=[CSRF])
async def agregar_mascota(request: Request, propietario_id: int, db: Session = Depends(get_db),
                          yo: Usuario = Depends(requiere_usuario)):
    propietario = _propietario(db, propietario_id)
    destino = f"/panel/propietarios?sel={propietario.id}"
    try:
        datos = servicio.validar_mascota(_datos_mascota(await request.form()))
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    propietario.mascotas.append(Mascota(**datos))
    db.commit()
    return volver(request, destino, f"{datos['nombre']} quedó registrado.")


@router.post("/panel/mascotas/{mascota_id}", dependencies=[CSRF])
async def editar_mascota(request: Request, mascota_id: int, db: Session = Depends(get_db),
                         yo: Usuario = Depends(requiere_usuario)):
    mascota = db.get(Mascota, mascota_id)
    if not mascota:
        raise HTTPException(404, "La mascota no existe.")
    destino = f"/panel/propietarios?sel={mascota.propietario_id}"
    try:
        datos = servicio.validar_mascota(_datos_mascota(await request.form()))
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    for campo, valor in datos.items():
        setattr(mascota, campo, valor)
    db.commit()
    return volver(request, destino, f"Datos de {mascota.nombre} actualizados.")

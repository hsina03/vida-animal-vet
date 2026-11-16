"""Panel: propietarios y mascotas (búsqueda, alta, edición, fotos, expediente clínico e historial de citas)."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, undefer

from app import tiempo
from app.database import get_db
from app.errores import ErrorNegocio
from app.models import ESPECIES, TIPOS_REGISTRO, Cita, Mascota, Propietario, RegistroClinico, Usuario
from app.routers.panel.comun import CSRF, contexto, volver
from app.security import requiere_admin, requiere_usuario
from app.services import expediente as exp
from app.services import fotos
from app.services import propietarios as servicio
from app.templating import render

router = APIRouter()


@router.get("/panel/propietarios")
def lista(request: Request, q: str = "", letra: str = "", sel: int | None = None, mascota: int | None = None,
          archivados: int = 0, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    ver_archivados = bool(archivados) and yo.es_admin
    letra = letra[:1].upper() if letra[:1].isalpha() else ""
    encontrados = servicio.buscar(db, q[:80], letra=letra, archivados=ver_archivados)
    actual = None
    if sel:
        actual = db.get(Propietario, sel)
        if actual and actual.archivado != ver_archivados:
            actual = None
    if not actual and encontrados:
        actual = encontrados[0]
    historial, mascota_actual, registros = [], None, []
    if actual:
        ids = [m.id for m in actual.mascotas]
        if ids:
            historial = list(db.scalars(select(Cita).options(joinedload(Cita.servicio), joinedload(Cita.mascota))
                                        .where(Cita.mascota_id.in_(ids)).order_by(Cita.inicio.desc()).limit(50)))
        mascota_actual = next((m for m in actual.mascotas if m.id == mascota), None) or (
            actual.mascotas[0] if actual.mascotas else None)
        if mascota_actual:
            registros = list(db.scalars(select(RegistroClinico).options(joinedload(RegistroClinico.usuario))
                                        .where(RegistroClinico.mascota_id == mascota_actual.id)
                                        .order_by(RegistroClinico.fecha.desc(), RegistroClinico.id.desc())))
    return render(request, "panel/propietarios.html", contexto(
        db, yo, "propietarios", q=q, letra=letra, letras=servicio.LETRAS, propietarios=encontrados, actual=actual,
        historial=historial, especies=ESPECIES, mascota_actual=mascota_actual, registros=registros,
        tipos_registro=TIPOS_REGISTRO, ver_archivados=ver_archivados))


def _datos_mascota(form) -> dict:
    return {k: form.get(f"mascota_{k}", "") for k in ("nombre", "especie", "raza", "edad", "sexo", "peso")}


def _destino(propietario_id: int, mascota_id: int | None = None) -> str:
    url = f"/panel/propietarios?sel={propietario_id}"
    return url + (f"&mascota={mascota_id}" if mascota_id else "")


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
    return volver(request, _destino(propietario.id), f"{nombre} quedó registrado.")


def _propietario(db: Session, propietario_id: int) -> Propietario:
    propietario = db.get(Propietario, propietario_id)
    if not propietario:
        raise HTTPException(404, "El propietario no existe.")
    return propietario


def _mascota(db: Session, mascota_id: int) -> Mascota:
    mascota = db.get(Mascota, mascota_id)
    if not mascota:
        raise HTTPException(404, "La mascota no existe.")
    return mascota


@router.post("/panel/propietarios/{propietario_id}", dependencies=[CSRF])
def editar(request: Request, propietario_id: int, nombre: str = Form(""), telefono: str = Form(""),
           correo: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    propietario = _propietario(db, propietario_id)
    destino = _destino(propietario.id)
    try:
        propietario.nombre, propietario.telefono, propietario.correo = servicio.validar_propietario(
            db, nombre, telefono, correo, excluir_id=propietario.id)
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    db.commit()
    return volver(request, destino, "Datos del propietario actualizados.")


@router.post("/panel/propietarios/{propietario_id}/archivar", dependencies=[CSRF])
def archivar(request: Request, propietario_id: int, db: Session = Depends(get_db),
             yo: Usuario = Depends(requiere_admin)):
    propietario = _propietario(db, propietario_id)
    propietario.archivado, propietario.archivado_en = True, tiempo.ahora()
    db.commit()
    return volver(request, "/panel/propietarios",
                  f"{propietario.nombre} se archivó. Su historial se conserva en «Archivados».")


@router.post("/panel/propietarios/{propietario_id}/restaurar", dependencies=[CSRF])
def restaurar(request: Request, propietario_id: int, db: Session = Depends(get_db),
              yo: Usuario = Depends(requiere_admin)):
    propietario = _propietario(db, propietario_id)
    propietario.archivado, propietario.archivado_en = False, None
    db.commit()
    return volver(request, _destino(propietario.id), f"{propietario.nombre} volvió a la lista de clientes.")


@router.post("/panel/propietarios/{propietario_id}/mascotas", dependencies=[CSRF])
async def agregar_mascota(request: Request, propietario_id: int, db: Session = Depends(get_db),
                          yo: Usuario = Depends(requiere_usuario)):
    propietario = _propietario(db, propietario_id)
    try:
        datos = servicio.validar_mascota(_datos_mascota(await request.form()))
    except ErrorNegocio as error:
        return volver(request, _destino(propietario.id), error.mensaje, "error")
    mascota = Mascota(**datos)
    propietario.mascotas.append(mascota)
    db.commit()
    return volver(request, _destino(propietario.id, mascota.id), f"{datos['nombre']} quedó registrado.")


@router.post("/panel/mascotas/{mascota_id}", dependencies=[CSRF])
async def editar_mascota(request: Request, mascota_id: int, db: Session = Depends(get_db),
                         yo: Usuario = Depends(requiere_usuario)):
    mascota = _mascota(db, mascota_id)
    destino = _destino(mascota.propietario_id, mascota.id)
    try:
        datos = servicio.validar_mascota(_datos_mascota(await request.form()))
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    for campo, valor in datos.items():
        setattr(mascota, campo, valor)
    db.commit()
    return volver(request, destino, f"Datos de {mascota.nombre} actualizados.")


# ---------------------------------------------------------------- fotos

@router.post("/panel/mascotas/{mascota_id}/foto", dependencies=[CSRF])
async def subir_foto(request: Request, mascota_id: int, foto: UploadFile = File(None),
                     db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    mascota = _mascota(db, mascota_id)
    destino = _destino(mascota.propietario_id, mascota.id)
    contenido = await foto.read(fotos.TAMANO_MAXIMO + 1) if foto else b""
    try:
        tipo = fotos.validar_foto(contenido)
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    mascota.foto, mascota.foto_tipo = contenido, tipo
    mascota.foto_version = (mascota.foto_version or 0) + 1
    db.commit()
    return volver(request, destino, f"Foto de {mascota.nombre} actualizada.")


@router.get("/panel/mascotas/{mascota_id}/foto")
def ver_foto(mascota_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    mascota = db.scalar(select(Mascota).options(undefer(Mascota.foto)).where(Mascota.id == mascota_id))
    if not mascota or not mascota.foto:
        raise HTTPException(404, "La mascota no tiene foto.")
    return Response(mascota.foto, media_type=f"image/{mascota.foto_tipo or 'jpeg'}",
                    headers={"Cache-Control": "private, max-age=86400"})


@router.post("/panel/mascotas/{mascota_id}/foto/eliminar", dependencies=[CSRF])
def quitar_foto(request: Request, mascota_id: int, db: Session = Depends(get_db),
                yo: Usuario = Depends(requiere_usuario)):
    mascota = _mascota(db, mascota_id)
    mascota.foto, mascota.foto_tipo, mascota.foto_version = None, "", 0
    db.commit()
    return volver(request, _destino(mascota.propietario_id, mascota.id), f"Se quitó la foto de {mascota.nombre}.")


# ---------------------------------------------------------------- expediente clínico

@router.post("/panel/mascotas/{mascota_id}/expediente", dependencies=[CSRF])
async def agregar_registro(request: Request, mascota_id: int, db: Session = Depends(get_db),
                           yo: Usuario = Depends(requiere_usuario)):
    mascota = _mascota(db, mascota_id)
    destino = _destino(mascota.propietario_id, mascota.id) + "#expediente"
    try:
        datos = exp.validar_registro(await request.form())
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    db.add(RegistroClinico(mascota=mascota, usuario=yo, **datos))
    if datos["peso"]:
        mascota.peso = datos["peso"]   # el peso más reciente queda en la ficha de la mascota
    db.commit()
    return volver(request, destino, f"Registro agregado al expediente de {mascota.nombre}.")


def _registro(db: Session, registro_id: int) -> RegistroClinico:
    registro = db.get(RegistroClinico, registro_id)
    if not registro:
        raise HTTPException(404, "El registro no existe.")
    return registro


@router.post("/panel/expediente/{registro_id}", dependencies=[CSRF])
async def editar_registro(request: Request, registro_id: int, db: Session = Depends(get_db),
                          yo: Usuario = Depends(requiere_usuario)):
    registro = _registro(db, registro_id)
    destino = _destino(registro.mascota.propietario_id, registro.mascota_id) + "#expediente"
    try:
        datos = exp.validar_registro(await request.form())
    except ErrorNegocio as error:
        return volver(request, destino, error.mensaje, "error")
    for campo, valor in datos.items():
        setattr(registro, campo, valor)
    db.commit()
    return volver(request, destino, "Registro del expediente actualizado.")


@router.post("/panel/expediente/{registro_id}/eliminar", dependencies=[CSRF])
def eliminar_registro(request: Request, registro_id: int, db: Session = Depends(get_db),
                      yo: Usuario = Depends(requiere_admin)):
    registro = _registro(db, registro_id)
    destino = _destino(registro.mascota.propietario_id, registro.mascota_id) + "#expediente"
    db.delete(registro)
    db.commit()
    return volver(request, destino, "Registro eliminado del expediente.")

"""Panel: inventario de productos y medicamentos.

Todo el personal consulta y registra entradas y salidas. Solo el administrador da de alta, edita,
ajusta existencias y da de baja productos.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app import tiempo
from app.database import get_db
from app.errores import ErrorNegocio
from app.models import (CATEGORIAS_PRODUCTO, MOV_AJUSTE, UNIDADES, MovimientoInventario, Producto, Usuario)
from app.routers.panel.comun import CSRF, contexto, ruta_segura, volver
from app.security import requiere_admin, requiere_usuario
from app.services import inventario as inv
from app.templating import render

router = APIRouter()
DESTINO = "/panel/inventario"


@router.get("/panel/inventario")
def ver(request: Request, q: str = "", categoria: str = "", bajos: int = 0, bajas: int = 0, ver: int | None = None,
        db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    inactivos = bool(bajas) and yo.es_admin
    productos = inv.buscar(db, q[:80], categoria, solo_bajos=bool(bajos), inactivos=inactivos)
    activos = list(db.scalars(select(Producto).where(Producto.activo.is_(True))))
    limite_caducidad = tiempo.hoy() + timedelta(days=30)
    seleccionado = db.get(Producto, ver) if ver else None
    consulta = (select(MovimientoInventario).options(joinedload(MovimientoInventario.producto),
                                                     joinedload(MovimientoInventario.usuario))
                .order_by(MovimientoInventario.creado.desc(), MovimientoInventario.id.desc()).limit(40))
    if seleccionado:
        consulta = consulta.where(MovimientoInventario.producto_id == seleccionado.id)
    return render(request, "panel/inventario.html", contexto(
        db, yo, "inventario", productos=productos, q=q, categoria=categoria, bajos=bool(bajos), bajas=inactivos,
        categorias=CATEGORIAS_PRODUCTO, unidades=UNIDADES, seleccionado=seleccionado,
        movimientos=list(db.scalars(consulta)),
        total_activos=len(activos), total_bajos=sum(1 for p in activos if p.bajo_minimo),
        por_caducar=sum(1 for p in activos if p.caducidad and p.caducidad <= limite_caducidad),
        valor=sum((p.costo * p.existencia for p in activos), 0), limite_caducidad=limite_caducidad))


def _producto(db: Session, producto_id: int) -> Producto:
    producto = db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(404, "El producto no existe.")
    return producto


@router.post("/panel/inventario", dependencies=[CSRF])
async def alta(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    form = await request.form()
    try:
        datos = inv.validar_producto(form)
        inicial = form.get("existencia") or "0"
        producto = Producto(**datos)
        db.add(producto)
        db.flush()
        cantidad = inv.dinero.leer(inicial, "la existencia inicial")
        if cantidad:
            inv.mover(db, producto, "entrada", cantidad, motivo="Existencia inicial", usuario=yo)
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, DESTINO, error.mensaje, "error")
    db.commit()
    return volver(request, f"{DESTINO}?ver={producto.id}", f"{producto.nombre} quedó registrado en el inventario.")


@router.post("/panel/inventario/{producto_id}", dependencies=[CSRF])
async def editar(request: Request, producto_id: int, db: Session = Depends(get_db),
                 yo: Usuario = Depends(requiere_admin)):
    producto = _producto(db, producto_id)
    try:
        datos = inv.validar_producto(await request.form())
    except ErrorNegocio as error:
        return volver(request, f"{DESTINO}?ver={producto.id}", error.mensaje, "error")
    for campo, valor in datos.items():
        setattr(producto, campo, valor)
    db.commit()
    return volver(request, f"{DESTINO}?ver={producto.id}", f"{producto.nombre} actualizado.")


@router.post("/panel/inventario/{producto_id}/baja", dependencies=[CSRF])
def baja(request: Request, producto_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    producto = _producto(db, producto_id)
    producto.activo = not producto.activo
    db.commit()
    if producto.activo:
        return volver(request, f"{DESTINO}?ver={producto.id}", f"{producto.nombre} volvió al inventario.")
    return volver(request, DESTINO, f"{producto.nombre} se dio de baja. Lo encuentras en «Dados de baja».")


@router.post("/panel/inventario/{producto_id}/movimiento", dependencies=[CSRF])
def movimiento(request: Request, producto_id: int, tipo: str = Form(""), cantidad: str = Form(""),
               motivo: str = Form(""), volver_a: str = Form(""), db: Session = Depends(get_db),
               yo: Usuario = Depends(requiere_usuario)):
    destino = ruta_segura(volver_a, f"{DESTINO}?ver={producto_id}")
    if tipo == MOV_AJUSTE and not yo.es_admin:
        return volver(request, destino, "Solo el administrador puede ajustar existencias.", "error")
    try:
        mov = inv.registrar(db, producto_id, tipo, cantidad, motivo, yo)
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, destino, error.mensaje, "error")
    db.commit()
    return volver(request, destino, f"Movimiento registrado ({mov.tipo_txt.lower()}). {mov.producto.nombre}: "
                  f"{inv.dinero.cantidad(mov.existencia_final)} {mov.producto.unidad}.")

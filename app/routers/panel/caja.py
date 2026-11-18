"""Panel: caja y cobros. Todo el personal cobra y hace el corte; solo el administrador cancela ventas."""
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import tiempo
from app.database import get_db
from app.errores import ErrorNegocio
from app.models import METODOS_PAGO, Cita, ConceptoVenta, Producto, Propietario, Servicio, Usuario, Venta
from app.routers.panel.comun import CSRF, contexto, leer_fecha, volver
from app.security import requiere_admin, requiere_usuario
from app.services import caja, dinero
from app.templating import render

router = APIRouter()


def _catalogo(db: Session) -> dict:
    servicios = db.scalars(select(Servicio).order_by(Servicio.orden, Servicio.id))
    productos = db.scalars(select(Producto).where(Producto.activo.is_(True), Producto.se_vende.is_(True))
                           .order_by(Producto.nombre))
    return {
        "servicios": [{"id": s.id, "nombre": s.nombre, "precio": str(s.precio)} for s in servicios],
        "productos": [{"id": p.id, "nombre": p.nombre, "precio": str(p.precio), "existencia": str(p.existencia),
                       "unidad": p.unidad, "codigo": p.codigo} for p in productos],
    }


@router.get("/panel/caja")
def ver(request: Request, fecha: str | None = None, propietario: int | None = None, cita: int | None = None,
        db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    dia = leer_fecha(fecha, tiempo.hoy())
    ventas = caja.ventas_del_dia(db, dia)
    inicial = {"propietario_id": "", "mascota_id": "", "cita_id": "", "conceptos": []}
    if cita:
        c = db.get(Cita, cita)
        if c:
            inicial.update(propietario_id=c.mascota.propietario_id, mascota_id=c.mascota_id, cita_id=c.id,
                           conceptos=[{"tipo": "servicio", "id": c.servicio_id, "cantidad": "1"}])
    elif propietario:
        inicial["propietario_id"] = propietario
    clientes = list(db.scalars(select(Propietario).where(Propietario.archivado.is_(False))
                               .order_by(Propietario.nombre)))
    return render(request, "panel/caja.html", contexto(
        db, yo, "caja", dia=dia, ventas=ventas, resumen=caja.resumen(db, dia, ventas), metodos=METODOS_PAGO,
        catalogo=_catalogo(db), clientes=clientes, inicial=inicial))


@router.post("/panel/caja", dependencies=[CSRF])
def cobrar(request: Request, conceptos: str = Form(""), metodo: str = Form(""), recibido: str = Form(""),
           descuento: str = Form(""), referencia: str = Form(""), notas: str = Form(""),
           propietario_id: str = Form(""), mascota_id: str = Form(""), cita_id: str = Form(""),
           db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    def entero(texto):
        return int(texto) if texto and texto.isdigit() else None
    try:
        venta = caja.cobrar(db, conceptos_json=conceptos, metodo=metodo, usuario=yo, recibido_txt=recibido,
                            descuento_txt=descuento, referencia=referencia, notas=notas,
                            propietario_id=entero(propietario_id), mascota_id=entero(mascota_id),
                            cita_id=entero(cita_id))
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, "/panel/caja", error.mensaje, "error")
    db.commit()
    texto = f"Venta {venta.folio} cobrada: {dinero.formato(venta.total)}."
    if venta.cambio:
        texto += f" Cambio: {dinero.formato(venta.cambio)}."
    return volver(request, f"/panel/caja/ventas/{venta.id}", texto)


def _venta(db: Session, venta_id: int) -> Venta:
    venta = db.scalar(select(Venta).options(selectinload(Venta.conceptos), joinedload(Venta.usuario),
                                            joinedload(Venta.propietario), joinedload(Venta.mascota))
                      .where(Venta.id == venta_id))
    if not venta:
        raise HTTPException(404, "La venta no existe.")
    return venta


@router.get("/panel/caja/ventas/{venta_id}")
def ticket(request: Request, venta_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    from app.services import sitio
    return render(request, "panel/ticket.html", contexto(db, yo, "caja", venta=_venta(db, venta_id),
                                                           contacto=sitio.contacto(db)))


@router.post("/panel/caja/ventas/{venta_id}/cancelar", dependencies=[CSRF])
def cancelar(request: Request, venta_id: int, motivo: str = Form(""), db: Session = Depends(get_db),
             yo: Usuario = Depends(requiere_admin)):
    venta = _venta(db, venta_id)
    try:
        caja.cancelar(db, venta, motivo, yo)
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, f"/panel/caja/ventas/{venta.id}", error.mensaje, "error")
    db.commit()
    return volver(request, f"/panel/caja/ventas/{venta.id}",
                  f"Venta {venta.folio} cancelada. Los productos regresaron al inventario.")


@router.get("/panel/caja/corte")
def corte(request: Request, fecha: str | None = None, db: Session = Depends(get_db),
          yo: Usuario = Depends(requiere_usuario)):
    dia = leer_fecha(fecha, tiempo.hoy())
    ventas = caja.ventas_del_dia(db, dia)
    return render(request, "panel/corte.html", contexto(
        db, yo, "caja", dia=dia, ventas=ventas, resumen=caja.resumen(db, dia, ventas), metodos=METODOS_PAGO,
        cortes=caja.cortes_del_dia(db, dia)))


@router.post("/panel/caja/corte", dependencies=[CSRF])
def registrar_corte(request: Request, fecha: str = Form(""), fondo: str = Form(""), contado: str = Form(""),
                    notas: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_usuario)):
    dia = leer_fecha(fecha, tiempo.hoy())
    destino = f"/panel/caja/corte?fecha={dia.isoformat()}"
    try:
        corte_ = caja.registrar_corte(db, dia, fondo, contado, notas, yo)
    except ErrorNegocio as error:
        db.rollback()
        return volver(request, destino, error.mensaje, "error")
    db.commit()
    if corte_.diferencia == 0:
        return volver(request, destino, "Corte registrado. La caja cuadra.")
    tipo = "sobran" if corte_.diferencia > 0 else "faltan"
    return volver(request, destino, f"Corte registrado. En efectivo {tipo} {dinero.formato(abs(corte_.diferencia))}.")

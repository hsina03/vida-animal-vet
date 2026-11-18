"""Inventario: productos, existencias y movimientos (entradas, salidas, ajustes y ventas)."""
from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errores import ErrorNegocio
from app.models import (CATEGORIAS_PRODUCTO, MOV_AJUSTE, MOV_ENTRADA, MOV_SALIDA, UNIDADES, MovimientoInventario,
                        Producto, Usuario, Venta)
from app.services import dinero


def validar_producto(form) -> dict:
    nombre = " ".join((form.get("nombre") or "").split())
    if not nombre or len(nombre) > 120:
        raise ErrorNegocio("Escribe el nombre del producto.")
    categoria = form.get("categoria") or "Otro"
    if categoria not in CATEGORIAS_PRODUCTO:
        categoria = "Otro"
    unidad = form.get("unidad") or "pieza"
    if unidad not in UNIDADES:
        unidad = "pieza"
    caducidad = None
    if (form.get("caducidad") or "").strip():
        try:
            caducidad = date.fromisoformat(form.get("caducidad").strip())
        except ValueError:
            raise ErrorNegocio("Revisa la fecha de caducidad.")
    return {
        "nombre": nombre, "categoria": categoria, "unidad": unidad,
        "codigo": (form.get("codigo") or "").strip()[:40],
        "minimo": dinero.leer(form.get("minimo"), "la existencia mínima"),
        "costo": dinero.leer(form.get("costo"), "el costo"),
        "precio": dinero.leer(form.get("precio"), "el precio de venta"),
        "se_vende": form.get("se_vende") == "1",
        "caducidad": caducidad,
    }


def buscar(db: Session, texto: str = "", categoria: str = "", solo_bajos: bool = False,
           inactivos: bool = False) -> list[Producto]:
    consulta = select(Producto).where(Producto.activo.is_(not inactivos)).order_by(Producto.nombre)
    texto = (texto or "").strip()
    if texto:
        patron = f"%{texto.lower()}%"
        consulta = consulta.where(or_(func.lower(Producto.nombre).like(patron), func.lower(Producto.codigo).like(patron)))
    if categoria in CATEGORIAS_PRODUCTO:
        consulta = consulta.where(Producto.categoria == categoria)
    if solo_bajos:
        consulta = consulta.where(Producto.existencia <= Producto.minimo)
    return list(db.scalars(consulta))


def contar_bajos(db: Session) -> int:
    return db.scalar(select(func.count(Producto.id)).where(
        Producto.activo.is_(True), Producto.existencia <= Producto.minimo)) or 0


def bloquear(db: Session, producto_id: int) -> Producto | None:
    """Lee el producto bloqueando su fila hasta el commit (dos ventas no descuentan a la vez)."""
    return db.scalar(select(Producto).where(Producto.id == producto_id).with_for_update())


def mover(db: Session, producto: Producto, tipo: str, cantidad: Decimal, *, motivo: str = "",
          usuario: Usuario | None = None, venta: Venta | None = None) -> MovimientoInventario:
    """Suma (o resta, si es negativa) la cantidad a la existencia y lo registra. No hace commit."""
    nueva = dinero.redondear(producto.existencia + cantidad)
    if nueva < 0:
        raise ErrorNegocio(f"No hay suficiente {producto.nombre}: quedan {dinero.cantidad(producto.existencia)} "
                           f"{producto.unidad}.")
    producto.existencia = nueva
    movimiento = MovimientoInventario(producto=producto, tipo=tipo, cantidad=dinero.redondear(cantidad),
                                      existencia_final=nueva, motivo=motivo.strip()[:200], usuario=usuario,
                                      venta_id=venta.id if venta else None)
    db.add(movimiento)
    db.flush()
    return movimiento


def registrar(db: Session, producto_id: int, tipo: str, cantidad_txt: str, motivo: str,
              usuario: Usuario) -> MovimientoInventario:
    """Entrada, salida o ajuste desde el panel. El ajuste fija la existencia contada."""
    producto = bloquear(db, producto_id)
    if not producto or not producto.activo:
        raise ErrorNegocio("El producto no existe o está dado de baja.")
    if tipo == MOV_AJUSTE:
        contada = dinero.leer(cantidad_txt, "la existencia contada", vacio=None)
        if not motivo.strip():
            raise ErrorNegocio("Escribe el motivo del ajuste.")
        return mover(db, producto, MOV_AJUSTE, contada - producto.existencia, motivo=motivo, usuario=usuario)
    if tipo not in (MOV_ENTRADA, MOV_SALIDA):
        raise ErrorNegocio("Elige si es entrada, salida o ajuste.")
    cantidad = dinero.leer(cantidad_txt, "la cantidad", minimo=Decimal("0.01"), vacio=None)
    return mover(db, producto, tipo, cantidad if tipo == MOV_ENTRADA else -cantidad, motivo=motivo, usuario=usuario)

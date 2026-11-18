"""Caja: cobro de servicios y productos, cancelaciones y corte del día."""
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import tiempo
from app.errores import ErrorNegocio
from app.models import (METODOS_PAGO, MOV_CANCELACION, MOV_VENTA, VENTA_CANCELADA, VENTA_PAGADA, Cita,
                        ConceptoVenta, CorteCaja, Mascota, Propietario, Servicio, Usuario, Venta)
from app.services import dinero, inventario

MAX_CONCEPTOS = 60


def leer_conceptos(texto: str) -> list[dict]:
    """Los conceptos llegan del navegador como JSON: [{"tipo": "producto", "id": 3, "cantidad": "2"}, …].

    Solo se usa el tipo, el id y la cantidad; los precios se toman siempre de la base de datos.
    """
    try:
        datos = json.loads(texto or "[]")
    except ValueError:
        raise ErrorNegocio("No se pudo leer la venta. Recarga la página e inténtalo de nuevo.")
    if not isinstance(datos, list) or not datos:
        raise ErrorNegocio("Agrega al menos un servicio o producto a la venta.")
    if len(datos) > MAX_CONCEPTOS:
        raise ErrorNegocio(f"Una venta puede tener hasta {MAX_CONCEPTOS} conceptos.")
    conceptos = []
    for d in datos:
        if not isinstance(d, dict) or d.get("tipo") not in ("servicio", "producto"):
            raise ErrorNegocio("Hay un concepto que no se reconoce. Quítalo e inténtalo de nuevo.")
        try:
            ident = int(d.get("id"))
        except (TypeError, ValueError):
            raise ErrorNegocio("Hay un concepto que no se reconoce. Quítalo e inténtalo de nuevo.")
        cantidad = dinero.leer(d.get("cantidad"), "la cantidad", minimo=Decimal("0.01"), maximo=Decimal("9999"),
                               vacio=None)
        conceptos.append({"tipo": d["tipo"], "id": ident, "cantidad": cantidad})
    return conceptos


def _siguiente_folio(venta: Venta) -> str:
    return f"V-{venta.id:06d}"


def cobrar(db: Session, *, conceptos_json: str, metodo: str, usuario: Usuario, recibido_txt: str = "",
           descuento_txt: str = "", referencia: str = "", notas: str = "", propietario_id: int | None = None,
           mascota_id: int | None = None, cita_id: int | None = None) -> Venta:
    """Registra la venta, descuenta el inventario y calcula el cambio. No hace commit."""
    if metodo not in METODOS_PAGO:
        raise ErrorNegocio("Elige cómo pagó el cliente.")
    conceptos = leer_conceptos(conceptos_json)

    propietario = mascota = cita = None
    if propietario_id:
        propietario = db.get(Propietario, propietario_id)
        if not propietario or propietario.archivado:
            raise ErrorNegocio("El cliente elegido no existe.")
    if mascota_id:
        mascota = db.get(Mascota, mascota_id)
        if not mascota or (propietario and mascota.propietario_id != propietario.id):
            raise ErrorNegocio("La mascota no pertenece al cliente elegido.")
        propietario = propietario or mascota.propietario
    if cita_id:
        cita = db.get(Cita, cita_id)

    venta = Venta(folio=f"T-{uuid.uuid4().hex[:16]}", metodo=metodo, usuario=usuario, propietario=propietario, mascota=mascota, cita=cita,
                  referencia=referencia.strip()[:60], notas=notas.strip()[:300], estado=VENTA_PAGADA)
    db.add(venta)
    db.flush()
    venta.folio = _siguiente_folio(venta)

    subtotal = dinero.CERO
    pendientes = []   # productos a descontar: (producto, cantidad)
    for c in conceptos:
        if c["tipo"] == "servicio":
            servicio = db.get(Servicio, c["id"])
            if not servicio:
                raise ErrorNegocio("Uno de los servicios ya no existe.")
            precio, descripcion = dinero.redondear(servicio.precio), servicio.nombre
            venta.conceptos.append(ConceptoVenta(tipo="servicio", servicio=servicio, descripcion=descripcion,
                                                 cantidad=c["cantidad"], precio_unitario=precio,
                                                 importe=dinero.redondear(precio * c["cantidad"])))
        else:
            producto = inventario.bloquear(db, c["id"])
            if not producto or not producto.activo or not producto.se_vende:
                raise ErrorNegocio("Uno de los productos ya no está a la venta.")
            precio = dinero.redondear(producto.precio)
            venta.conceptos.append(ConceptoVenta(tipo="producto", producto=producto, descripcion=producto.nombre,
                                                 cantidad=c["cantidad"], precio_unitario=precio,
                                                 importe=dinero.redondear(precio * c["cantidad"])))
            pendientes.append((producto, c["cantidad"]))
        subtotal += venta.conceptos[-1].importe

    descuento = dinero.leer(descuento_txt, "el descuento")
    if descuento > subtotal:
        raise ErrorNegocio("El descuento no puede ser mayor que el total.")
    total = dinero.redondear(subtotal - descuento)
    venta.subtotal, venta.descuento, venta.total = dinero.redondear(subtotal), descuento, total

    if metodo == "efectivo":
        recibido = dinero.leer(recibido_txt, "el efectivo recibido", vacio=total)
        if recibido < total:
            raise ErrorNegocio(f"El efectivo recibido ({dinero.formato(recibido)}) no alcanza para el total "
                               f"({dinero.formato(total)}).")
        venta.recibido, venta.cambio = recibido, dinero.redondear(recibido - total)
    else:
        venta.recibido, venta.cambio = total, dinero.CERO

    for producto, cantidad in pendientes:
        inventario.mover(db, producto, MOV_VENTA, -cantidad, motivo=f"Venta {venta.folio}", usuario=usuario,
                         venta=venta)
    db.flush()
    return venta


def cancelar(db: Session, venta: Venta, motivo: str, usuario: Usuario) -> None:
    """Cancela la venta y regresa los productos al inventario. No hace commit."""
    if venta.cancelada:
        raise ErrorNegocio("Esta venta ya estaba cancelada.")
    motivo = " ".join((motivo or "").split())[:200]
    if not motivo:
        raise ErrorNegocio("Escribe el motivo de la cancelación.")
    for concepto in venta.conceptos:
        if concepto.producto_id:
            producto = inventario.bloquear(db, concepto.producto_id)
            inventario.mover(db, producto, MOV_CANCELACION, concepto.cantidad,
                             motivo=f"Cancelación de {venta.folio}", usuario=usuario, venta=venta)
    venta.estado, venta.motivo_cancelacion = VENTA_CANCELADA, motivo
    venta.cancelada_por, venta.cancelada_en = usuario, tiempo.ahora()
    db.flush()


def ventas_del_dia(db: Session, dia: date) -> list[Venta]:
    desde = datetime.combine(dia, time(0))
    return list(db.scalars(select(Venta).options(joinedload(Venta.usuario), joinedload(Venta.propietario),
                                                  selectinload(Venta.conceptos))
                           .where(Venta.creado >= desde, Venta.creado < desde + timedelta(days=1))
                           .order_by(Venta.creado.desc())))


@dataclass
class Resumen:
    dia: date
    ventas: int = 0
    canceladas: int = 0
    por_metodo: dict = field(default_factory=lambda: {m: dinero.CERO for m in METODOS_PAGO})
    servicios: Decimal = dinero.CERO
    productos: Decimal = dinero.CERO
    descuentos: Decimal = dinero.CERO

    @property
    def total(self) -> Decimal:
        return sum(self.por_metodo.values(), dinero.CERO)


def resumen(db: Session, dia: date, ventas: list[Venta] | None = None) -> Resumen:
    r = Resumen(dia=dia)
    for v in ventas if ventas is not None else ventas_del_dia(db, dia):
        if v.cancelada:
            r.canceladas += 1
            continue
        r.ventas += 1
        r.por_metodo[v.metodo] = r.por_metodo.get(v.metodo, dinero.CERO) + v.total
        r.descuentos += v.descuento
        for c in v.conceptos:
            if c.tipo == "servicio":
                r.servicios += c.importe
            else:
                r.productos += c.importe
    return r


def registrar_corte(db: Session, dia: date, fondo_txt: str, contado_txt: str, notas: str,
                    usuario: Usuario) -> CorteCaja:
    r = resumen(db, dia)
    fondo = dinero.leer(fondo_txt, "el fondo inicial")
    contado = dinero.leer(contado_txt, "el efectivo contado", vacio=None)
    esperado = fondo + r.por_metodo["efectivo"]
    corte = CorteCaja(fecha=dia, ventas=r.ventas, total_efectivo=r.por_metodo["efectivo"],
                      total_tarjeta=r.por_metodo["tarjeta"], total_transferencia=r.por_metodo["transferencia"],
                      total=r.total, fondo_inicial=fondo, efectivo_contado=contado,
                      diferencia=dinero.redondear(contado - esperado), notas=notas.strip()[:300], usuario=usuario)
    db.add(corte)
    db.flush()
    return corte


def cortes_del_dia(db: Session, dia: date) -> list[CorteCaja]:
    return list(db.scalars(select(CorteCaja).options(joinedload(CorteCaja.usuario))
                           .where(CorteCaja.fecha == dia).order_by(CorteCaja.creado.desc())))

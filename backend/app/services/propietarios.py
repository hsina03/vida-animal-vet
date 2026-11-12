"""Propietarios y mascotas: validación, búsqueda y alta."""
import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ESPECIES, Mascota, Propietario
from app.errores import ErrorNegocio


def limpiar_telefono(texto: str) -> str | None:
    """Devuelve los 10 dígitos del teléfono o None si no es válido. Acepta +52 al inicio."""
    digitos = re.sub(r"\D", "", texto or "")
    if len(digitos) == 12 and digitos.startswith("52"):
        digitos = digitos[2:]
    return digitos if len(digitos) == 10 else None


def formato_telefono(digitos: str) -> str:
    if digitos and len(digitos) == 10:
        return f"{digitos[:3]} {digitos[3:6]} {digitos[6:]}"
    return digitos or ""


def validar_propietario(db: Session, nombre: str, telefono: str, correo: str = "",
                        excluir_id: int | None = None) -> tuple[str, str, str]:
    nombre = " ".join((nombre or "").split())
    tel = limpiar_telefono(telefono)
    correo = (correo or "").strip()
    if not nombre or len(nombre) > 120:
        raise ErrorNegocio("Escribe el nombre completo del propietario.")
    if not tel:
        raise ErrorNegocio("El WhatsApp debe tener 10 dígitos, por ejemplo 656 123 4567.")
    if correo and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", correo):
        raise ErrorNegocio("Revisa el correo electrónico o déjalo vacío.")
    otro = db.scalar(select(Propietario).where(Propietario.telefono == tel))
    if otro and otro.id != excluir_id:
        raise ErrorNegocio(f"Ya hay un propietario con ese teléfono: {otro.nombre}.")
    return nombre, tel, correo


def validar_mascota(datos: dict) -> dict:
    nombre = " ".join((datos.get("nombre") or "").split())
    if not nombre or len(nombre) > 60:
        raise ErrorNegocio("Escribe el nombre de la mascota.")
    especie = datos.get("especie") or "Otra"
    if especie not in ESPECIES:
        especie = "Otra"
    sexo = datos.get("sexo") or ""
    if sexo not in ("", "Macho", "Hembra"):
        sexo = ""
    return {
        "nombre": nombre, "especie": especie, "sexo": sexo,
        "raza": (datos.get("raza") or "").strip()[:60],
        "edad": (datos.get("edad") or "").strip()[:30],
        "peso": (datos.get("peso") or "").strip()[:20],
    }


def buscar(db: Session, texto: str, limite: int = 100) -> list[Propietario]:
    consulta = select(Propietario).order_by(Propietario.nombre)
    texto = (texto or "").strip()
    if texto:
        patron = f"%{texto.lower()}%"
        condiciones = [func.lower(Propietario.nombre).like(patron),
                       Propietario.id.in_(select(Mascota.propietario_id)
                                          .where(func.lower(Mascota.nombre).like(patron)))]
        digitos = re.sub(r"\D", "", texto)
        if len(digitos) >= 3:
            condiciones.append(Propietario.telefono.like(f"%{digitos}%"))
        consulta = consulta.where(or_(*condiciones))
    return list(db.scalars(consulta.limit(limite)))


def buscar_o_crear_mascota(db: Session, propietario: Propietario, nombre: str, especie: str) -> Mascota:
    for mascota in propietario.mascotas:
        if mascota.nombre.lower() == nombre.lower():
            return mascota
    mascota = Mascota(nombre=nombre, especie=especie if especie in ESPECIES else "Otra")
    propietario.mascotas.append(mascota)
    db.flush()
    return mascota

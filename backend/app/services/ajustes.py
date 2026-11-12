"""Lectura y escritura de ajustes configurables (tabla clave-valor)."""
from sqlalchemy.orm import Session

from app.models import Ajuste

VALORES_INICIALES = {
    "duracion_espacio_min": "30",
    "cupo_por_espacio": "2",
    "anticipacion_min": "120",
    "dias_chat": "7",
    "telefono": "6560000000",
    "whatsapp": "6560000000",
    "direccion": "Plaza del Sol, Ciudad Juárez, Chih.",
    "mapa_url": "",
}


def obtener(db: Session, clave: str) -> str:
    fila = db.get(Ajuste, clave)
    return fila.valor if fila else VALORES_INICIALES.get(clave, "")


def obtener_int(db: Session, clave: str) -> int:
    try:
        return int(obtener(db, clave))
    except ValueError:
        return int(VALORES_INICIALES[clave])


def guardar(db: Session, clave: str, valor) -> None:
    fila = db.get(Ajuste, clave)
    if fila:
        fila.valor = str(valor)
    else:
        db.add(Ajuste(clave=clave, valor=str(valor)))


def todos(db: Session) -> dict[str, str]:
    return {clave: obtener(db, clave) for clave in VALORES_INICIALES}

"""Fecha y hora de la clínica (America/Ciudad_Juarez).

Todas las fechas se guardan como hora local de la clínica, sin zona.
Las pruebas pueden fijar la hora con `fijar_ahora`.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import obtener_ajustes

ZONA = ZoneInfo(obtener_ajustes().zona_horaria)
_ahora_fijo: datetime | None = None

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def ahora() -> datetime:
    if _ahora_fijo is not None:
        return _ahora_fijo
    return datetime.now(ZONA).replace(tzinfo=None, microsecond=0)


def hoy() -> date:
    return ahora().date()


def fijar_ahora(momento: datetime | None) -> None:
    global _ahora_fijo
    _ahora_fijo = momento


def hora_txt(momento) -> str:
    return f"{momento.hour}:{momento.minute:02d}"


def fecha_larga(d: date, con_anio: bool = True) -> str:
    texto = f"{DIAS[d.weekday()].capitalize()} {d.day} de {MESES[d.month - 1]}"
    return f"{texto} de {d.year}" if con_anio else texto


def fecha_corta(d: date) -> str:
    return f"{DIAS_CORTOS[d.weekday()]} {d.day} {MESES_CORTOS[d.month - 1]}"

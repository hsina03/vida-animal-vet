"""Expediente clínico: validación de los registros de cada mascota."""
from datetime import date, datetime, time

from app import tiempo
from app.errores import ErrorNegocio
from app.models import TIPOS_REGISTRO


def _texto(valor, maximo: int) -> str:
    return (valor or "").strip()[:maximo]


def validar_registro(form) -> dict:
    tipo = form.get("tipo") or "Consulta"
    if tipo not in TIPOS_REGISTRO:
        tipo = "Otro"
    motivo = " ".join((form.get("motivo") or "").split())[:200]
    diagnostico = _texto(form.get("diagnostico"), 4000)
    tratamiento = _texto(form.get("tratamiento"), 4000)
    notas = _texto(form.get("notas"), 4000)
    if not (motivo or diagnostico or tratamiento or notas):
        raise ErrorNegocio("Escribe al menos el motivo o una nota para el expediente.")

    fecha = tiempo.ahora()
    texto_fecha = (form.get("fecha") or "").strip()
    if texto_fecha:
        try:
            dia = date.fromisoformat(texto_fecha)
        except ValueError:
            raise ErrorNegocio("Revisa la fecha del registro.")
        if dia > tiempo.hoy():
            raise ErrorNegocio("La fecha del registro no puede ser futura.")
        fecha = datetime.combine(dia, fecha.time() if dia == tiempo.hoy() else time(12))

    proxima = None
    texto_proxima = (form.get("proxima_fecha") or "").strip()
    if texto_proxima:
        try:
            proxima = date.fromisoformat(texto_proxima)
        except ValueError:
            raise ErrorNegocio("Revisa la fecha de la próxima aplicación o revisión.")

    return {
        "tipo": tipo, "motivo": motivo, "diagnostico": diagnostico, "tratamiento": tratamiento, "notas": notas,
        "peso": _texto(form.get("peso"), 20), "temperatura": _texto(form.get("temperatura"), 10),
        "fecha": fecha, "proxima_fecha": proxima,
    }

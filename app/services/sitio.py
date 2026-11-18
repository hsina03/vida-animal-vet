"""Datos públicos de la clínica que se muestran en el sitio y en el asistente."""
from datetime import timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tiempo
from app.models import DiaSinServicio, HorarioDia
from app.services import ajustes
from app.services.propietarios import formato_telefono

DIAS_CAP = [d.capitalize() for d in tiempo.DIAS]


def _horas(h: HorarioDia) -> str:
    if not h.abierto or not h.apertura or not h.cierre:
        return "Cerrado"
    return f"{tiempo.hora_txt(h.apertura)} a {tiempo.hora_txt(h.cierre)}"


def resumen_horario(db: Session) -> list[tuple[str, str]]:
    """Agrupa días seguidos con el mismo horario: [("Lunes a viernes", "9:00 a 19:00"), ...]."""
    dias = {h.dia_semana: h for h in db.scalars(select(HorarioDia))}
    grupos: list[list] = []
    for i in range(7):
        horas = _horas(dias[i]) if i in dias else "Cerrado"
        if grupos and grupos[-1][2] == horas:
            grupos[-1][1] = i
        else:
            grupos.append([i, i, horas])
    resultado = []
    for desde, hasta, horas in grupos:
        if desde == hasta:
            nombre = DIAS_CAP[desde]
        elif hasta == desde + 1:
            nombre = f"{DIAS_CAP[desde]} y {tiempo.DIAS[hasta]}"
        else:
            nombre = f"{DIAS_CAP[desde]} a {tiempo.DIAS[hasta]}"
        resultado.append((nombre, horas))
    return resultado


def horario_corto(db: Session) -> str:
    abiertos = [h for h in db.scalars(select(HorarioDia).order_by(HorarioDia.dia_semana))
                if h.abierto and h.apertura]
    if not abiertos:
        return "Consulta nuestro horario por WhatsApp"
    primero, ultimo = abiertos[0], abiertos[-1]
    temprano = min(h.apertura for h in abiertos)
    return (f"{tiempo.DIAS_CORTOS[primero.dia_semana]} a {tiempo.DIAS_CORTOS[ultimo.dia_semana].lower()} "
            f"desde las {tiempo.hora_txt(temprano)}")


def proximos_dias_sin_servicio(db: Session, dias: int = 30) -> list[DiaSinServicio]:
    hoy = tiempo.hoy()
    return list(db.scalars(select(DiaSinServicio).where(
        DiaSinServicio.fecha >= hoy, DiaSinServicio.fecha <= hoy + timedelta(days=dias))
        .order_by(DiaSinServicio.fecha)))


def whatsapp_url(db: Session, mensaje: str = "", telefono: str | None = None) -> str:
    numero = telefono or ajustes.obtener(db, "whatsapp")
    url = f"https://wa.me/52{numero}"
    return f"{url}?text={quote(mensaje)}" if mensaje else url


def mapa_url(db: Session) -> str:
    propio = ajustes.obtener(db, "mapa_url").strip()
    if propio.startswith("https://"):
        return propio
    return "https://www.google.com/maps/search/?api=1&query=" + quote(ajustes.obtener(db, "direccion"))


def contacto(db: Session) -> dict:
    valores = ajustes.todos(db)
    return {
        "telefono": formato_telefono(valores["telefono"]),
        "telefono_digitos": valores["telefono"],
        "whatsapp": formato_telefono(valores["whatsapp"]),
        "direccion": valores["direccion"],
        "whatsapp_url": whatsapp_url(db, "Hola, me gustaría información sobre sus servicios."),
        "mapa_url": mapa_url(db),
    }

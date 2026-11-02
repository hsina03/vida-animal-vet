"""Plantillas Jinja2 (con escape automático) y ayudantes para las vistas."""
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote

from fastapi import Request
from fastapi.templating import Jinja2Templates

from app import tiempo
from app.security import token_csrf
from app.services.propietarios import formato_telefono

CARPETA = Path(__file__).parent
templates = Jinja2Templates(directory=CARPETA / "templates")

CLASE_ESTADO = {
    "pendiente": "b-pend", "confirmada": "b-conf", "atendida": "b-aten", "cancelada": "b-canc",
    "reprogramada": "b-repr", "nueva": "b-new", "urgente": "b-urg", "requiere_atencion": "b-pend",
    "resuelta": "b-aten",
}

entorno = templates.env
entorno.filters.update({
    "hora": tiempo.hora_txt,
    "fecha_larga": tiempo.fecha_larga,
    "fecha_corta": tiempo.fecha_corta,
    "telefono": formato_telefono,
    "clase_estado": lambda estado: CLASE_ESTADO.get(estado, "b-canc"),
    "sumar_dias": lambda fecha, n: fecha + timedelta(days=n),
})


def wa_url(telefono: str, mensaje: str = "") -> str:
    """Enlace para abrir WhatsApp con un propietario y un mensaje ya escrito."""
    return f"https://wa.me/52{telefono}" + (f"?text={quote(mensaje)}" if mensaje else "")


def url_actual(request: Request) -> str:
    return request.url.path + (f"?{request.url.query}" if request.url.query else "")


entorno.globals.update({"csrf_token": token_csrf, "tiempo": tiempo, "wa_url": wa_url, "url_actual": url_actual})


def flash(request: Request, texto: str, tipo: str = "ok") -> None:
    mensajes = request.session.get("flash", [])
    mensajes.append({"tipo": tipo, "texto": texto})
    request.session["flash"] = mensajes


def render(request: Request, plantilla: str, contexto: dict | None = None, status_code: int = 200):
    contexto = dict(contexto or {})
    contexto.setdefault("flash", request.session.pop("flash", []))
    return templates.TemplateResponse(request, plantilla, contexto, status_code=status_code)

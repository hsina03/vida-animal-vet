"""Panel: contenido del sitio (servicios, contacto y preguntas frecuentes). Solo administrador."""
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PreguntaFrecuente, Servicio, Usuario
from app.routers.panel.comun import CSRF, contexto, volver
from app.security import requiere_admin
from app.services import ajustes as aj
from app.services.propietarios import formato_telefono, limpiar_telefono
from app.templating import render

router = APIRouter()
DESTINO = "/panel/contenido"


@router.get("/panel/contenido")
def ver(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    valores = aj.todos(db)
    return render(request, "panel/contenido.html", contexto(
        db, yo, "contenido",
        servicios=list(db.scalars(select(Servicio).order_by(Servicio.orden, Servicio.id))),
        preguntas=list(db.scalars(select(PreguntaFrecuente).order_by(PreguntaFrecuente.orden, PreguntaFrecuente.id))),
        contacto={"telefono": formato_telefono(valores["telefono"]), "whatsapp": formato_telefono(valores["whatsapp"]),
                  "direccion": valores["direccion"], "mapa_url": valores["mapa_url"]}))


def _servicio(db: Session, servicio_id: int) -> Servicio:
    servicio = db.get(Servicio, servicio_id)
    if not servicio:
        raise HTTPException(404, "El servicio no existe.")
    return servicio


@router.post("/panel/contenido/servicios/{servicio_id}", dependencies=[CSRF])
def editar_servicio(request: Request, servicio_id: int, nombre: str = Form(""), descripcion: str = Form(""),
                    duracion_min: int = Form(30), agendable: str = Form(""), db: Session = Depends(get_db),
                    yo: Usuario = Depends(requiere_admin)):
    servicio = _servicio(db, servicio_id)
    nombre = " ".join(nombre.split())
    if not nombre or len(nombre) > 80:
        return volver(request, DESTINO, "Escribe el nombre del servicio.", "error")
    if not 5 <= duracion_min <= 480:
        return volver(request, DESTINO, "La duración debe estar entre 5 y 480 minutos.", "error")
    servicio.nombre, servicio.descripcion = nombre, descripcion.strip()[:400]
    servicio.duracion_min, servicio.agendable = duracion_min, agendable == "1"
    db.commit()
    return volver(request, DESTINO, f"{servicio.nombre} actualizado en el sitio.")


@router.post("/panel/contenido/servicios/{servicio_id}/visible", dependencies=[CSRF])
def visibilidad(request: Request, servicio_id: int, db: Session = Depends(get_db),
                yo: Usuario = Depends(requiere_admin)):
    servicio = _servicio(db, servicio_id)
    servicio.visible = not servicio.visible
    db.commit()
    return volver(request, DESTINO, f"{servicio.nombre} {'visible en' if servicio.visible else 'oculto del'} sitio.")


@router.post("/panel/contenido/contacto", dependencies=[CSRF])
def contacto(request: Request, telefono: str = Form(""), whatsapp: str = Form(""), direccion: str = Form(""),
             mapa_url: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    tel, wa = limpiar_telefono(telefono), limpiar_telefono(whatsapp)
    direccion, mapa_url = " ".join(direccion.split()), mapa_url.strip()
    if not tel or not wa:
        return volver(request, DESTINO, "El teléfono y el WhatsApp deben tener 10 dígitos.", "error")
    if not direccion:
        return volver(request, DESTINO, "Escribe la dirección de la clínica.", "error")
    if mapa_url and not mapa_url.startswith("https://"):
        return volver(request, DESTINO, "El enlace del mapa debe empezar con https://", "error")
    for clave, valor in (("telefono", tel), ("whatsapp", wa), ("direccion", direccion[:200]), ("mapa_url", mapa_url[:500])):
        aj.guardar(db, clave, valor)
    db.commit()
    return volver(request, DESTINO, "Datos de contacto actualizados en el sitio.")


def _validar_pregunta(pregunta: str, respuesta: str) -> tuple[str, str] | None:
    pregunta, respuesta = " ".join(pregunta.split()), respuesta.strip()
    if not pregunta or not respuesta or len(pregunta) > 200 or len(respuesta) > 1000:
        return None
    return pregunta, respuesta


@router.post("/panel/contenido/preguntas", dependencies=[CSRF])
def nueva_pregunta(request: Request, pregunta: str = Form(""), respuesta: str = Form(""),
                   db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    datos = _validar_pregunta(pregunta, respuesta)
    if not datos:
        return volver(request, DESTINO, "Escribe la pregunta y su respuesta.", "error")
    orden = (db.scalar(select(func.max(PreguntaFrecuente.orden))) or 0) + 1
    db.add(PreguntaFrecuente(pregunta=datos[0], respuesta=datos[1], orden=orden))
    db.commit()
    return volver(request, DESTINO, "Pregunta agregada al asistente.")


@router.post("/panel/contenido/preguntas/{pregunta_id}", dependencies=[CSRF])
def editar_pregunta(request: Request, pregunta_id: int, pregunta: str = Form(""), respuesta: str = Form(""),
                    visible: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    fila = db.get(PreguntaFrecuente, pregunta_id)
    datos = _validar_pregunta(pregunta, respuesta)
    if not fila:
        raise HTTPException(404, "La pregunta no existe.")
    if not datos:
        return volver(request, DESTINO, "Escribe la pregunta y su respuesta.", "error")
    fila.pregunta, fila.respuesta, fila.visible = datos[0], datos[1], visible == "1"
    db.commit()
    return volver(request, DESTINO, "Pregunta actualizada.")


@router.post("/panel/contenido/preguntas/{pregunta_id}/eliminar", dependencies=[CSRF])
def eliminar_pregunta(request: Request, pregunta_id: int, db: Session = Depends(get_db),
                      yo: Usuario = Depends(requiere_admin)):
    fila = db.get(PreguntaFrecuente, pregunta_id)
    if fila:
        db.delete(fila)
        db.commit()
    return volver(request, DESTINO, "Pregunta eliminada.")

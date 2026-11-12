"""API JSON del asistente del sitio."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from asistente.maquina import Asistente, ConversacionNoEncontrada
from app.database import get_db

router = APIRouter(prefix="/api/chat")


class Inicio(BaseModel):
    modo: str = Field(default="hola", pattern="^(hola|cita|faq)$")


class Mensaje(BaseModel):
    token: str = Field(min_length=10, max_length=64)
    opcion: str | None = Field(default=None, max_length=60)
    texto: str | None = Field(default=None, max_length=500)


@router.post("/iniciar")
def iniciar(datos: Inicio, db: Session = Depends(get_db)):
    token, respuesta = Asistente(db).iniciar(datos.modo)
    return {"token": token, **respuesta.como_dict()}


@router.post("/mensaje")
def mensaje(datos: Mensaje, db: Session = Depends(get_db)):
    try:
        respuesta = Asistente(db).procesar(datos.token, opcion=datos.opcion, texto=datos.texto)
    except ConversacionNoEncontrada:
        raise HTTPException(404, "La conversación terminó. Empieza una nueva.")
    return respuesta.como_dict()

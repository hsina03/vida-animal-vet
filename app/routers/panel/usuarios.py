"""Panel: usuarios y roles. Solo administrador."""
import re

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ROL_ADMIN, ROLES, Usuario
from app.routers.panel.comun import CSRF, contexto, volver
from app.security import abrir_sesion, hash_password, requiere_admin, validar_password_nueva
from app.templating import render

router = APIRouter()
DESTINO = "/panel/usuarios"

PERMISOS = [
    ("Consultar agenda y citas", True, True),
    ("Registrar, modificar y cancelar citas", True, True),
    ("Atender solicitudes del chat", True, True),
    ("Consultar y actualizar propietarios y mascotas", True, True),
    ("Consultar horarios y disponibilidad", True, True),
    ("Cambiar horarios y disponibilidad", True, False),
    ("Editar contenido del sitio y preguntas frecuentes", True, False),
    ("Administrar usuarios y roles", True, False),
]


@router.get("/panel/usuarios")
def ver(request: Request, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    usuarios = list(db.scalars(select(Usuario).order_by(Usuario.rol, Usuario.nombre)))
    return render(request, "panel/usuarios.html", contexto(db, yo, "usuarios", usuarios=usuarios,
                                                            roles=ROLES, permisos=PERMISOS))


def _usuario(db: Session, usuario_id: int) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(404, "El usuario no existe.")
    return usuario


@router.post("/panel/usuarios", dependencies=[CSRF])
def alta(request: Request, nombre: str = Form(""), usuario: str = Form(""), rol: str = Form(""),
         password: str = Form(""), db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    nombre, clave = " ".join(nombre.split()), usuario.strip().lower()
    if not nombre or len(nombre) > 120:
        return volver(request, DESTINO, "Escribe el nombre completo.", "error")
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", clave):
        return volver(request, DESTINO, "El usuario debe tener de 3 a 40 letras sin acentos, números, punto o guion.", "error")
    if rol not in ROLES:
        return volver(request, DESTINO, "Elige un rol.", "error")
    error = validar_password_nueva(password)
    if error:
        return volver(request, DESTINO, error, "error")
    if db.scalar(select(Usuario).where(Usuario.usuario == clave)):
        return volver(request, DESTINO, f"El usuario «{clave}» ya existe. Elige otro.", "error")
    db.add(Usuario(nombre=nombre, usuario=clave, rol=rol, password_hash=hash_password(password),
                   debe_cambiar_password=True))
    db.commit()
    return volver(request, DESTINO, f"{nombre} agregado. Deberá cambiar su contraseña temporal al entrar.")


@router.post("/panel/usuarios/{usuario_id}", dependencies=[CSRF])
def editar(request: Request, usuario_id: int, nombre: str = Form(""), rol: str = Form(""),
           db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    usuario = _usuario(db, usuario_id)
    nombre = " ".join(nombre.split())
    if not nombre or rol not in ROLES:
        return volver(request, DESTINO, "Escribe el nombre y elige un rol.", "error")
    if usuario.id == yo.id and rol != ROL_ADMIN:
        return volver(request, DESTINO, "No puedes quitarte el rol de administrador a ti mismo.", "error")
    if usuario.rol != rol:
        usuario.version_sesion += 1   # el cambio de rol cierra sus sesiones abiertas
    usuario.nombre, usuario.rol = nombre[:120], rol
    db.commit()
    return volver(request, DESTINO, f"Datos de {usuario.nombre} actualizados.")


@router.post("/panel/usuarios/{usuario_id}/password", dependencies=[CSRF])
def restablecer(request: Request, usuario_id: int, password: str = Form(""), db: Session = Depends(get_db),
                yo: Usuario = Depends(requiere_admin)):
    usuario = _usuario(db, usuario_id)
    error = validar_password_nueva(password)
    if error:
        return volver(request, DESTINO, error, "error")
    usuario.password_hash = hash_password(password)
    usuario.debe_cambiar_password = usuario.id != yo.id
    usuario.version_sesion += 1
    db.commit()
    if usuario.id == yo.id:
        abrir_sesion(request, usuario)
        return volver(request, DESTINO, "Tu contraseña quedó actualizada.")
    return volver(request, DESTINO, f"Contraseña de {usuario.nombre} restablecida. "
                                    "Deberá cambiarla en su próximo acceso.")


@router.post("/panel/usuarios/{usuario_id}/activo", dependencies=[CSRF])
def activar(request: Request, usuario_id: int, db: Session = Depends(get_db), yo: Usuario = Depends(requiere_admin)):
    usuario = _usuario(db, usuario_id)
    if usuario.id == yo.id:
        return volver(request, DESTINO, "No puedes desactivar tu propia cuenta.", "error")
    usuario.activo = not usuario.activo
    usuario.version_sesion += 1
    db.commit()
    return volver(request, DESTINO, f"Acceso de {usuario.nombre} {'activado' if usuario.activo else 'desactivado'}.")

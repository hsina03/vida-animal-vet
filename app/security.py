"""Contraseñas, sesión del personal, permisos por rol y protección CSRF.

La sesión vive en una cookie httpOnly firmada (SessionMiddleware de Starlette).
Guarda solo el id del usuario, la versión de su sesión y el token CSRF.
"""
import secrets
from datetime import timedelta

from fastapi import Depends, Request
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import tiempo
from app.config import obtener_ajustes
from app.database import get_db
from app.models import IntentoLogin, Usuario

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_HASH_FALSO = pwd.hash("contraseña-que-no-existe")
LARGO_MIN_PASSWORD = 8


class NoAutenticado(Exception):
    pass


class SinPermiso(Exception):
    pass


class DebeCambiarPassword(Exception):
    pass


class CsrfInvalido(Exception):
    pass


def hash_password(password: str) -> str:
    return pwd.hash(password)


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return pwd.verify(password, password_hash)
    except ValueError:
        return False


def validar_password_nueva(password: str) -> str | None:
    if len(password or "") < LARGO_MIN_PASSWORD:
        return f"La contraseña debe tener al menos {LARGO_MIN_PASSWORD} caracteres."
    if len(password.encode()) > 72:
        return "La contraseña es demasiado larga (máximo 72 caracteres)."
    return None


# ---------------------------------------------------------------- inicio de sesión

def _fallos_recientes(db: Session, usuario: str) -> int:
    ajustes = obtener_ajustes()
    desde = tiempo.ahora() - timedelta(minutes=ajustes.login_bloqueo_minutos)
    ultimo_exito = db.scalar(select(func.max(IntentoLogin.creado))
                             .where(IntentoLogin.usuario == usuario, IntentoLogin.exito.is_(True)))
    if ultimo_exito and ultimo_exito > desde:
        desde = ultimo_exito
    return db.scalar(select(func.count(IntentoLogin.id)).where(
        IntentoLogin.usuario == usuario, IntentoLogin.exito.is_(False), IntentoLogin.creado > desde)) or 0


def intentar_login(db: Session, usuario: str, password: str, ip: str) -> tuple[Usuario | None, str | None]:
    """Devuelve (usuario, None) si entra o (None, mensaje) si no."""
    ajustes = obtener_ajustes()
    usuario = (usuario or "").strip().lower()[:40]
    if not usuario or not password:
        return None, "Escribe tu usuario y tu contraseña para continuar."

    bloqueo = (f"Hubo demasiados intentos fallidos. Por seguridad, espera {ajustes.login_bloqueo_minutos} "
               "minutos e inténtalo de nuevo.")
    if _fallos_recientes(db, usuario) >= ajustes.login_max_intentos:
        return None, bloqueo

    cuenta = db.scalar(select(Usuario).where(Usuario.usuario == usuario))
    correcta = verificar_password(password, cuenta.password_hash if cuenta else _HASH_FALSO)
    if not cuenta or not correcta:
        db.add(IntentoLogin(usuario=usuario, ip=ip[:64], exito=False))
        db.commit()
        restantes = ajustes.login_max_intentos - _fallos_recientes(db, usuario)
        if restantes <= 0:
            return None, bloqueo
        mensaje = "El usuario o la contraseña no coinciden. Revísalos e inténtalo de nuevo."
        if restantes <= 2:
            mensaje += f" Te {'queda' if restantes == 1 else 'quedan'} {restantes} {'intento' if restantes == 1 else 'intentos'}."
        return None, mensaje

    if not cuenta.activo:
        return None, "Esta cuenta está desactivada. Pide al administrador que reactive tu acceso."

    db.add(IntentoLogin(usuario=usuario, ip=ip[:64], exito=True))
    cuenta.ultimo_acceso = tiempo.ahora()
    db.commit()
    return cuenta, None


def abrir_sesion(request: Request, usuario: Usuario) -> None:
    request.session.clear()
    request.session.update({"uid": usuario.id, "ver": usuario.version_sesion,
                            "csrf": secrets.token_urlsafe(32)})


def cerrar_sesion(request: Request) -> None:
    request.session.clear()


# ---------------------------------------------------------------- dependencias

def usuario_en_sesion(request: Request, db: Session) -> Usuario | None:
    uid = request.session.get("uid")
    if not uid:
        return None
    usuario = db.get(Usuario, uid)
    if not usuario or not usuario.activo or usuario.version_sesion != request.session.get("ver"):
        request.session.clear()
        return None
    return usuario


def usuario_sin_restriccion(request: Request, db: Session = Depends(get_db)) -> Usuario:
    """Usuario con sesión, aunque deba cambiar su contraseña."""
    usuario = usuario_en_sesion(request, db)
    if not usuario:
        raise NoAutenticado()
    return usuario


def requiere_usuario(usuario: Usuario = Depends(usuario_sin_restriccion)) -> Usuario:
    if usuario.debe_cambiar_password:
        raise DebeCambiarPassword()
    return usuario


def requiere_admin(usuario: Usuario = Depends(requiere_usuario)) -> Usuario:
    if not usuario.es_admin:
        raise SinPermiso()
    return usuario


def token_csrf(request: Request) -> str:
    token = request.session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf"] = token
    return token


async def verificar_csrf(request: Request) -> None:
    esperado = request.session.get("csrf")
    recibido = request.headers.get("x-csrf-token")
    if not recibido:
        formulario = await request.form()
        recibido = formulario.get("csrf_token")
    if not esperado or not recibido or not secrets.compare_digest(str(esperado), str(recibido)):
        raise CsrfInvalido()

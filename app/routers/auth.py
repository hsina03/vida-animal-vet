"""Inicio y cierre de sesión del personal, y cambio de contraseña."""
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Usuario
from app.security import (abrir_sesion, cerrar_sesion, hash_password, intentar_login, usuario_en_sesion,
                          usuario_sin_restriccion, validar_password_nueva, verificar_csrf, verificar_password)
from app.templating import flash, render

router = APIRouter()
CSRF = Depends(verificar_csrf)


def _destino_seguro(siguiente: str) -> str:
    # Solo rutas internas del panel, para no redirigir a otros sitios
    if siguiente.startswith("/panel") and not siguiente.startswith("//"):
        return siguiente
    return "/panel"


@router.get("/login")
def login_form(request: Request, siguiente: str = "/panel", db: Session = Depends(get_db)):
    if usuario_en_sesion(request, db):
        return RedirectResponse(_destino_seguro(siguiente), status_code=303)
    return render(request, "login.html", {"siguiente": siguiente, "usuario": ""})


@router.post("/login", dependencies=[CSRF])
def login(request: Request, usuario: str = Form(""), password: str = Form(""),
          siguiente: str = Form("/panel"), db: Session = Depends(get_db)):
    ip = request.client.host if request.client else ""
    cuenta, error = intentar_login(db, usuario, password, ip)
    if error:
        return render(request, "login.html", {"error": error, "usuario": usuario[:40], "siguiente": siguiente})
    abrir_sesion(request, cuenta)
    if cuenta.debe_cambiar_password:
        return RedirectResponse("/panel/cambiar-password", status_code=303)
    return RedirectResponse(_destino_seguro(siguiente), status_code=303)


@router.post("/logout", dependencies=[CSRF])
def logout(request: Request):
    cerrar_sesion(request)
    return RedirectResponse("/login", status_code=303)


@router.get("/panel/cambiar-password")
def cambiar_form(request: Request, usuario: Usuario = Depends(usuario_sin_restriccion)):
    return render(request, "cambiar_password.html", {"yo": usuario})


@router.post("/panel/cambiar-password", dependencies=[CSRF])
def cambiar(request: Request, actual: str = Form(""), nueva: str = Form(""), repetir: str = Form(""),
            usuario: Usuario = Depends(usuario_sin_restriccion), db: Session = Depends(get_db)):
    error = None
    if not verificar_password(actual, usuario.password_hash):
        error = "La contraseña actual no es correcta."
    elif nueva != repetir:
        error = "Las contraseñas nuevas no coinciden."
    elif nueva == actual:
        error = "La contraseña nueva debe ser distinta a la actual."
    else:
        error = validar_password_nueva(nueva)
    if error:
        return render(request, "cambiar_password.html", {"yo": usuario, "error": error})
    usuario.password_hash = hash_password(nueva)
    usuario.debe_cambiar_password = False
    usuario.version_sesion += 1
    db.commit()
    abrir_sesion(request, usuario)
    flash(request, "Tu contraseña quedó actualizada.")
    return RedirectResponse("/panel", status_code=303)

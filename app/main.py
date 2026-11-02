"""Aplicación FastAPI de Vida Animal II."""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from app.config import obtener_ajustes
from app.routers import auth, chat_api, publico
from app.routers.panel import citas, contenido, horarios, inicio, propietarios, solicitudes, usuarios
from app.security import CsrfInvalido, DebeCambiarPassword, NoAutenticado, SinPermiso
from app.templating import CARPETA, render

ajustes = obtener_ajustes()
if ajustes.secret_key.startswith("solo-para-desarrollo") or ajustes.secret_key.startswith("cambia-esta"):
    logging.getLogger("uvicorn.error").warning(
        "SECRET_KEY no está configurada en .env; usa una clave propia antes de publicar el sitio.")

app = FastAPI(title="Vida Animal II", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SessionMiddleware, secret_key=ajustes.secret_key, session_cookie="va_sesion",
                   max_age=12 * 3600, same_site="lax", https_only=ajustes.cookie_segura)


CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def cabeceras_de_seguridad(request: Request, call_next):
    respuesta = await call_next(request)
    respuesta.headers.setdefault("Content-Security-Policy", CSP)
    respuesta.headers.setdefault("X-Content-Type-Options", "nosniff")
    respuesta.headers.setdefault("X-Frame-Options", "DENY")
    respuesta.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith(("/panel", "/login")):
        respuesta.headers.setdefault("Cache-Control", "no-store")
    return respuesta


app.mount("/static", StaticFiles(directory=CARPETA / "static"), name="static")
for modulo in (publico, chat_api, auth, inicio, citas, solicitudes, propietarios, horarios, contenido, usuarios):
    app.include_router(modulo.router)


def _es_api(request: Request) -> bool:
    return request.url.path.startswith(("/api/", "/panel/api/"))


@app.exception_handler(NoAutenticado)
async def _no_autenticado(request: Request, _exc):
    if _es_api(request):
        return JSONResponse({"error": "Tu sesión terminó. Vuelve a iniciar sesión."}, status_code=401)
    siguiente = request.url.path if request.method == "GET" else "/panel"
    return RedirectResponse(f"/login?siguiente={siguiente}", status_code=303)


@app.exception_handler(DebeCambiarPassword)
async def _cambiar_password(request: Request, _exc):
    if _es_api(request):
        return JSONResponse({"error": "Primero cambia tu contraseña."}, status_code=403)
    return RedirectResponse("/panel/cambiar-password", status_code=303)


@app.exception_handler(SinPermiso)
async def _sin_permiso(request: Request, _exc):
    if _es_api(request):
        return JSONResponse({"error": "No tienes permiso para esta acción."}, status_code=403)
    return render(request, "error.html", {
        "titulo": "No tienes permiso para esta sección",
        "mensaje": "Solo el administrador puede ver o cambiar esta información. Si la necesitas, pídesela.",
        "volver": "/panel"}, status_code=403)


@app.exception_handler(CsrfInvalido)
async def _csrf(request: Request, _exc):
    if _es_api(request):
        return JSONResponse({"error": "La página expiró. Recárgala e inténtalo de nuevo."}, status_code=400)
    return render(request, "error.html", {
        "titulo": "La página expiró",
        "mensaje": "Por seguridad no guardamos el cambio. Recarga la página e inténtalo de nuevo.",
        "volver": "/login" if request.url.path == "/login" else "/panel"}, status_code=400)


@app.exception_handler(StarletteHTTPException)
async def _http(request: Request, exc: StarletteHTTPException):
    if _es_api(request):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)
    if exc.status_code == 404:
        return render(request, "error.html", {
            "titulo": "No encontramos esta página",
            "mensaje": "Puede que el enlace esté incompleto o que el registro ya no exista.",
            "volver": "/panel" if request.url.path.startswith("/panel") else "/"}, status_code=404)
    return render(request, "error.html", {"titulo": "Algo salió mal", "mensaje": str(exc.detail),
                                          "volver": "/"}, status_code=exc.status_code)

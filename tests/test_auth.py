"""Inicio de sesión del personal."""
from app.config import obtener_ajustes
from app.models import Usuario

from .conftest import csrf_de, entrar


def test_inicio_correcto(client):
    r = entrar(client, "admin")
    assert r.status_code == 303 and r.headers["location"] == "/panel"
    panel = client.get("/panel")
    assert panel.status_code == 200 and "Agenda de hoy" in panel.text
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_usuario_sin_distinguir_mayusculas(client):
    assert entrar(client, "  ADMIN ").status_code == 303


def test_contrasena_incorrecta(client):
    r = entrar(client, "admin", "otra-cosa")
    assert r.status_code == 200
    assert "El usuario o la contraseña no coinciden" in r.text
    assert client.get("/panel", follow_redirects=False).status_code == 303


def test_usuario_inexistente_da_el_mismo_mensaje(client):
    r = entrar(client, "nadie", "lo-que-sea")
    assert "El usuario o la contraseña no coinciden" in r.text


def test_cuenta_desactivada(client):
    r = entrar(client, "esilva")
    assert r.status_code == 200
    assert "Esta cuenta está desactivada" in r.text


def test_campos_vacios(client):
    r = entrar(client, "", "")
    assert "Escribe tu usuario y tu contraseña" in r.text


def test_limite_de_intentos(client):
    maximo = obtener_ajustes().login_max_intentos
    for _ in range(maximo - 1):
        entrar(client, "lrios", "mal")
    r = entrar(client, "lrios", "mal")
    assert "demasiados intentos" in r.text.lower()
    # Aunque ahora escriba la contraseña correcta, sigue bloqueado
    r = entrar(client, "lrios")
    assert r.status_code == 200 and "demasiados intentos" in r.text.lower()
    # Otras cuentas no se ven afectadas
    assert entrar(client, "admin").status_code == 303


def test_avisa_cuando_quedan_pocos_intentos(client):
    maximo = obtener_ajustes().login_max_intentos
    for _ in range(maximo - 2):
        r = entrar(client, "lrios", "mal")
    assert "Te quedan 2 intentos" in r.text


def test_login_sin_token_csrf_se_rechaza(client):
    r = client.post("/login", data={"usuario": "admin", "password": "x"})
    assert r.status_code == 400 and "La página expiró" in r.text


def test_cerrar_sesion(client):
    entrar(client, "admin")
    token = csrf_de(client.get("/panel").text)
    client.post("/logout", data={"csrf_token": token})
    assert client.get("/panel", follow_redirects=False).status_code == 303


def test_desactivar_cuenta_cierra_su_sesion(client, db):
    entrar(client, "lrios")
    assert client.get("/panel").status_code == 200
    usuario = db.query(Usuario).filter_by(usuario="lrios").one()
    usuario.activo = False
    usuario.version_sesion += 1
    db.commit()
    assert client.get("/panel", follow_redirects=False).headers["location"].startswith("/login")


def test_contrasena_temporal_obliga_a_cambiarla(client, db):
    usuario = db.query(Usuario).filter_by(usuario="lrios").one()
    usuario.debe_cambiar_password = True
    db.commit()
    r = entrar(client, "lrios")
    assert r.headers["location"] == "/panel/cambiar-password"
    assert client.get("/panel/citas", follow_redirects=False).headers["location"] == "/panel/cambiar-password"
    pagina = client.get("/panel/cambiar-password")
    r = client.post("/panel/cambiar-password", data={
        "csrf_token": csrf_de(pagina.text), "actual": "clave-segura-123",
        "nueva": "nueva-clave-456", "repetir": "nueva-clave-456"}, follow_redirects=False)
    assert r.headers["location"] == "/panel"
    assert client.get("/panel/citas").status_code == 200


def test_redirige_solo_a_rutas_del_panel(client):
    pagina = client.get("/login?siguiente=https://otro-sitio.com")
    r = client.post("/login", data={"usuario": "admin", "password": "clave-segura-123",
                                    "csrf_token": csrf_de(pagina.text), "siguiente": "https://otro-sitio.com"},
                    follow_redirects=False)
    assert r.headers["location"] == "/panel"

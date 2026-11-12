"""El servidor valida el rol en cada petición, no solo oculta botones."""
import pytest

from app.models import HorarioDia, Servicio, Usuario

from .conftest import csrf_de, entrar

PAGINAS = ["/panel", "/panel/citas", "/panel/citas?vista=semana", "/panel/solicitudes",
           "/panel/propietarios", "/panel/horarios"]
SOLO_ADMIN = ["/panel/contenido", "/panel/usuarios"]


@pytest.mark.parametrize("ruta", PAGINAS + SOLO_ADMIN)
def test_sin_sesion_redirige_al_login(client, ruta):
    r = client.get(ruta, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/login")


def test_api_sin_sesion_responde_401(client):
    assert client.get("/panel/api/disponibilidad?fecha=2026-11-04&servicio_id=1").status_code == 401


@pytest.mark.parametrize("ruta", PAGINAS + SOLO_ADMIN)
def test_administrador_ve_todo(client, ruta):
    entrar(client, "admin")
    assert client.get(ruta).status_code == 200


@pytest.mark.parametrize("ruta", PAGINAS)
def test_operativo_ve_la_operacion_diaria(client, ruta):
    entrar(client, "lrios")
    assert client.get(ruta).status_code == 200


@pytest.mark.parametrize("ruta", SOLO_ADMIN)
def test_operativo_no_entra_a_secciones_de_administrador(client, ruta):
    entrar(client, "lrios")
    r = client.get(ruta)
    assert r.status_code == 403 and "No tienes permiso" in r.text


def test_operativo_no_ve_los_enlaces_de_administrador(client):
    entrar(client, "lrios")
    html = client.get("/panel").text
    assert "/panel/contenido" not in html and "/panel/usuarios" not in html


def test_operativo_consulta_horarios_en_solo_lectura(client):
    entrar(client, "lrios")
    html = client.get("/panel/horarios").text
    assert "Solo el administrador puede cambiar horarios" in html
    assert "Guardar horarios" not in html


def _post(client, ruta, datos=None):
    token = csrf_de(client.get("/panel").text)
    return client.post(ruta, data={"csrf_token": token, **(datos or {})}, follow_redirects=False)


@pytest.mark.parametrize("ruta,datos", [
    ("/panel/horarios", {"abierto_6": "1", "apertura_6": "9:00", "cierre_6": "13:00",
                         "espacio": "30", "cupo": "2", "anticipacion": "120"}),
    ("/panel/horarios/dias-sin-servicio", {"fecha": "2026-12-01", "motivo": "x"}),
    ("/panel/contenido/servicios/1/visible", {}),
    ("/panel/contenido/contacto", {"telefono": "6561112233", "whatsapp": "6561112233", "direccion": "x"}),
    ("/panel/contenido/preguntas", {"pregunta": "x", "respuesta": "y"}),
    ("/panel/usuarios", {"nombre": "Nuevo", "usuario": "nuevo", "rol": "admin", "password": "12345678"}),
    ("/panel/usuarios/2/activo", {}),
])
def test_operativo_no_puede_cambiar_configuracion_aunque_envie_la_peticion(client, db, ruta, datos):
    entrar(client, "lrios")
    r = _post(client, ruta, datos)
    assert r.status_code == 403
    db.expire_all()
    assert db.get(HorarioDia, 6).abierto is False
    assert all(s.visible for s in db.query(Servicio))
    assert db.query(Usuario).filter_by(usuario="nuevo").count() == 0
    assert db.query(Usuario).filter_by(usuario="lrios").one().activo


def test_peticion_sin_csrf_se_rechaza(client, db):
    entrar(client, "admin")
    r = client.post("/panel/contenido/servicios/1/visible", follow_redirects=False)
    assert r.status_code == 400
    db.expire_all()
    assert db.get(Servicio, 1).visible


def test_administrador_no_puede_desactivar_su_propia_cuenta(client, db):
    entrar(client, "admin")
    admin = db.query(Usuario).filter_by(usuario="admin").one()
    _post(client, f"/panel/usuarios/{admin.id}/activo")
    db.expire_all()
    assert db.get(Usuario, admin.id).activo
    assert "No puedes desactivar tu propia cuenta" in client.get("/panel/usuarios").text


def test_administrador_no_puede_quitarse_el_rol(client, db):
    entrar(client, "admin")
    admin = db.query(Usuario).filter_by(usuario="admin").one()
    _post(client, f"/panel/usuarios/{admin.id}", {"nombre": "Admin", "rol": "operativo"})
    db.expire_all()
    assert db.get(Usuario, admin.id).rol == "admin"


def test_administrador_gestiona_usuarios(client, db):
    entrar(client, "admin")
    _post(client, "/panel/usuarios", {"nombre": "MVZ Karla Méndez", "usuario": "KMendez", "rol": "operativo",
                                      "password": "temporal-123"})
    nueva = db.query(Usuario).filter_by(usuario="kmendez").one()
    assert nueva.debe_cambiar_password
    _post(client, f"/panel/usuarios/{nueva.id}", {"nombre": "MVZ Karla Méndez", "rol": "admin"})
    _post(client, f"/panel/usuarios/{nueva.id}/activo")
    db.expire_all()
    nueva = db.get(Usuario, nueva.id)
    assert nueva.rol == "admin" and not nueva.activo
    _post(client, f"/panel/usuarios/{nueva.id}/password", {"password": "otra-temporal-1"})
    db.expire_all()
    assert db.get(Usuario, nueva.id).debe_cambiar_password


def test_administrador_cambia_horario_y_se_refleja_en_el_sitio(client):
    entrar(client, "admin")
    datos = {"espacio": "30", "cupo": "2", "anticipacion": "120"}
    for i in range(6):
        datos.update({f"abierto_{i}": "1", f"apertura_{i}": "9:00", f"cierre_{i}": "19:00"})
    datos["cierre_5"] = "14:00"
    _post(client, "/panel/horarios", datos)
    assert "9:00 a 14:00" in client.get("/").text


def test_cierre_antes_de_apertura_se_rechaza(client, db):
    entrar(client, "admin")
    _post(client, "/panel/horarios", {"abierto_0": "1", "apertura_0": "15:00", "cierre_0": "10:00",
                                      "espacio": "30", "cupo": "2", "anticipacion": "120"})
    assert "la hora de cierre debe ser después" in client.get("/panel/horarios").text

"""Casos de prueba de la Fase 3 que no cubrían los demás archivos.

CP-10: consultar la agenda del día en el panel.
CP-13: consultar y actualizar los datos de un propietario y de su mascota.
CP-14: tiempo de respuesta del asistente y del panel (requerimiento no funcional).
"""
import time
from datetime import datetime

from app.models import Mascota, Propietario
from app.services import agenda

from .conftest import csrf_de, entrar, mascota_de_prueba, servicio

LIMITE_SEGUNDOS = 2.0


def _post(client, ruta, datos=None):
    token = csrf_de(client.get("/panel").text)
    return client.post(ruta, data={"csrf_token": token, **(datos or {})}, follow_redirects=False)


def test_cp10_agenda_del_dia_lista_solo_las_citas_de_ese_dia(client, db):
    max_ = mascota_de_prueba(db, nombre="Max")
    luna = mascota_de_prueba(db, nombre="Luna", telefono="6561112233")
    agenda.reservar(db, mascota=max_, servicio=servicio(db, "consulta"),
                    inicio=datetime(2026, 11, 4, 10, 0), origen="personal")
    agenda.reservar(db, mascota=luna, servicio=servicio(db, "estetica"),
                    inicio=datetime(2026, 11, 5, 12, 0), origen="personal")
    db.commit()
    entrar(client, "lrios")

    dia_4 = client.get("/panel/citas?fecha=2026-11-04").text
    assert "Max" in dia_4 and "Luna" not in dia_4

    dia_5 = client.get("/panel/citas?fecha=2026-11-05").text
    assert "Luna" in dia_5 and "Max" not in dia_5


def test_cp13_actualizar_datos_del_propietario(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    r = _post(client, f"/panel/propietarios/{mascota.propietario_id}",
              {"nombre": "Sofía Hernández Ruiz", "telefono": "656 214 7790", "correo": "sofia@correo.com"})
    assert r.status_code == 303
    db.expire_all()
    propietario = db.get(Propietario, mascota.propietario_id)
    assert propietario.nombre == "Sofía Hernández Ruiz" and propietario.correo == "sofia@correo.com"
    assert "Sofía Hernández Ruiz" in client.get(f"/panel/propietarios?sel={propietario.id}").text


def test_cp13_telefono_invalido_no_se_guarda(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    _post(client, f"/panel/propietarios/{mascota.propietario_id}", {"nombre": "Sofía Hernández", "telefono": "656 21"})
    db.expire_all()
    assert db.get(Propietario, mascota.propietario_id).telefono == "6562147790"


def test_cp13_actualizar_datos_de_la_mascota(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    _post(client, f"/panel/mascotas/{mascota.id}", {"mascota_nombre": "Max", "mascota_especie": "Perro",
                                                    "mascota_raza": "Labrador", "mascota_peso": "28 kg"})
    db.expire_all()
    mascota = db.get(Mascota, mascota.id)
    assert mascota.raza == "Labrador" and mascota.peso == "28 kg"


def test_cp14_el_asistente_responde_en_menos_de_dos_segundos(client, db):
    inicio = time.perf_counter()
    r = client.post("/api/chat/iniciar", json={"modo": "hola"})
    token = r.json()["token"]
    r = client.post("/api/chat/mensaje", json={"token": token, "texto": "¿Cuál es el horario?"})
    duracion = time.perf_counter() - inicio
    assert r.status_code == 200
    assert duracion < LIMITE_SEGUNDOS, f"El asistente tardó {duracion:.2f} s"


def test_cp14_la_agenda_del_panel_carga_en_menos_de_dos_segundos(client, db):
    mascota = mascota_de_prueba(db)
    for hora in (10, 11, 12, 13):
        agenda.reservar(db, mascota=mascota, servicio=servicio(db, "consulta"),
                        inicio=datetime(2026, 11, 4, hora, 0), origen="personal")
    db.commit()
    entrar(client, "lrios")
    inicio = time.perf_counter()
    r = client.get("/panel/citas?fecha=2026-11-04")
    duracion = time.perf_counter() - inicio
    assert r.status_code == 200
    assert duracion < LIMITE_SEGUNDOS, f"La agenda tardó {duracion:.2f} s"

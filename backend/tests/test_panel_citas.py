"""Citas desde el panel y flujo completo: agendar por el chat y confirmar en el panel."""
from datetime import datetime

from app.models import (CANCELADA, CONFIRMADA, PENDIENTE, REPROGRAMADA, SOL_RESUELTA, Cita, Propietario,
                        Solicitud)
from app.services import agenda

from .conftest import csrf_de, entrar, mascota_de_prueba, servicio


def _post(client, ruta, datos=None):
    token = csrf_de(client.get("/panel").text)
    return client.post(ruta, data={"csrf_token": token, **(datos or {})}, follow_redirects=False)


def _cita(db, mascota, hora=10, clave="consulta"):
    cita = agenda.reservar(db, mascota=mascota, servicio=servicio(db, clave),
                           inicio=datetime(2026, 11, 4, hora, 0), origen="personal")
    db.commit()
    return cita


def test_registrar_cita_desde_el_panel(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    r = _post(client, "/panel/citas", {"mascota_id": mascota.id, "servicio_id": servicio(db, "estetica").id,
                                       "fecha": "2026-11-04", "hora": "12:00"})
    assert r.status_code == 303
    cita = db.query(Cita).one()
    assert cita.estado == CONFIRMADA and cita.origen == "personal"
    assert "Max" in client.get("/panel/citas?fecha=2026-11-04").text


def test_registrar_en_horario_lleno_muestra_error(client, db):
    mascota = mascota_de_prueba(db)
    _cita(db, mascota)
    _cita(db, mascota)
    entrar(client, "lrios")
    _post(client, "/panel/citas", {"mascota_id": mascota.id, "servicio_id": servicio(db, "consulta").id,
                                   "fecha": "2026-11-04", "hora": "10:00"})
    assert db.query(Cita).count() == 2
    assert "ya no tiene lugar" in client.get("/panel/citas?fecha=2026-11-04").text


def test_cancelar_con_motivo(client, db):
    cita = _cita(db, mascota_de_prueba(db))
    entrar(client, "lrios")
    _post(client, f"/panel/citas/{cita.id}/cancelar", {"motivo": "Otro", "detalle": ""})
    db.expire_all()
    assert db.get(Cita, cita.id).estado == PENDIENTE   # "Otro" sin detalle no basta
    _post(client, f"/panel/citas/{cita.id}/cancelar", {"motivo": "El propietario lo solicitó"})
    db.expire_all()
    cita = db.get(Cita, cita.id)
    assert cita.estado == CANCELADA and cita.motivo_cancelacion == "El propietario lo solicitó"


def test_reprogramar(client, db):
    cita = _cita(db, mascota_de_prueba(db))
    entrar(client, "lrios")
    _post(client, f"/panel/citas/{cita.id}/reprogramar", {"fecha": "2026-11-05", "hora": "16:30"})
    db.expire_all()
    cita = db.get(Cita, cita.id)
    assert cita.estado == REPROGRAMADA and cita.inicio == datetime(2026, 11, 5, 16, 30)


def test_reprogramar_a_dia_sin_servicio_se_rechaza(client, db):
    cita = _cita(db, mascota_de_prueba(db))
    entrar(client, "lrios")
    _post(client, f"/panel/citas/{cita.id}/reprogramar", {"fecha": "2026-11-08", "hora": "10:00"})  # domingo
    db.expire_all()
    assert db.get(Cita, cita.id).inicio == datetime(2026, 11, 4, 10, 0)


def test_confirmar_y_marcar_atendida(client, db):
    cita = agenda.reservar(db, mascota=mascota_de_prueba(db), servicio=servicio(db, "consulta"),
                           inicio=datetime(2026, 11, 3, 9, 0), origen="personal")
    db.commit()
    entrar(client, "lrios")
    _post(client, f"/panel/citas/{cita.id}/confirmar")
    _post(client, f"/panel/citas/{cita.id}/atendida")
    db.expire_all()
    assert db.get(Cita, cita.id).estado == "atendida"


def test_api_de_disponibilidad(client, db):
    mascota = mascota_de_prueba(db)
    _cita(db, mascota)
    _cita(db, mascota)
    entrar(client, "lrios")
    datos = client.get(f"/panel/api/disponibilidad?fecha=2026-11-04&servicio_id={servicio(db, 'consulta').id}").json()
    diez = next(h for h in datos["horarios"] if h["hora"] == "10:00")
    assert diez["libre"] is False and diez["motivo"] == "Ocupado"


def test_busqueda_de_propietarios(client, db):
    mascota_de_prueba(db, nombre="Kiwi", telefono="6564473318")
    entrar(client, "lrios")
    for q in ("sofía", "kiwi", "447 33"):
        assert "Sofía Hernández" in client.get(f"/panel/propietarios?q={q}").text
    assert "Sin resultados" in client.get("/panel/propietarios?q=zzz").text


def test_alta_de_propietario_valida_telefono(client, db):
    entrar(client, "lrios")
    _post(client, "/panel/propietarios", {"nombre": "Jorge Medina", "telefono": "656 447", "mascota_nombre": "Kiwi"})
    assert db.query(Propietario).count() == 0
    _post(client, "/panel/propietarios", {"nombre": "Jorge Medina", "telefono": "656 447 3318",
                                          "mascota_nombre": "Kiwi", "mascota_especie": "Ave", "mascota_peso": "38 g"})
    propietario = db.query(Propietario).one()
    assert propietario.telefono == "6564473318" and propietario.mascotas[0].peso == "38 g"


def test_los_datos_se_escapan_en_pantalla(client, db):
    mascota_de_prueba(db, nombre="<script>alert(1)</script>")
    entrar(client, "lrios")
    html = client.get("/panel/propietarios").text
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_flujo_completo_chat_hasta_confirmar_en_el_panel(client, db):
    # 1. Una persona agenda por el asistente del sitio
    r = client.post("/api/chat/iniciar", json={"modo": "hola"}).json()
    token = r["token"]

    def tocar(etiqueta):
        nonlocal r
        valor = next(o["valor"] for o in r["opciones"] if o["etiqueta"] == etiqueta)
        r = client.post("/api/chat/mensaje", json={"token": token, "opcion": valor}).json()

    def escribir(texto):
        nonlocal r
        r = client.post("/api/chat/mensaje", json={"token": token, "texto": texto}).json()

    tocar("Agendar una cita")
    tocar("Estética")
    escribir("Coco")
    tocar("Perro")
    tocar("Jue 5 nov")
    tocar("11:00")
    escribir("Mariana Torres")
    escribir("656 109 5521")
    tocar("Confirmar solicitud")
    assert any("SOL-0001" in m.get("texto", "") for m in r["mensajes"])

    cita = db.query(Cita).one()
    assert cita.estado == PENDIENTE and (cita.fin - cita.inicio).seconds == 3600

    # 2. El personal la ve en el panel y la confirma desde la solicitud
    entrar(client, "lrios")
    inicio = client.get("/panel").text
    assert "Coco" in inicio
    solicitud = db.query(Solicitud).one()
    pagina = client.get(f"/panel/solicitudes?sel={solicitud.id}").text
    assert "Mariana Torres" in pagina and "Coco" in pagina and "Confirmar cita" in pagina
    _post(client, f"/panel/solicitudes/{solicitud.id}/confirmar")

    db.expire_all()
    assert db.get(Cita, cita.id).estado == CONFIRMADA
    assert db.get(Solicitud, solicitud.id).estado == SOL_RESUELTA
    assert "Sin pendientes" in client.get("/panel/solicitudes").text


def test_sitio_publico_lee_datos_de_la_base(client, db):
    html = client.get("/").text
    assert "Consulta general" in html and "Cremación" in html
    assert "Lunes a viernes" in html and "9:00 a 19:00" in html
    assert "https://wa.me/526560000000" in html
    estetica = servicio(db, "estetica")
    estetica.visible = False
    db.commit()
    assert "Baño, corte de pelo" not in client.get("/").text

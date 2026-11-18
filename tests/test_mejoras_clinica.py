"""Cambios pedidos por la clínica después de la presentación del prototipo.

Expediente clínico, fotos de mascotas, búsqueda por letra, archivar clientes, horario especial,
inventario y caja.
"""
from datetime import date, datetime, time
from decimal import Decimal

from app.models import (MOV_ENTRADA, VENTA_CANCELADA, DiaSinServicio, Mascota, MovimientoInventario, Producto,
                        Propietario, RegistroClinico, Venta)
from app.services import agenda, caja, inventario
from app.services.propietarios import buscar

from .conftest import csrf_de, entrar, mascota_de_prueba, servicio
from .test_chatbot import Chat, agendar_hasta_horarios

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _post(client, ruta, datos=None, files=None):
    token = csrf_de(client.get("/panel").text)
    return client.post(ruta, data={"csrf_token": token, **(datos or {})}, files=files, follow_redirects=False)


def _mensaje_error(client) -> str:
    return client.get("/panel").text


# ---------------------------------------------------------------- expediente clínico

def test_el_personal_agrega_un_registro_al_expediente(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    r = _post(client, f"/panel/mascotas/{mascota.id}/expediente", {
        "fecha": "2026-11-03", "tipo": "Vacunación", "motivo": "Vacuna antirrábica",
        "tratamiento": "Aplicación subcutánea", "peso": "31.5 kg", "temperatura": "38.4",
        "proxima_fecha": "2027-11-03"})
    assert r.status_code == 303
    registro = db.query(RegistroClinico).one()
    assert registro.tipo == "Vacunación" and registro.usuario.usuario == "lrios"
    assert registro.proxima_fecha == date(2027, 11, 3)
    db.expire_all()
    assert db.get(Mascota, mascota.id).peso == "31.5 kg"   # el peso más reciente pasa a la ficha
    pagina = client.get(f"/panel/propietarios?sel={mascota.propietario_id}&mascota={mascota.id}").text
    assert "Vacuna antirrábica" in pagina and "Aplicación subcutánea" in pagina


def test_registro_vacio_o_con_fecha_futura_no_se_guarda(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    _post(client, f"/panel/mascotas/{mascota.id}/expediente", {"fecha": "2026-11-03", "tipo": "Consulta"})
    _post(client, f"/panel/mascotas/{mascota.id}/expediente", {"fecha": "2026-11-10", "motivo": "Revisión"})
    assert db.query(RegistroClinico).count() == 0


def test_editar_registro_y_solo_el_administrador_lo_elimina(client, db):
    mascota = mascota_de_prueba(db)
    db.add(RegistroClinico(mascota=mascota, tipo="Consulta", motivo="Vómito"))
    db.commit()
    registro = db.query(RegistroClinico).one()
    entrar(client, "lrios")
    _post(client, f"/panel/expediente/{registro.id}", {"fecha": "2026-11-03", "tipo": "Consulta",
                                                       "motivo": "Vómito", "diagnostico": "Gastritis"})
    db.expire_all()
    assert db.get(RegistroClinico, registro.id).diagnostico == "Gastritis"
    assert _post(client, f"/panel/expediente/{registro.id}/eliminar").status_code == 403
    client.post("/logout", data={"csrf_token": csrf_de(client.get("/panel").text)})
    entrar(client, "admin")
    _post(client, f"/panel/expediente/{registro.id}/eliminar")
    assert db.query(RegistroClinico).count() == 0


# ---------------------------------------------------------------- fotos

def test_subir_ver_y_quitar_la_foto_de_una_mascota(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    r = _post(client, f"/panel/mascotas/{mascota.id}/foto", files={"foto": ("max.png", PNG, "image/png")})
    assert r.status_code == 303
    foto = client.get(f"/panel/mascotas/{mascota.id}/foto")
    assert foto.status_code == 200 and foto.content == PNG and foto.headers["content-type"] == "image/png"
    assert f"/panel/mascotas/{mascota.id}/foto?v=1" in client.get(f"/panel/propietarios?sel={mascota.propietario_id}").text

    _post(client, f"/panel/mascotas/{mascota.id}/foto", files={"foto": ("max.jpg", JPG, "image/jpeg")})
    db.expire_all()
    assert db.get(Mascota, mascota.id).foto_version == 2

    _post(client, f"/panel/mascotas/{mascota.id}/foto/eliminar")
    assert client.get(f"/panel/mascotas/{mascota.id}/foto").status_code == 404


def test_solo_se_aceptan_imagenes_de_hasta_3_mb(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    _post(client, f"/panel/mascotas/{mascota.id}/foto", files={"foto": ("virus.png", b"MZ\x90\x00", "image/png")})
    _post(client, f"/panel/mascotas/{mascota.id}/foto",
          files={"foto": ("enorme.jpg", JPG + b"\x00" * (3 * 1024 * 1024), "image/jpeg")})
    db.expire_all()
    assert not db.get(Mascota, mascota.id).tiene_foto


def test_la_foto_requiere_sesion(client, db):
    mascota = mascota_de_prueba(db)
    mascota.foto, mascota.foto_tipo, mascota.foto_version = PNG, "png", 1
    db.commit()
    assert client.get(f"/panel/mascotas/{mascota.id}/foto", follow_redirects=False).status_code == 303


# ---------------------------------------------------------------- búsqueda por letra

def _clientes(db, *nombres):
    for i, nombre in enumerate(nombres):
        propietario = Propietario(nombre=nombre, telefono=f"65610000{i:02d}")
        propietario.mascotas.append(Mascota(nombre=f"Mascota {i}", especie="Gato"))
        db.add(propietario)
    db.commit()


def test_buscar_por_letra_inicial(client, db):
    _clientes(db, "Sofía Hernández", "Carlos Ramírez", "Ángel Soto", "Ana Pérez", "Óscar Díaz")
    assert [p.nombre for p in buscar(db, "", letra="A")] == ["Ana Pérez", "Ángel Soto"]
    assert [p.nombre for p in buscar(db, "s")] == ["Sofía Hernández"]   # una letra: empieza con
    assert [p.nombre for p in buscar(db, "", letra="O")] == ["Óscar Díaz"]
    entrar(client, "lrios")
    pagina = client.get("/panel/propietarios?letra=C").text
    assert "Carlos Ramírez" in pagina and "Sofía Hernández" not in pagina


# ---------------------------------------------------------------- archivar clientes

def test_operativo_no_puede_eliminar_clientes(client, db):
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    assert _post(client, f"/panel/propietarios/{mascota.propietario_id}/archivar").status_code == 403
    assert not db.get(Propietario, mascota.propietario_id).archivado


def test_administrador_archiva_y_restaura_un_cliente(client, db):
    mascota = mascota_de_prueba(db)
    db.add(RegistroClinico(mascota=mascota, motivo="Consulta anual"))
    db.commit()
    entrar(client, "admin")
    _post(client, f"/panel/propietarios/{mascota.propietario_id}/archivar")
    db.expire_all()
    assert db.get(Propietario, mascota.propietario_id).archivado
    client.get("/panel")   # muestra el aviso de confirmación
    assert "Sofía Hernández" not in client.get("/panel/propietarios").text
    assert "Sofía Hernández" not in client.get("/panel/citas").text                # ventana de nueva cita
    assert client.get(f"/panel/api/propietarios/{mascota.propietario_id}/mascotas").status_code == 404
    archivados = client.get("/panel/propietarios?archivados=1").text
    assert "Sofía Hernández" in archivados and "Consulta anual" in archivados     # su historial se conserva

    _post(client, f"/panel/propietarios/{mascota.propietario_id}/restaurar")
    assert "Sofía Hernández" in client.get("/panel/propietarios").text


def test_cliente_archivado_que_vuelve_a_agendar_se_restaura(db):
    propietario = Propietario(nombre="Nadia López", telefono="6561234567", archivado=True)
    db.add(propietario)
    db.commit()
    chat = agendar_hasta_horarios(Chat(db))
    chat.tocar("10:30")
    chat.escribir("Nadia López")
    chat.escribir("656 123 4567")
    chat.tocar("Confirmar solicitud")
    db.expire_all()
    assert db.query(Propietario).count() == 1 and not db.get(Propietario, propietario.id).archivado


# ---------------------------------------------------------------- horario especial

def test_dia_con_horario_especial(client, db):
    entrar(client, "admin")
    _post(client, "/panel/horarios/dias-sin-servicio", {"fecha": "2026-11-04", "tipo": "horario",
                                                        "apertura": "12:00", "cierre": "15:00", "motivo": "Inventario"})
    dia = db.query(DiaSinServicio).one()
    assert dia.horario_especial and (dia.apertura, dia.cierre) == (time(12), time(15))
    horarios = agenda.horarios_del_dia(db, date(2026, 11, 4), servicio(db, "consulta"), para_chat=False)
    assert horarios[0].hora == "12:00" and horarios[-1].hora == "14:30"
    assert agenda.motivo_sin_servicio(db, date(2026, 11, 4)) is None
    assert "Horario especial: 12:00 a 15:00" in client.get("/panel/horarios").text


def test_horario_especial_en_domingo_permite_agendar(db):
    db.add(DiaSinServicio(fecha=date(2026, 11, 8), apertura=time(10), cierre=time(13)))
    db.commit()
    mascota = mascota_de_prueba(db)
    cita = agenda.reservar(db, mascota=mascota, servicio=servicio(db, "consulta"),
                           inicio=datetime(2026, 11, 8, 11, 0), origen="personal")
    assert cita.fin == datetime(2026, 11, 8, 11, 30)


def test_horario_especial_invalido_se_rechaza_y_el_cierre_sigue_funcionando(client, db):
    entrar(client, "admin")
    _post(client, "/panel/horarios/dias-sin-servicio", {"fecha": "2026-11-04", "tipo": "horario",
                                                        "apertura": "15:00", "cierre": "12:00"})
    assert db.query(DiaSinServicio).count() == 0
    _post(client, "/panel/horarios/dias-sin-servicio", {"fecha": "2026-11-05", "tipo": "cerrado"})
    assert agenda.horarios_del_dia(db, date(2026, 11, 5), servicio(db, "consulta"), para_chat=False) == []


def test_el_asistente_avisa_del_horario_especial(db):
    db.add(DiaSinServicio(fecha=date(2026, 11, 6), apertura=time(9), cierre=time(13)))
    db.commit()
    chat = Chat(db)
    chat.tocar("Horario y ubicación")
    assert "Horario especial: 6 de noviembre de 9:00 a 13:00" in chat.textos


# ---------------------------------------------------------------- inventario

def _producto(db, existencia="10", precio="100", minimo="2", nombre="Vacuna antirrábica") -> Producto:
    producto = Producto(nombre=nombre, categoria="Vacuna", unidad="dosis", precio=Decimal(precio),
                        minimo=Decimal(minimo), costo=Decimal("50"))
    db.add(producto)
    db.flush()
    inventario.mover(db, producto, MOV_ENTRADA, Decimal(existencia), motivo="Existencia inicial")
    db.commit()
    return producto


def test_administrador_da_de_alta_un_producto_con_existencia_inicial(client, db):
    entrar(client, "admin")
    _post(client, "/panel/inventario", {"nombre": "Croquetas cachorro 2 kg", "categoria": "Alimento",
                                        "unidad": "bolsa", "existencia": "8", "minimo": "3", "costo": "210",
                                        "precio": "$320.00", "se_vende": "1"})
    producto = db.query(Producto).one()
    assert producto.existencia == Decimal("8") and producto.precio == Decimal("320")
    assert db.query(MovimientoInventario).one().tipo == MOV_ENTRADA


def test_operativo_registra_entradas_y_salidas_pero_no_da_de_alta(client, db):
    producto = _producto(db)
    entrar(client, "lrios")
    assert _post(client, "/panel/inventario", {"nombre": "X"}).status_code == 403
    _post(client, f"/panel/inventario/{producto.id}/movimiento", {"tipo": "salida", "cantidad": "3",
                                                                 "motivo": "Uso en consulta"})
    _post(client, f"/panel/inventario/{producto.id}/movimiento", {"tipo": "entrada", "cantidad": "5"})
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("12")


def test_no_puede_quedar_existencia_negativa(client, db):
    producto = _producto(db, existencia="2")
    entrar(client, "lrios")
    _post(client, f"/panel/inventario/{producto.id}/movimiento", {"tipo": "salida", "cantidad": "5"})
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("2")
    assert "No hay suficiente" in client.get("/panel/inventario").text


def test_solo_el_administrador_ajusta_la_existencia(client, db):
    producto = _producto(db, existencia="10")
    entrar(client, "lrios")
    _post(client, f"/panel/inventario/{producto.id}/movimiento", {"tipo": "ajuste", "cantidad": "7", "motivo": "Conteo"})
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("10")
    client.post("/logout", data={"csrf_token": csrf_de(client.get("/panel").text)})
    entrar(client, "admin")
    _post(client, f"/panel/inventario/{producto.id}/movimiento", {"tipo": "ajuste", "cantidad": "7", "motivo": "Conteo"})
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("7")


def test_productos_por_surtir(client, db):
    _producto(db, existencia="2", minimo="5", nombre="Pipeta antipulgas")
    _producto(db, existencia="20", minimo="5", nombre="Shampoo")
    assert inventario.contar_bajos(db) == 1
    entrar(client, "lrios")
    pagina = client.get("/panel/inventario?bajos=1").text
    assert "<b>Pipeta antipulgas</b>" in pagina and "<b>Shampoo</b>" not in pagina


# ---------------------------------------------------------------- caja

def _conceptos(*items):
    import json
    return json.dumps([{"tipo": t, "id": i, "cantidad": str(c)} for t, i, c in items])


def test_cobro_en_efectivo_descuenta_inventario_y_calcula_el_cambio(client, db):
    consulta = servicio(db, "consulta")
    consulta.precio = Decimal("350")
    producto = _producto(db, existencia="10", precio="180")
    mascota = mascota_de_prueba(db)
    entrar(client, "lrios")
    r = _post(client, "/panel/caja", {
        "conceptos": _conceptos(("servicio", consulta.id, 1), ("producto", producto.id, 2)),
        "metodo": "efectivo", "recibido": "1000", "descuento": "10",
        "propietario_id": str(mascota.propietario_id), "mascota_id": str(mascota.id)})
    assert r.status_code == 303
    venta = db.query(Venta).one()
    assert (venta.subtotal, venta.descuento, venta.total) == (Decimal("710"), Decimal("10"), Decimal("700"))
    assert venta.cambio == Decimal("300") and venta.folio == "V-000001"
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("8")
    ticket = client.get(r.headers["location"]).text
    assert "V-000001" in ticket and "$700.00" in ticket and "$300.00" in ticket and "Sofía Hernández" in ticket


def test_los_precios_se_toman_de_la_base_y_no_del_navegador(client, db):
    import json
    producto = _producto(db, precio="180")
    entrar(client, "lrios")
    _post(client, "/panel/caja", {"conceptos": json.dumps([{"tipo": "producto", "id": producto.id, "cantidad": "1",
                                                           "precio": "1"}]), "metodo": "tarjeta"})
    venta = db.query(Venta).one()
    assert venta.total == Decimal("180") and venta.recibido == Decimal("180") and venta.cambio == 0


def test_cobro_rechazado_no_registra_nada(client, db):
    producto = _producto(db, existencia="1", precio="100")
    entrar(client, "lrios")
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 1)), "metodo": "efectivo",
                                  "recibido": "50"})                                       # no alcanza
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 3)), "metodo": "tarjeta"})  # sin existencia
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 1)), "metodo": "tarjeta",
                                  "descuento": "150"})                                     # descuento mayor
    _post(client, "/panel/caja", {"conceptos": "[]", "metodo": "efectivo"})                # vacía
    assert db.query(Venta).count() == 0
    db.expire_all()
    assert db.get(Producto, producto.id).existencia == Decimal("1")


def test_solo_el_administrador_cancela_y_regresa_el_inventario(client, db):
    producto = _producto(db, existencia="5", precio="100")
    entrar(client, "lrios")
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 2)), "metodo": "efectivo"})
    venta = db.query(Venta).one()
    assert _post(client, f"/panel/caja/ventas/{venta.id}/cancelar", {"motivo": "Error"}).status_code == 403
    client.post("/logout", data={"csrf_token": csrf_de(client.get("/panel").text)})
    entrar(client, "admin")
    _post(client, f"/panel/caja/ventas/{venta.id}/cancelar", {"motivo": "Cobro duplicado"})
    db.expire_all()
    assert db.get(Venta, venta.id).estado == VENTA_CANCELADA
    assert db.get(Producto, producto.id).existencia == Decimal("5")
    assert caja.resumen(db, date(2026, 11, 3)).total == 0


def test_corte_de_caja(client, db):
    producto = _producto(db, existencia="10", precio="100")
    entrar(client, "lrios")
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 2)), "metodo": "efectivo",
                                  "recibido": "200"})
    _post(client, "/panel/caja", {"conceptos": _conceptos(("producto", producto.id, 1)), "metodo": "tarjeta"})
    resumen = caja.resumen(db, date(2026, 11, 3))
    assert resumen.por_metodo["efectivo"] == Decimal("200") and resumen.por_metodo["tarjeta"] == Decimal("100")
    _post(client, "/panel/caja/corte", {"fecha": "2026-11-03", "fondo": "500", "contado": "690"})
    pagina = client.get("/panel/caja/corte?fecha=2026-11-03").text
    assert "Faltan $10.00" in pagina and "$300.00" in pagina


def test_cobrar_una_cita_precarga_el_servicio(client, db):
    mascota = mascota_de_prueba(db)
    cita = agenda.reservar(db, mascota=mascota, servicio=servicio(db, "estetica"),
                           inicio=datetime(2026, 11, 4, 12, 0), origen="personal", estado="confirmada")
    db.commit()
    entrar(client, "lrios")
    assert f'href="/panel/caja?cita={cita.id}"' in client.get("/panel/citas?fecha=2026-11-04").text
    pagina = client.get(f"/panel/caja?cita={cita.id}").text
    assert '"cita_id": %d' % cita.id in pagina and '"tipo": "servicio"' in pagina


def test_no_se_cobra_a_un_cliente_archivado(client, db):
    mascota = mascota_de_prueba(db)
    mascota.propietario.archivado = True
    db.commit()
    entrar(client, "lrios")
    _post(client, "/panel/caja", {"conceptos": _conceptos(("servicio", servicio(db, "consulta").id, 1)),
                                  "metodo": "tarjeta", "propietario_id": str(mascota.propietario_id)})
    assert db.query(Venta).count() == 0

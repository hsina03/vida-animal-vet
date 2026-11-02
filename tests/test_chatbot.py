"""Máquina de estados del asistente."""
from datetime import datetime

import pytest

from app.chatbot.maquina import Asistente
from app.chatbot.texto import es_urgencia
from app.models import (PENDIENTE, SOL_ATENCION, SOL_NUEVA, SOL_URGENTE, TIPO_CANALIZACION, TIPO_CITA,
                        Cita, Mascota, PreguntaFrecuente, Propietario, Solicitud)
from app.services import agenda

from .conftest import mascota_de_prueba, servicio


class Chat:
    """Pequeño ayudante que conversa con el asistente como lo haría el navegador."""

    def __init__(self, db, modo="hola"):
        self.db = db
        self.token, self.ultima = Asistente(db).iniciar(modo)

    def tocar(self, etiqueta: str):
        valor = next(o["valor"] for o in self.ultima.opciones
                     if o["etiqueta"] == etiqueta and not o["deshabilitada"])
        self.ultima = Asistente(self.db).procesar(self.token, opcion=valor)
        return self.ultima

    def escribir(self, texto: str):
        self.ultima = Asistente(self.db).procesar(self.token, texto=texto)
        return self.ultima

    @property
    def textos(self):
        return " ".join(m.get("texto", "") for m in self.ultima.mensajes)

    @property
    def etiquetas(self):
        return [o["etiqueta"] for o in self.ultima.opciones if not o["deshabilitada"]]


def agendar_hasta_horarios(chat: Chat):
    chat.tocar("Agendar una cita")
    chat.tocar("Consulta general")
    chat.escribir("firulais")
    chat.tocar("Perro")
    assert chat.etiquetas[0] == "Mar 3 nov"   # hoy aún tiene lugar a partir de las 10:00
    chat.tocar("Mié 4 nov")
    return chat


def test_flujo_completo_de_agendar(db):
    chat = agendar_hasta_horarios(Chat(db))
    assert chat.etiquetas[:2] == ["9:00", "9:30"]
    chat.tocar("10:30")
    assert "A nombre de quién" in chat.textos
    chat.escribir("Nadia López")
    chat.escribir("656 12")
    assert "10 dígitos" in chat.textos
    chat.escribir("656 123 4567")
    resumen = next(m for m in chat.ultima.mensajes if m["tipo"] == "resumen")
    assert ("Mascota", "Firulais (Perro)") in [tuple(x) for x in resumen["datos"]]
    chat.tocar("Confirmar solicitud")
    assert "SOL-0001" in chat.textos

    cita = db.query(Cita).one()
    assert cita.estado == PENDIENTE and cita.origen == "chat"
    assert cita.inicio == datetime(2026, 11, 4, 10, 30)
    assert cita.mascota.propietario.telefono == "6561234567"
    solicitud = db.query(Solicitud).one()
    assert (solicitud.folio, solicitud.tipo, solicitud.estado) == ("SOL-0001", TIPO_CITA, SOL_NUEVA)
    autores = [m.autor for m in solicitud.conversacion.mensajes]
    assert "usuario" in autores and "bot" in autores


def test_reutiliza_propietario_y_mascota_por_telefono(db):
    mascota_de_prueba(db, nombre="Max", telefono="6562147790")
    chat = Chat(db, modo="cita")
    chat.tocar("Vacunación y medicina preventiva")
    chat.escribir("max")
    chat.tocar("Perro")
    chat.tocar("Mié 4 nov")
    chat.tocar("11:00")
    chat.escribir("Sofía Hernández")
    chat.escribir("6562147790")
    chat.tocar("Confirmar solicitud")
    assert db.query(Propietario).count() == 1
    assert db.query(Mascota).count() == 1


def test_horario_ocupado_mientras_se_confirma(db):
    chat = agendar_hasta_horarios(Chat(db))
    chat.tocar("10:30")
    chat.escribir("Nadia López")
    chat.escribir("6561234567")
    # Mientras revisa el resumen, otras dos personas toman las 10:30
    otra = mascota_de_prueba(db, telefono="6560000001")
    for _ in range(2):
        agenda.reservar(db, mascota=otra, servicio=servicio(db, "consulta"),
                        inicio=datetime(2026, 11, 4, 10, 30), origen="personal")
    db.commit()
    chat.tocar("Confirmar solicitud")
    assert any(m["tipo"] == "aviso" and "ya no tiene lugar" in m["texto"] for m in chat.ultima.mensajes)
    assert "10:30" not in chat.etiquetas
    assert db.query(Solicitud).count() == 0
    chat.tocar("11:00")       # ya tiene nombre y teléfono: va directo al resumen
    chat.tocar("Confirmar solicitud")
    assert "SOL-0001" in chat.textos


def test_no_ofrece_servicios_que_no_se_agendan(db):
    chat = Chat(db, modo="cita")
    assert "Hospitalización" not in chat.etiquetas
    assert "Cremación" not in chat.etiquetas
    assert "Medicamentos y productos" not in chat.etiquetas
    assert "Estética" in chat.etiquetas and "Hospedaje" in chat.etiquetas


@pytest.mark.parametrize("mensaje", [
    "es urgente", "mi gato no respira bien", "mi perro sangra mucho", "creo que se envenenó",
    "mi perro se comió un pedazo de chocolate"])
def test_detecta_urgencias(db, mensaje):
    chat = Chat(db)
    chat.escribir(mensaje)
    solicitud = db.query(Solicitud).one()
    assert solicitud.tipo == TIPO_CANALIZACION and solicitud.estado == SOL_URGENTE
    assert any(m["tipo"] == "whatsapp" and m["url"].startswith("https://wa.me/52") for m in chat.ultima.mensajes)


def test_una_mascota_llamada_chocolate_no_es_urgencia():
    assert not es_urgencia("Chocolate")
    assert es_urgencia("se comio chocolate")


def test_canaliza_si_lo_pide_y_guarda_contacto(db):
    chat = Chat(db)
    chat.tocar("Hablar con el personal")
    solicitud = db.query(Solicitud).one()
    assert solicitud.estado == SOL_ATENCION
    chat.escribir("Gabriela León")
    chat.escribir("656 450 7781")
    db.refresh(solicitud)
    assert solicitud.nombre_contacto == "Gabriela León" and solicitud.telefono == "6564507781"
    assert "algo más" in chat.textos


def test_canaliza_si_no_entiende_dos_veces_seguidas(db):
    chat = Chat(db)
    chat.escribir("asdfgh")
    assert "No entendí" in chat.textos
    assert db.query(Solicitud).count() == 0
    chat.escribir("qwerty")
    solicitud = db.query(Solicitud).one()
    assert solicitud.estado == SOL_ATENCION and "no entendió" in solicitud.motivo


def test_entender_algo_reinicia_el_contador(db):
    chat = Chat(db)
    chat.escribir("asdfgh")
    chat.escribir("quiero una cita")
    assert "Qué servicio" in chat.textos
    chat.escribir("zzzz")
    assert db.query(Solicitud).count() == 0


def test_preguntas_frecuentes_se_leen_de_la_base(db):
    db.add(PreguntaFrecuente(pregunta="¿Tienen estacionamiento?", respuesta="Sí, el de la plaza.", orden=9))
    db.commit()
    chat = Chat(db, modo="faq")
    chat.tocar("¿Tienen estacionamiento?")
    assert "el de la plaza" in chat.textos


def test_horario_y_ubicacion(db):
    chat = Chat(db)
    chat.tocar("Horario y ubicación")
    assert "Plaza del Sol" in chat.textos
    assert "lunes a viernes de 9:00 a 19:00" in chat.textos.lower()
    assert "domingo cerrado" in chat.textos.lower()


def test_opcion_que_no_se_ofrecio_no_se_acepta(db):
    chat = Chat(db)
    respuesta = Asistente(db).procesar(chat.token, opcion="confirmar")
    assert "No entendí" in " ".join(m["texto"] for m in respuesta.mensajes)
    assert db.query(Cita).count() == 0

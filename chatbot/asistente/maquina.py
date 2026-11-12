"""Asistente del sitio: máquina de estados que responde con opciones y campos de texto.

Flujos:
- Agendar cita: servicio → mascota → especie → día → horario → nombre → WhatsApp → resumen → confirmar.
- Preguntas frecuentes y horario/ubicación (editables desde el panel).
- Canalizar al personal: si la persona lo pide, si hay una urgencia o si no se entiende
  dos veces seguidas. Crea una solicitud y ofrece el enlace de WhatsApp.

Cada llamada a `procesar` recibe una opción tocada o un texto escrito y devuelve una
`Respuesta` con los mensajes del asistente, las opciones a mostrar y el campo de texto.
"""
import json
import secrets
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tiempo
from asistente import texto as tx
from app.errores import ErrorNegocio
from app.models import (ESPECIES, SOL_ATENCION, SOL_NUEVA, SOL_URGENTE, TIPO_CANALIZACION, TIPO_CITA,
                        Conversacion, MensajeChat, PreguntaFrecuente, Propietario, Servicio, Solicitud)
from app.services import agenda, ajustes, sitio, solicitudes
from app.services.propietarios import buscar_o_crear_mascota, formato_telefono, limpiar_telefono

MAX_MENSAJES = 300
SALUDO = "¡Hola! Soy el asistente de Vida Animal II. Puedo ayudarte a agendar una cita o resolver tus dudas."

# Estados que esperan un texto libre (los demás esperan que se toque una opción).
ESTADOS_TEXTO = {"mascota", "nombre", "telefono", "canal_nombre", "canal_telefono"}


@dataclass
class Respuesta:
    mensajes: list[dict] = field(default_factory=list)
    opciones: list[dict] = field(default_factory=list)
    entrada: dict = field(default_factory=lambda: {"placeholder": "Escribe tu mensaje…"})
    terminada: bool = False

    def como_dict(self) -> dict:
        return {"mensajes": self.mensajes, "opciones": self.opciones, "entrada": self.entrada}


class ConversacionNoEncontrada(Exception):
    pass


class Asistente:
    def __init__(self, db: Session):
        self.db = db
        self.conv: Conversacion | None = None
        self.datos: dict = {}
        self.estado = "menu"
        self.fallos = 0
        self.r = Respuesta()
        self._usuario_txt: str | None = None

    # ------------------------------------------------------------ entrada pública

    def iniciar(self, modo: str = "hola") -> tuple[str, Respuesta]:
        self.conv = Conversacion(token=secrets.token_urlsafe(24), estado="menu", datos="{}")
        self.db.add(self.conv)
        self.decir(SALUDO)
        if modo == "cita":
            self.pedir_servicio()
        elif modo == "faq":
            self.mostrar_faq()
        else:
            self.mostrar_menu(primera=True)
        self._guardar()
        return self.conv.token, self.r

    def procesar(self, token: str, opcion: str | None = None, texto: str | None = None) -> Respuesta:
        self.conv = self.db.scalar(select(Conversacion).where(Conversacion.token == token))
        if not self.conv:
            raise ConversacionNoEncontrada()
        self.datos = json.loads(self.conv.datos or "{}")
        self.estado, self.fallos = self.conv.estado, self.conv.fallos_seguidos

        if len(self.conv.mensajes) >= MAX_MENSAJES:
            self.decir("Esta conversación ya es muy larga. Recarga la página para empezar una nueva, "
                       "o escríbenos por WhatsApp.")
            self.ofrecer_whatsapp()
            return self.r

        ofrecidas = self.datos.get("ofrecidas", {})
        if opcion is not None:
            if opcion not in ofrecidas:
                self.no_entendi()
                self._guardar()
                return self.r
            self._usuario_txt = ofrecidas[opcion]
            self.elegir(opcion)
        else:
            texto = " ".join((texto or "").split())[:500]
            if not texto:
                return self._repetir()
            self._usuario_txt = texto
            self.escribir(texto, ofrecidas)
        self._guardar()
        return self.r

    # ------------------------------------------------------------ utilidades

    def decir(self, mensaje: str) -> None:
        self.r.mensajes.append({"tipo": "texto", "texto": mensaje})

    def opciones(self, lista: list[tuple[str, str]], ocupadas: set[str] | None = None) -> None:
        self.r.opciones = [{"valor": v, "etiqueta": e, "deshabilitada": v in (ocupadas or set())}
                           for v, e in lista]
        self.datos["ofrecidas"] = {v: e for v, e in lista if v not in (ocupadas or set())}

    def pedir_texto(self, placeholder: str) -> None:
        self.r.entrada = {"placeholder": placeholder}
        self.datos["ofrecidas"] = {}

    def _repetir(self) -> Respuesta:
        ofrecidas = self.datos.get("ofrecidas", {})
        self.r.opciones = [{"valor": v, "etiqueta": e, "deshabilitada": False} for v, e in ofrecidas.items()]
        return self.r

    def _guardar(self) -> None:
        if self._usuario_txt:
            self.conv.mensajes.append(MensajeChat(autor="usuario", texto=self._usuario_txt))
        for m in self.r.mensajes:
            if m["tipo"] in ("texto", "aviso"):
                self.conv.mensajes.append(MensajeChat(autor="bot", texto=m["texto"]))
            elif m["tipo"] == "resumen":
                resumen = "; ".join(f"{k}: {v}" for k, v in m["datos"])
                self.conv.mensajes.append(MensajeChat(autor="bot", texto=f"Resumen de la cita. {resumen}"))
        self.conv.estado = self.estado
        self.conv.fallos_seguidos = self.fallos
        self.conv.datos = json.dumps(self.datos, ensure_ascii=False)
        self.db.commit()

    def _servicio(self) -> Servicio | None:
        sid = self.datos.get("servicio_id")
        return self.db.get(Servicio, sid) if sid else None

    # ------------------------------------------------------------ despacho

    def elegir(self, opcion: str) -> None:
        self.fallos = 0
        clave, _, valor = opcion.partition(":")
        acciones = {
            "agendar": lambda: self.pedir_servicio(),
            "faq": lambda: self.mostrar_faq(),
            "horario": lambda: self.mostrar_horario(),
            "personal": lambda: self.canalizar(SOL_ATENCION, "Pidió hablar con el personal"),
            "menu": lambda: self.mostrar_menu(),
            "fin": lambda: self.despedir(),
            "servicio": lambda: self.elegir_servicio(valor),
            "especie": lambda: self.elegir_especie(valor),
            "dia": lambda: self.elegir_dia(valor),
            "otros_dias": lambda: self.pedir_dia(),
            "hora": lambda: self.elegir_hora(valor),
            "confirmar": lambda: self.confirmar_cita(),
            "cambiar": lambda: self.pedir_servicio(cambiar=True),
            "pregunta": lambda: self.responder_pregunta(valor),
            "otro_servicio": lambda: self.canalizar(SOL_ATENCION, "No encontró el servicio que busca"),
            "no_esta": lambda: self.canalizar(SOL_ATENCION, "Su pregunta no está en las frecuentes"),
            "omitir": lambda: self.preguntar_algo_mas("Está bien. Puedes escribirle al personal por WhatsApp cuando gustes."),
        }
        acciones.get(clave, self.no_entendi)()

    def escribir(self, texto: str, ofrecidas: dict) -> None:
        # Revisiones que aplican en cualquier momento de la conversación
        if tx.es_urgencia(texto):
            self.fallos = 0
            return self.canalizar(SOL_URGENTE, "Posible urgencia detectada en el mensaje")
        if tx.pide_personal(texto):
            self.fallos = 0
            return self.canalizar(SOL_ATENCION, "Pidió hablar con el personal")
        if tx.quiere_volver(texto):
            self.fallos = 0
            return self.mostrar_menu()

        if self.estado in ESTADOS_TEXTO:
            return getattr(self, f"recibir_{self.estado}")(texto)

        # Si escribió el texto de una opción, se toma como si la hubiera tocado
        for valor, etiqueta in ofrecidas.items():
            if tx.coincide(texto, etiqueta):
                return self.elegir(valor)

        if self.estado in ("menu", "despues", "fin", "faq"):
            intencion = tx.intencion_menu(texto)
            if intencion == "saludo":
                self.fallos = 0
                return self.mostrar_menu()
            if intencion == "fin" and self.estado != "menu":
                self.fallos = 0
                return self.despedir()
            if intencion in ("agendar", "horario", "faq"):
                return self.elegir(intencion)
        self.no_entendi()

    def no_entendi(self) -> None:
        self.fallos += 1
        if self.fallos >= 2:
            self.fallos = 0
            self.decir("Perdona, sigo sin entenderte.")
            return self.canalizar(SOL_ATENCION, "El asistente no entendió dos veces seguidas")
        self.decir("No entendí tu mensaje. Elige una de las opciones o escribe «hablar con el personal».")
        ofrecidas = self.datos.get("ofrecidas") or {}
        if ofrecidas:
            self.r.opciones = [{"valor": v, "etiqueta": e, "deshabilitada": False} for v, e in ofrecidas.items()]
        elif self.estado not in ESTADOS_TEXTO:
            self.mostrar_menu(solo_opciones=True)

    # ------------------------------------------------------------ menú, FAQ y horario

    def mostrar_menu(self, primera: bool = False, solo_opciones: bool = False) -> None:
        self.estado = "menu"
        if not solo_opciones:
            self.decir("¿Qué necesitas?")
        self.opciones([("agendar", "Agendar una cita"), ("faq", "Preguntas frecuentes"),
                       ("horario", "Horario y ubicación"), ("personal", "Hablar con el personal")])

    def preguntar_algo_mas(self, mensaje: str | None = None) -> None:
        if mensaje:
            self.decir(mensaje)
        self.estado = "despues"
        self.decir("¿Te ayudo con algo más?")
        self.opciones([("agendar", "Agendar una cita"), ("faq", "Preguntas frecuentes"),
                       ("personal", "Hablar con el personal"), ("fin", "No, gracias")])

    def despedir(self) -> None:
        self.estado = "fin"
        self.decir("¡Gracias por elegir Vida Animal II! Si necesitas algo más, aquí estoy. 🐾")
        self.opciones([("menu", "Volver al inicio")])

    def mostrar_faq(self) -> None:
        self.estado = "faq"
        preguntas = list(self.db.scalars(select(PreguntaFrecuente).where(PreguntaFrecuente.visible.is_(True))
                                         .order_by(PreguntaFrecuente.orden, PreguntaFrecuente.id)))
        self.decir("Estas son las preguntas más comunes:" if preguntas else
                   "Por ahora no tengo preguntas frecuentes registradas.")
        self.opciones([(f"pregunta:{p.id}", p.pregunta) for p in preguntas] +
                      [("no_esta", "Mi pregunta no está aquí")])

    def responder_pregunta(self, valor: str) -> None:
        pregunta = self.db.get(PreguntaFrecuente, int(valor)) if valor.isdigit() else None
        if not pregunta or not pregunta.visible:
            return self.mostrar_faq()
        self.decir(pregunta.respuesta)
        self.estado = "despues"
        self.decir("¿Te ayudo con algo más?")
        self.opciones([("agendar", "Agendar una cita"), ("faq", "Otra pregunta"),
                       ("personal", "Hablar con el personal"), ("fin", "No, gracias")])

    def mostrar_horario(self) -> None:
        horario = "; ".join(f"{dias.lower() if i else dias} {'de ' + horas if horas != 'Cerrado' else 'cerrado'}"
                            for i, (dias, horas) in enumerate(sitio.resumen_horario(self.db)))
        mensaje = f"Estamos en {ajustes.obtener(self.db, 'direccion')}. Atendemos: {horario}."
        cerrados = sitio.proximos_dias_sin_servicio(self.db, 21)
        if cerrados:
            fechas = ", ".join(f"{d.fecha.day} de {tiempo.MESES[d.fecha.month - 1]}"
                               + (f" ({d.motivo})" if d.motivo else "") for d in cerrados)
            mensaje += f" No hay servicio: {fechas}."
        self.decir(mensaje)
        self.decir(f"Nuestro teléfono y WhatsApp es {formato_telefono(ajustes.obtener(self.db, 'telefono'))}.")
        self.preguntar_algo_mas()

    # ------------------------------------------------------------ agendar cita

    def pedir_servicio(self, cambiar: bool = False) -> None:
        for clave in ("servicio_id", "mascota", "especie", "fecha", "hora"):
            self.datos.pop(clave, None)
        self.estado = "servicio"
        servicios = list(self.db.scalars(select(Servicio).where(Servicio.agendable.is_(True),
                                                                Servicio.visible.is_(True))
                                         .order_by(Servicio.orden)))
        self.decir("Claro, cambiemos los datos. ¿Qué servicio necesitas?" if cambiar else
                   "Con gusto. ¿Qué servicio necesitas?")
        self.opciones([(f"servicio:{s.id}", s.nombre) for s in servicios] +
                      [("otro_servicio", "Otro o no estoy seguro")])

    def elegir_servicio(self, valor: str) -> None:
        servicio = self.db.get(Servicio, int(valor)) if valor.isdigit() else None
        if not servicio or not servicio.agendable or not servicio.visible:
            return self.pedir_servicio()
        self.datos["servicio_id"] = servicio.id
        if servicio.clave == "cirugia":
            self.decir("Para cirugías primero agendamos una valoración con el médico.")
        if self.datos.get("mascota"):
            return self.pedir_dia()
        self.estado = "mascota"
        self.decir("¿Cómo se llama tu mascota?")
        self.pedir_texto("Nombre de tu mascota")

    def recibir_mascota(self, texto: str) -> None:
        if len(texto) > 60 or not any(c.isalpha() for c in texto):
            self.decir("Escribe solo el nombre de tu mascota, por favor.")
            return self.pedir_texto("Nombre de tu mascota")
        self.fallos = 0
        self.datos["mascota"] = texto[0].upper() + texto[1:]
        self.estado = "especie"
        self.decir(f"¿Qué especie es {self.datos['mascota']}?")
        self.opciones([(f"especie:{e}", e) for e in ESPECIES])

    def elegir_especie(self, valor: str) -> None:
        self.datos["especie"] = valor if valor in ESPECIES else "Otra"
        self.pedir_dia()

    def pedir_dia(self) -> None:
        servicio = self._servicio()
        if not servicio:
            return self.pedir_servicio()
        dias = agenda.dias_con_lugar(self.db, servicio, ajustes.obtener_int(self.db, "dias_chat"))
        if not dias:
            self.decir("Por ahora no hay horarios libres para este servicio en los próximos días.")
            return self.canalizar(SOL_ATENCION, f"Sin horarios libres para {servicio.nombre}")
        self.estado = "dia"
        self.decir("Elige el día:")
        self.opciones([(f"dia:{d.isoformat()}", tiempo.fecha_corta(d)) for d in dias])

    def elegir_dia(self, valor: str, aviso: str | None = None) -> None:
        servicio = self._servicio()
        try:
            fecha = date.fromisoformat(valor)
        except ValueError:
            return self.pedir_dia()
        if not servicio:
            return self.pedir_servicio()
        horarios = [h for h in agenda.horarios_del_dia(self.db, fecha, servicio, para_chat=True) if h.libre]
        if aviso:
            self.r.mensajes.append({"tipo": "aviso", "texto": aviso})
        if not horarios:
            self.decir("Ese día ya no tiene horarios libres.")
            return self.pedir_dia()
        self.datos["fecha"] = fecha.isoformat()
        self.estado = "hora"
        self.decir(f"Estos son los horarios libres para el {tiempo.fecha_larga(fecha, con_anio=False).lower()}:")
        self.opciones([(f"hora:{h.hora}", h.hora) for h in horarios] + [("otros_dias", "Ver otros días")])

    def elegir_hora(self, valor: str) -> None:
        self.datos["hora"] = valor
        if self.datos.get("nombre") and self.datos.get("telefono"):
            return self.mostrar_resumen()
        self.estado = "nombre"
        self.decir("¿A nombre de quién registro la cita?")
        self.pedir_texto("Tu nombre completo")

    def recibir_nombre(self, texto: str) -> None:
        if len(texto) < 3 or len(texto) > 120 or not any(c.isalpha() for c in texto):
            self.decir("Escribe tu nombre completo, por favor.")
            return self.pedir_texto("Tu nombre completo")
        self.fallos = 0
        self.datos["nombre"] = texto
        self.estado = "telefono"
        self.decir("¿A qué número de WhatsApp te confirmamos? Escribe los 10 dígitos.")
        self.pedir_texto("Ej. 656 123 4567")

    def recibir_telefono(self, texto: str) -> None:
        telefono = limpiar_telefono(texto)
        if not telefono:
            self.fallos += 1
            if self.fallos >= 2:
                self.fallos = 0
                self.decir("Parece que hay un problema con el número.")
                return self.canalizar(SOL_ATENCION, "No pudo capturar un teléfono válido")
            self.decir("El número debe tener 10 dígitos. Escríbelo de nuevo, por ejemplo 656 123 4567.")
            return self.pedir_texto("Ej. 656 123 4567")
        self.fallos = 0
        self.datos["telefono"] = telefono
        self.mostrar_resumen()

    def _inicio_elegido(self) -> datetime:
        fecha = date.fromisoformat(self.datos["fecha"])
        hora, minuto = (int(x) for x in self.datos["hora"].split(":"))
        return datetime(fecha.year, fecha.month, fecha.day, hora, minuto)

    def mostrar_resumen(self) -> None:
        servicio = self._servicio()
        if not servicio or not self.datos.get("fecha"):
            return self.pedir_servicio()
        self.estado = "resumen"
        inicio = self._inicio_elegido()
        self.decir("Revisa los datos de tu cita:")
        self.r.mensajes.append({"tipo": "resumen", "datos": [
            ("Servicio", servicio.nombre),
            ("Mascota", f"{self.datos['mascota']} ({self.datos['especie']})"),
            ("Fecha", f"{tiempo.fecha_corta(inicio.date())}, {tiempo.hora_txt(inicio)}"),
            ("Propietario", self.datos["nombre"]),
            ("WhatsApp", formato_telefono(self.datos["telefono"])),
        ]})
        self.opciones([("confirmar", "Confirmar solicitud"), ("cambiar", "Cambiar datos")])

    def confirmar_cita(self) -> None:
        servicio = self._servicio()
        if not servicio or not all(self.datos.get(k) for k in ("mascota", "fecha", "hora", "nombre", "telefono")):
            return self.pedir_servicio()
        inicio = self._inicio_elegido()
        try:
            agenda.bloquear_agenda(self.db)   # antes de crear al propietario, para revisar el cupo al día
            propietario = self.db.scalar(select(Propietario).where(Propietario.telefono == self.datos["telefono"]))
            if not propietario:
                propietario = Propietario(nombre=self.datos["nombre"], telefono=self.datos["telefono"])
                self.db.add(propietario)
                self.db.flush()
            mascota = buscar_o_crear_mascota(self.db, propietario, self.datos["mascota"], self.datos["especie"])
            cita = agenda.reservar(self.db, mascota=mascota, servicio=servicio, inicio=inicio, origen="chat")
            solicitud = solicitudes.crear(
                self.db, tipo=TIPO_CITA, estado=SOL_NUEVA, motivo=f"Cita de {servicio.nombre}",
                nombre=self.datos["nombre"], telefono=self.datos["telefono"],
                mascota_txt=f"{self.datos['mascota']} ({self.datos['especie']})", cita=cita, conversacion=self.conv)
            self.db.flush()
        except ErrorNegocio as error:
            self.db.rollback()
            return self.elegir_dia(self.datos["fecha"], aviso=error.mensaje)

        self.datos["folio"] = solicitud.folio
        nombre = self.datos["nombre"].split()[0]
        self.decir(f"Listo, {nombre}. Tu solicitud quedó registrada con el folio {solicitud.folio}. "
                   "El personal te confirmará la cita por WhatsApp.")
        self.preguntar_algo_mas()

    # ------------------------------------------------------------ canalizar al personal

    def _solicitud_abierta(self) -> Solicitud | None:
        sid = self.datos.get("canal_solicitud_id")
        solicitud = self.db.get(Solicitud, sid) if sid else None
        return solicitud if solicitud and solicitud.abierta else None

    def ofrecer_whatsapp(self, folio: str | None = None) -> None:
        mensaje = "Hola, vengo del asistente del sitio de Vida Animal II."
        if folio:
            mensaje += f" Mi folio es {folio}."
        self.r.mensajes.append({"tipo": "whatsapp", "url": sitio.whatsapp_url(self.db, mensaje),
                                "texto": "Continuar en WhatsApp"})

    def canalizar(self, estado: str, motivo: str) -> None:
        solicitud = self._solicitud_abierta()
        if solicitud:
            if estado == SOL_URGENTE and solicitud.estado != SOL_URGENTE:
                solicitud.estado = SOL_URGENTE
                solicitud.motivo = motivo
        else:
            mascota = self.datos.get("mascota", "")
            if mascota and self.datos.get("especie"):
                mascota = f"{mascota} ({self.datos['especie']})"
            solicitud = solicitudes.crear(
                self.db, tipo=TIPO_CANALIZACION, estado=estado, motivo=motivo,
                nombre=self.datos.get("nombre", ""), telefono=self.datos.get("telefono", ""),
                mascota_txt=mascota, conversacion=self.conv)
            self.datos["canal_solicitud_id"] = solicitud.id

        telefono = formato_telefono(ajustes.obtener(self.db, "telefono"))
        if estado == SOL_URGENTE:
            self.decir("Por lo que me cuentas, puede tratarse de una urgencia. Ya avisé al personal. "
                       f"Escríbeles ahora por WhatsApp o llama al {telefono} antes de salir, "
                       "para que preparen la atención de tu mascota.")
        else:
            self.decir("Te comunico con el personal de la clínica. Ya les avisé y puedes escribirles por "
                       f"WhatsApp. Tu folio es {solicitud.folio}.")
        self.ofrecer_whatsapp(solicitud.folio)

        if solicitud.telefono:
            return self.preguntar_algo_mas()
        self.estado = "canal_nombre"
        self.decir("Si quieres que el personal te escriba, dime tu nombre.")
        self.pedir_texto("Tu nombre")
        self.opciones([("omitir", "Prefiero escribir yo por WhatsApp")])

    def recibir_canal_nombre(self, texto: str) -> None:
        if len(texto) < 2 or not any(c.isalpha() for c in texto):
            self.decir("Escribe tu nombre, por favor.")
            self.pedir_texto("Tu nombre")
            return self.opciones([("omitir", "Prefiero escribir yo por WhatsApp")])
        solicitud = self._solicitud_abierta()
        self.datos["nombre"] = texto[:120]
        if solicitud:
            solicitud.nombre_contacto = texto[:120]
        self.estado = "canal_telefono"
        self.decir("Gracias. ¿A qué número de WhatsApp te pueden escribir?")
        self.pedir_texto("Ej. 656 123 4567")
        self.opciones([("omitir", "Prefiero escribir yo por WhatsApp")])

    def recibir_canal_telefono(self, texto: str) -> None:
        telefono = limpiar_telefono(texto)
        if not telefono:
            self.decir("El número debe tener 10 dígitos, por ejemplo 656 123 4567.")
            self.pedir_texto("Ej. 656 123 4567")
            return self.opciones([("omitir", "Prefiero escribir yo por WhatsApp")])
        self.datos["telefono"] = telefono
        solicitud = self._solicitud_abierta()
        if solicitud:
            solicitud.telefono = telefono
        self.preguntar_algo_mas("Listo. El personal te escribirá en cuanto pueda.")

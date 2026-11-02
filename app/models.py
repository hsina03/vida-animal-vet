"""Tablas del sistema."""
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app import tiempo
from app.database import Base

ROL_ADMIN = "admin"
ROL_OPERATIVO = "operativo"
ROLES = {ROL_ADMIN: "Administrador", ROL_OPERATIVO: "Personal operativo"}

# Estados de cita. Las "activas" ocupan lugar en la agenda.
PENDIENTE, CONFIRMADA, REPROGRAMADA, ATENDIDA, CANCELADA = (
    "pendiente", "confirmada", "reprogramada", "atendida", "cancelada")
ESTADOS_CITA = {PENDIENTE: "Pendiente", CONFIRMADA: "Confirmada", REPROGRAMADA: "Reprogramada",
                ATENDIDA: "Atendida", CANCELADA: "Cancelada"}
ESTADOS_ACTIVOS = (PENDIENTE, CONFIRMADA, REPROGRAMADA, ATENDIDA)

# Solicitudes del chat
TIPO_CITA, TIPO_CANALIZACION = "cita", "canalizacion"
SOL_NUEVA, SOL_URGENTE, SOL_ATENCION, SOL_RESUELTA = "nueva", "urgente", "requiere_atencion", "resuelta"
ESTADOS_SOLICITUD = {SOL_NUEVA: "Nueva", SOL_URGENTE: "Urgente",
                     SOL_ATENCION: "Requiere atención", SOL_RESUELTA: "Resuelta"}

ESPECIES = ["Perro", "Gato", "Conejo", "Ave", "Otra"]


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    usuario: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(120))
    rol: Mapped[str] = mapped_column(String(20), default=ROL_OPERATIVO)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    debe_cambiar_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # Cambia al restablecer la contraseña o desactivar la cuenta e invalida sesiones abiertas.
    version_sesion: Mapped[int] = mapped_column(Integer, default=1)
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime)
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)

    @property
    def es_admin(self) -> bool:
        return self.rol == ROL_ADMIN

    @property
    def rol_txt(self) -> str:
        return ROLES.get(self.rol, self.rol)

    @property
    def iniciales(self) -> str:
        palabras = self.nombre.replace("MVZ ", "").split()
        return "".join(p[0] for p in palabras[:2]).upper() or "?"


class IntentoLogin(Base):
    __tablename__ = "intentos_login"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(40), index=True)
    ip: Mapped[str] = mapped_column(String(64), default="")
    exito: Mapped[bool] = mapped_column(Boolean, default=False)
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora, index=True)


class Ajuste(Base):
    """Valores configurables desde el panel (reglas de agenda y datos de contacto)."""
    __tablename__ = "ajustes"

    clave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(Text, default="")


class BloqueoAgenda(Base):
    """Fila única que se actualiza al reservar para serializar las reservas."""
    __tablename__ = "bloqueo_agenda"

    id: Mapped[int] = mapped_column(primary_key=True)
    contador: Mapped[int] = mapped_column(Integer, default=0)


class Servicio(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    grupo: Mapped[str] = mapped_column(String(60), default="Salud")
    icono: Mapped[str] = mapped_column(String(30), default="i-paw")
    duracion_min: Mapped[int] = mapped_column(Integer, default=30)
    agendable: Mapped[bool] = mapped_column(Boolean, default=True)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)


class HorarioDia(Base):
    __tablename__ = "horario_dias"

    dia_semana: Mapped[int] = mapped_column(Integer, primary_key=True)  # 0 = lunes
    abierto: Mapped[bool] = mapped_column(Boolean, default=True)
    apertura: Mapped[time | None] = mapped_column(Time)
    cierre: Mapped[time | None] = mapped_column(Time)


class DiaSinServicio(Base):
    __tablename__ = "dias_sin_servicio"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, unique=True)
    motivo: Mapped[str] = mapped_column(String(120), default="")


class PreguntaFrecuente(Base):
    __tablename__ = "preguntas_frecuentes"

    id: Mapped[int] = mapped_column(primary_key=True)
    pregunta: Mapped[str] = mapped_column(String(200))
    respuesta: Mapped[str] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Propietario(Base):
    __tablename__ = "propietarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), index=True)
    telefono: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    correo: Mapped[str] = mapped_column(String(120), default="")
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)

    mascotas: Mapped[list["Mascota"]] = relationship(
        back_populates="propietario", order_by="Mascota.id", cascade="all, delete-orphan")

    @property
    def iniciales(self) -> str:
        return "".join(p[0] for p in self.nombre.split()[:2]).upper() or "?"


class Mascota(Base):
    __tablename__ = "mascotas"

    id: Mapped[int] = mapped_column(primary_key=True)
    propietario_id: Mapped[int] = mapped_column(ForeignKey("propietarios.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(60), index=True)
    especie: Mapped[str] = mapped_column(String(30), default="Perro")
    raza: Mapped[str] = mapped_column(String(60), default="")
    edad: Mapped[str] = mapped_column(String(30), default="")
    sexo: Mapped[str] = mapped_column(String(10), default="")
    peso: Mapped[str] = mapped_column(String(20), default="")  # texto: admite "38 g"
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)

    propietario: Mapped[Propietario] = relationship(back_populates="mascotas")


class Cita(Base):
    __tablename__ = "citas"

    id: Mapped[int] = mapped_column(primary_key=True)
    mascota_id: Mapped[int] = mapped_column(ForeignKey("mascotas.id"), index=True)
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"))
    inicio: Mapped[datetime] = mapped_column(DateTime, index=True)
    fin: Mapped[datetime] = mapped_column(DateTime, index=True)
    estado: Mapped[str] = mapped_column(String(20), default=PENDIENTE, index=True)
    origen: Mapped[str] = mapped_column(String(10), default="personal")  # chat | personal
    motivo_cancelacion: Mapped[str] = mapped_column(String(200), default="")
    notas: Mapped[str] = mapped_column(Text, default="")
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)
    actualizado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora, onupdate=tiempo.ahora)

    mascota: Mapped[Mascota] = relationship()
    servicio: Mapped[Servicio] = relationship()
    historial: Mapped[list["HistorialCita"]] = relationship(
        back_populates="cita", order_by="HistorialCita.id", cascade="all, delete-orphan")

    @property
    def estado_txt(self) -> str:
        return ESTADOS_CITA.get(self.estado, self.estado)

    @property
    def propietario(self) -> Propietario:
        return self.mascota.propietario


class HistorialCita(Base):
    __tablename__ = "historial_citas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cita_id: Mapped[int] = mapped_column(ForeignKey("citas.id"), index=True)
    accion: Mapped[str] = mapped_column(String(30))
    detalle: Mapped[str] = mapped_column(Text, default="")
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)

    cita: Mapped[Cita] = relationship(back_populates="historial")
    usuario: Mapped[Usuario | None] = relationship()


class Conversacion(Base):
    __tablename__ = "conversaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    estado: Mapped[str] = mapped_column(String(30), default="menu")
    datos: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    fallos_seguidos: Mapped[int] = mapped_column(Integer, default=0)
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)
    actualizado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora, onupdate=tiempo.ahora)

    mensajes: Mapped[list["MensajeChat"]] = relationship(
        back_populates="conversacion", order_by="MensajeChat.id", cascade="all, delete-orphan")


class MensajeChat(Base):
    __tablename__ = "mensajes_chat"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversacion_id: Mapped[int] = mapped_column(ForeignKey("conversaciones.id"), index=True)
    autor: Mapped[str] = mapped_column(String(10))  # bot | usuario
    texto: Mapped[str] = mapped_column(Text)
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)

    conversacion: Mapped[Conversacion] = relationship(back_populates="mensajes")


class Solicitud(Base):
    __tablename__ = "solicitudes"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio: Mapped[str] = mapped_column(String(20), unique=True, default="")
    tipo: Mapped[str] = mapped_column(String(20))
    estado: Mapped[str] = mapped_column(String(20), index=True)
    motivo: Mapped[str] = mapped_column(String(200), default="")
    nombre_contacto: Mapped[str] = mapped_column(String(120), default="")
    telefono: Mapped[str] = mapped_column(String(10), default="")
    mascota_txt: Mapped[str] = mapped_column(String(120), default="")
    cita_id: Mapped[int | None] = mapped_column(ForeignKey("citas.id"))
    conversacion_id: Mapped[int | None] = mapped_column(ForeignKey("conversaciones.id"))
    creado: Mapped[datetime] = mapped_column(DateTime, default=tiempo.ahora)
    resuelta_en: Mapped[datetime | None] = mapped_column(DateTime)
    resuelta_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))

    cita: Mapped[Cita | None] = relationship()
    conversacion: Mapped[Conversacion | None] = relationship()
    resuelta_por: Mapped[Usuario | None] = relationship()

    @property
    def abierta(self) -> bool:
        return self.estado != SOL_RESUELTA

    @property
    def estado_txt(self) -> str:
        return ESTADOS_SOLICITUD.get(self.estado, self.estado)

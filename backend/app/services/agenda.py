"""Reglas de la agenda: espacios, cupo, anticipación, días sin servicio y reservas."""
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import event, select, update
from sqlalchemy.orm import Session

from app import tiempo
from app.errores import ErrorNegocio
from app.models import (ESTADOS_ACTIVOS, PENDIENTE, BloqueoAgenda, Cita, DiaSinServicio,
                        HistorialCita, HorarioDia, Mascota, Servicio, Usuario)
from app.services import ajustes


@dataclass
class ReglasAgenda:
    espacio_min: int
    cupo: int
    anticipacion_min: int


@dataclass
class Horario:
    inicio: datetime
    libre: bool
    motivo: str = ""

    @property
    def hora(self) -> str:
        return tiempo.hora_txt(self.inicio)


# Punto de prueba: permite simular una pausa entre la revisión del cupo y el registro.
_despues_de_revisar = None


def reglas(db: Session) -> ReglasAgenda:
    return ReglasAgenda(
        espacio_min=max(5, ajustes.obtener_int(db, "duracion_espacio_min")),
        cupo=max(1, ajustes.obtener_int(db, "cupo_por_espacio")),
        anticipacion_min=max(0, ajustes.obtener_int(db, "anticipacion_min")),
    )


def motivo_sin_servicio(db: Session, fecha: date) -> str | None:
    """Devuelve por qué no hay servicio ese día, o None si sí hay."""
    dia = db.scalar(select(DiaSinServicio).where(DiaSinServicio.fecha == fecha))
    if dia:
        return f"Día sin servicio: {dia.motivo}" if dia.motivo else "Día sin servicio"
    horario = db.get(HorarioDia, fecha.weekday())
    if not horario or not horario.abierto or not horario.apertura or not horario.cierre:
        return "La clínica está cerrada ese día"
    return None


def horario_del_dia(db: Session, fecha: date) -> tuple[datetime, datetime] | None:
    if motivo_sin_servicio(db, fecha):
        return None
    horario = db.get(HorarioDia, fecha.weekday())
    return datetime.combine(fecha, horario.apertura), datetime.combine(fecha, horario.cierre)


def espacios_necesarios(servicio: Servicio, espacio_min: int) -> int:
    return max(1, math.ceil(servicio.duracion_min / espacio_min))


def citas_activas(db: Session, desde: datetime, hasta: datetime, excluir_id: int | None = None,
                  bloquear: bool = False) -> list[Cita]:
    """Citas que ocupan lugar y se traslapan con [desde, hasta)."""
    consulta = select(Cita).where(Cita.estado.in_(ESTADOS_ACTIVOS), Cita.inicio < hasta, Cita.fin > desde)
    if excluir_id:
        consulta = consulta.where(Cita.id != excluir_id)
    if bloquear:
        consulta = consulta.with_for_update()
    return list(db.scalars(consulta))


def _ocupados(citas: list[Cita], inicio: datetime, fin: datetime) -> int:
    return sum(1 for c in citas if c.inicio < fin and c.fin > inicio)


def _limite_inicio(r: ReglasAgenda, para_chat: bool) -> datetime:
    ahora = tiempo.ahora()
    if para_chat:
        return ahora + timedelta(minutes=r.anticipacion_min)
    # El personal puede registrar una cita en el espacio que está corriendo.
    return ahora - timedelta(minutes=r.espacio_min) + timedelta(seconds=1)


def horarios_del_dia(db: Session, fecha: date, servicio: Servicio, *, para_chat: bool,
                     excluir_cita_id: int | None = None) -> list[Horario]:
    """Todos los inicios posibles del día, marcando cuáles están libres."""
    rango = horario_del_dia(db, fecha)
    if not rango:
        return []
    apertura, cierre = rango
    r = reglas(db)
    paso = timedelta(minutes=r.espacio_min)
    n = espacios_necesarios(servicio, r.espacio_min)
    limite = _limite_inicio(r, para_chat)
    citas = citas_activas(db, apertura, cierre, excluir_cita_id)

    resultado = []
    inicio = apertura
    while inicio + paso * n <= cierre:
        motivo = ""
        if inicio < limite:
            motivo = "Ya no se puede agendar en este horario"
        else:
            for i in range(n):
                desde = inicio + paso * i
                if _ocupados(citas, desde, desde + paso) >= r.cupo:
                    motivo = "Ocupado"
                    break
        resultado.append(Horario(inicio=inicio, libre=not motivo, motivo=motivo))
        inicio += paso
    return resultado


def dias_con_lugar(db: Session, servicio: Servicio, cuantos: int, buscar_dias: int = 30) -> list[date]:
    """Próximos días que tienen al menos un horario libre para el chat."""
    dias = []
    fecha = tiempo.hoy()
    for _ in range(buscar_dias):
        if any(h.libre for h in horarios_del_dia(db, fecha, servicio, para_chat=True)):
            dias.append(fecha)
            if len(dias) >= cuantos:
                break
        fecha += timedelta(days=1)
    return dias


def validar_horario(db: Session, servicio: Servicio, inicio: datetime, *, para_chat: bool,
                    excluir_cita_id: int | None = None, bloquear: bool = False) -> datetime:
    """Revisa todas las reglas y devuelve la hora de fin. Lanza ErrorNegocio si no se puede."""
    if not servicio.agendable:
        raise ErrorNegocio(f"{servicio.nombre} no se agenda por cita. Comunícate con la clínica.")
    motivo = motivo_sin_servicio(db, inicio.date())
    if motivo:
        raise ErrorNegocio(f"{motivo}. Elige otro día.")
    apertura, cierre = horario_del_dia(db, inicio.date())
    r = reglas(db)
    paso = timedelta(minutes=r.espacio_min)
    n = espacios_necesarios(servicio, r.espacio_min)
    fin = inicio + paso * n

    desfase = (inicio - apertura).total_seconds() / 60
    if inicio < apertura or desfase % r.espacio_min != 0:
        raise ErrorNegocio("Ese horario no corresponde a la agenda de la clínica.")
    if fin > cierre:
        raise ErrorNegocio(f"{servicio.nombre} necesita {servicio.duracion_min} minutos y no alcanza antes del cierre.")
    if inicio < _limite_inicio(r, para_chat):
        if para_chat and r.anticipacion_min:
            raise ErrorNegocio(f"Las citas se agendan con al menos {_txt_minutos(r.anticipacion_min)} de anticipación.")
        raise ErrorNegocio("Ese horario ya pasó.")

    citas = citas_activas(db, inicio, fin, excluir_cita_id, bloquear=bloquear)
    for i in range(n):
        desde = inicio + paso * i
        if _ocupados(citas, desde, desde + paso) >= r.cupo:
            raise ErrorNegocio(f"El horario de las {tiempo.hora_txt(inicio)} ya no tiene lugar. Elige otro, por favor.")
    return fin


def _txt_minutos(minutos: int) -> str:
    if minutos % 1440 == 0:
        dias = minutos // 1440
        return "1 día" if dias == 1 else f"{dias} días"
    if minutos % 60 == 0:
        horas = minutos // 60
        return "1 hora" if horas == 1 else f"{horas} horas"
    return f"{minutos} minutos"


def bloquear_agenda(db: Session) -> None:
    """Toma el candado de la agenda hasta el commit o rollback de la transacción.

    Se actualiza una fila fija: en MySQL el UPDATE bloquea esa fila y en SQLite
    toma el candado de escritura de la base. Así dos reservas no pueden revisar
    el cupo al mismo tiempo. Debe llamarse ANTES de crear o modificar registros
    de la reserva: si la transacción solo había leído, se cierra primero para que
    la revisión de cupo vea los datos más recientes.
    """
    if db.info.get("agenda_bloqueada"):
        return
    if db.in_transaction():
        if db.new or db.dirty or db.deleted:
            raise RuntimeError("bloquear_agenda debe llamarse antes de modificar registros")
        db.commit()
    db.execute(update(BloqueoAgenda).where(BloqueoAgenda.id == 1)
               .values(contador=BloqueoAgenda.contador + 1))
    db.info["agenda_bloqueada"] = True


@event.listens_for(Session, "after_transaction_end")
def _soltar_bloqueo(session: Session, transaccion) -> None:
    if transaccion.parent is None:
        session.info.pop("agenda_bloqueada", None)


def reservar(db: Session, *, mascota: Mascota, servicio: Servicio, inicio: datetime, origen: str,
             estado: str = PENDIENTE, usuario: Usuario | None = None, notas: str = "") -> Cita:
    """Revisa el cupo y registra la cita en la misma transacción. No hace commit."""
    bloquear_agenda(db)
    fin = validar_horario(db, servicio, inicio, para_chat=(origen == "chat"), bloquear=True)
    if _despues_de_revisar:
        _despues_de_revisar()
    cita = Cita(mascota=mascota, servicio=servicio, inicio=inicio, fin=fin, estado=estado,
                origen=origen, notas=notas)
    db.add(cita)
    quien = "el asistente del sitio" if origen == "chat" else "el personal"
    db.add(HistorialCita(cita=cita, accion="registrada", usuario=usuario,
                         detalle=f"Registrada por {quien} para el {tiempo.fecha_larga(inicio.date())}, {tiempo.hora_txt(inicio)}"))
    db.flush()
    return cita


def mover(db: Session, cita: Cita, nuevo_inicio: datetime, usuario: Usuario | None) -> None:
    """Cambia el horario de una cita revisando el cupo sin contarse a sí misma. No hace commit."""
    bloquear_agenda(db)
    fin = validar_horario(db, cita.servicio, nuevo_inicio, para_chat=False,
                          excluir_cita_id=cita.id, bloquear=True)
    anterior = f"{tiempo.fecha_larga(cita.inicio.date())}, {tiempo.hora_txt(cita.inicio)}"
    cita.inicio, cita.fin = nuevo_inicio, fin
    db.add(HistorialCita(cita=cita, accion="reprogramada", usuario=usuario,
                         detalle=f"Antes: {anterior}. Ahora: {tiempo.fecha_larga(nuevo_inicio.date())}, {tiempo.hora_txt(nuevo_inicio)}"))
    db.flush()

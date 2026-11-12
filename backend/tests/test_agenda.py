"""Reglas de la agenda: espacios, cupo, anticipación, días sin servicio y doble reserva."""
import threading
import time as reloj
from datetime import date, datetime

import pytest

from app.errores import ErrorNegocio
from app.models import CANCELADA, REPROGRAMADA, Cita, DiaSinServicio, Mascota, Servicio, Usuario
from app.services import agenda, ajustes, citas

from .conftest import mascota_de_prueba, servicio

MIERCOLES = date(2026, 11, 4)


def reservar(db, mascota, clave, hora, minuto=0, origen="personal", dia=MIERCOLES):
    cita = agenda.reservar(db, mascota=mascota, servicio=servicio(db, clave),
                           inicio=datetime.combine(dia, datetime.min.time()).replace(hour=hora, minute=minuto),
                           origen=origen)
    db.commit()
    return cita


def libres(db, clave, dia=MIERCOLES, para_chat=True):
    return [h.hora for h in agenda.horarios_del_dia(db, dia, servicio(db, clave), para_chat=para_chat) if h.libre]


def test_espacios_de_30_minutos_en_horario_inicial(db):
    horas = libres(db, "consulta")
    assert horas[0] == "9:00" and horas[1] == "9:30"
    assert horas[-1] == "18:30"          # cierra a las 19:00
    assert len(horas) == 20


def test_sabado_cierra_a_las_15_y_domingo_no_hay_servicio(db):
    assert libres(db, "consulta", date(2026, 11, 7))[-1] == "14:30"
    assert libres(db, "consulta", date(2026, 11, 8)) == []


def test_servicio_largo_ocupa_espacios_seguidos(db):
    mascota = mascota_de_prueba(db)
    cita = reservar(db, mascota, "estetica", 10)
    assert (cita.fin - cita.inicio).seconds == 3600
    # La estética no puede empezar a las 18:30 porque no alcanza antes del cierre
    assert "18:30" not in libres(db, "estetica")
    assert "18:00" in libres(db, "estetica")


def test_cupo_maximo_de_dos_citas_por_espacio(db):
    mascota = mascota_de_prueba(db)
    reservar(db, mascota, "consulta", 10)
    assert "10:00" in libres(db, "consulta")
    reservar(db, mascota, "vacunacion", 10)
    assert "10:00" not in libres(db, "consulta")
    with pytest.raises(ErrorNegocio, match="ya no tiene lugar"):
        reservar(db, mascota, "consulta", 10)


def test_servicio_largo_no_cabe_si_un_espacio_intermedio_esta_lleno(db):
    mascota = mascota_de_prueba(db)
    reservar(db, mascota, "consulta", 10, 30)
    reservar(db, mascota, "consulta", 10, 30)
    # Estética a las 10:00 necesita 10:00 y 10:30; 10:30 está lleno
    assert "10:00" not in libres(db, "estetica")
    assert "10:00" in libres(db, "consulta")


def test_cupo_configurable(db):
    ajustes.guardar(db, "cupo_por_espacio", 1)
    db.commit()
    mascota = mascota_de_prueba(db)
    reservar(db, mascota, "consulta", 10)
    assert "10:00" not in libres(db, "consulta")


def test_espacio_configurable(db):
    ajustes.guardar(db, "duracion_espacio_min", 60)
    db.commit()
    horas = libres(db, "consulta")
    assert horas[:2] == ["9:00", "10:00"]


def test_anticipacion_minima_de_dos_horas_para_el_chat(db):
    hoy = date(2026, 11, 3)  # son las 8:00
    horas = libres(db, "consulta", hoy)
    assert horas[0] == "10:00"
    # El personal sí puede registrar desde la apertura
    assert libres(db, "consulta", hoy, para_chat=False)[0] == "9:00"
    with pytest.raises(ErrorNegocio, match="anticipación"):
        reservar(db, mascota_de_prueba(db), "consulta", 9, 30, origen="chat", dia=hoy)


def test_dia_sin_servicio(db):
    db.add(DiaSinServicio(fecha=MIERCOLES, motivo="Capacitación"))
    db.commit()
    assert libres(db, "consulta") == []
    with pytest.raises(ErrorNegocio, match="Capacitación"):
        reservar(db, mascota_de_prueba(db), "consulta", 10)


def test_servicios_que_no_se_agendan(db):
    for clave in ("hospitalizacion", "medicamentos", "cremacion"):
        with pytest.raises(ErrorNegocio, match="no se agenda"):
            reservar(db, mascota_de_prueba(db, telefono=f"65600000{len(clave):02d}"), clave, 10)


def test_cancelar_libera_el_lugar_y_guarda_motivo(db):
    mascota = mascota_de_prueba(db)
    admin = db.query(Usuario).filter_by(usuario="admin").one()
    reservar(db, mascota, "consulta", 10)
    cita = reservar(db, mascota, "consulta", 10)
    with pytest.raises(ErrorNegocio, match="motivo"):
        citas.cancelar(db, cita, "  ", admin)
    citas.cancelar(db, cita, "No se presentó", admin)
    assert cita.estado == CANCELADA and cita.motivo_cancelacion == "No se presentó"
    assert "10:00" in libres(db, "consulta")


def test_reprogramar_revisa_cupo_sin_contarse_a_si_misma(db):
    mascota = mascota_de_prueba(db)
    admin = db.query(Usuario).filter_by(usuario="admin").one()
    cita = reservar(db, mascota, "estetica", 10)       # 10:00-11:00
    reservar(db, mascota, "consulta", 12)
    reservar(db, mascota, "consulta", 12)
    with pytest.raises(ErrorNegocio, match="ya no tiene lugar"):
        citas.reprogramar(db, cita, datetime(2026, 11, 4, 11, 30), admin)  # 12:00 está lleno
    assert cita.inicio == datetime(2026, 11, 4, 10, 0)
    citas.reprogramar(db, cita, datetime(2026, 11, 4, 10, 30), admin)    # se traslapa consigo misma
    assert cita.estado == REPROGRAMADA
    assert cita.fin == datetime(2026, 11, 4, 11, 30)
    assert [h.accion for h in cita.historial] == ["registrada", "reprogramada"]


def test_doble_reserva_concurrente_solo_una_toma_el_ultimo_lugar(Sesion, db, monkeypatch):
    """Dos reservas al mismo tiempo por el último lugar: solo una debe lograrlo."""
    mascota_id = mascota_de_prueba(db).id
    reservar(db, db.get(Mascota, mascota_id), "consulta", 10)   # queda 1 lugar a las 10:00
    db.close()

    # Pausa entre revisar el cupo y registrar: sin el candado ambas pasarían la revisión.
    monkeypatch.setattr(agenda, "_despues_de_revisar", lambda: reloj.sleep(0.3))
    barrera = threading.Barrier(2)
    resultados = []

    def intentar():
        sesion = Sesion()
        try:
            mascota = sesion.get(Mascota, mascota_id)
            consulta = sesion.query(Servicio).filter_by(clave="consulta").one()
            sesion.rollback()          # que la reserva empiece su propia transacción
            barrera.wait()
            agenda.reservar(sesion, mascota=mascota, servicio=consulta,
                            inicio=datetime(2026, 11, 4, 10, 0), origen="chat")
            sesion.commit()
            resultados.append("ok")
        except ErrorNegocio:
            sesion.rollback()
            resultados.append("sin lugar")
        finally:
            sesion.close()

    hilos = [threading.Thread(target=intentar) for _ in range(2)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join(timeout=30)

    assert sorted(resultados) == ["ok", "sin lugar"]
    sesion = Sesion()
    total = sesion.query(Cita).filter(Cita.inicio == datetime(2026, 11, 4, 10, 0)).count()
    sesion.close()
    assert total == 2

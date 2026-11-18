"""Configuración común de las pruebas.

Cada prueba usa su propia base SQLite en una carpeta temporal y una hora
fija: martes 3 de noviembre de 2026, 8:00 (la clínica abre a las 9:00).
"""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import tiempo
from app.database import Base, crear_engine, get_db
from app.datos_iniciales import cargar_catalogos
from app.models import ROL_ADMIN, ROL_OPERATIVO, Mascota, Propietario, Servicio, Usuario
from app.security import hash_password

AHORA = datetime(2026, 11, 3, 8, 0)
PASSWORD = "clave-segura-123"


@pytest.fixture(autouse=True)
def hora_fija():
    tiempo.fijar_ahora(AHORA)
    yield
    tiempo.fijar_ahora(None)


@pytest.fixture
def engine(tmp_path):
    engine = crear_engine(f"sqlite:///{tmp_path / 'prueba.db'}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def Sesion(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(Sesion):
    sesion = Sesion()
    cargar_catalogos(sesion)
    sesion.add_all([
        Usuario(nombre="Administración", usuario="admin", password_hash=hash_password(PASSWORD), rol=ROL_ADMIN),
        Usuario(nombre="MVZ Laura Ríos", usuario="lrios", password_hash=hash_password(PASSWORD), rol=ROL_OPERATIVO),
        Usuario(nombre="MVZ Ernesto Silva", usuario="esilva", password_hash=hash_password(PASSWORD),
                rol=ROL_OPERATIVO, activo=False),
    ])
    sesion.commit()
    yield sesion
    sesion.close()


@pytest.fixture
def client(Sesion, db):
    from app.main import app

    def _db():
        sesion = Sesion()
        try:
            yield sesion
        finally:
            sesion.close()

    app.dependency_overrides[get_db] = _db
    with TestClient(app) as cliente:
        yield cliente
    app.dependency_overrides.clear()


def entrar(cliente: TestClient, usuario: str, password: str = PASSWORD):
    pagina = cliente.get("/login")
    token = csrf_de(pagina.text)
    return cliente.post("/login", data={"usuario": usuario, "password": password, "csrf_token": token},
                        follow_redirects=False)


def csrf_de(html: str) -> str:
    marca = 'name="csrf_token" value="'
    inicio = html.index(marca) + len(marca)
    return html[inicio:html.index('"', inicio)]


def servicio(db, clave: str) -> Servicio:
    return db.query(Servicio).filter_by(clave=clave).one()


def mascota_de_prueba(db, nombre="Max", telefono="6562147790") -> Mascota:
    propietario = Propietario(nombre="Sofía Hernández", telefono=telefono)
    mascota = Mascota(nombre=nombre, especie="Perro")
    propietario.mascotas.append(mascota)
    db.add(propietario)
    db.commit()
    return mascota

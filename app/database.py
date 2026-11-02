"""Conexión a la base de datos con SQLAlchemy.

Para cambiar a MySQL basta con modificar DATABASE_URL; las opciones
específicas de SQLite solo se aplican cuando la URL empieza con "sqlite".
"""
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import obtener_ajustes


class Base(DeclarativeBase):
    pass


def crear_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(engine, "connect")
        def _pragmas(conexion, _registro):
            # El controlador sqlite3 abre la transacción con la primera escritura;
            # ver agenda.bloquear_agenda para el candado de las reservas.
            cursor = conexion.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


engine = crear_engine(obtener_ajustes().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

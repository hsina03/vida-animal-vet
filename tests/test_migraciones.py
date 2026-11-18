"""La migración de Alembic crea exactamente las tablas de los modelos."""
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.database import Base, crear_engine


def test_migraciones_coinciden_con_los_modelos(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrada.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = crear_engine(url)
    with engine.connect() as conexion:
        diferencias = compare_metadata(MigrationContext.configure(conexion), Base.metadata)
    engine.dispose()
    assert diferencias == []

"""Configuración de Alembic: usa DATABASE_URL del .env y los modelos de app.models."""
from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (registra las tablas)
from app.config import obtener_ajustes
from app.database import Base, crear_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def obtener_url() -> str:
    return config.get_main_option("sqlalchemy.url") or obtener_ajustes().database_url


def run_migrations_offline() -> None:
    url = obtener_url()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      render_as_batch=url.startswith("sqlite"))
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = obtener_url()
    engine = crear_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=url.startswith("sqlite"))
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

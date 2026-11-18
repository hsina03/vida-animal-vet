"""Configuración leída de variables de entorno o del archivo .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str = "solo-para-desarrollo-cambiar"
    database_url: str = "sqlite:///./vida_animal.db"
    cookie_segura: bool = False
    login_max_intentos: int = 5
    login_bloqueo_minutos: int = 15
    zona_horaria: str = "America/Ciudad_Juarez"

    admin_usuario: str = "admin"
    admin_nombre: str = "Administración Vida Animal II"
    admin_password: str = ""
    operativo_usuario: str = "lrios"
    operativo_nombre: str = "MVZ Laura Ríos"
    operativo_password: str = ""


@lru_cache
def obtener_ajustes() -> Ajustes:
    return Ajustes()

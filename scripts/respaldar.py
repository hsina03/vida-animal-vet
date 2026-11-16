"""Respaldo de toda la base de datos en un archivo JSON.

Uso (con DATABASE_URL apuntando a la base que quieres respaldar):

    python scripts/respaldar.py

Crea respaldos/vida_animal_AAAA-MM-DD_HHMM.json con todas las tablas. Las fotos se guardan en base64.
Funciona igual con SQLite, PostgreSQL (Neon) o MySQL. Guarda el archivo en un lugar seguro: contiene
datos personales de los clientes.
"""
import base64
import json
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app import models  # noqa: E402,F401
from app.database import Base, engine  # noqa: E402


def a_json(valor):
    if isinstance(valor, (datetime, date, time)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, bytes):
        return base64.b64encode(valor).decode()
    return valor


def main() -> None:
    datos = {"creado": datetime.now().isoformat(timespec="seconds"), "tablas": {}}
    with engine.connect() as conexion:
        for tabla in Base.metadata.sorted_tables:
            filas = conexion.execute(select(tabla)).mappings().all()
            datos["tablas"][tabla.name] = [{k: a_json(v) for k, v in fila.items()} for fila in filas]
    carpeta = Path("respaldos")
    carpeta.mkdir(exist_ok=True)
    archivo = carpeta / f"vida_animal_{datetime.now():%Y-%m-%d_%H%M}.json"
    archivo.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(f) for f in datos["tablas"].values())
    print(f"Respaldo guardado en {archivo} ({total} registros).")


if __name__ == "__main__":
    main()

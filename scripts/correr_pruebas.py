"""Corre todas las pruebas y guarda la evidencia en docs/pruebas/evidencia/.

Uso (con el entorno virtual activo, desde la carpeta del proyecto):

    python scripts/correr_pruebas.py

Genera tres archivos:
- resultado-pruebas.txt  salida completa de pytest, prueba por prueba
- reporte-pruebas.xml    reporte JUnit (lo leen GitHub y otras herramientas)
- resumen.md             fecha, equipo, totales y lista de pruebas con su resultado
"""
import os
import platform
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "docs" / "pruebas" / "evidencia"


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    xml = SALIDA / "reporte-pruebas.xml"
    inicio = datetime.now()
    proceso = subprocess.run(
        [sys.executable, "-m", "pytest", "-v", "-p", "no:cacheprovider", f"--junitxml={xml}"],
        cwd=RAIZ, env={**os.environ, "PYTHONUTF8": "1"}, capture_output=True, text=True, encoding="utf-8", errors="replace")
    salida = proceso.stdout + proceso.stderr
    (SALIDA / "resultado-pruebas.txt").write_text(salida, encoding="utf-8")
    print(salida)

    raiz = ET.parse(xml).getroot()
    suite = raiz if raiz.tag == "testsuite" else raiz.find("testsuite")
    total = int(suite.get("tests", 0))
    fallas = int(suite.get("failures", 0)) + int(suite.get("errors", 0))
    omitidas = int(suite.get("skipped", 0))
    filas = []
    for caso in suite.iter("testcase"):
        archivo = caso.get("classname", "").replace("tests.", "")
        if caso.find("failure") is not None or caso.find("error") is not None:
            estado = "Falló"
        elif caso.find("skipped") is not None:
            estado = "Omitida"
        else:
            estado = "Aprobada"
        filas.append(f"| {archivo} | `{caso.get('name')}` | {estado} | {float(caso.get('time', 0)):.2f} s |")

    resumen = [
        "# Evidencia de ejecución de pruebas",
        "",
        f"- **Fecha:** {inicio:%d/%m/%Y %H:%M}",
        f"- **Equipo:** {platform.system()} {platform.release()}, Python {platform.python_version()}",
        f"- **Comando:** `python scripts/correr_pruebas.py` (ejecuta `pytest -v`)",
        f"- **Resultado:** {total - fallas - omitidas} aprobadas, {fallas} con falla, {omitidas} omitidas, de {total} pruebas",
        f"- **Duración:** {float(suite.get('time', 0)):.1f} s",
        "",
        "| Archivo | Prueba | Resultado | Tiempo |",
        "|---|---|---|---|",
        *filas,
        "",
    ]
    (SALIDA / "resumen.md").write_text("\n".join(resumen), encoding="utf-8")
    print(f"\nEvidencia guardada en {SALIDA.relative_to(RAIZ)}")
    return proceso.returncode


if __name__ == "__main__":
    sys.exit(main())

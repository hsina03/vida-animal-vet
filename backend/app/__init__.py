"""Backend de Vida Animal II (FastAPI).

El asistente vive en la carpeta chatbot/ del repositorio; se agrega al path
para poder importarlo como `asistente`.
"""
import sys
from pathlib import Path

_CHATBOT = Path(__file__).resolve().parents[2] / "chatbot"
if str(_CHATBOT) not in sys.path:
    sys.path.insert(0, str(_CHATBOT))

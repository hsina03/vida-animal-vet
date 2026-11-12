"""Análisis sencillo del texto que escribe la persona (sin IA externa)."""
import re
import unicodedata


def normalizar(texto: str) -> str:
    """Minúsculas, sin acentos y con espacios simples."""
    sin_acentos = unicodedata.normalize("NFKD", texto or "")
    sin_acentos = "".join(c for c in sin_acentos if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w\s:]", " ", sin_acentos.lower()).split())


_URGENCIAS = [
    r"\burgen(te|cia)s?\b", r"\bemergencia", r"\bno respira", r"\bsangr(a|ando|e|o)\b",
    r"\benvenen", r"\bconvulsi", r"\batropell", r"\bse desmay", r"\bse ahoga",
    r"\bcomi\w*\b.*\bchocolate\b", r"\bchocolate\b.*\bcomi\w*\b",
]
_PIDE_PERSONAL = [
    r"\bhablar con\b", r"\bhumano\b", r"\buna persona\b", r"\bel personal\b", r"\bun doctor\b",
    r"\bel doctor\b", r"\bveterinari[oa]\b.*\bhablar\b", r"\brecepcion\b", r"\basesor\b",
]
_VOLVER = [r"^(menu|inicio|volver|empezar de nuevo|reiniciar)$"]


def _alguno(patrones: list[str], texto: str) -> bool:
    return any(re.search(p, texto) for p in patrones)


def es_urgencia(texto: str) -> bool:
    return _alguno(_URGENCIAS, normalizar(texto))


def pide_personal(texto: str) -> bool:
    return _alguno(_PIDE_PERSONAL, normalizar(texto))


def quiere_volver(texto: str) -> bool:
    return _alguno(_VOLVER, normalizar(texto))


def intencion_menu(texto: str) -> str | None:
    """Intención general cuando la persona escribe en lugar de tocar una opción."""
    t = normalizar(texto)
    if re.search(r"\b(cita|agendar|agenda|reservar|apartar)\b", t):
        return "agendar"
    if re.search(r"\b(horario|hora|abren|cierran|ubicacion|direccion|donde|llegar)\b", t):
        return "horario"
    if re.search(r"\b(pregunta|duda|precio|cuesta|costo|cobran)\b", t):
        return "faq"
    if re.search(r"^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)\b", t):
        return "saludo"
    if re.search(r"^(no|no gracias|gracias|nada|eso es todo|adios)$", t):
        return "fin"
    return None


def coincide(texto: str, etiqueta: str) -> bool:
    t, e = normalizar(texto), normalizar(etiqueta)
    if not t:
        return False
    return t == e or (len(t) >= 4 and (t in e or e in t))

"""Fotos de las mascotas. Se guardan en la base de datos para que no se pierdan en el hosting."""
from app.errores import ErrorNegocio

TAMANO_MAXIMO = 3 * 1024 * 1024   # 3 MB; el navegador reduce la foto antes de subirla

FIRMAS = {
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),
}


def tipo_de_imagen(contenido: bytes) -> str | None:
    """Reconoce la imagen por sus primeros bytes, sin confiar en el nombre del archivo."""
    if contenido.startswith(FIRMAS["jpeg"][0]):
        return "jpeg"
    if contenido.startswith(FIRMAS["png"][0]):
        return "png"
    if contenido.startswith(b"RIFF") and contenido[8:12] == b"WEBP":
        return "webp"
    return None


def validar_foto(contenido: bytes) -> str:
    if not contenido:
        raise ErrorNegocio("Elige una foto.")
    if len(contenido) > TAMANO_MAXIMO:
        raise ErrorNegocio("La foto pesa más de 3 MB. Elige otra o tómala con menor resolución.")
    tipo = tipo_de_imagen(contenido)
    if not tipo:
        raise ErrorNegocio("El archivo no es una foto válida. Usa JPG, PNG o WEBP.")
    return tipo

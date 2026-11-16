"""Cantidades y dinero con Decimal (nunca float) para que los totales cuadren al centavo."""
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.errores import ErrorNegocio

CENTAVO = Decimal("0.01")
CERO = Decimal("0")


def redondear(valor) -> Decimal:
    return Decimal(valor or 0).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def leer(texto, campo: str, *, minimo: Decimal = CERO, maximo: Decimal = Decimal("999999.99"),
         vacio: Decimal | None = CERO) -> Decimal:
    """Convierte lo que escribió el usuario ("1,250.50", "$300") en Decimal o lanza ErrorNegocio."""
    texto = str(texto if texto is not None else "").strip().replace("$", "").replace(",", "").replace(" ", "")
    if not texto:
        if vacio is None:
            raise ErrorNegocio(f"Escribe {campo}.")
        return vacio
    try:
        valor = Decimal(texto)
    except InvalidOperation:
        raise ErrorNegocio(f"Revisa {campo}: debe ser un número.")
    if not valor.is_finite() or valor < minimo or valor > maximo:
        raise ErrorNegocio(f"Revisa {campo}: debe estar entre {formato(minimo)} y {formato(maximo)}.")
    return redondear(valor)


def formato(valor) -> str:
    """$1,234.50"""
    valor = redondear(valor)
    signo = "-" if valor < 0 else ""
    return f"{signo}${abs(valor):,.2f}"


def cantidad(valor) -> str:
    """3, 2.5 o 0.25 (sin ceros de más)."""
    valor = redondear(valor)
    if valor == valor.to_integral():
        return f"{int(valor):,}"
    return f"{valor:,.2f}".rstrip("0").rstrip(".")

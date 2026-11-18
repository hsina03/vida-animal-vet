"""Errores de reglas de negocio con mensajes listos para mostrarse."""


class ErrorNegocio(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje

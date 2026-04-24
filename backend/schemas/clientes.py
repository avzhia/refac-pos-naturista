from pydantic import BaseModel
from typing import Optional
from datetime import date


class ClienteIn(BaseModel):
    nombre: str
    telefono: str = ""
    email: str = ""
    fecha_cumple: Optional[date] = None
    cliente_desde: date
    notas: str = ""


class ClienteOut(ClienteIn):
    id: int
    tipo: str
    activo: bool
    total_compras: int = 0
    total_gastado: float = 0.0

    class Config:
        from_attributes = True

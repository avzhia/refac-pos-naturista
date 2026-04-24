from pydantic import BaseModel
from typing import Optional


class CierreIn(BaseModel):
    tienda_id: Optional[int] = 1
    cajero: str
    fecha_apertura: Optional[str] = None
    fondo_inicial: float = 0.0
    total_efectivo: float = 0.0
    total_tarjeta: float = 0.0
    total_transferencia: float = 0.0
    total_ventas: float = 0.0
    efectivo_contado: float = 0.0
    diferencia: float = 0.0
    tickets: int = 0


class GastoIn(BaseModel):
    monto: float
    descripcion: str
    categoria: str = "Otro"
    cajero: str = ""
    tienda_id: Optional[int] = None


class GastoOut(GastoIn):
    id: int
    fecha: str = ""

    class Config:
        from_attributes = True

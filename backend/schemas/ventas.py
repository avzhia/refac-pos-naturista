from pydantic import BaseModel
from typing import Optional


class ItemIn(BaseModel):
    producto_id: int
    nombre_prod: str
    cantidad: int
    precio_unit: float
    subtotal: float


class VentaIn(BaseModel):
    cliente_id: int
    tienda_id: int
    forma_pago: str
    total: float
    cajero: str = ""
    notas: str = ""
    items: list[ItemIn]


class DevolucionIn(BaseModel):
    venta_id: int
    producto_id: int
    nombre_prod: str
    cantidad: int
    monto: float
    motivo: str = ""
    cajero: str = ""
    tienda_id: Optional[int] = 1
    regresar_inventario: bool = True
    forma_pago_regreso: str = "Efectivo"


class MermaIn(BaseModel):
    producto_id: Optional[int] = None
    nombre_prod: str
    lote_id: Optional[int] = None
    cantidad: int
    motivo: str = ""
    cajero: str = ""
    tienda_id: Optional[int] = 1

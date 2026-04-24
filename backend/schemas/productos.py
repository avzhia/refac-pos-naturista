from pydantic import BaseModel
from typing import Optional
from datetime import date


class LoteSchema(BaseModel):
    numero_lote: str
    caduca: bool = True
    fecha_caducidad: Optional[date] = None
    fecha_entrada: date
    stock: int
    costo_unitario: float = 0.0
    proveedor_id: Optional[int] = None


class LoteOut(LoteSchema):
    id: int
    producto_id: int
    proveedor_nombre: Optional[str] = None

    class Config:
        from_attributes = True


class LoteEditSchema(BaseModel):
    stock: int
    costo_unitario: float = 0.0
    fecha_entrada: date
    caduca: bool = True
    fecha_caducidad: Optional[date] = None
    proveedor_id: Optional[int] = None


class ProductoIn(BaseModel):
    nombre: str
    categoria: str
    icono: str = "🌿"
    precio: float
    stock_min: int = 5
    codigo_barras: Optional[str] = None
    marca: Optional[str] = "Genérico"
    url_ecommerce: Optional[str] = None


class ProductoOut(ProductoIn):
    id: int
    activo: bool
    lotes: list[LoteOut] = []

    class Config:
        from_attributes = True

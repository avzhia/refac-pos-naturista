from pydantic import BaseModel


class CajeroIn(BaseModel):
    nombre: str
    tienda_id: int


class CajeroOut(CajeroIn):
    id: int
    activo: bool
    tienda_nombre: str = ""

    class Config:
        from_attributes = True

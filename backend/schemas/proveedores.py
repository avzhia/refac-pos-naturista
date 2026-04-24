from pydantic import BaseModel


class ProveedorIn(BaseModel):
    nombre: str


class ProveedorOut(BaseModel):
    id: int
    nombre: str
    activo: bool

    class Config:
        from_attributes = True

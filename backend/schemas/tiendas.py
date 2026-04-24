from pydantic import BaseModel


class TiendaIn(BaseModel):
    nombre: str
    direccion: str = ""


class TiendaOut(TiendaIn):
    id: int
    activa: bool

    class Config:
        from_attributes = True

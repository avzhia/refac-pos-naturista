from pydantic import BaseModel


class CategoriaIn(BaseModel):
    nombre: str


class CategoriaOut(CategoriaIn):
    id: int
    activa: bool

    class Config:
        from_attributes = True

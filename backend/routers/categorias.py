from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Categoria, Producto
from schemas.categorias import CategoriaIn, CategoriaOut

router = APIRouter(prefix="/api/categorias", tags=["categorias"])


@router.get("")
def listar_categorias(db: Session = Depends(get_db)):
    return db.query(Categoria).filter(Categoria.activa == True).all()


@router.post("", response_model=CategoriaOut)
def crear_categoria(data: CategoriaIn, db: Session = Depends(get_db)):
    if db.query(Categoria).filter(Categoria.nombre == data.nombre).first():
        raise HTTPException(status_code=400, detail="La categoría ya existe")
    c = Categoria(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{cat_id}")
def eliminar_categoria(cat_id: int, db: Session = Depends(get_db)):
    c = db.query(Categoria).filter(Categoria.id == cat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    prods = db.query(Producto).filter(Producto.categoria == c.nombre, Producto.activo == True).count()
    if prods > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Esta categoría tiene {prods} producto(s) asignado(s) y no puede eliminarse",
        )
    c.activa = False
    db.commit()
    return {"ok": True}

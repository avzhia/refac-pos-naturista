from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Tienda
from schemas.tiendas import TiendaIn, TiendaOut

router = APIRouter(prefix="/api/tiendas", tags=["tiendas"])


@router.get("", response_model=list[TiendaOut])
def listar_tiendas(db: Session = Depends(get_db)):
    return db.query(Tienda).filter(Tienda.activa == True).all()


@router.post("", response_model=TiendaOut)
def crear_tienda(data: TiendaIn, db: Session = Depends(get_db)):
    t = Tienda(nombre=data.nombre, direccion=data.direccion, activa=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/{tienda_id}", response_model=TiendaOut)
def editar_tienda(tienda_id: int, data: TiendaIn, db: Session = Depends(get_db)):
    t = db.query(Tienda).filter(Tienda.id == tienda_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")
    t.nombre = data.nombre
    t.direccion = data.direccion
    db.commit()
    db.refresh(t)
    return t


@router.put("/{tienda_id}/desactivar")
def desactivar_tienda(tienda_id: int, db: Session = Depends(get_db)):
    t = db.query(Tienda).filter(Tienda.id == tienda_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")
    activas = db.query(Tienda).filter(Tienda.activa == True).count()
    if activas <= 1:
        raise HTTPException(status_code=400, detail="Debe haber al menos una tienda activa")
    t.activa = False
    db.commit()
    return {"ok": True}

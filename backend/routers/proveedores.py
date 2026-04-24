from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, Proveedor, Lote
from schemas.proveedores import ProveedorIn, ProveedorOut

router = APIRouter(prefix="/api/proveedores", tags=["proveedores"])


@router.get("")
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(Proveedor).filter(Proveedor.activo == True).order_by(Proveedor.nombre).all()


@router.post("")
def crear_proveedor(data: ProveedorIn, db: Session = Depends(get_db)):
    nombre_clean = data.nombre.strip()
    if not nombre_clean:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    existe = db.query(Proveedor).filter(func.lower(Proveedor.nombre) == func.lower(nombre_clean)).first()
    if existe:
        if not existe.activo:
            existe.activo = True
            existe.nombre = nombre_clean
            db.commit()
            db.refresh(existe)
            return existe
        raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")
    p = Proveedor(nombre=nombre_clean)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{prov_id}")
def editar_proveedor(prov_id: int, data: ProveedorIn, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == prov_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    p.nombre = data.nombre
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{prov_id}")
def eliminar_proveedor(prov_id: int, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == prov_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    lotes_asignados = db.query(Lote).filter(Lote.proveedor_id == prov_id).count()
    if lotes_asignados > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Este proveedor tiene {lotes_asignados} lote(s) asignado(s) y no puede eliminarse",
        )
    p.activo = False
    db.commit()
    return {"ok": True}

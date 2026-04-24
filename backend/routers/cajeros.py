from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Cajero
from schemas.cajeros import CajeroIn, CajeroOut
from schemas.admin import CajeroPinUpdate
from utils import hash_password

router = APIRouter(prefix="/api/cajeros", tags=["cajeros"])


@router.get("")
def listar_cajeros(db: Session = Depends(get_db)):
    db.expire_all()
    cajeros = db.query(Cajero).filter(Cajero.activo == True).all()
    result = []
    for c in cajeros:
        db.refresh(c)
        tiene_pin = bool(c.pin)
        result.append({
            "id": c.id, "nombre": c.nombre, "tienda_id": c.tienda_id,
            "activo": c.activo, "tienda_nombre": c.tienda.nombre if c.tienda else "",
            "tiene_pin": tiene_pin,
        })
    return result


@router.post("", response_model=CajeroOut)
def crear_cajero(data: CajeroIn, db: Session = Depends(get_db)):
    c = Cajero(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return CajeroOut(
        id=c.id, nombre=c.nombre, tienda_id=c.tienda_id,
        activo=c.activo, tienda_nombre=c.tienda.nombre if c.tienda else "",
    )


@router.put("/{cajero_id}", response_model=CajeroOut)
def editar_cajero(cajero_id: int, data: CajeroIn, db: Session = Depends(get_db)):
    c = db.query(Cajero).filter(Cajero.id == cajero_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    c.nombre = data.nombre
    c.tienda_id = data.tienda_id
    db.commit()
    db.refresh(c)
    return CajeroOut(
        id=c.id, nombre=c.nombre, tienda_id=c.tienda_id,
        activo=c.activo, tienda_nombre=c.tienda.nombre if c.tienda else "",
    )


@router.delete("/{cajero_id}")
def eliminar_cajero(cajero_id: int, db: Session = Depends(get_db)):
    c = db.query(Cajero).filter(Cajero.id == cajero_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    c.activo = False
    db.commit()
    return {"ok": True}


@router.put("/{cajero_id}/pin")
def set_pin_cajero(cajero_id: int, data: CajeroPinUpdate, db: Session = Depends(get_db)):
    c = db.query(Cajero).filter(Cajero.id == cajero_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    c.pin = hash_password(data.pin) if data.pin else None
    db.commit()
    db.refresh(c)
    return {"ok": True, "tiene_pin": bool(c.pin)}


@router.get("/verificar-pin")
def verificar_pin(cajero_id: int, pin: str, db: Session = Depends(get_db)):
    c = db.query(Cajero).filter(Cajero.id == cajero_id, Cajero.activo == True).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    if not c.pin:
        return {"ok": True, "sin_pin": True}
    if hash_password(pin) != c.pin:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    return {"ok": True}

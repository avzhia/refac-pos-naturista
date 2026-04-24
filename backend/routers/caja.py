from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, Cajero, Turno, CierreCaja, Gasto
from schemas.caja import CierreIn, GastoIn, GastoOut

router = APIRouter(tags=["caja"])


# ── Turnos ────────────────────────────────────────────────────────────────────

@router.post("/api/turnos/abrir")
def abrir_turno(data: dict, db: Session = Depends(get_db)):
    cajero_id = data.get("cajero_id")
    tienda_id = data.get("tienda_id")
    fondo_inicial = data.get("fondo_inicial", 0.0)

    if not cajero_id or not tienda_id:
        raise HTTPException(status_code=400, detail="cajero_id y tienda_id son requeridos")

    cajero = db.query(Cajero).filter(Cajero.id == cajero_id, Cajero.activo == True).first()
    if not cajero:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")

    db.query(Turno).filter(
        Turno.cajero_id == cajero_id, Turno.tienda_id == tienda_id, Turno.activo == True,
    ).update({"activo": False, "fecha_cierre": datetime.now()})

    turno = Turno(
        cajero_id=cajero_id, cajero_nombre=cajero.nombre,
        tienda_id=tienda_id, fondo_inicial=fondo_inicial,
        fecha_apertura=datetime.now(), activo=True,
    )
    db.add(turno)
    db.commit()
    db.refresh(turno)
    return {
        "ok": True, "turno_id": turno.id,
        "fondo_inicial": turno.fondo_inicial,
        "fecha_apertura": turno.fecha_apertura.isoformat(),
    }


@router.get("/api/turnos/activo")
def turno_activo(cajero_id: int, tienda_id: int, db: Session = Depends(get_db)):
    turno = (
        db.query(Turno)
        .filter(Turno.cajero_id == cajero_id, Turno.tienda_id == tienda_id, Turno.activo == True)
        .order_by(Turno.fecha_apertura.desc())
        .first()
    )
    if not turno:
        return {"activo": False}
    return {
        "activo": True, "turno_id": turno.id,
        "fondo_inicial": turno.fondo_inicial,
        "fecha_apertura": turno.fecha_apertura.isoformat(),
    }


@router.post("/api/turnos/cerrar/{turno_id}")
def cerrar_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id, Turno.activo == True).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado o ya cerrado")
    turno.activo = False
    turno.fecha_cierre = datetime.now()
    db.commit()
    return {"ok": True}


# ── Cierre de caja ────────────────────────────────────────────────────────────

@router.post("/api/cierre")
def registrar_cierre(data: CierreIn, db: Session = Depends(get_db)):
    datos = data.model_dump()
    if datos.get("fecha_apertura") and isinstance(datos["fecha_apertura"], str):
        try:
            datos["fecha_apertura"] = datetime.fromisoformat(datos["fecha_apertura"].replace("Z", ""))
        except Exception:
            datos["fecha_apertura"] = datetime.now()
    else:
        datos["fecha_apertura"] = datetime.now()

    cierre = CierreCaja(**datos)
    db.add(cierre)
    db.commit()
    db.refresh(cierre)

    db.query(Turno).filter(
        Turno.cajero_nombre == data.cajero,
        Turno.tienda_id == (data.tienda_id or 1),
        Turno.activo == True,
    ).update({"activo": False, "fecha_cierre": datetime.now()})
    db.commit()

    return {"ok": True, "cierre_id": cierre.id}


@router.get("/api/cierres")
def listar_cierres(tienda_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(CierreCaja)
    if tienda_id:
        q = q.filter(CierreCaja.tienda_id == tienda_id)
    cierres = q.order_by(CierreCaja.fecha_cierre.desc()).limit(30).all()
    return [
        {
            "id": c.id, "tienda_id": c.tienda_id, "cajero": c.cajero,
            "fecha_apertura": c.fecha_apertura.isoformat() if c.fecha_apertura else None,
            "fecha_cierre": c.fecha_cierre.isoformat() if c.fecha_cierre else None,
            "fondo_inicial": c.fondo_inicial, "total_efectivo": c.total_efectivo,
            "total_tarjeta": c.total_tarjeta, "total_transferencia": c.total_transferencia,
            "total_ventas": c.total_ventas, "efectivo_contado": c.efectivo_contado,
            "diferencia": c.diferencia, "tickets": c.tickets,
        }
        for c in cierres
    ]


# ── Gastos ────────────────────────────────────────────────────────────────────

@router.post("/api/gastos", response_model=GastoOut)
def crear_gasto(data: GastoIn, db: Session = Depends(get_db)):
    g = Gasto(**data.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return {**g.__dict__, "fecha": g.fecha.isoformat() if g.fecha else ""}


@router.get("/api/gastos")
def listar_gastos(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    tienda_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Gasto)
    if desde:
        q = q.filter(func.date(Gasto.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Gasto.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Gasto.tienda_id == tienda_id)
    gastos = q.order_by(Gasto.fecha.desc()).all()
    return [
        {
            "id": g.id, "monto": g.monto, "descripcion": g.descripcion,
            "categoria": g.categoria, "cajero": g.cajero, "tienda_id": g.tienda_id,
            "fecha": g.fecha.isoformat() if g.fecha else "",
        }
        for g in gastos
    ]


@router.delete("/api/gastos/{gasto_id}")
def eliminar_gasto(gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(Gasto).filter(Gasto.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(g)
    db.commit()
    return {"ok": True}

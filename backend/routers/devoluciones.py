from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, Devolucion, Merma, ItemVenta, Lote
from schemas.ventas import DevolucionIn, MermaIn

router = APIRouter(tags=["devoluciones"])


# ── Devoluciones ──────────────────────────────────────────────────────────────

@router.post("/api/devoluciones")
def registrar_devolucion(data: DevolucionIn, db: Session = Depends(get_db)):
    ya_devuelto = (
        db.query(func.sum(Devolucion.cantidad))
        .filter(Devolucion.venta_id == data.venta_id, Devolucion.producto_id == data.producto_id)
        .scalar() or 0
    )
    item_original = db.query(ItemVenta).filter(
        ItemVenta.venta_id == data.venta_id, ItemVenta.producto_id == data.producto_id,
    ).first()
    cantidad_original = item_original.cantidad if item_original else 0

    if ya_devuelto + data.cantidad > cantidad_original:
        disponible = cantidad_original - ya_devuelto
        raise HTTPException(
            status_code=409,
            detail=f"Solo quedan {disponible} unidad(es) por devolver de este producto en el ticket #{data.venta_id}",
        )

    dev = Devolucion(
        venta_id=data.venta_id, producto_id=data.producto_id,
        nombre_prod=data.nombre_prod, cantidad=data.cantidad,
        monto=data.monto, motivo=data.motivo, cajero=data.cajero,
        tienda_id=data.tienda_id, fecha=datetime.now(),
        forma_pago_regreso=data.forma_pago_regreso,
        regresar_inventario=data.regresar_inventario,
    )
    db.add(dev)

    if data.regresar_inventario:
        lote_dev = db.query(Lote).filter(
            Lote.producto_id == data.producto_id, Lote.numero_lote == "DEV"
        ).first()
        if lote_dev:
            lote_dev.stock += data.cantidad
            lote_dev.fecha_entrada = date.today()
        else:
            db.add(Lote(
                producto_id=data.producto_id, numero_lote="DEV",
                caduca=False, fecha_caducidad=None,
                fecha_entrada=date.today(), stock=data.cantidad, costo_unitario=0.0,
            ))

    db.commit()
    return {"ok": True}


@router.get("/api/devoluciones")
def listar_devoluciones(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    tienda_id: Optional[int] = None,
    venta_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Devolucion)
    if desde:
        q = q.filter(func.date(Devolucion.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Devolucion.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Devolucion.tienda_id == tienda_id)
    if venta_id:
        q = q.filter(Devolucion.venta_id == venta_id)
    devs = q.order_by(Devolucion.fecha.desc()).all()
    return [
        {
            "id": d.id, "venta_id": d.venta_id, "producto_id": d.producto_id,
            "nombre_prod": d.nombre_prod, "cantidad": d.cantidad, "monto": d.monto,
            "motivo": d.motivo, "cajero": d.cajero, "fecha": d.fecha.isoformat(),
            "regresar_inventario": d.regresar_inventario,
            "forma_pago_regreso": d.forma_pago_regreso or "Efectivo",
        }
        for d in devs
    ]


# ── Mermas ────────────────────────────────────────────────────────────────────

@router.post("/api/mermas")
def registrar_merma(data: MermaIn, db: Session = Depends(get_db)):
    merma = Merma(**data.model_dump(), fecha=datetime.now())
    db.add(merma)
    db.commit()
    db.refresh(merma)
    return {"ok": True, "merma_id": merma.id}


@router.get("/api/mermas")
def listar_mermas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    tienda_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Merma)
    if desde:
        q = q.filter(func.date(Merma.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Merma.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Merma.tienda_id == tienda_id)
    mermas = q.order_by(Merma.fecha.desc()).all()
    return [
        {
            "id": m.id, "fecha": m.fecha.isoformat(), "nombre_prod": m.nombre_prod,
            "lote_id": m.lote_id, "cantidad": m.cantidad, "motivo": m.motivo,
            "cajero": m.cajero, "tienda_id": m.tienda_id,
        }
        for m in mermas
    ]

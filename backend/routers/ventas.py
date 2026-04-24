from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case as sa_case, func
from sqlalchemy.orm import Session

from database import get_db, Cliente, Venta, ItemVenta, Lote
from schemas.ventas import VentaIn

router = APIRouter(prefix="/api/ventas", tags=["ventas"])


@router.get("/{venta_id}")
def get_venta_by_id(venta_id: int, db: Session = Depends(get_db)):
    v = db.query(Venta).filter(Venta.id == venta_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return {
        "id": v.id, "cliente_id": v.cliente_id,
        "cliente_nombre": v.cliente.nombre if v.cliente else "—",
        "tienda_id": v.tienda_id, "fecha": v.fecha.isoformat(),
        "forma_pago": v.forma_pago, "total": v.total, "cajero": v.cajero,
        "items": [
            {
                "nombre": i.nombre_prod, "cantidad": i.cantidad,
                "precio_unit": i.precio_unit, "subtotal": i.subtotal,
                "producto_id": i.producto_id,
            }
            for i in v.items
        ],
    }


@router.get("")
def listar_ventas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    tienda_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Venta)
    if desde:
        q = q.filter(func.date(Venta.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Venta.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Venta.tienda_id == tienda_id)
    if cliente_id:
        q = q.filter(Venta.cliente_id == cliente_id)
    ventas = q.order_by(Venta.fecha.desc()).all()
    return [
        {
            "id": v.id, "cliente_id": v.cliente_id,
            "cliente_nombre": v.cliente.nombre if v.cliente else "—",
            "tienda_id": v.tienda_id,
            "tienda_nombre": v.tienda.nombre if v.tienda else "—",
            "fecha": v.fecha.isoformat(), "forma_pago": v.forma_pago,
            "total": v.total, "cajero": v.cajero,
            "items": [
                {
                    "nombre": i.nombre_prod, "cantidad": i.cantidad,
                    "precio_unit": i.precio_unit, "subtotal": i.subtotal,
                    "producto_id": i.producto_id,
                }
                for i in v.items
            ],
        }
        for v in ventas
    ]


@router.post("")
def registrar_venta(data: VentaIn, db: Session = Depends(get_db)):
    if not db.query(Cliente).filter(Cliente.id == data.cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    venta = Venta(
        cliente_id=data.cliente_id, tienda_id=data.tienda_id,
        forma_pago=data.forma_pago, total=data.total,
        cajero=data.cajero, notas=data.notas, fecha=datetime.now(),
    )
    db.add(venta)
    db.flush()

    for item in data.items:
        lotes_peps = (
            db.query(Lote)
            .filter(Lote.producto_id == item.producto_id, Lote.stock > 0)
            .order_by(
                sa_case(
                    (Lote.numero_lote == "DEV", 2),
                    (Lote.caduca == False, 1),
                    else_=0,
                ).asc(),
                Lote.fecha_caducidad.asc(),
            )
            .all()
        )
        primer_lote_id = lotes_peps[0].id if lotes_peps else None
        primer_costo = lotes_peps[0].costo_unitario if lotes_peps else 0.0

        db.add(ItemVenta(
            venta_id=venta.id, producto_id=item.producto_id,
            nombre_prod=item.nombre_prod, cantidad=item.cantidad,
            precio_unit=item.precio_unit, subtotal=item.subtotal,
            lote_id=primer_lote_id, costo_unit=primer_costo,
        ))

        pendiente = item.cantidad
        for lote in lotes_peps:
            if pendiente <= 0:
                break
            descontar = min(lote.stock, pendiente)
            lote.stock -= descontar
            pendiente -= descontar

    db.commit()
    return {"ok": True, "venta_id": venta.id}

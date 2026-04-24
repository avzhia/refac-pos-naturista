from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, Venta, ItemVenta, Devolucion, Producto

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/resumen")
def resumen_hoy(tienda_id: Optional[int] = None, limite: int = 200, db: Session = Depends(get_db)):
    hoy = date.today()
    q = db.query(Venta).filter(func.date(Venta.fecha) == hoy)
    if tienda_id:
        q = q.filter(Venta.tienda_id == tienda_id)
    ventas = q.order_by(Venta.fecha.desc()).all()
    total = sum(v.total for v in ventas)

    por_pago = {}
    for v in ventas:
        por_pago[v.forma_pago] = por_pago.get(v.forma_pago, 0) + v.total

    conteo_prods = {}
    por_cat = {}
    por_hora = {}
    for v in ventas:
        hora = v.fecha.strftime("%H:00")
        por_hora[hora] = por_hora.get(hora, 0) + v.total
        for item in v.items:
            key = item.nombre_prod
            if key not in conteo_prods:
                conteo_prods[key] = {"nombre": item.nombre_prod, "uds": 0, "ing": 0}
            conteo_prods[key]["uds"] += item.cantidad
            conteo_prods[key]["ing"] += item.subtotal
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            cat = prod.categoria if prod else "Otros"
            por_cat[cat] = por_cat.get(cat, 0) + item.subtotal

    q_devs = db.query(Devolucion).filter(func.date(Devolucion.fecha) == hoy)
    if tienda_id:
        q_devs = q_devs.filter(Devolucion.tienda_id == tienda_id)
    total_devoluciones = sum(d.monto for d in q_devs.all())

    estrella = max(conteo_prods.values(), key=lambda x: x["uds"]) if conteo_prods else None
    top_prods = sorted(conteo_prods.values(), key=lambda x: x["uds"], reverse=True)[:5]

    ultimas = [
        {
            "hora": v.fecha.strftime("%I:%M %p"),
            "cliente_nombre": v.cliente.nombre if v.cliente else "—",
            "cajero": v.cajero or "—",
            "tienda_nombre": v.tienda.nombre if v.tienda else "—",
            "forma_pago": v.forma_pago, "total": v.total,
            "items": [
                {"nombre": i.nombre_prod, "cantidad": i.cantidad,
                 "precio_unit": i.precio_unit, "subtotal": i.subtotal}
                for i in v.items
            ],
        }
        for v in ventas[:limite]
    ]

    return {
        "fecha": hoy.isoformat(),
        "total_ventas": round(total, 2),
        "total_devoluciones": round(total_devoluciones, 2),
        "num_tickets": len(ventas),
        "ticket_promedio": round(total / len(ventas), 2) if ventas else 0,
        "por_forma_pago": por_pago,
        "por_categoria": por_cat,
        "por_hora": por_hora,
        "ultimas": ultimas,
        "estrella": estrella,
        "top_productos": top_prods,
    }


@router.get("/ventas-periodo")
def ventas_periodo(
    desde: date, hasta: date, tienda_id: Optional[int] = None, db: Session = Depends(get_db)
):
    q = db.query(Venta).filter(
        func.date(Venta.fecha) >= desde, func.date(Venta.fecha) <= hasta,
    )
    if tienda_id:
        q = q.filter(Venta.tienda_id == tienda_id)
    ventas = q.all()

    por_dia, por_pago, por_cat, conteo_prods = {}, {}, {}, {}
    for v in ventas:
        dia = v.fecha.date().isoformat()
        por_dia[dia] = por_dia.get(dia, 0) + v.total
        por_pago[v.forma_pago] = por_pago.get(v.forma_pago, 0) + v.total
        for item in v.items:
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            cat = prod.categoria if prod else "Otros"
            por_cat[cat] = por_cat.get(cat, 0) + item.subtotal
            key = item.nombre_prod
            if key not in conteo_prods:
                conteo_prods[key] = {"nombre": item.nombre_prod, "uds": 0, "ing": 0}
            conteo_prods[key]["uds"] += item.cantidad
            conteo_prods[key]["ing"] += item.subtotal

    total = sum(v.total for v in ventas)
    return {
        "total": round(total, 2),
        "num_tickets": len(ventas),
        "ticket_promedio": round(total / len(ventas), 2) if ventas else 0,
        "por_dia": por_dia, "por_forma_pago": por_pago, "por_categoria": por_cat,
        "top_uds": sorted(conteo_prods.values(), key=lambda x: x["uds"], reverse=True)[:5],
        "top_ing": sorted(conteo_prods.values(), key=lambda x: x["ing"], reverse=True)[:5],
    }


@router.get("/ganancias")
def reporte_ganancias(
    desde: date, hasta: date,
    categoria: Optional[str] = None,
    producto_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    ventas = db.query(Venta).filter(
        func.date(Venta.fecha) >= desde, func.date(Venta.fecha) <= hasta,
    ).all()
    venta_ids = [v.id for v in ventas]

    if not venta_ids:
        return {"ingresos": 0, "costo": 0, "ganancia": 0, "margen": 0, "detalle": []}

    q_items = db.query(ItemVenta).filter(ItemVenta.venta_id.in_(venta_ids))
    if producto_id:
        q_items = q_items.filter(ItemVenta.producto_id == producto_id)
    items = q_items.all()

    prods_cat = None
    if categoria:
        prods_cat = {p.id for p in db.query(Producto).filter(Producto.categoria == categoria).all()}
        items = [i for i in items if i.producto_id in prods_cat]

    q_devs = db.query(Devolucion).filter(
        func.date(Devolucion.fecha) >= desde, func.date(Devolucion.fecha) <= hasta,
    )
    if producto_id:
        q_devs = q_devs.filter(Devolucion.producto_id == producto_id)
    devs = q_devs.all()
    if prods_cat:
        devs = [d for d in devs if d.producto_id in prods_cat]

    detalle = {}
    for item in items:
        pid = item.producto_id
        if pid not in detalle:
            detalle[pid] = {"producto_id": pid, "nombre": item.nombre_prod,
                            "cantidad": 0, "ingresos": 0.0, "costo": 0.0, "devuelto": 0.0}
        detalle[pid]["cantidad"] += item.cantidad
        detalle[pid]["ingresos"] += item.subtotal
        detalle[pid]["costo"] += item.costo_unit * item.cantidad

    for dev in devs:
        pid = dev.producto_id
        if pid in detalle:
            cant = detalle[pid]["cantidad"]
            costo_unit_dev = detalle[pid]["costo"] / cant if cant > 0 else 0
            detalle[pid]["ingresos"] -= dev.monto
            detalle[pid]["costo"] -= costo_unit_dev * dev.cantidad
            detalle[pid]["cantidad"] -= dev.cantidad
            detalle[pid]["devuelto"] += dev.monto

    for d in detalle.values():
        d["ganancia"] = round(d["ingresos"] - d["costo"], 2)
        d["margen"] = round((d["ganancia"] / d["ingresos"] * 100), 2) if d["ingresos"] > 0 else 0
        d["ingresos"] = round(d["ingresos"], 2)
        d["costo"] = round(d["costo"], 2)

    total_ingresos = sum(d["ingresos"] for d in detalle.values())
    total_costo = sum(d["costo"] for d in detalle.values())
    total_ganancia = total_ingresos - total_costo

    return {
        "ingresos": round(total_ingresos, 2),
        "costo": round(total_costo, 2),
        "ganancia": round(total_ganancia, 2),
        "margen": round((total_ganancia / total_ingresos * 100), 2) if total_ingresos > 0 else 0,
        "detalle": sorted(detalle.values(), key=lambda x: x["ganancia"], reverse=True),
    }

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Producto, Lote
from schemas.productos import ProductoIn, ProductoOut, LoteSchema, LoteOut, LoteEditSchema

router = APIRouter(tags=["productos"])


# ── Productos ─────────────────────────────────────────────────────────────────

@router.get("/api/productos")
def listar_productos(db: Session = Depends(get_db)):
    productos = db.query(Producto).filter(Producto.activo == True).all()
    return [
        {
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria,
            "icono": p.icono, "precio": p.precio, "stock_min": p.stock_min,
            "codigo_barras": p.codigo_barras, "activo": p.activo,
            "marca": p.marca or "Genérico", "url_ecommerce": p.url_ecommerce,
            "lotes": [
                {
                    "id": l.id, "numero_lote": l.numero_lote, "caduca": l.caduca,
                    "fecha_caducidad": str(l.fecha_caducidad) if l.fecha_caducidad else None,
                    "fecha_entrada": str(l.fecha_entrada), "stock": l.stock,
                    "costo_unitario": l.costo_unitario, "proveedor_id": l.proveedor_id,
                    "proveedor_nombre": l.proveedor_rel.nombre if l.proveedor_rel else "",
                }
                for l in p.lotes
            ],
        }
        for p in productos
    ]


@router.post("/api/productos", response_model=ProductoOut)
def crear_producto(data: ProductoIn, db: Session = Depends(get_db)):
    prod = Producto(**data.model_dump())
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


@router.put("/api/productos/{prod_id}", response_model=ProductoOut)
def editar_producto(prod_id: int, data: ProductoIn, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.id == prod_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for k, v in data.model_dump().items():
        setattr(prod, k, v)
    db.commit()
    db.refresh(prod)
    return prod


@router.delete("/api/productos/{prod_id}")
def eliminar_producto(prod_id: int, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.id == prod_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    lotes_con_stock = db.query(Lote).filter(Lote.producto_id == prod_id, Lote.stock > 0).count()
    if lotes_con_stock > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Este producto tiene {lotes_con_stock} lote(s) con stock y no puede eliminarse",
        )
    prod.activo = False
    db.commit()
    return {"ok": True}


# ── Lotes ─────────────────────────────────────────────────────────────────────

@router.post("/api/productos/{prod_id}/lotes", response_model=LoteOut)
def agregar_lote(prod_id: int, data: LoteSchema, db: Session = Depends(get_db)):
    if not db.query(Producto).filter(Producto.id == prod_id).first():
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if data.caduca and not data.fecha_caducidad:
        raise HTTPException(status_code=400, detail="Si el producto caduca debes indicar la fecha")
    lote = Lote(producto_id=prod_id, **data.model_dump())
    db.add(lote)
    db.commit()
    db.refresh(lote)
    return lote


@router.put("/api/lotes/{lote_id}/editar", response_model=LoteOut)
def editar_lote(lote_id: int, data: LoteEditSchema, db: Session = Depends(get_db)):
    lote = db.query(Lote).filter(Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    if data.caduca and not data.fecha_caducidad:
        raise HTTPException(status_code=400, detail="Si el producto caduca debes indicar la fecha")
    lote.stock = data.stock
    lote.costo_unitario = data.costo_unitario
    lote.fecha_entrada = data.fecha_entrada
    lote.caduca = data.caduca
    lote.fecha_caducidad = data.fecha_caducidad if data.caduca else None
    lote.proveedor_id = data.proveedor_id
    db.commit()
    db.refresh(lote)
    return lote


@router.put("/api/lotes/{lote_id}/stock")
def ajustar_stock(lote_id: int, nuevo_stock: int, db: Session = Depends(get_db)):
    lote = db.query(Lote).filter(Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    lote.stock = nuevo_stock
    db.commit()
    return {"ok": True, "stock": nuevo_stock}


@router.delete("/api/lotes/{lote_id}")
def eliminar_lote(lote_id: int, db: Session = Depends(get_db)):
    lote = db.query(Lote).filter(Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    db.delete(lote)
    db.commit()
    return {"ok": True}

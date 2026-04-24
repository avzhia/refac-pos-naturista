from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Cliente, Venta, ItemVenta
from schemas.clientes import ClienteIn, ClienteOut

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).filter(Cliente.activo == True).all()
    return [
        ClienteOut(
            id=c.id, nombre=c.nombre, telefono=c.telefono, email=c.email,
            fecha_cumple=c.fecha_cumple, cliente_desde=c.cliente_desde,
            notas=c.notas, tipo=c.tipo, activo=c.activo,
            total_compras=len(c.ventas),
            total_gastado=sum(v.total for v in c.ventas),
        )
        for c in clientes
    ]


@router.post("", response_model=ClienteOut)
def crear_cliente(data: ClienteIn, db: Session = Depends(get_db)):
    cliente = Cliente(**data.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return ClienteOut(
        id=cliente.id, nombre=cliente.nombre, telefono=cliente.telefono,
        email=cliente.email, fecha_cumple=cliente.fecha_cumple,
        cliente_desde=cliente.cliente_desde, notas=cliente.notas,
        tipo=cliente.tipo, activo=cliente.activo,
        total_compras=0, total_gastado=0.0,
    )


@router.put("/{cliente_id}", response_model=ClienteOut)
def editar_cliente(cliente_id: int, data: ClienteIn, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if c.tipo == "general":
        raise HTTPException(status_code=400, detail="El cliente Público General no se puede editar")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return ClienteOut(
        id=c.id, nombre=c.nombre, telefono=c.telefono, email=c.email,
        fecha_cumple=c.fecha_cumple, cliente_desde=c.cliente_desde,
        notas=c.notas, tipo=c.tipo, activo=c.activo,
        total_compras=len(c.ventas), total_gastado=sum(v.total for v in c.ventas),
    )


@router.delete("/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if c.tipo == "general":
        raise HTTPException(status_code=400, detail="El cliente Público General no se puede eliminar")
    num_compras = db.query(Venta).filter(Venta.cliente_id == cliente_id).count()
    c.activo = False
    db.commit()
    return {"ok": True, "tenia_compras": num_compras > 0, "num_compras": num_compras}


@router.get("/{cliente_id}/ventas")
def get_ventas_cliente(cliente_id: int, db: Session = Depends(get_db)):
    ventas = (
        db.query(Venta)
        .filter(Venta.cliente_id == cliente_id)
        .order_by(Venta.fecha.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": v.id,
            "fecha": v.fecha.isoformat() if v.fecha else "",
            "total": v.total,
            "forma_pago": v.forma_pago,
            "items": [
                {"nombre": i.nombre_prod, "cantidad": i.cantidad, "precio": i.precio_unit}
                for i in db.query(ItemVenta).filter(ItemVenta.venta_id == v.id).all()
            ],
        }
        for v in ventas
    ]

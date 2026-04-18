from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel
import os

from database import crear_tablas, get_db, insertar_datos_iniciales, Gasto
from backup_db import hacer_respaldo
from database import (Producto, Lote, Cliente, Venta, ItemVenta,
                      CierreCaja, Tienda, Cajero, Categoria, Devolucion, Merma, Config, Proveedor, Turno)
import hashlib

app = FastAPI(title="TiendaNaturistaMX POS")

# CORS — permite que el index.html se comunique con el servidor
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    crear_tablas()
    db = next(get_db())
    insertar_datos_iniciales(db)
    hacer_respaldo()
    print("✓ TiendaNaturistaMX POS listo en http://localhost:8000")

app.mount("/static", StaticFiles(directory="../"), name="static")
app.mount("/css", StaticFiles(directory="../css"), name="css")
app.mount("/js",  StaticFiles(directory="../js"),  name="js")

@app.get("/")
def raiz():
    return FileResponse("../index.html")

@app.get("/mobile")
def mobile():
    return FileResponse("../mobile.html")

@app.get("/manifest.json")
def manifest():
    return FileResponse("../manifest.json", media_type="application/manifest+json")

@app.get("/sw.js")
def service_worker():
    return FileResponse("../sw.js", media_type="application/javascript")

@app.get("/favicon.ico")
def favicon():
    import os
    if os.path.exists("../logo.png"):
        return FileResponse("../logo.png", media_type="image/png")
    from fastapi.responses import Response
    return Response(status_code=204)


# ══════════════════════════════════════
#  SCHEMAS
# ══════════════════════════════════════

class LoteSchema(BaseModel):
    numero_lote: str
    caduca: bool = True
    fecha_caducidad: Optional[date] = None
    fecha_entrada: date
    stock: int
    costo_unitario: float = 0.0
    proveedor_id: Optional[int] = None

class LoteOut(LoteSchema):
    id: int
    producto_id: int
    proveedor_nombre: Optional[str] = None

    @classmethod
    def from_orm_with_proveedor(cls, lote):
        obj = cls.from_orm(lote)
        obj.proveedor_nombre = lote.proveedor_rel.nombre if lote.proveedor_rel else ""
        return obj

    class Config: from_attributes = True

class ProductoIn(BaseModel):
    nombre: str
    categoria: str
    icono: str = "🌿"
    precio: float
    stock_min: int = 5
    codigo_barras: Optional[str] = None

class ProductoOut(ProductoIn):
    id: int
    activo: bool
    codigo_barras: Optional[str] = None
    lotes: list[LoteOut] = []
    class Config: from_attributes = True

class ClienteIn(BaseModel):
    nombre: str
    telefono: str = ""
    email: str = ""
    fecha_cumple: Optional[date] = None
    cliente_desde: date
    notas: str = ""

class ClienteOut(ClienteIn):
    id: int
    tipo: str
    activo: bool
    total_compras: int = 0
    total_gastado: float = 0.0
    class Config: from_attributes = True

class ItemIn(BaseModel):
    producto_id: int
    nombre_prod: str
    cantidad: int
    precio_unit: float
    subtotal: float

class VentaIn(BaseModel):
    cliente_id: int
    tienda_id: int
    forma_pago: str
    total: float
    cajero: str = ""
    notas: str = ""
    items: list[ItemIn]

class DevolucionIn(BaseModel):
    venta_id: int
    producto_id: int
    nombre_prod: str
    cantidad: int
    monto: float
    motivo: str = ""
    cajero: str = ""
    tienda_id: int

class CierreIn(BaseModel):
    tienda_id: Optional[int] = 1
    cajero: str
    fecha_apertura: Optional[str] = None   # acepta ISO string o None
    fondo_inicial: float = 0.0
    total_efectivo: float = 0.0
    total_tarjeta: float = 0.0
    total_transferencia: float = 0.0
    total_ventas: float = 0.0
    efectivo_contado: float = 0.0
    diferencia: float = 0.0
    tickets: int = 0

class TiendaIn(BaseModel):
    nombre: str
    direccion: str = ""

class TiendaOut(TiendaIn):
    id: int
    activa: bool
    class Config: from_attributes = True

class CajeroIn(BaseModel):
    nombre: str
    tienda_id: int

class CajeroOut(CajeroIn):
    id: int
    activo: bool
    tienda_nombre: str = ""
    class Config: from_attributes = True

class CategoriaIn(BaseModel):
    nombre: str

class CategoriaOut(CategoriaIn):
    id: int
    activa: bool
    class Config: from_attributes = True


# ══════════════════════════════════════
#  ADMINISTRACIÓN — Config y seguridad
# ══════════════════════════════════════

def _hash(texto: str) -> str:
    """Hash SHA-256 simple para contraseñas."""
    return hashlib.sha256(texto.encode()).hexdigest()

class AdminSetup(BaseModel):
    password: str
    confirm: str

class AdminLogin(BaseModel):
    password: str

class CajeroConPin(BaseModel):
    nombre: str
    tienda_id: int
    pin: Optional[str] = None

class CajeroPinUpdate(BaseModel):
    pin: str


class GastoIn(BaseModel):
    monto:       float
    descripcion: str
    categoria:   str = "Otro"
    cajero:      str = ""
    tienda_id:   Optional[int] = None

class GastoOut(GastoIn):
    id:    int
    fecha: str = ""
    class Config: from_attributes = True

@app.get("/api/admin/setup-required")
def setup_required(db: Session = Depends(get_db)):
    """¿Se necesita configurar la contraseña maestra?"""
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    return {"required": cfg is None or not cfg.valor}

@app.post("/api/admin/setup")
def setup_admin(data: AdminSetup, db: Session = Depends(get_db)):
    """Configura la contraseña maestra por primera vez."""
    if data.password != data.confirm:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    # Solo se puede usar si no existe aún
    existing = db.query(Config).filter(Config.clave == "admin_password").first()
    if existing and existing.valor:
        raise HTTPException(status_code=409, detail="Ya existe una contraseña configurada")
    cfg = Config(clave="admin_password", valor=_hash(data.password))
    db.add(cfg)
    db.commit()
    return {"ok": True}

@app.post("/api/admin/login")
def admin_login(data: AdminLogin, db: Session = Depends(get_db)):
    """Verifica la contraseña maestra."""
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    if not cfg or _hash(data.password) != cfg.valor:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"ok": True}

@app.put("/api/admin/password")
def cambiar_password(data: AdminSetup, db: Session = Depends(get_db)):
    """Cambia la contraseña maestra (requiere la actual en confirm)."""
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Mínimo 4 caracteres")
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Sin contraseña configurada")
    # confirm = contraseña actual para verificar identidad
    if _hash(data.confirm) != cfg.valor:
        raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")
    cfg.valor = _hash(data.password)
    db.commit()
    return {"ok": True}

@app.put("/api/cajeros/{cajero_id}/pin")
def set_pin_cajero(cajero_id: int, data: CajeroPinUpdate, db: Session = Depends(get_db)):
    """Asigna o actualiza el PIN de un cajero."""
    c = db.query(Cajero).filter(Cajero.id == cajero_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    c.pin = _hash(data.pin) if data.pin else None
    db.commit()
    db.refresh(c)
    # Verificar que se guardó
    print(f"PIN guardado para cajero {cajero_id}: {bool(c.pin)}")
    return {"ok": True, "tiene_pin": bool(c.pin)}

@app.get("/api/cajeros/verificar-pin")
def verificar_pin(cajero_id: int, pin: str, db: Session = Depends(get_db)):
    """Verifica el PIN de un cajero al iniciar turno."""
    c = db.query(Cajero).filter(Cajero.id == cajero_id, Cajero.activo == True).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    # Si no tiene PIN configurado, acceso libre
    if not c.pin:
        return {"ok": True, "sin_pin": True}
    if _hash(pin) != c.pin:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    return {"ok": True}

# ══════════════════════════════════════
#  PROVEEDORES
# ══════════════════════════════════════

class ProveedorIn(BaseModel):
    nombre: str

class ProveedorOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    class Config: from_attributes = True

@app.get("/api/proveedores")
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(Proveedor).filter(Proveedor.activo == True).order_by(Proveedor.nombre).all()

@app.post("/api/proveedores")
def crear_proveedor(data: ProveedorIn, db: Session = Depends(get_db)):
    nombre_clean = data.nombre.strip()
    if not nombre_clean:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    existe = db.query(Proveedor).filter(
        func.lower(Proveedor.nombre) == func.lower(nombre_clean)
    ).first()
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

@app.put("/api/proveedores/{prov_id}")
def editar_proveedor(prov_id: int, data: ProveedorIn, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == prov_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    p.nombre = data.nombre
    db.commit()
    db.refresh(p)
    return p

@app.delete("/api/proveedores/{prov_id}")
def eliminar_proveedor(prov_id: int, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == prov_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    lotes_asignados = db.query(Lote).filter(Lote.proveedor_id == prov_id).count()
    if lotes_asignados > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Este proveedor tiene {lotes_asignados} lote(s) asignado(s) y no puede eliminarse"
        )
    p.activo = False
    db.commit()
    return {"ok": True}

# ══════════════════════════════════════
#  CONFIG GENERAL
# ══════════════════════════════════════

class ConfigIn(BaseModel):
    clave: str
    valor: str

@app.post("/api/admin/config")
def guardar_config(data: ConfigIn, db: Session = Depends(get_db)):
    """Guarda o actualiza un valor de configuración."""
    cfg = db.query(Config).filter(Config.clave == data.clave).first()
    if cfg:
        cfg.valor = data.valor
    else:
        cfg = Config(clave=data.clave, valor=data.valor)
        db.add(cfg)
    db.commit()
    return {"ok": True}

@app.get("/api/admin/config/{clave}")
def obtener_config(clave: str, db: Session = Depends(get_db)):
    """Obtiene un valor de configuración por clave."""
    cfg = db.query(Config).filter(Config.clave == clave).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return {"clave": cfg.clave, "valor": cfg.valor}

@app.get("/api/admin/backup")
def descargar_backup():
    """Descarga el archivo de base de datos como respaldo."""
    import os
    db_path = "./pos.db"
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    from fastapi.responses import FileResponse as FR
    fecha = datetime.now().strftime("%Y-%m-%d")
    return FR(
        path=db_path,
        filename=f"pos_backup_{fecha}.db",
        media_type="application/octet-stream"
    )

# ══════════════════════════════════════
#  LOGO
# ══════════════════════════════════════

LOGO_PATH = "../logo.png"

@app.post("/api/admin/logo")
async def subir_logo(file: UploadFile = File(...)):
    """Sube el logo de la tienda."""
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos de imagen")
    contenido = await file.read()
    with open(LOGO_PATH, "wb") as f:
        f.write(contenido)
    return {"ok": True}

@app.delete("/api/admin/logo")
def eliminar_logo():
    """Elimina el logo de la tienda."""
    import os
    if os.path.exists(LOGO_PATH):
        os.remove(LOGO_PATH)
    return {"ok": True}

# ══════════════════════════════════════
#  TIENDAS
# ══════════════════════════════════════

@app.get("/api/tiendas", response_model=list[TiendaOut])
def listar_tiendas(db: Session = Depends(get_db)):
    return db.query(Tienda).filter(Tienda.activa == True).all()

@app.post("/api/tiendas", response_model=TiendaOut)
def crear_tienda(data: TiendaIn, db: Session = Depends(get_db)):
    t = Tienda(nombre=data.nombre, direccion=data.direccion, activa=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t

@app.put("/api/tiendas/{tienda_id}", response_model=TiendaOut)
def editar_tienda(tienda_id: int, data: TiendaIn, db: Session = Depends(get_db)):
    t = db.query(Tienda).filter(Tienda.id == tienda_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")
    t.nombre = data.nombre
    t.direccion = data.direccion
    db.commit()
    db.refresh(t)
    return t

@app.put("/api/tiendas/{tienda_id}/desactivar")
def desactivar_tienda(tienda_id: int, db: Session = Depends(get_db)):
    t = db.query(Tienda).filter(Tienda.id == tienda_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tienda no encontrada")
    # Verificar que quede al menos una tienda activa
    activas = db.query(Tienda).filter(Tienda.activa == True).count()
    if activas <= 1:
        raise HTTPException(status_code=400, detail="Debe haber al menos una tienda activa")
    t.activa = False
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════
#  CAJEROS
# ══════════════════════════════════════

@app.get("/api/cajeros")
def listar_cajeros(db: Session = Depends(get_db)):
    # Expire all to force fresh data from DB
    db.expire_all()
    cajeros = db.query(Cajero).filter(Cajero.activo == True).all()
    result = []
    for c in cajeros:
        db.refresh(c)
        tiene_pin = c.pin is not None and len(c.pin) > 0
        print(f"Cajero {c.nombre} (ID:{c.id}): pin={'SET' if tiene_pin else 'NULL'}")
        result.append({
            "id": c.id, "nombre": c.nombre, "tienda_id": c.tienda_id,
            "activo": c.activo, "tienda_nombre": c.tienda.nombre if c.tienda else "",
            "tiene_pin": tiene_pin,
        })
    return result

@app.post("/api/cajeros", response_model=CajeroOut)
def crear_cajero(data: CajeroIn, db: Session = Depends(get_db)):
    c = Cajero(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return CajeroOut(
        id=c.id, nombre=c.nombre, tienda_id=c.tienda_id,
        activo=c.activo, tienda_nombre=c.tienda.nombre if c.tienda else ""
    )

@app.put("/api/cajeros/{cajero_id}", response_model=CajeroOut)
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
        activo=c.activo, tienda_nombre=c.tienda.nombre if c.tienda else ""
    )

@app.delete("/api/cajeros/{cajero_id}")
def eliminar_cajero(cajero_id: int, db: Session = Depends(get_db)):
    c = db.query(Cajero).filter(Cajero.id == cajero_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")
    c.activo = False
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════
#  CATEGORÍAS
# ══════════════════════════════════════

@app.get("/api/categorias")
def listar_categorias(db: Session = Depends(get_db)):
    return db.query(Categoria).filter(Categoria.activa == True).all()

@app.post("/api/categorias", response_model=CategoriaOut)
def crear_categoria(data: CategoriaIn, db: Session = Depends(get_db)):
    existe = db.query(Categoria).filter(Categoria.nombre == data.nombre).first()
    if existe:
        raise HTTPException(status_code=400, detail="La categoría ya existe")
    c = Categoria(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@app.delete("/api/categorias/{cat_id}")
def eliminar_categoria(cat_id: int, db: Session = Depends(get_db)):
    c = db.query(Categoria).filter(Categoria.id == cat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    prods = db.query(Producto).filter(Producto.categoria == c.nombre, Producto.activo == True).count()
    if prods > 0:
        raise HTTPException(status_code=409, detail=f"Esta categoría tiene {prods} producto(s) asignado(s) y no puede eliminarse")
    c.activa = False
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════
#  PRODUCTOS
# ══════════════════════════════════════

@app.get("/api/productos")
def listar_productos(db: Session = Depends(get_db)):
    productos = db.query(Producto).filter(Producto.activo == True).all()
    result = []
    for p in productos:
        result.append({
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria,
            "icono": p.icono, "precio": p.precio, "stock_min": p.stock_min,
            "codigo_barras": p.codigo_barras, "activo": p.activo,
            "lotes": [{
                "id": l.id, "numero_lote": l.numero_lote,
                "caduca": l.caduca,
                "fecha_caducidad": str(l.fecha_caducidad) if l.fecha_caducidad else None,
                "fecha_entrada": str(l.fecha_entrada), "stock": l.stock,
                "costo_unitario": l.costo_unitario,
                "proveedor_id": l.proveedor_id,
                "proveedor_nombre": l.proveedor_rel.nombre if l.proveedor_rel else "",
            } for l in p.lotes]
        })
    return result

@app.post("/api/productos", response_model=ProductoOut)
def crear_producto(data: ProductoIn, db: Session = Depends(get_db)):
    prod = Producto(**data.model_dump())
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod

@app.put("/api/productos/{prod_id}", response_model=ProductoOut)
def editar_producto(prod_id: int, data: ProductoIn, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.id == prod_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for k, v in data.model_dump().items():
        setattr(prod, k, v)
    db.commit()
    db.refresh(prod)
    return prod

@app.delete("/api/productos/{prod_id}")
def eliminar_producto(prod_id: int, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.id == prod_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    lotes_con_stock = db.query(Lote).filter(Lote.producto_id == prod_id, Lote.stock > 0).count()
    if lotes_con_stock > 0:
        raise HTTPException(status_code=409, detail=f"Este producto tiene {lotes_con_stock} lote(s) con stock y no puede eliminarse")
    prod.activo = False
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════
#  LOTES
# ══════════════════════════════════════

@app.post("/api/productos/{prod_id}/lotes", response_model=LoteOut)
def agregar_lote(prod_id: int, data: LoteSchema, db: Session = Depends(get_db)):
    prod = db.query(Producto).filter(Producto.id == prod_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if data.caduca and not data.fecha_caducidad:
        raise HTTPException(status_code=400, detail="Si el producto caduca debes indicar la fecha")
    lote = Lote(producto_id=prod_id, **data.model_dump())
    db.add(lote)
    db.commit()
    db.refresh(lote)
    return lote

class LoteEditSchema(BaseModel):
    stock: int
    costo_unitario: float = 0.0
    fecha_entrada: date
    caduca: bool = True
    fecha_caducidad: Optional[date] = None
    proveedor_id: Optional[int] = None

@app.put("/api/lotes/{lote_id}/editar", response_model=LoteOut)
def editar_lote(lote_id: int, data: LoteEditSchema, db: Session = Depends(get_db)):
    """Edita todos los campos de un lote existente."""
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

@app.put("/api/lotes/{lote_id}/stock")
def ajustar_stock(lote_id: int, nuevo_stock: int, db: Session = Depends(get_db)):
    lote = db.query(Lote).filter(Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    lote.stock = nuevo_stock
    db.commit()
    return {"ok": True, "stock": nuevo_stock}

@app.delete("/api/lotes/{lote_id}")
def eliminar_lote(lote_id: int, db: Session = Depends(get_db)):
    lote = db.query(Lote).filter(Lote.id == lote_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    db.delete(lote)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════
#  CLIENTES
# ══════════════════════════════════════

@app.get("/api/clientes", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    clientes = db.query(Cliente).filter(Cliente.activo == True).all()
    return [ClienteOut(
        id=c.id, nombre=c.nombre, telefono=c.telefono, email=c.email,
        fecha_cumple=c.fecha_cumple, cliente_desde=c.cliente_desde,
        notas=c.notas, tipo=c.tipo, activo=c.activo,
        total_compras=len(c.ventas),
        total_gastado=sum(v.total for v in c.ventas),
    ) for c in clientes]

@app.post("/api/clientes", response_model=ClienteOut)
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

@app.put("/api/clientes/{cliente_id}", response_model=ClienteOut)
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

@app.delete("/api/clientes/{cliente_id}")
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if c.tipo == "general":
        raise HTTPException(status_code=400, detail="El cliente Público General no se puede eliminar")
    # Verificar si tiene compras registradas
    num_compras = db.query(Venta).filter(Venta.cliente_id == cliente_id).count()
    c.activo = False
    db.commit()
    return {"ok": True, "tenia_compras": num_compras > 0, "num_compras": num_compras}


@app.get("/api/clientes/{cliente_id}/ventas")
def get_ventas_cliente(cliente_id: int, db: Session = Depends(get_db)):
    ventas = db.query(Venta).filter(
        Venta.cliente_id == cliente_id
    ).order_by(Venta.fecha.desc()).limit(50).all()
    result = []
    for v in ventas:
        items = db.query(ItemVenta).filter(ItemVenta.venta_id == v.id).all()
        result.append({
            "id":         v.id,
            "fecha":      v.fecha.isoformat() if v.fecha else "",
            "total":      v.total,
            "forma_pago": v.forma_pago,
            "items":      [{"nombre": i.nombre_prod, "cantidad": i.cantidad, "precio": i.precio_unit} for i in items],
        })
    return result


# ══════════════════════════════════════
#  VENTAS
# ══════════════════════════════════════

@app.get("/api/ventas/{venta_id}")
def get_venta_by_id(venta_id: int, db: Session = Depends(get_db)):
    v = db.query(Venta).filter(Venta.id == venta_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return {
        "id": v.id, "cliente_id": v.cliente_id,
        "cliente_nombre": v.cliente.nombre if v.cliente else "—",
        "tienda_id": v.tienda_id, "fecha": v.fecha.isoformat(),
        "forma_pago": v.forma_pago, "total": v.total, "cajero": v.cajero,
        "items": [{"nombre": i.nombre_prod, "cantidad": i.cantidad,
                   "precio_unit": i.precio_unit, "subtotal": i.subtotal,
                   "producto_id": i.producto_id} for i in v.items],
    }

@app.get("/api/ventas")
def listar_ventas(
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    tienda_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db)
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
    return [{
        "id": v.id,
        "cliente_id": v.cliente_id,
        "cliente_nombre": v.cliente.nombre if v.cliente else "—",
        "tienda_id": v.tienda_id,
        "fecha": v.fecha.isoformat(),
        "forma_pago": v.forma_pago,
        "total": v.total,
        "cajero": v.cajero,
        "items": [{"nombre": i.nombre_prod, "cantidad": i.cantidad,
                   "precio_unit": i.precio_unit, "subtotal": i.subtotal,
                   "producto_id": i.producto_id}
                  for i in v.items],
    } for v in ventas]

@app.post("/api/ventas")
def registrar_venta(data: VentaIn, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == data.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    venta = Venta(
        cliente_id=data.cliente_id,
        tienda_id=data.tienda_id,
        forma_pago=data.forma_pago,
        total=data.total,
        cajero=data.cajero,
        notas=data.notas,
        fecha=datetime.now(),
    )
    db.add(venta)
    db.flush()

    for item in data.items:
        # Determinar lote_id y costo_unit del primer lote PEPS antes de descontar
        from sqlalchemy import case as sa_case
        lotes_peps = db.query(Lote).filter(
            Lote.producto_id == item.producto_id,
            Lote.stock > 0
        ).order_by(
            sa_case((Lote.numero_lote == "DEV", 2), (Lote.caduca == False, 1), else_=0).asc(),
            Lote.fecha_caducidad.asc()
        ).all()
        primer_lote_id   = lotes_peps[0].id            if lotes_peps else None
        primer_costo     = lotes_peps[0].costo_unitario if lotes_peps else 0.0

        db.add(ItemVenta(
            venta_id=venta.id,
            producto_id=item.producto_id,
            nombre_prod=item.nombre_prod,
            cantidad=item.cantidad,
            precio_unit=item.precio_unit,
            subtotal=item.subtotal,
            lote_id=primer_lote_id,
            costo_unit=primer_costo,
        ))
        # Descontar stock PEPS
        pendiente = item.cantidad
        lotes = lotes_peps
        for lote in lotes:
            if pendiente <= 0:
                break
            descontar = min(lote.stock, pendiente)
            lote.stock -= descontar
            pendiente -= descontar

    db.commit()
    return {"ok": True, "venta_id": venta.id}


class MermaIn(BaseModel):
    producto_id: Optional[int] = None
    nombre_prod: str
    lote_id: Optional[int] = None
    cantidad: int
    motivo: str = ""
    cajero: str = ""
    tienda_id: Optional[int] = 1

class DevolucionIn2(BaseModel):
    venta_id: int
    producto_id: int
    nombre_prod: str
    cantidad: int
    monto: float
    motivo: str = ""
    cajero: str = ""
    tienda_id: Optional[int] = 1
    regresar_inventario: bool = True
    forma_pago_regreso: str = "Efectivo"

# ══════════════════════════════════════
#  DEVOLUCIONES
# ══════════════════════════════════════

@app.post("/api/devoluciones")
def registrar_devolucion(data: DevolucionIn2, db: Session = Depends(get_db)):
    # Verificar que la cantidad a devolver no supere lo que queda por devolver
    # Suma de todas las devoluciones previas de este producto en esta venta
    ya_devuelto = db.query(func.sum(Devolucion.cantidad)).filter(
        Devolucion.venta_id == data.venta_id,
        Devolucion.producto_id == data.producto_id,
    ).scalar() or 0

    # Cantidad original comprada en esta venta
    item_original = db.query(ItemVenta).filter(
        ItemVenta.venta_id == data.venta_id,
        ItemVenta.producto_id == data.producto_id,
    ).first()
    cantidad_original = item_original.cantidad if item_original else 0

    if ya_devuelto + data.cantidad > cantidad_original:
        disponible = cantidad_original - ya_devuelto
        raise HTTPException(
            status_code=409,
            detail=f"Solo quedan {disponible} unidad(es) por devolver de este producto en el ticket #{data.venta_id}"
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

    # Regresar stock a lote de devolución si aplica
    if data.regresar_inventario:
        # Buscar si ya existe un lote DEV para este producto
        lote_dev = db.query(Lote).filter(
            Lote.producto_id == data.producto_id,
            Lote.numero_lote == "DEV"
        ).first()

        if lote_dev:
            # Ya existe — sumar unidades
            lote_dev.stock += data.cantidad
            lote_dev.fecha_entrada = date.today()  # Actualizar fecha para PEPS
        else:
            # Crear lote DEV nuevo para este producto
            lote_dev = Lote(
                producto_id=data.producto_id,
                numero_lote="DEV",
                caduca=False,
                fecha_caducidad=None,
                fecha_entrada=date.today(),
                stock=data.cantidad,
                costo_unitario=0.0,
            )
            db.add(lote_dev)

    db.commit()
    return {"ok": True}

@app.get("/api/devoluciones")
def listar_devoluciones(
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    tienda_id: Optional[int] = None,
    venta_id: Optional[int] = None,
    db: Session = Depends(get_db)
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
    return [{
        "id": d.id,
        "venta_id": d.venta_id,
        "producto_id": d.producto_id,
        "nombre_prod": d.nombre_prod,
        "cantidad": d.cantidad,
        "monto": d.monto,
        "motivo": d.motivo,
        "cajero": d.cajero,
        "fecha": d.fecha.isoformat(),
        "regresar_inventario": getattr(d, 'regresar_inventario', True),
        "forma_pago_regreso": getattr(d, 'forma_pago_regreso', 'Efectivo') or 'Efectivo',
    } for d in devs]


# ══════════════════════════════════════
#  MERMAS
# ══════════════════════════════════════

@app.post("/api/mermas")
def registrar_merma(data: MermaIn, db: Session = Depends(get_db)):
    merma = Merma(**data.model_dump(), fecha=datetime.now())
    db.add(merma)
    db.commit()
    db.refresh(merma)
    return {"ok": True, "merma_id": merma.id}

@app.get("/api/mermas")
def listar_mermas(desde: Optional[date] = None, hasta: Optional[date] = None,
                  tienda_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Merma)
    if desde:
        q = q.filter(func.date(Merma.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Merma.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Merma.tienda_id == tienda_id)
    mermas = q.order_by(Merma.fecha.desc()).all()
    return [{
        "id": m.id, "fecha": m.fecha.isoformat(), "nombre_prod": m.nombre_prod,
        "lote_id": m.lote_id, "cantidad": m.cantidad, "motivo": m.motivo,
        "cajero": m.cajero, "tienda_id": m.tienda_id,
    } for m in mermas]

# ══════════════════════════════════════
#  REPORTES
# ══════════════════════════════════════

@app.get("/api/reportes/resumen")
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

    # Todas las ventas del día con detalle de productos
    ultimas = [{
        "hora": v.fecha.strftime("%I:%M %p"),
        "cliente_nombre": v.cliente.nombre if v.cliente else "—",
        "cajero": v.cajero or "—",
        "forma_pago": v.forma_pago,
        "total": v.total,
        "items": [{"nombre": i.nombre_prod, "cantidad": i.cantidad,
                   "precio_unit": i.precio_unit, "subtotal": i.subtotal}
                  for i in v.items],
    } for v in ventas[:limite]]

    # Producto estrella: el más vendido en cantidad hoy
    conteo_prods = {}
    for v in ventas:
        for item in v.items:
            key = item.nombre_prod
            if key not in conteo_prods:
                conteo_prods[key] = {"nombre": item.nombre_prod, "uds": 0, "ing": 0}
            conteo_prods[key]["uds"] += item.cantidad
            conteo_prods[key]["ing"] += item.subtotal
    estrella = max(conteo_prods.values(), key=lambda x: x["uds"]) if conteo_prods else None

    # Por categoría — cruzando items con productos
    por_cat = {}
    for v in ventas:
        for item in v.items:
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            cat = prod.categoria if prod else "Otros"
            por_cat[cat] = por_cat.get(cat, 0) + item.subtotal

    # Ventas por hora para gráfica
    por_hora = {}
    for v in ventas:
        hora = v.fecha.strftime("%H:00")
        por_hora[hora] = por_hora.get(hora, 0) + v.total

    # Top productos del día
    top_prods = sorted(conteo_prods.values(), key=lambda x: x["uds"], reverse=True)[:5]

    # Total devoluciones del día
    from sqlalchemy import func as sqlfunc
    devs_hoy = db.query(Devolucion).filter(
        sqlfunc.date(Devolucion.fecha) == hoy
    )
    if tienda_id:
        devs_hoy = devs_hoy.filter(Devolucion.tienda_id == tienda_id)
    total_devoluciones = sum(d.monto for d in devs_hoy.all())

    return {
        "fecha": hoy.isoformat(),
        "total_ventas": round(total, 2),         # ventas BRUTAS
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

@app.get("/api/reportes/ventas-periodo")
def ventas_periodo(desde: date, hasta: date, tienda_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Venta).filter(
        func.date(Venta.fecha) >= desde,
        func.date(Venta.fecha) <= hasta,
    )
    if tienda_id:
        q = q.filter(Venta.tienda_id == tienda_id)
    ventas = q.all()
    por_dia = {}
    for v in ventas:
        dia = v.fecha.date().isoformat()
        por_dia[dia] = por_dia.get(dia, 0) + v.total
    total = sum(v.total for v in ventas)
    por_pago = {}
    for v in ventas:
        por_pago[v.forma_pago] = por_pago.get(v.forma_pago, 0) + v.total

    # Por categoría
    por_cat = {}
    conteo_prods = {}
    for v in ventas:
        for item in v.items:
            prod = db.query(Producto).filter(Producto.id == item.producto_id).first()
            cat = prod.categoria if prod else "Otros"
            por_cat[cat] = por_cat.get(cat, 0) + item.subtotal
            key = item.nombre_prod
            if key not in conteo_prods:
                conteo_prods[key] = {"nombre": item.nombre_prod, "uds": 0, "ing": 0}
            conteo_prods[key]["uds"] += item.cantidad
            conteo_prods[key]["ing"] += item.subtotal

    top_uds = sorted(conteo_prods.values(), key=lambda x: x["uds"], reverse=True)[:5]
    top_ing = sorted(conteo_prods.values(), key=lambda x: x["ing"], reverse=True)[:5]

    return {
        "total": round(total, 2),
        "num_tickets": len(ventas),
        "ticket_promedio": round(total / len(ventas), 2) if ventas else 0,
        "por_dia": por_dia,
        "por_forma_pago": por_pago,
        "por_categoria": por_cat,
        "top_uds": top_uds,
        "top_ing": top_ing,
    }


# ══════════════════════════════════════
#  CIERRE DE CAJA
# ══════════════════════════════════════

@app.post("/api/turnos/abrir")
def abrir_turno(data: dict, db: Session = Depends(get_db)):
    cajero_id     = data.get("cajero_id")
    tienda_id     = data.get("tienda_id")
    fondo_inicial = data.get("fondo_inicial", 0.0)

    if not cajero_id or not tienda_id:
        raise HTTPException(status_code=400, detail="cajero_id y tienda_id son requeridos")

    cajero = db.query(Cajero).filter(Cajero.id == cajero_id, Cajero.activo == True).first()
    if not cajero:
        raise HTTPException(status_code=404, detail="Cajero no encontrado")

    # Cerrar cualquier turno activo previo del mismo cajero+tienda
    db.query(Turno).filter(
        Turno.cajero_id == cajero_id,
        Turno.tienda_id == tienda_id,
        Turno.activo == True
    ).update({"activo": False, "fecha_cierre": datetime.now()})

    turno = Turno(
        cajero_id     = cajero_id,
        cajero_nombre = cajero.nombre,
        tienda_id     = tienda_id,
        fondo_inicial = fondo_inicial,
        fecha_apertura= datetime.now(),
        activo        = True
    )
    db.add(turno)
    db.commit()
    db.refresh(turno)
    return {
        "ok": True,
        "turno_id": turno.id,
        "fondo_inicial": turno.fondo_inicial,
        "fecha_apertura": turno.fecha_apertura.isoformat()
    }


@app.get("/api/turnos/activo")
def turno_activo(cajero_id: int, tienda_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(
        Turno.cajero_id == cajero_id,
        Turno.tienda_id == tienda_id,
        Turno.activo == True
    ).order_by(Turno.fecha_apertura.desc()).first()

    if not turno:
        return {"activo": False}

    return {
        "activo": True,
        "turno_id": turno.id,
        "fondo_inicial": turno.fondo_inicial,
        "fecha_apertura": turno.fecha_apertura.isoformat()
    }


@app.post("/api/turnos/cerrar/{turno_id}")
def cerrar_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id, Turno.activo == True).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado o ya cerrado")
    turno.activo       = False
    turno.fecha_cierre = datetime.now()
    db.commit()
    return {"ok": True}


@app.post("/api/cierre")
def registrar_cierre(data: CierreIn, db: Session = Depends(get_db)):
    datos = data.model_dump()
    # Parsear fecha_apertura de string a datetime si es necesario
    if datos.get('fecha_apertura') and isinstance(datos['fecha_apertura'], str):
        try:
            datos['fecha_apertura'] = datetime.fromisoformat(datos['fecha_apertura'].replace('Z',''))
        except Exception:
            datos['fecha_apertura'] = datetime.now()
    else:
        datos['fecha_apertura'] = datetime.now()
    cierre = CierreCaja(**datos)
    db.add(cierre)
    db.commit()
    db.refresh(cierre)

    # Cerrar turno activo del cajero si existe
    db.query(Turno).filter(
        Turno.cajero_nombre == data.cajero,
        Turno.tienda_id == (data.tienda_id or 1),
        Turno.activo == True
    ).update({"activo": False, "fecha_cierre": datetime.now()})
    db.commit()

    return {"ok": True, "cierre_id": cierre.id}

@app.post("/api/gastos", response_model=GastoOut)
def crear_gasto(data: GastoIn, db: Session = Depends(get_db)):
    g = Gasto(
        monto=data.monto,
        descripcion=data.descripcion,
        categoria=data.categoria,
        cajero=data.cajero,
        tienda_id=data.tienda_id,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return {**g.__dict__, "fecha": g.fecha.isoformat() if g.fecha else ""}

@app.get("/api/gastos")
def listar_gastos(
    desde:     Optional[str] = None,
    hasta:     Optional[str] = None,
    tienda_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Gasto)
    if desde:
        q = q.filter(func.date(Gasto.fecha) >= desde)
    if hasta:
        q = q.filter(func.date(Gasto.fecha) <= hasta)
    if tienda_id:
        q = q.filter(Gasto.tienda_id == tienda_id)
    gastos = q.order_by(Gasto.fecha.desc()).all()
    return [{
        "id":          g.id,
        "monto":       g.monto,
        "descripcion": g.descripcion,
        "categoria":   g.categoria,
        "cajero":      g.cajero,
        "tienda_id":   g.tienda_id,
        "fecha":       g.fecha.isoformat() if g.fecha else "",
    } for g in gastos]

@app.delete("/api/gastos/{gasto_id}")
def eliminar_gasto(gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(Gasto).filter(Gasto.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(g)
    db.commit()
    return {"ok": True}

@app.get("/api/cierres")
def listar_cierres(tienda_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(CierreCaja)
    if tienda_id:
        q = q.filter(CierreCaja.tienda_id == tienda_id)
    return q.order_by(CierreCaja.fecha_cierre.desc()).limit(30).all()


# ══════════════════════════════════════
#  REPORTES — GANANCIAS
# ══════════════════════════════════════

@app.get("/api/reportes/ganancias")
def reporte_ganancias(
    desde: date,
    hasta: date,
    categoria: Optional[str] = None,
    producto_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    # Ventas en el periodo
    ventas = db.query(Venta).filter(
        func.date(Venta.fecha) >= desde,
        func.date(Venta.fecha) <= hasta,
    ).all()
    venta_ids = [v.id for v in ventas]

    if not venta_ids:
        return {"ingresos": 0, "costo": 0, "ganancia": 0, "margen": 0, "detalle": []}

    # Items de esas ventas
    q_items = db.query(ItemVenta).filter(ItemVenta.venta_id.in_(venta_ids))
    if producto_id:
        q_items = q_items.filter(ItemVenta.producto_id == producto_id)
    items = q_items.all()

    # Filtrar por categoría si aplica
    if categoria:
        prods_cat = {p.id for p in db.query(Producto).filter(Producto.categoria == categoria).all()}
        items = [i for i in items if i.producto_id in prods_cat]

    # Devoluciones en el periodo
    q_devs = db.query(Devolucion).filter(
        func.date(Devolucion.fecha) >= desde,
        func.date(Devolucion.fecha) <= hasta,
    )
    if producto_id:
        q_devs = q_devs.filter(Devolucion.producto_id == producto_id)
    devs = q_devs.all()
    if categoria:
        devs = [d for d in devs if d.producto_id in prods_cat]

    # Calcular por producto
    detalle = {}
    for item in items:
        pid = item.producto_id
        if pid not in detalle:
            detalle[pid] = {
                "producto_id": pid,
                "nombre": item.nombre_prod,
                "cantidad": 0,
                "ingresos": 0.0,
                "costo": 0.0,
                "devuelto": 0.0,
            }
        detalle[pid]["cantidad"]  += item.cantidad
        detalle[pid]["ingresos"]  += item.subtotal
        detalle[pid]["costo"]     += item.costo_unit * item.cantidad

    # Restar devoluciones
    for dev in devs:
        pid = dev.producto_id
        if pid in detalle:
            # Costo unitario promedio ANTES de descontar cantidad
            cant = detalle[pid]["cantidad"]
            costo_unit_dev = detalle[pid]["costo"] / cant if cant > 0 else 0
            detalle[pid]["ingresos"] -= dev.monto
            detalle[pid]["costo"]    -= costo_unit_dev * dev.cantidad
            detalle[pid]["cantidad"] -= dev.cantidad   # ← descuentar cantidad devuelta
            detalle[pid]["devuelto"] += dev.monto

    # Totales
    total_ingresos = sum(d["ingresos"] for d in detalle.values())
    total_costo    = sum(d["costo"]    for d in detalle.values())
    total_ganancia = total_ingresos - total_costo
    total_margen   = round((total_ganancia / total_ingresos * 100), 2) if total_ingresos > 0 else 0

    # Agregar ganancia y margen por producto
    for d in detalle.values():
        d["ganancia"] = round(d["ingresos"] - d["costo"], 2)
        d["margen"]   = round((d["ganancia"] / d["ingresos"] * 100), 2) if d["ingresos"] > 0 else 0
        d["ingresos"] = round(d["ingresos"], 2)
        d["costo"]    = round(d["costo"], 2)

    return {
        "ingresos": round(total_ingresos, 2),
        "costo":    round(total_costo, 2),
        "ganancia": round(total_ganancia, 2),
        "margen":   total_margen,
        "detalle":  sorted(detalle.values(), key=lambda x: x["ganancia"], reverse=True),
    }

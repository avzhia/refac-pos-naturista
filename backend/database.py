import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Date, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://pos:pos_secret@localhost:5432/pos_naturista",
)

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ══════════════════════════════════════
#  MODELOS
# ══════════════════════════════════════

class Tienda(Base):
    __tablename__ = "tiendas"

    id        = Column(Integer, primary_key=True, index=True)
    nombre    = Column(String(200), nullable=False)
    direccion = Column(String(300), default="")
    activa    = Column(Boolean, default=True)

    cajeros = relationship("Cajero", back_populates="tienda")


class Cajero(Base):
    __tablename__ = "cajeros"

    id        = Column(Integer, primary_key=True, index=True)
    nombre    = Column(String(200), nullable=False)
    tienda_id = Column(Integer, ForeignKey("tiendas.id"), nullable=False)
    activo    = Column(Boolean, default=True)
    pin       = Column(String(64), nullable=True, default=None)

    tienda = relationship("Tienda", back_populates="cajeros")


class Producto(Base):
    __tablename__ = "productos"

    id              = Column(Integer, primary_key=True, index=True)
    nombre          = Column(String(200), nullable=False)
    categoria       = Column(String(100), nullable=False)
    icono           = Column(String(10), default="🌿")
    precio          = Column(Float, nullable=False)
    stock_min       = Column(Integer, default=5)
    activo          = Column(Boolean, default=True)
    codigo_barras   = Column(String(100), nullable=True, default=None)
    marca           = Column(String(100), nullable=True, default="Genérico")
    url_ecommerce   = Column(String(500), nullable=True, default=None)

    lotes = relationship("Lote", back_populates="producto", cascade="all, delete-orphan")


class Proveedor(Base):
    __tablename__ = "proveedores"

    id     = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False, unique=True)
    activo = Column(Boolean, default=True)

    lotes = relationship("Lote", back_populates="proveedor_rel")


class Lote(Base):
    __tablename__ = "lotes"

    id              = Column(Integer, primary_key=True, index=True)
    producto_id     = Column(Integer, ForeignKey("productos.id"), nullable=False)
    numero_lote     = Column(String(50), nullable=False)
    caduca          = Column(Boolean, default=True)
    fecha_caducidad = Column(Date, nullable=True)
    fecha_entrada   = Column(Date, nullable=False)
    stock           = Column(Integer, nullable=False, default=0)
    costo_unitario  = Column(Float, default=0.0)
    proveedor_id    = Column(Integer, ForeignKey("proveedores.id"), nullable=True, default=None)

    producto      = relationship("Producto", back_populates="lotes")
    proveedor_rel = relationship("Proveedor", back_populates="lotes")


class Categoria(Base):
    __tablename__ = "categorias"

    id     = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, unique=True)
    activa = Column(Boolean, default=True)


class Cliente(Base):
    __tablename__ = "clientes"

    id            = Column(Integer, primary_key=True, index=True)
    nombre        = Column(String(200), nullable=False)
    telefono      = Column(String(20), default="")
    email         = Column(String(200), default="")
    fecha_cumple  = Column(Date, nullable=True)
    cliente_desde = Column(Date, nullable=False)
    notas         = Column(Text, default="")
    tipo          = Column(String(20), default="regular")
    activo        = Column(Boolean, default=True)

    ventas = relationship("Venta", back_populates="cliente")


class Venta(Base):
    __tablename__ = "ventas"

    id         = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    tienda_id  = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    cajero     = Column(String(100), default="")
    fecha      = Column(DateTime, default=datetime.now)
    forma_pago = Column(String(20), nullable=False)
    total      = Column(Float, nullable=False)
    notas      = Column(Text, default="")

    cliente = relationship("Cliente", back_populates="ventas")
    tienda  = relationship("Tienda")
    items   = relationship("ItemVenta", back_populates="venta", cascade="all, delete-orphan")


class ItemVenta(Base):
    __tablename__ = "items_venta"

    id          = Column(Integer, primary_key=True, index=True)
    venta_id    = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    nombre_prod = Column(String(200), nullable=False)
    cantidad    = Column(Integer, nullable=False)
    precio_unit = Column(Float, nullable=False)
    subtotal    = Column(Float, nullable=False)
    lote_id     = Column(Integer, nullable=True, default=None)
    costo_unit  = Column(Float, default=0.0)

    venta = relationship("Venta", back_populates="items")


class Devolucion(Base):
    __tablename__ = "devoluciones"

    id                  = Column(Integer, primary_key=True, index=True)
    venta_id            = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    producto_id         = Column(Integer, ForeignKey("productos.id"), nullable=False)
    nombre_prod         = Column(String(200), nullable=False)
    cantidad            = Column(Integer, nullable=False)
    monto               = Column(Float, nullable=False)
    motivo              = Column(Text, default="")
    fecha               = Column(DateTime, default=datetime.now)
    cajero              = Column(String(100), default="")
    tienda_id           = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    forma_pago_regreso  = Column(String(20), default="Efectivo")
    regresar_inventario = Column(Boolean, default=True)


class Config(Base):
    __tablename__ = "config"

    id    = Column(Integer, primary_key=True, index=True)
    clave = Column(String(100), nullable=False, unique=True)
    valor = Column(Text, default="")


class Merma(Base):
    __tablename__ = "mermas"

    id          = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=True)
    nombre_prod = Column(String(200), nullable=False)
    lote_id     = Column(Integer, nullable=True)
    cantidad    = Column(Integer, nullable=False)
    motivo      = Column(Text, default="")
    cajero      = Column(String(100), default="")
    tienda_id   = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    fecha       = Column(DateTime, default=datetime.now)


class Gasto(Base):
    __tablename__ = "gastos"

    id          = Column(Integer, primary_key=True, index=True)
    monto       = Column(Float, nullable=False)
    descripcion = Column(Text, nullable=False)
    categoria   = Column(String(50), default="Otro")
    cajero      = Column(String(100), default="")
    tienda_id   = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    fecha       = Column(DateTime, default=datetime.now)


class Turno(Base):
    __tablename__ = "turnos"

    id             = Column(Integer, primary_key=True, index=True)
    cajero_id      = Column(Integer, ForeignKey("cajeros.id"), nullable=False)
    cajero_nombre  = Column(String(200), nullable=False)
    tienda_id      = Column(Integer, ForeignKey("tiendas.id"), nullable=False)
    fondo_inicial  = Column(Float, default=0.0)
    fecha_apertura = Column(DateTime, default=datetime.now)
    fecha_cierre   = Column(DateTime, nullable=True)
    activo         = Column(Boolean, default=True)


class CierreCaja(Base):
    __tablename__ = "cierres_caja"

    id                  = Column(Integer, primary_key=True, index=True)
    tienda_id           = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    cajero              = Column(String(100), nullable=False)
    fecha_apertura      = Column(DateTime, nullable=False)
    fecha_cierre        = Column(DateTime, default=datetime.now)
    fondo_inicial       = Column(Float, default=0.0)
    total_efectivo      = Column(Float, default=0.0)
    total_tarjeta       = Column(Float, default=0.0)
    total_transferencia = Column(Float, default=0.0)
    total_ventas        = Column(Float, default=0.0)
    efectivo_contado    = Column(Float, default=0.0)
    diferencia          = Column(Float, default=0.0)
    tickets             = Column(Integer, default=0)


# ══════════════════════════════════════
#  INICIALIZACIÓN
# ══════════════════════════════════════

def crear_tablas():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def insertar_datos_iniciales(db):
    """Inserta datos base si la BD está vacía."""

    if db.query(Cliente).count() == 0:
        db.add(Cliente(
            id=1, nombre="Público General", telefono="", email="",
            cliente_desde=datetime.now().date(),
            notas="Cliente predeterminado para ventas sin registro.",
            tipo="general",
        ))
        db.commit()
        print("✓ Cliente 'Público General' creado.")

    if db.query(Categoria).count() == 0:
        cats = ["Plantas", "Semillas", "Suplementos", "Tés",
                "Aceites", "Especias", "Endulzantes", "Otros"]
        for c in cats:
            db.add(Categoria(nombre=c))
        db.commit()
        print("✓ Categorías base creadas.")

    if db.query(Tienda).count() == 0:
        db.add(Tienda(id=1, nombre="TiendaNaturistaMX", direccion=""))
        db.commit()
        print("✓ Tienda base creada.")

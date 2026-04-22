from sqlalchemy import create_engine, Column, Integer, String, Float, Date, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./pos.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ══════════════════════════════════════
#  TABLAS NUEVAS — Tienda y Cajero
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


# ══════════════════════════════════════
#  TABLAS EXISTENTES — sin cambios destructivos
# ══════════════════════════════════════

class Producto(Base):
    __tablename__ = "productos"

    id        = Column(Integer, primary_key=True, index=True)
    nombre    = Column(String(200), nullable=False)
    categoria = Column(String(100), nullable=False)
    icono     = Column(String(10), default="🌿")
    precio    = Column(Float, nullable=False)
    stock_min = Column(Integer, default=5)
    activo          = Column(Boolean, default=True)
    codigo_barras   = Column(String(100), nullable=True, default=None)
    marca           = Column(String(100), nullable=True, default='Genérico')
    url_ecommerce   = Column(String(500), nullable=True, default=None)

    lotes = relationship("Lote", back_populates="producto", cascade="all, delete-orphan")


class Proveedor(Base):
    __tablename__ = "proveedores"

    id      = Column(Integer, primary_key=True, index=True)
    nombre  = Column(String(200), nullable=False, unique=True)
    activo  = Column(Boolean, default=True)

    lotes   = relationship("Lote", back_populates="proveedor_rel")


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

    producto        = relationship("Producto", back_populates="lotes")
    proveedor_rel   = relationship("Proveedor", back_populates="lotes")


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

    id                 = Column(Integer, primary_key=True, index=True)
    venta_id           = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    producto_id        = Column(Integer, ForeignKey("productos.id"), nullable=False)
    nombre_prod        = Column(String(200), nullable=False)
    cantidad           = Column(Integer, nullable=False)
    monto              = Column(Float, nullable=False)
    motivo             = Column(Text, default="")
    fecha              = Column(DateTime, default=datetime.now)
    cajero             = Column(String(100), default="")
    tienda_id          = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    forma_pago_regreso = Column(String(20), default="Efectivo")
    regresar_inventario = Column(Boolean, default=True)


class Config(Base):
    """Configuración general del sistema — clave/valor."""
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
    categoria   = Column(String(50), default="Otro")  # Compra proveedor / Servicio / Otro
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
    _migrar_columnas_nuevas()


def _migrar_columnas_nuevas():
    """
    Agrega columnas nuevas a tablas existentes sin borrar datos.
    Si la columna ya existe SQLite lanza un error que ignoramos.
    """
    from sqlalchemy import text
    columnas = [
        "ALTER TABLE lotes ADD COLUMN caduca BOOLEAN DEFAULT 1",
        "ALTER TABLE ventas ADD COLUMN tienda_id INTEGER",
        "ALTER TABLE cierres_caja ADD COLUMN tienda_id INTEGER",
        "ALTER TABLE productos ADD COLUMN codigo_barras VARCHAR(100)",
        "ALTER TABLE devoluciones ADD COLUMN forma_pago_regreso VARCHAR(20) DEFAULT 'Efectivo'",
        "ALTER TABLE cajeros ADD COLUMN pin VARCHAR(64)",
        """CREATE TABLE IF NOT EXISTS proveedores (
            id INTEGER PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL UNIQUE,
            activo BOOLEAN DEFAULT 1
        )""",
        "ALTER TABLE lotes ADD COLUMN proveedor_id INTEGER REFERENCES proveedores(id)",
        "ALTER TABLE lotes ADD COLUMN proveedor VARCHAR(200)",
        """CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY,
            clave VARCHAR(100) NOT NULL UNIQUE,
            valor TEXT DEFAULT ''
        )""",
        "ALTER TABLE items_venta ADD COLUMN lote_id INTEGER",
        "ALTER TABLE items_venta ADD COLUMN costo_unit REAL DEFAULT 0.0",
        "ALTER TABLE devoluciones ADD COLUMN regresar_inventario BOOLEAN DEFAULT 1",
        """CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY,
            monto REAL NOT NULL,
            descripcion TEXT NOT NULL,
            categoria VARCHAR(50) DEFAULT 'Otro',
            cajero VARCHAR(100) DEFAULT '',
            tienda_id INTEGER,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS turnos (
            id INTEGER PRIMARY KEY,
            cajero_id INTEGER NOT NULL REFERENCES cajeros(id),
            cajero_nombre VARCHAR(200) NOT NULL,
            tienda_id INTEGER NOT NULL REFERENCES tiendas(id),
            fondo_inicial REAL DEFAULT 0.0,
            fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_cierre DATETIME,
            activo BOOLEAN DEFAULT 1
        )""",
        "ALTER TABLE productos ADD COLUMN marca VARCHAR(100) DEFAULT 'Genérico'",
        "ALTER TABLE productos ADD COLUMN url_ecommerce VARCHAR(500)",
    ]
    with engine.connect() as conn:
        for sql in columnas:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                msg = str(e).lower()
                if 'duplicate column' in msg or 'already exists' in msg:
                    pass  # columna/tabla ya existe — esperado
                else:
                    print(f'[migración] Advertencia: {sql[:80]} → {e}')


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def insertar_datos_iniciales(db):
    """Inserta datos base si la BD está vacía."""

    # Cliente Público General
    if db.query(Cliente).count() == 0:
        db.add(Cliente(
            id=1, nombre="Público General", telefono="", email="",
            cliente_desde=datetime.now().date(),
            notas="Cliente predeterminado para ventas sin registro.",
            tipo="general",
        ))
        db.commit()
        print("✓ Cliente 'Público General' creado.")

    # Categorías base
    if db.query(Categoria).count() == 0:
        cats = ["Plantas", "Semillas", "Suplementos", "Tés",
                "Aceites", "Especias", "Endulzantes", "Otros"]
        for c in cats:
            db.add(Categoria(nombre=c))
        db.commit()
        print("✓ Categorías base creadas.")

    # Tienda base — una sola al inicio
    if db.query(Tienda).count() == 0:
        db.add(Tienda(id=1, nombre="TiendaNaturistaMX", direccion=""))
        db.commit()
        print("✓ Tienda base creada.")

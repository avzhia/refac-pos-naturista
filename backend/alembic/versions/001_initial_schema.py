"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-24
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tiendas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("direccion", sa.String(300), nullable=True, server_default=""),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "categorias",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(100), nullable=False, unique=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "clientes",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("telefono", sa.String(20), nullable=True, server_default=""),
        sa.Column("email", sa.String(200), nullable=True, server_default=""),
        sa.Column("fecha_cumple", sa.Date(), nullable=True),
        sa.Column("cliente_desde", sa.Date(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True, server_default=""),
        sa.Column("tipo", sa.String(20), nullable=True, server_default="regular"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "cajeros",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pin", sa.String(64), nullable=True),
    )

    op.create_table(
        "proveedores",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(200), nullable=False, unique=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "productos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("categoria", sa.String(100), nullable=False),
        sa.Column("icono", sa.String(10), nullable=True, server_default="🌿"),
        sa.Column("precio", sa.Float(), nullable=False),
        sa.Column("stock_min", sa.Integer(), nullable=True, server_default="5"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("codigo_barras", sa.String(100), nullable=True),
        sa.Column("marca", sa.String(100), nullable=True, server_default="Genérico"),
        sa.Column("url_ecommerce", sa.String(500), nullable=True),
    )

    op.create_table(
        "lotes",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=False),
        sa.Column("numero_lote", sa.String(50), nullable=False),
        sa.Column("caduca", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("fecha_caducidad", sa.Date(), nullable=True),
        sa.Column("fecha_entrada", sa.Date(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("costo_unitario", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("proveedor_id", sa.Integer(), sa.ForeignKey("proveedores.id"), nullable=True),
    )

    op.create_table(
        "ventas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=False),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=True),
        sa.Column("cajero", sa.String(100), nullable=True, server_default=""),
        sa.Column("fecha", sa.DateTime(), nullable=True),
        sa.Column("forma_pago", sa.String(20), nullable=False),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True, server_default=""),
    )

    op.create_table(
        "items_venta",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("venta_id", sa.Integer(), sa.ForeignKey("ventas.id"), nullable=False),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=False),
        sa.Column("nombre_prod", sa.String(200), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("precio_unit", sa.Float(), nullable=False),
        sa.Column("subtotal", sa.Float(), nullable=False),
        sa.Column("lote_id", sa.Integer(), nullable=True),
        sa.Column("costo_unit", sa.Float(), nullable=True, server_default="0.0"),
    )

    op.create_table(
        "devoluciones",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("venta_id", sa.Integer(), sa.ForeignKey("ventas.id"), nullable=False),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=False),
        sa.Column("nombre_prod", sa.String(200), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("monto", sa.Float(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True, server_default=""),
        sa.Column("fecha", sa.DateTime(), nullable=True),
        sa.Column("cajero", sa.String(100), nullable=True, server_default=""),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=True),
        sa.Column("forma_pago_regreso", sa.String(20), nullable=True, server_default="Efectivo"),
        sa.Column("regresar_inventario", sa.Boolean(), nullable=True, server_default=sa.true()),
    )

    op.create_table(
        "mermas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id"), nullable=True),
        sa.Column("nombre_prod", sa.String(200), nullable=False),
        sa.Column("lote_id", sa.Integer(), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True, server_default=""),
        sa.Column("cajero", sa.String(100), nullable=True, server_default=""),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=True),
        sa.Column("fecha", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "gastos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("monto", sa.Float(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("categoria", sa.String(50), nullable=True, server_default="Otro"),
        sa.Column("cajero", sa.String(100), nullable=True, server_default=""),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=True),
        sa.Column("fecha", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "turnos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("cajero_id", sa.Integer(), sa.ForeignKey("cajeros.id"), nullable=False),
        sa.Column("cajero_nombre", sa.String(200), nullable=False),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=False),
        sa.Column("fondo_inicial", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("fecha_apertura", sa.DateTime(), nullable=True),
        sa.Column("fecha_cierre", sa.DateTime(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "cierres_caja",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("tienda_id", sa.Integer(), sa.ForeignKey("tiendas.id"), nullable=True),
        sa.Column("cajero", sa.String(100), nullable=False),
        sa.Column("fecha_apertura", sa.DateTime(), nullable=False),
        sa.Column("fecha_cierre", sa.DateTime(), nullable=True),
        sa.Column("fondo_inicial", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("total_efectivo", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("total_tarjeta", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("total_transferencia", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("total_ventas", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("efectivo_contado", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("diferencia", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("tickets", sa.Integer(), nullable=True, server_default="0"),
    )

    op.create_table(
        "config",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("clave", sa.String(100), nullable=False, unique=True),
        sa.Column("valor", sa.Text(), nullable=True, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("config")
    op.drop_table("cierres_caja")
    op.drop_table("turnos")
    op.drop_table("gastos")
    op.drop_table("mermas")
    op.drop_table("devoluciones")
    op.drop_table("items_venta")
    op.drop_table("ventas")
    op.drop_table("lotes")
    op.drop_table("productos")
    op.drop_table("proveedores")
    op.drop_table("cajeros")
    op.drop_table("clientes")
    op.drop_table("categorias")
    op.drop_table("tiendas")

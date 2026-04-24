import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import crear_tablas, get_db, insertar_datos_iniciales
from routers import admin, cajeros, caja, categorias, clientes, devoluciones, productos, proveedores, reportes, tiendas, ventas

app = FastAPI(title="TiendaNaturistaMX POS")

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
    db.close()
    print("✓ TiendaNaturistaMX POS listo en http://localhost:8000")


# ── Routers API ───────────────────────────────────────────────────────────────
app.include_router(admin.router)
app.include_router(cajeros.router)
app.include_router(caja.router)
app.include_router(categorias.router)
app.include_router(clientes.router)
app.include_router(devoluciones.router)
app.include_router(productos.router)
app.include_router(proveedores.router)
app.include_router(reportes.router)
app.include_router(tiendas.router)
app.include_router(ventas.router)


# ── Frontend estático (legacy — se reemplaza en Fase 2 con Vite) ──────────────
app.mount("/css", StaticFiles(directory="../css"), name="css")
app.mount("/js",  StaticFiles(directory="../js"),  name="js")

@app.get("/manifest.json")
def manifest():
    return FileResponse("../manifest.json", media_type="application/manifest+json")

@app.get("/sw.js")
def service_worker():
    return FileResponse("../sw.js", media_type="application/javascript")

@app.get("/favicon.ico")
def favicon():
    logo = "../logo.png"
    if os.path.exists(logo):
        return FileResponse(logo, media_type="image/png")
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/mobile")
def mobile():
    return FileResponse("../mobile.html")

@app.get("/")
def raiz():
    return FileResponse("../index.html")

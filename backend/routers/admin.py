import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db, Config, Cajero
from schemas.admin import AdminSetup, AdminLogin, CajeroPinUpdate, ConfigIn
from utils import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

LOGO_PATH = "../logo.png"


@router.get("/setup-required")
def setup_required(db: Session = Depends(get_db)):
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    return {"required": cfg is None or not cfg.valor}


@router.post("/setup")
def setup_admin(data: AdminSetup, db: Session = Depends(get_db)):
    if data.password != data.confirm:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    existing = db.query(Config).filter(Config.clave == "admin_password").first()
    if existing and existing.valor:
        raise HTTPException(status_code=409, detail="Ya existe una contraseña configurada")
    db.add(Config(clave="admin_password", valor=hash_password(data.password)))
    db.commit()
    return {"ok": True}


@router.post("/login")
def admin_login(data: AdminLogin, db: Session = Depends(get_db)):
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    if not cfg or hash_password(data.password) != cfg.valor:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"ok": True}


@router.put("/password")
def cambiar_password(data: AdminSetup, db: Session = Depends(get_db)):
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Mínimo 4 caracteres")
    cfg = db.query(Config).filter(Config.clave == "admin_password").first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Sin contraseña configurada")
    if hash_password(data.confirm) != cfg.valor:
        raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")
    cfg.valor = hash_password(data.password)
    db.commit()
    return {"ok": True}


@router.post("/config")
def guardar_config(data: ConfigIn, db: Session = Depends(get_db)):
    cfg = db.query(Config).filter(Config.clave == data.clave).first()
    if cfg:
        cfg.valor = data.valor
    else:
        db.add(Config(clave=data.clave, valor=data.valor))
    db.commit()
    return {"ok": True}


@router.get("/config/{clave}")
def obtener_config(clave: str, db: Session = Depends(get_db)):
    cfg = db.query(Config).filter(Config.clave == clave).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return {"clave": cfg.clave, "valor": cfg.valor}


@router.get("/backup")
def descargar_backup():
    from fastapi.responses import FileResponse as FR
    fecha = datetime.now().strftime("%Y-%m-%d")
    pg_backup = f"./respaldos/pos_backup_{fecha}.sql"
    if os.path.exists(pg_backup):
        return FR(path=pg_backup, filename=f"pos_backup_{fecha}.sql", media_type="application/octet-stream")
    raise HTTPException(status_code=404, detail="No hay respaldo disponible para hoy")


@router.post("/logo")
async def subir_logo(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos de imagen")
    contenido = await file.read()
    with open(LOGO_PATH, "wb") as f:
        f.write(contenido)
    return {"ok": True}


@router.delete("/logo")
def eliminar_logo():
    if os.path.exists(LOGO_PATH):
        os.remove(LOGO_PATH)
    return {"ok": True}

"""
backup_db.py — Respaldo automático diario de pos.db

Especificaciones:
  - Se ejecuta al arrancar el servidor (llamado desde main.py al inicio)
  - Una vez al día: si ya existe pos_backup_YYYY-MM-DD.db no crea otro
  - Nombre del archivo: pos_backup_YYYY-MM-DD.db
  - Máximo 30 respaldos — elimina los más antiguos si se supera el límite
"""

import shutil
import os
import glob
from datetime import date
from pathlib import Path


# ── Configuración ────────────────────────────────────────────────────────────

# Ruta al archivo de base de datos origen
DB_ORIGEN = Path(__file__).parent / "pos.db"

# Carpeta donde se guardan los respaldos (se crea si no existe)
CARPETA_RESPALDOS = Path(__file__).parent / "respaldos"

# Número máximo de respaldos a conservar
MAX_RESPALDOS = 30


# ── Función principal ─────────────────────────────────────────────────────────

def hacer_respaldo() -> None:
    """
    Crea un respaldo diario de pos.db.
    Si el respaldo del día ya existe, no hace nada.
    Si hay más de MAX_RESPALDOS archivos, elimina los más antiguos.
    """

    # Verificar que la BD origen existe
    if not DB_ORIGEN.exists():
        print(f"[backup] ⚠ No se encontró la base de datos en: {DB_ORIGEN}")
        return

    # Crear carpeta de respaldos si no existe
    CARPETA_RESPALDOS.mkdir(parents=True, exist_ok=True)

    # Nombre del respaldo de hoy
    hoy = date.today().strftime("%Y-%m-%d")
    archivo_hoy = CARPETA_RESPALDOS / f"pos_backup_{hoy}.db"

    # Si ya existe el respaldo de hoy, no hacer nada
    if archivo_hoy.exists():
        print(f"[backup] ✓ Respaldo del día ya existe: {archivo_hoy.name}")
        return

    # Copiar la BD al archivo de respaldo
    shutil.copy2(DB_ORIGEN, archivo_hoy)
    print(f"[backup] ✓ Respaldo creado: {archivo_hoy.name}")

    # Rotar: eliminar respaldos más antiguos si se supera el límite
    _rotar_respaldos()


def _rotar_respaldos() -> None:
    """
    Elimina los respaldos más antiguos si hay más de MAX_RESPALDOS.
    Ordena por nombre (YYYY-MM-DD garantiza orden cronológico).
    """
    patron = str(CARPETA_RESPALDOS / "pos_backup_*.db")
    archivos = sorted(glob.glob(patron))  # orden: más antiguo primero

    exceso = len(archivos) - MAX_RESPALDOS
    if exceso > 0:
        for archivo in archivos[:exceso]:
            os.remove(archivo)
            print(f"[backup] 🗑 Respaldo eliminado (límite {MAX_RESPALDOS}): {Path(archivo).name}")


# ── Uso directo ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    hacer_respaldo()

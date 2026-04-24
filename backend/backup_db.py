"""
backup_db.py — Respaldo automático diario via pg_dump

Especificaciones:
  - Ejecutar manualmente o via cron: python backup_db.py
  - Una vez al día: si ya existe pos_backup_YYYY-MM-DD.sql no crea otro
  - Nombre del archivo: pos_backup_YYYY-MM-DD.sql
  - Máximo 30 respaldos — elimina los más antiguos si se supera el límite
"""

import os
import glob
import subprocess
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

CARPETA_RESPALDOS = Path(__file__).parent / "respaldos"
MAX_RESPALDOS = 30


def hacer_respaldo() -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("[backup] ⚠ DATABASE_URL no configurado, omitiendo respaldo")
        return

    CARPETA_RESPALDOS.mkdir(parents=True, exist_ok=True)

    hoy = date.today().strftime("%Y-%m-%d")
    archivo_hoy = CARPETA_RESPALDOS / f"pos_backup_{hoy}.sql"

    if archivo_hoy.exists():
        print(f"[backup] ✓ Respaldo del día ya existe: {archivo_hoy.name}")
        return

    parsed = urlparse(db_url)
    env = os.environ.copy()
    env["PGPASSWORD"] = parsed.password or ""

    cmd = [
        "pg_dump",
        "-h", parsed.hostname or "localhost",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username or "pos",
        "-d", (parsed.path or "").lstrip("/"),
        "-f", str(archivo_hoy),
        "--no-password",
    ]

    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True)
        print(f"[backup] ✓ Respaldo creado: {archivo_hoy.name}")
        _rotar_respaldos()
    except FileNotFoundError:
        print("[backup] ⚠ pg_dump no encontrado, omitiendo respaldo")
    except subprocess.CalledProcessError as e:
        print(f"[backup] ✗ Error al crear respaldo: {e.stderr.decode()}")


def _rotar_respaldos() -> None:
    patron = str(CARPETA_RESPALDOS / "pos_backup_*.sql")
    archivos = sorted(glob.glob(patron))
    exceso = len(archivos) - MAX_RESPALDOS
    if exceso > 0:
        for archivo in archivos[:exceso]:
            os.remove(archivo)
            print(f"[backup] 🗑 Respaldo eliminado (límite {MAX_RESPALDOS}): {Path(archivo).name}")


if __name__ == "__main__":
    hacer_respaldo()

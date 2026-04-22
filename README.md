# 🌿 TiendaNaturistaMX POS

Sistema de punto de venta desarrollado a medida para tienda de productos naturistas. Corre como aplicación web (SPA) servida por un backend FastAPI + SQLite, con aplicación Android nativa conectada al mismo backend.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.14 · FastAPI · SQLAlchemy · SQLite |
| Frontend | Vanilla JS (ES Modules) · HTML5 · CSS3 |
| App Android | Kotlin · Retrofit2 · Coroutines · ViewBinding |
| Producción | Orange Pi Zero 2W · Cloudflare Tunnel |

---

## Requisitos

- Python 3.10 o superior
- pip
- (Opcional) Cloudflare Tunnel para acceso externo

---

## Instalación y arranque

### Windows (desarrollo local)

```bash
# 1. Clonar o descomprimir el proyecto
cd C:\pos\refac-pos-naturista\backend

# 2. Instalar dependencias
pip install fastapi uvicorn sqlalchemy python-multipart aiofiles

# 3. Arrancar el servidor
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Abre el navegador en: [http://localhost:8000](http://localhost:8000)

---

### Linux / Orange Pi (producción)

```bash
# 1. Clonar o copiar el proyecto
cd /home/usuario/refac-pos-naturista/backend

# 2. Instalar dependencias
pip install fastapi uvicorn sqlalchemy python-multipart aiofiles --break-system-packages

# 3. Arrancar el servidor
uvicorn main:app --host 0.0.0.0 --port 8000
```

> **Zona horaria:** Asegúrate de que el sistema tenga configurada la zona horaria correcta:
> ```bash
> sudo timedatectl set-timezone America/Mexico_City
> ```

---

### Acceso externo con Cloudflare Tunnel

Cloudflare Tunnel expone el servidor local a internet sin abrir puertos en el router.

**Requisitos:** Cuenta en [Cloudflare](https://cloudflare.com) con un dominio configurado.

```bash
# 1. Instalar cloudflared
# Linux (ARM64 para Orange Pi):
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb

# 2. Autenticar
cloudflared tunnel login

# 3. Crear el tunnel
cloudflared tunnel create pos-tunnel

# 4. Configurar (~/.cloudflared/config.yml):
# tunnel: <TUNNEL_ID>
# credentials-file: /home/usuario/.cloudflared/<TUNNEL_ID>.json
# ingress:
#   - hostname: pos.tudominio.com
#     service: http://localhost:8000
#   - service: http_status:404

# 5. Crear registro DNS en Cloudflare
cloudflared tunnel route dns pos-tunnel pos.tudominio.com

# 6. Arrancar el tunnel
cloudflared tunnel run pos-tunnel
```

Con el servidor y el tunnel corriendo, el sistema queda accesible en `https://pos.tudominio.com`.

---

## Estructura del proyecto

```
refac-pos-naturista/
├── index.html              ← SPA principal
├── css/
│   ├── base.css            ← Variables, layout global
│   └── components.css      ← Componentes reutilizables
├── js/
│   ├── core/
│   │   ├── api.js          ← Cliente HTTP
│   │   ├── estado.js       ← Estado global
│   │   └── app.js          ← Helpers y navegación
│   └── modules/
│       ├── login.js        ← Autenticación y turnos
│       ├── ventas.js       ← Catálogo, ticket, cobro
│       ├── inventario.js   ← Productos, lotes, proveedores
│       ├── clientes.js     ← CRUD clientes
│       ├── devoluciones.js ← Devoluciones, cambios, mermas
│       ├── reportes.js     ← Reportes y cierre de caja
│       └── admin.js        ← Panel de administración
└── backend/
    ├── main.py             ← Endpoints FastAPI
    ├── database.py         ← Modelos SQLAlchemy
    └── backup_db.py        ← Respaldo automático diario
```

---

## Características principales

- **Multi-tienda** — soporte para varias sucursales con cajeros independientes
- **Gestión de turnos** — apertura y cierre de caja con conteo de denominaciones
- **Inventario PEPS/FIFO** — control por lotes con fechas de caducidad
- **Devoluciones y cambios** — flujo completo con destino a inventario o merma
- **Reportes globales** — ventas, ganancias, mermas, gastos y devoluciones de todas las tiendas
- **Scanner de código de barras** — en ventas (agrega al ticket) e inventario (consulta de precio)
- **App Android** — ventas móviles conectadas al mismo backend
- **Respaldo automático** — copia diaria de la base de datos al arrancar
- **Acceso remoto** — vía Cloudflare Tunnel sin exponer puertos

---

## Primer uso

1. Al abrir el sistema por primera vez se solicita crear una contraseña maestra de administrador
2. Desde el panel admin (⚙) crear la primera tienda y cajero
3. Iniciar turno seleccionando tienda, cajero e ingresando fondo inicial

---

## Notas de despliegue

- La base de datos `backend/pos.db` **no debe reemplazarse** al actualizar el sistema — contiene todos los datos de producción
- Los respaldos automáticos se guardan en `backend/respaldos/`
- Al actualizar, copiar todos los archivos excepto `backend/pos.db` y `backend/respaldos/`

---

## Licencia

Uso privado — TiendaNaturistaMX. No distribuir.

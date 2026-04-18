/* ═══════════════════════════════════════════════
   js/core/estado.js
   Estado global de la aplicación
═══════════════════════════════════════════════ */

const SESION_KEY = 'pos_sesion';

const Estado = {

  // ── Datos en memoria ──────────────────────────

  productos: [],   // [{id, nombre, cat, precio, min, icon, barcode, lotes:[...]}]
  clientes:  [],   // [{id, nombre, tel, email, tipo, ...}]
  ticketActual: [], // [{id, nombre, icon, precio, qty}]
  ventas: [],      // historial local del turno

  // ── Configuración de sesión ───────────────────

  config: {
    cajero:       null,
    cajeroId:     null,
    tiendaId:     null,
    tiendaNombre: null,
    fondoInicial: 0,
    apertura:     null,   // ISO string
    turnoId:      null,   // ID del turno activo en backend
    negocio:      'TiendaNaturistaMX',
    logoEmoji:    '🌿',
  },

  // ── Persistencia ──────────────────────────────

  guardarSesion() {
    try {
      localStorage.setItem(SESION_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('[Estado] No se pudo guardar sesión:', e);
    }
  },

  cargarSesion() {
    try {
      const raw = localStorage.getItem(SESION_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data?.cajero || !data?.tiendaId) return false;
      this.config = { ...this.config, ...data };
      return true;
    } catch (e) {
      console.warn('[Estado] No se pudo cargar sesión:', e);
      return false;
    }
  },

  cerrarSesion() {
    this.config = {
      cajero:       null,
      cajeroId:     null,
      tiendaId:     null,
      tiendaNombre: null,
      fondoInicial: 0,
      apertura:     null,
      turnoId:      null,
      negocio:      this.config.negocio,
      logoEmoji:    this.config.logoEmoji,
    };
    this.ticketActual = [];
    this.ventas = [];
    try { localStorage.removeItem(SESION_KEY); } catch(e) {}
  },

  // ── Helpers ───────────────────────────────────

  hayProductos() { return this.productos.length > 0; },
  hayClientes()  { return this.clientes.length > 0; },
};

export default Estado;

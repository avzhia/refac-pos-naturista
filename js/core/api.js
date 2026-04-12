/* ═══════════════════════════════════════════════
   js/core/api.js
   Comunicación con el backend FastAPI
═══════════════════════════════════════════════ */

const API = {
  BASE: window.location.origin,

  // ── Métodos base ──────────────────────────────

  async get(url) {
    const res = await fetch(this.BASE + url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(this.BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${await res.text()}`);
    return res.json();
  },

  async put(url, data) {
    const res = await fetch(this.BASE + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`PUT ${url} → ${res.status}`);
    return res.json();
  },

  async delete(url) {
    const res = await fetch(this.BASE + url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${url} → ${res.status}`);
    return res.json();
  },

  // ── Tiendas y Cajeros ─────────────────────────

  getTiendas()                  { return this.get('/api/tiendas'); },
  crearTienda(data)             { return this.post('/api/tiendas', data); },

  getCajeros(tiendaId)          { return this.get(`/api/cajeros?tienda_id=${tiendaId}`); },
  crearCajero(data)             { return this.post('/api/cajeros', data); },
  editarCajero(id, data)        { return this.put(`/api/cajeros/${id}`, data); },
  setPinCajero(id, pin)         { return this.put(`/api/cajeros/${id}/pin`, { pin }); },

  // ── Productos ─────────────────────────────────

  getProductos()                { return this.get('/api/productos'); },
  crearProducto(data)           { return this.post('/api/productos', data); },
  editarProducto(id, data)      { return this.put(`/api/productos/${id}`, data); },
  eliminarProducto(id)          { return this.delete(`/api/productos/${id}`); },

  // ── Lotes ─────────────────────────────────────

  agregarLote(prodId, data)     { return this.post(`/api/productos/${prodId}/lotes`, data); },
  editarLote(loteId, data)      { return this.put(`/api/lotes/${loteId}/editar`, data); },
  ajustarStock(loteId, stock)   { return this.put(`/api/lotes/${loteId}/stock?nuevo_stock=${stock}`, {}); },
  eliminarLote(loteId)          { return this.delete(`/api/lotes/${loteId}`); },

  // ── Categorías ────────────────────────────────

  getCategorias()               { return this.get('/api/categorias'); },
  crearCategoria(data)          { return this.post('/api/categorias', data); },
  eliminarCategoria(id)         { return this.delete(`/api/categorias/${id}`); },

  // ── Proveedores ───────────────────────────────

  getProveedores()              { return this.get('/api/proveedores'); },
  crearProveedor(data)          { return this.post('/api/proveedores', data); },
  eliminarProveedor(id)         { return this.delete(`/api/proveedores/${id}`); },

  // ── Clientes ──────────────────────────────────

  getClientes()                 { return this.get('/api/clientes'); },
  crearCliente(data)            { return this.post('/api/clientes', data); },
  editarCliente(id, data)       { return this.put(`/api/clientes/${id}`, data); },
  eliminarCliente(id)           { return this.delete(`/api/clientes/${id}`); },

  // ── Ventas ────────────────────────────────────

  registrarVenta(data)          { return this.post('/api/ventas', data); },
  getVentas(desde, hasta, tid)  {
    let url = `/api/ventas?desde=${desde}&hasta=${hasta}`;
    if (tid) url += `&tienda_id=${tid}`;
    return this.get(url);
  },
  getVentaById(id)              { return this.get(`/api/ventas/${id}`); },

  // ── Devoluciones ──────────────────────────────

  registrarDevolucion(data)     { return this.post('/api/devoluciones', data); },
  getDevoluciones(params)       {
    const q = new URLSearchParams(params).toString();
    return this.get(`/api/devoluciones?${q}`);
  },

  // ── Mermas ────────────────────────────────────

  registrarMerma(data)          { return this.post('/api/mermas', data); },
  getMermas(desde, hasta)       { return this.get(`/api/mermas?desde=${desde}&hasta=${hasta}`); },

  // ── Reportes ──────────────────────────────────

  getResumenHoy()               { return this.get('/api/reportes/resumen'); },
  getVentasPeriodo(desde, hasta, tid) {
    let url = `/api/reportes/ventas-periodo?desde=${desde}&hasta=${hasta}`;
    if (tid) url += `&tienda_id=${tid}`;
    return this.get(url);
  },
  getGanancias(params)          {
    const q = new URLSearchParams(params).toString();
    return this.get(`/api/reportes/ganancias?${q}`);
  },

  // ── Cierre ────────────────────────────────────

  registrarCierre(data)         { return this.post('/api/cierre', data); },
  getCierres()                  { return this.get('/api/cierres'); },

  // ── Configuración ─────────────────────────────

  getConfig(clave)              { return this.get(`/api/admin/config/${clave}`); },
  setConfig(clave, valor)       { return this.post('/api/admin/config', { clave, valor }); },

  setupRequired()               { return this.get('/api/admin/setup-required'); },
  setupAdmin(password, confirm) { return this.post('/api/admin/setup', { password, confirm }); },
  adminLogin(password)          { return this.post('/api/admin/login', { password }); },
  cambiarPasswordAdmin(nueva, actual) { return this.put('/api/admin/password', { password: nueva, confirm: actual }); },

  // ── Admin ─────────────────────────────────────

  subirLogo(formData) {
    return fetch(this.BASE + '/api/admin/logo', {
      method: 'POST',
      body: formData,
    }).then(r => { if (!r.ok) throw new Error('Error al subir logo'); return r.json(); });
  },
};

export default API;

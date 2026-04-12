/* ═══════════════════════════════════════════════
   js/modules/ventas.js
   Catálogo, ticket, cobro y registro de ventas
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, confirmar, mxPesos, fechaHoyLocal, irA } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

const _s = {
  catActiva: 'Todas',
  pagoSel:   'Efectivo',
  dropIdx:   -1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stockTotal(prod) {
  return (prod.lotes || []).reduce((s, l) => s + (l.stock || 0), 0);
}

function getDescuento(sub) {
  const tipo = document.getElementById('v-desc-tipo')?.value ?? 'ninguno';
  const val  = parseFloat(document.getElementById('v-desc-valor')?.value ?? '0') || 0;
  if (tipo === 'pct')   return Math.min(sub, sub * val / 100);
  if (tipo === 'monto') return Math.min(sub, val);
  return 0;
}

// ── Inicialización ────────────────────────────────────────────────────────────

async function init() {
  try {
    const [prods, clientes] = await Promise.all([
      API.getProductos(),
      API.getClientes(),
    ]);
    Estado.productos = prods;
    Estado.clientes  = clientes;
  } catch(e) {
    showNotif('⚠ Sin conexión al servidor');
  }
  renderCatalogo();
  renderTicket();
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

function renderCatalogo() {
  _renderCats();
  _renderGrid();
}

function _renderCats() {
  const cats = ['Todas', ...[...new Set(Estado.productos.map(p => p.categoria))]];
  const cont = document.getElementById('v-cats');
  if (!cont) return;
  cont.innerHTML = cats.map(c => `
    <button class="v-cat-btn ${c === _s.catActiva ? 'act' : ''}" data-cat="${c}">${c}</button>
  `).join('');
  cont.querySelectorAll('.v-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _s.catActiva = btn.dataset.cat;
      renderCatalogo();
    });
  });
}

function _renderGrid() {
  const q    = document.getElementById('v-search-input')?.value?.toLowerCase() ?? '';
  const grid = document.getElementById('v-prod-grid');
  if (!grid) return;

  const lista = Estado.productos.filter(p => {
    const mCat = _s.catActiva === 'Todas' || p.categoria === _s.catActiva;
    const mQ   = !q || p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q);
    return mCat && mQ;
  });

  if (!lista.length) {
    grid.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:20px 0;">Sin productos.</div>';
    return;
  }

  grid.innerHTML = lista.map(p => {
    const st  = stockTotal(p);
    const cls = st === 0 ? 'out-stock' : st <= (p.stock_min || 5) ? 'low-stock' : '';
    const lbl = st === 0 ? 'Agotado' : st <= (p.stock_min || 5) ? `⚠ Solo ${st}` : `${st} en stock`;
    return `
      <div class="prod-card ${cls}" data-prod-id="${p.id}">
        <span class="prod-icon">${p.icono || '🌿'}</span>
        <div class="prod-name">${p.nombre}</div>
        <div class="prod-price">${mxPesos(p.precio)}</div>
        <div class="prod-stock-lbl">${lbl}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.prod-card').forEach(card => {
    card.addEventListener('click', () => agregarAlTicket(parseInt(card.dataset.prodId)));
  });
}

// ── Ticket ────────────────────────────────────────────────────────────────────

function agregarAlTicket(id) {
  const p  = Estado.productos.find(x => x.id === id);
  const st = p ? stockTotal(p) : 0;
  if (!p || st === 0) return;

  const ex = Estado.ticketActual.find(x => x.id === id);
  if (ex) {
    if (ex.qty < st) ex.qty++;
  } else {
    Estado.ticketActual.push({ id: p.id, nombre: p.nombre, icon: p.icono || '🌿', precio: p.precio, qty: 1 });
  }
  renderTicket();
  showNotif(`${p.icono || '🌿'} ${p.nombre} agregado`);
}

function cambiarQty(id, delta) {
  const idx = Estado.ticketActual.findIndex(x => x.id === id);
  if (idx < 0) return;
  const p  = Estado.productos.find(x => x.id === id);
  const st = p ? stockTotal(p) : 999;
  Estado.ticketActual[idx].qty += delta;
  if (Estado.ticketActual[idx].qty > st) Estado.ticketActual[idx].qty = st;
  if (Estado.ticketActual[idx].qty <= 0) Estado.ticketActual.splice(idx, 1);
  renderTicket();
}

function quitarItem(id) {
  Estado.ticketActual = Estado.ticketActual.filter(x => x.id !== id);
  renderTicket();
}

function limpiarTicket() {
  Estado.ticketActual = [];
  renderTicket();
}

function renderTicket() {
  const list = document.getElementById('v-ticket-list');
  if (!list) return;

  if (!Estado.ticketActual.length) {
    list.innerHTML = '<div class="ticket-empty">Toca un producto para agregarlo</div>';
    _actualizarTotales(0, 0);
    _actualizarBotonCobrar(0);
    return;
  }

  list.innerHTML = Estado.ticketActual.map(x => `
    <div class="ticket-item">
      <span style="font-size:16px;">${x.icon}</span>
      <div class="ti-info">
        <div class="ti-name">${x.nombre}</div>
        <div class="ti-unit">${mxPesos(x.precio)} c/u</div>
      </div>
      <div class="ti-qty">
        <button class="qty-btn" data-id="${x.id}" data-delta="-1">−</button>
        <span class="qty-num">${x.qty}</span>
        <button class="qty-btn" data-id="${x.id}" data-delta="1">+</button>
      </div>
      <span class="ti-price">${mxPesos(x.precio * x.qty)}</span>
      <span class="ti-del" data-id="${x.id}">✕</span>
    </div>
  `).join('');

  list.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarQty(parseInt(btn.dataset.id), parseInt(btn.dataset.delta)));
  });
  list.querySelectorAll('.ti-del').forEach(btn => {
    btn.addEventListener('click', () => quitarItem(parseInt(btn.dataset.id)));
  });

  const sub  = Estado.ticketActual.reduce((s, x) => s + x.precio * x.qty, 0);
  const desc = getDescuento(sub);
  _actualizarTotales(sub, desc);
  _actualizarBotonCobrar(Math.max(0, sub - desc));
}

function _actualizarTotales(sub, desc) {
  const elSub  = document.getElementById('v-subtotal');
  const elDesc = document.getElementById('v-descuento');
  const elTot  = document.getElementById('v-total');
  if (elSub)  elSub.textContent  = mxPesos(sub);
  if (elDesc) elDesc.textContent = desc > 0 ? `− ${mxPesos(desc)}` : '—';
  if (elTot)  elTot.textContent  = mxPesos(Math.max(0, sub - desc));
}

function _actualizarBotonCobrar(total) {
  const btn = document.getElementById('v-cobrar-btn');
  if (!btn) return;
  btn.disabled    = total <= 0;
  btn.textContent = `Cobrar ${mxPesos(total)}`;
}

function calcDescuento() {
  const tipo  = document.getElementById('v-desc-tipo');
  const valor = document.getElementById('v-desc-valor');
  if (valor) valor.style.display = (tipo?.value !== 'ninguno') ? '' : 'none';
  renderTicket();
}

// ── Autocompletado de clientes ────────────────────────────────────────────────

function filtrarClientes(q) {
  const dd       = document.getElementById('v-cliente-dropdown');
  const clearBtn = document.getElementById('v-cliente-clear');
  _s.dropIdx     = -1;
  if (clearBtn) clearBtn.style.display = q.trim() ? '' : 'none';

  const lista = Estado.clientes.filter(c =>
    c.tipo !== 'general' && (
      !q.trim() ||
      c.nombre.toLowerCase().includes(q.toLowerCase()) ||
      (c.telefono && c.telefono.includes(q))
    )
  ).slice(0, 8);

  if (!dd) return;
  if (!q.trim()) { dd.classList.remove('open'); return; }

  dd.innerHTML = lista.length
    ? lista.map((c, i) => `
        <div class="cliente-drop-item" data-nombre="${c.nombre}" data-idx="${i}">
          <div>
            <div class="cli-nombre">${c.nombre}</div>
            <div class="cli-detalle">${c.telefono || 'Sin teléfono'}</div>
          </div>
        </div>
      `).join('')
    : '<div class="cliente-drop-vacio">Sin resultados</div>';

  dd.classList.add('open');
  dd.querySelectorAll('.cliente-drop-item').forEach(el => {
    el.addEventListener('mousedown', () => seleccionarCliente(el.dataset.nombre));
  });
}

function seleccionarCliente(nombre) {
  const input    = document.getElementById('v-cliente-input');
  const dd       = document.getElementById('v-cliente-dropdown');
  const clearBtn = document.getElementById('v-cliente-clear');
  if (input)    input.value = nombre;
  if (dd)       dd.classList.remove('open');
  if (clearBtn) clearBtn.style.display = '';
}

function limpiarCliente() {
  const input    = document.getElementById('v-cliente-input');
  const dd       = document.getElementById('v-cliente-dropdown');
  const clearBtn = document.getElementById('v-cliente-clear');
  if (input)    { input.value = ''; input.focus(); }
  if (dd)       dd.classList.remove('open');
  if (clearBtn) clearBtn.style.display = 'none';
}

// ── Modal de cobro ────────────────────────────────────────────────────────────

function cobrar() {
  if (!Estado.ticketActual.length) return;
  const sub   = Estado.ticketActual.reduce((s, x) => s + x.precio * x.qty, 0);
  const desc  = getDescuento(sub);
  const total = Math.max(0, sub - desc);

  // Llenar modal
  const itemsEl = document.getElementById('modal-cobro-items');
  if (itemsEl) {
    itemsEl.innerHTML = Estado.ticketActual.map(x =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${x.icon} ${x.nombre} ×${x.qty}</span>
        <span>${mxPesos(x.precio * x.qty)}</span>
      </div>`
    ).join('') + (desc > 0
      ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:var(--red-txt);">
           <span>Descuento</span><span>− ${mxPesos(desc)}</span>
         </div>`
      : '');
  }

  const totalEl = document.getElementById('modal-cobro-total');
  const pagoEl  = document.getElementById('modal-cobro-pago');
  if (totalEl) totalEl.textContent = mxPesos(total);
  if (pagoEl)  pagoEl.textContent  = _s.pagoSel;

  // Campo efectivo
  const efRow = document.getElementById('modal-cobro-efectivo-row');
  const esEf  = _s.pagoSel === 'Efectivo';
  if (efRow) efRow.style.display = esEf ? 'block' : 'none';
  if (esEf) {
    const rec = document.getElementById('modal-cobro-recibido');
    const cam = document.getElementById('modal-cobro-cambio');
    if (rec) rec.value = '';
    if (cam) cam.textContent = '$0.00';
  }

  document.getElementById('modal-cobro').classList.add('open');
}

function calcularCambio() {
  const sub      = Estado.ticketActual.reduce((s, x) => s + x.precio * x.qty, 0);
  const desc     = getDescuento(sub);
  const total    = Math.max(0, sub - desc);
  const recibido = parseFloat(document.getElementById('modal-cobro-recibido')?.value ?? '0') || 0;
  const cambio   = Math.max(0, recibido - total);
  const el       = document.getElementById('modal-cobro-cambio');
  if (el) {
    el.textContent = mxPesos(cambio);
    el.style.color = (recibido > 0 && recibido < total) ? 'var(--red-txt)' : 'var(--g1)';
  }
}

function cerrarModal() {
  document.getElementById('modal-cobro').classList.remove('open');
}

async function confirmarCobro() {
  const sub         = Estado.ticketActual.reduce((s, x) => s + x.precio * x.qty, 0);
  const descuento   = getDescuento(sub);
  const totalFinal  = Math.max(0, sub - descuento);

  // Cliente
  const clienteNombre = document.getElementById('v-cliente-input')?.value?.trim() ?? '';
  const clienteMatch  = Estado.clientes.find(c => c.nombre.toLowerCase() === clienteNombre.toLowerCase());
  const clienteId     = clienteMatch ? clienteMatch.id : 1;

  // Distribuir descuento proporcionalmente entre items
  const items = Estado.ticketActual.map(x => {
    const subtotalBruto = x.precio * x.qty;
    const factor        = sub > 0 ? subtotalBruto / sub : 1;
    const subtotalReal  = descuento > 0
      ? Math.round((subtotalBruto - descuento * factor) * 100) / 100
      : subtotalBruto;
    const precioUnitReal = x.qty > 0
      ? Math.round((subtotalReal / x.qty) * 100) / 100
      : x.precio;
    return {
      producto_id: x.id,
      nombre_prod: x.nombre,
      cantidad:    x.qty,
      precio_unit: precioUnitReal,
      subtotal:    subtotalReal,
    };
  });

  try {
    await API.registrarVenta({
      cliente_id: clienteId,
      tienda_id:  Estado.config.tiendaId || 1,
      cajero:     Estado.config.cajero,
      forma_pago: _s.pagoSel,
      total:      totalFinal,
      notas:      descuento > 0 ? `Descuento aplicado: ${mxPesos(descuento)}` : '',
      items,
    });

    // Recargar productos para stock actualizado
    const prods = await API.getProductos();
    Estado.productos = prods;

    // Limpiar ticket
    Estado.ticketActual = [];
    Estado.guardarSesion();

    // Limpiar UI
    const descTipo = document.getElementById('v-desc-tipo');
    const descVal  = document.getElementById('v-desc-valor');
    if (descTipo) descTipo.value = 'ninguno';
    if (descVal)  { descVal.value = ''; descVal.style.display = 'none'; }
    limpiarCliente();
    cerrarModal();
    renderTicket();
    renderCatalogo();
    showNotif('✓ Venta registrada correctamente');
  } catch(e) {
    showNotif('⚠ Error al registrar venta');
    console.error(e);
  }
}

// ── Forma de pago ─────────────────────────────────────────────────────────────

function selPago(pago) {
  _s.pagoSel = pago;
  document.querySelectorAll('.pago-btn').forEach(btn => {
    btn.classList.toggle('sel', btn.dataset.pago === pago);
  });
}

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  // Buscador
  document.getElementById('v-search-input')
    ?.addEventListener('input', renderCatalogo);

  // Descuento
  document.getElementById('v-desc-tipo')
    ?.addEventListener('change', calcDescuento);
  document.getElementById('v-desc-valor')
    ?.addEventListener('input', calcDescuento);

  // Formas de pago
  document.querySelectorAll('.pago-btn').forEach(btn => {
    btn.addEventListener('click', () => selPago(btn.dataset.pago));
  });

  // Cobrar
  document.getElementById('v-cobrar-btn')
    ?.addEventListener('click', cobrar);

  // Modal cobro
  document.getElementById('modal-cobro-cancel')
    ?.addEventListener('click', cerrarModal);
  document.getElementById('modal-cobro-confirm')
    ?.addEventListener('click', confirmarCobro);
  document.getElementById('modal-cobro-recibido')
    ?.addEventListener('input', calcularCambio);
  document.getElementById('modal-cobro')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) cerrarModal(); });

  // Cliente autocomplete
  const clienteInput = document.getElementById('v-cliente-input');
  clienteInput?.addEventListener('input',  e => filtrarClientes(e.target.value));
  clienteInput?.addEventListener('focus',  e => filtrarClientes(e.target.value));
  clienteInput?.addEventListener('keydown', e => {
    const dd    = document.getElementById('v-cliente-dropdown');
    const items = dd?.querySelectorAll('.cliente-drop-item') ?? [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _s.dropIdx = Math.min(_s.dropIdx + 1, items.length - 1);
      items.forEach((el, i) => el.style.background = i === _s.dropIdx ? 'var(--g7)' : '');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _s.dropIdx = Math.max(_s.dropIdx - 1, -1);
      items.forEach((el, i) => el.style.background = i === _s.dropIdx ? 'var(--g7)' : '');
    } else if (e.key === 'Enter' && _s.dropIdx >= 0) {
      e.preventDefault();
      const nombre = items[_s.dropIdx]?.dataset?.nombre;
      if (nombre) seleccionarCliente(nombre);
    }
  });
  document.getElementById('v-cliente-clear')
    ?.addEventListener('click', limpiarCliente);
  document.getElementById('v-nuevo-cliente-btn')
    ?.addEventListener('click', () => irA('clientes'));

  // Botón dev/cambio
  document.getElementById('btn-dev-cambio')
    ?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('pos:abrir-devolucion'));
    });

  // Navegar a ventas
  document.addEventListener('pos:navegar', e => {
    if (e.detail?.modulo === 'ventas') init();
  });
}

// ── Arranque ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', conectar);

export default { init, renderCatalogo, renderTicket };

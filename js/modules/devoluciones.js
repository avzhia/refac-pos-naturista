/* ═══════════════════════════════════════════════
   js/modules/devoluciones.js
   Flujo de devolución / cambio de producto (3 pasos)
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, mxPesos, fechaHoyLocal } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

const _s = {
  step:          1,
  ventaSel:      null,
  prodsSel:      [],       // [{...item, qty_dev}]
  prodCambioSel: null,
  todasVentas:   [],
  tabActiva:     'numero',
};

// ── Abrir modal (SIEMPRE limpio) ──────────────────────────────────────────────

async function abrirModal() {
  _resetear();
  _mostrarStep(1);
  document.getElementById('modal-devolucion').classList.add('open');

  // Cargar ventas recientes (últimos 7 días)
  try {
    const hoy    = fechaHoyLocal();
    const hace7d = new Date(); hace7d.setDate(hace7d.getDate() - 7);
    const hace7  = `${hace7d.getFullYear()}-${String(hace7d.getMonth()+1).padStart(2,'0')}-${String(hace7d.getDate()).padStart(2,'0')}`;
    const tid    = Estado.config.tiendaId || '';
    _s.todasVentas = await API.getVentas(hace7, hoy, tid);
    _filtrarLista();
  } catch(e) { console.error(e); }
}

function _resetear() {
  _s.step          = 1;
  _s.ventaSel      = null;
  _s.prodsSel      = [];
  _s.prodCambioSel = null;

  // Reset inputs paso 1
  const numInput = document.getElementById('dev-ticket-num');
  const buscar   = document.getElementById('dev-lista-buscar');
  const selInfo  = document.getElementById('dev-venta-seleccionada');
  if (numInput) numInput.value = '';
  if (buscar)   buscar.value   = '';
  if (selInfo)  selInfo.style.display = 'none';
  _btnNext(false);

  // Reset paso 3
  const tipoDevolucion = document.querySelector('input[name="dev-tipo"][value="devolucion"]');
  const pagoEfectivo   = document.querySelector('input[name="dev-pago-regreso"][value="Efectivo"]');
  const destinoInv     = document.querySelector('input[name="dev-destino"][value="inventario"]');
  if (tipoDevolucion) tipoDevolucion.checked = true;
  if (pagoEfectivo)   pagoEfectivo.checked   = true;
  if (destinoInv)     destinoInv.checked     = true;

  const cambioSection  = document.getElementById('dev-cambio-section');
  const cambioBuscar   = document.getElementById('dev-cambio-buscar');
  const cambioSel      = document.getElementById('dev-cambio-sel');
  const cambioBuscarLi = document.getElementById('dev-cambio-lista');
  const devResumen     = document.getElementById('dev-resumen');
  const motivoRow      = document.getElementById('dev-motivo-merma-row');
  if (cambioSection)  cambioSection.style.display  = 'none';
  if (cambioBuscar)   cambioBuscar.value           = '';
  if (cambioSel)      { cambioSel.style.display    = 'none'; cambioSel.innerHTML = ''; }
  if (cambioBuscarLi) cambioBuscarLi.innerHTML     = '';
  if (devResumen)     devResumen.innerHTML          = '';
  if (motivoRow)      motivoRow.style.display       = 'none';

  _onTipoChange();
}

// ── Navegación de pasos ───────────────────────────────────────────────────────

function _mostrarStep(n) {
  _s.step = n;
  document.querySelectorAll('.dev-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`dev-step-${n}`)?.classList.add('active');

  const btnBack    = document.getElementById('dev-btn-back');
  const btnNext    = document.getElementById('dev-btn-next');
  const btnConfirm = document.getElementById('dev-btn-confirm');
  const title      = document.getElementById('dev-modal-title');

  if (btnBack)    btnBack.style.display    = n > 1 ? 'inline-flex' : 'none';
  if (btnNext)    btnNext.style.display    = n < 3 ? 'inline-flex' : 'none';
  if (btnConfirm) btnConfirm.style.display = n === 3 ? 'inline-flex' : 'none';

  const titulos = ['','Paso 1 — Localizar la venta','Paso 2 — Productos a devolver','Paso 3 — Confirmar movimiento'];
  if (title) title.textContent = titulos[n];

  if (n === 3) _renderResumen();
}

async function siguiente() {
  if (_s.step === 1) {
    if (!_s.ventaSel) { showNotif('⚠ Selecciona una venta'); return; }
    await _renderProdsSel();
    _mostrarStep(2);
  } else if (_s.step === 2) {
    _s.prodsSel = [];
    document.querySelectorAll('#dev-prods-lista input[type=checkbox]:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const qty = parseInt(document.getElementById(`dev-qty-${idx}`)?.value ?? '1') || 1;
      const item = _s.ventaSel.items?.[idx];
      if (item) _s.prodsSel.push({ ...item, qty_dev: Math.min(qty, item.cantidad) });
    });
    if (!_s.prodsSel.length) { showNotif('⚠ Selecciona al menos un producto'); return; }
    _mostrarStep(3);
  }
}

function atras() { _mostrarStep(_s.step - 1); }

function cerrar() {
  document.getElementById('modal-devolucion').classList.remove('open');
}

function _btnNext(activo) {
  const btn = document.getElementById('dev-btn-next');
  if (btn) btn.disabled = !activo;
}

// ── Paso 1 — Buscar venta ─────────────────────────────────────────────────────

function setTab(tab) {
  _s.tabActiva = tab;
  document.querySelectorAll('.dev-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.devTab === tab);
  });
  document.querySelectorAll('.dev-panel').forEach(p => {
    p.classList.toggle('active', p.id === `dev-tab-${tab}`);
  });
}

async function buscarPorNumero() {
  const num = parseInt(document.getElementById('dev-ticket-num')?.value ?? '0');
  if (!num) { showNotif('⚠ Ingresa el número de ticket'); return; }
  try {
    const venta = await API.getVentaById(num);
    if (!venta?.id) { showNotif('⚠ Venta no encontrada'); return; }
    seleccionarVenta(venta);
  } catch(e) {
    showNotif('⚠ Venta no encontrada');
  }
}

function _filtrarLista() {
  const q     = document.getElementById('dev-lista-buscar')?.value?.toLowerCase() ?? '';
  const lista = q
    ? _s.todasVentas.filter(v =>
        (v.cliente_nombre||'').toLowerCase().includes(q) ||
        (v.items||[]).some(i => i.nombre.toLowerCase().includes(q)) ||
        String(v.id).includes(q))
    : _s.todasVentas.slice(0, 20);

  const cont = document.getElementById('dev-lista-ventas');
  if (!cont) return;
  if (!lista.length) { cont.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px;">Sin resultados.</div>'; return; }

  cont.innerHTML = lista.map(v => {
    const d      = new Date(v.fecha);
    const fecha  = d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'2-digit', timeZone: 'America/Mexico_City' });
    const hora   = d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Mexico_City' });
    const prods  = (v.items||[]).map(i => i.nombre).join(', ');
    const selCls = _s.ventaSel?.id === v.id ? 'sel' : '';
    return `
      <div class="dev-venta-row ${selCls}" data-venta-id="${v.id}">
        <div style="min-width:36px;font-size:12px;font-weight:500;color:var(--g1)">#${v.id}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;">${v.cliente_nombre||'Público General'}</div>
          <div style="font-size:11px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${prods}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;color:var(--txt3)">${fecha} ${hora}</div>
          <div style="font-size:12px;font-weight:500;color:var(--g1)">${mxPesos(v.total)}</div>
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('.dev-venta-row').forEach(row => {
    row.addEventListener('click', () => {
      const id    = parseInt(row.dataset.ventaId);
      const venta = _s.todasVentas.find(v => v.id === id);
      if (venta) seleccionarVenta(venta);
    });
  });
}

function seleccionarVenta(venta) {
  _s.ventaSel = venta;
  const infoEl = document.getElementById('dev-venta-info');
  const selEl  = document.getElementById('dev-venta-seleccionada');
  if (infoEl) infoEl.textContent = `#${venta.id} · ${venta.cliente_nombre||'Público General'} · ${mxPesos(venta.total)}`;
  if (selEl)  selEl.style.display = '';
  _btnNext(true);
  _filtrarLista(); // re-renderizar para marcar sel
}

// ── Paso 2 — Seleccionar productos ───────────────────────────────────────────

async function _renderProdsSel() {
  const items = _s.ventaSel?.items || [];
  const cont  = document.getElementById('dev-prods-lista');
  if (!cont) return;

  if (!items.length) {
    cont.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px;">Sin productos en esta venta.</div>';
    return;
  }

  // Cargar devoluciones previas de esta venta
  let yaDevueltos = {};
  try {
    const devs = await API.getDevoluciones({ venta_id: _s.ventaSel.id });
    devs.forEach(d => {
      const key = d.producto_id;
      yaDevueltos[key] = (yaDevueltos[key] || 0) + d.cantidad;
    });
  } catch(e) {}

  cont.innerHTML = items.map((item, idx) => {
    const yaDevuelto   = yaDevueltos[item.producto_id] || 0;
    const disponible   = item.cantidad - yaDevuelto;
    const yaCompleto   = disponible <= 0;
    return `
      <div class="dev-prod-check" style="${yaCompleto ? 'opacity:.5;' : ''}">
        <input type="checkbox" data-idx="${idx}" id="dev-chk-${idx}"
          ${yaCompleto ? 'disabled' : ''}>
        <label for="dev-chk-${idx}" style="flex:1;font-size:13px;cursor:${yaCompleto?'default':'pointer'};">
          ${item.nombre} — ${mxPesos(item.precio_unit)} c/u
          ${yaCompleto
            ? '<span style="color:var(--red-txt);font-size:11px;margin-left:4px;">✓ Ya devuelto</span>'
            : `<span style="color:var(--txt3);font-size:11px;">(disponible: ${disponible})</span>`}
        </label>
        ${!yaCompleto ? `
          <span style="font-size:12px;color:var(--txt3);margin-right:4px;">Cant:</span>
          <input type="number" class="dev-qty" id="dev-qty-${idx}"
            value="${disponible}" min="1" max="${disponible}">
        ` : ''}
      </div>
    `;
  }).join('');
}

// ── Paso 3 — Resumen ─────────────────────────────────────────────────────────

function _onTipoChange() {
  const tipo         = document.querySelector('input[name="dev-tipo"]:checked')?.value || 'devolucion';
  const cambioSec    = document.getElementById('dev-cambio-section');
  const pagoSection  = document.querySelector('.form-row:has(input[name="dev-pago-regreso"])');

  if (cambioSec) cambioSec.style.display = tipo === 'cambio' ? '' : 'none';
  if (tipo === 'cambio') {
    // N/A es la opción por defecto para cambio
    const naOpt = document.querySelector('input[name="dev-pago-regreso"][value="N/A"]');
    if (naOpt) naOpt.checked = true;
  } else {
    const efOpt = document.querySelector('input[name="dev-pago-regreso"][value="Efectivo"]');
    if (efOpt) efOpt.checked = true;
  }
  _renderResumen();
}

function _onDestinoChange() {
  const destino  = document.querySelector('input[name="dev-destino"]:checked')?.value || 'inventario';
  const motivoRow = document.getElementById('dev-motivo-merma-row');
  if (motivoRow) motivoRow.style.display = destino === 'merma' ? '' : 'none';
}

function _renderResumen() {
  const cont = document.getElementById('dev-resumen');
  if (!cont || !_s.prodsSel.length) return;

  const tipo       = document.querySelector('input[name="dev-tipo"]:checked')?.value || 'devolucion';
  const destino    = document.querySelector('input[name="dev-destino"]:checked')?.value || 'inventario';

  // CRÍTICO: usar precio_unit del item (ya tiene descuento proporcional)
  const totalDev   = _s.prodsSel.reduce((s, p) => s + p.precio_unit * p.qty_dev, 0);
  const totalCambio = tipo === 'cambio' && _s.prodCambioSel ? _s.prodCambioSel.precio : 0;
  const diferencia  = totalCambio - totalDev;

  let html = '<strong>Productos a devolver:</strong><br>';
  _s.prodsSel.forEach(p => {
    html += `&nbsp;• ${p.nombre} ×${p.qty_dev} = ${mxPesos(p.precio_unit * p.qty_dev)}<br>`;
  });
  html += `<strong>Subtotal devolución: ${mxPesos(totalDev)}</strong><br>`;

  if (tipo === 'devolucion') {
    html += `<span style="color:var(--red-txt);">Devolver al cliente: ${mxPesos(totalDev)}</span><br>`;
    html += `Destino producto: ${destino === 'merma' ? 'Merma' : 'Regresa a inventario'}`;
  } else if (tipo === 'cambio') {
    if (_s.prodCambioSel) {
      html += `<strong>Producto de cambio:</strong> ${_s.prodCambioSel.nombre} = ${mxPesos(totalCambio)}<br>`;
      if (diferencia > 0)       html += `<span style="color:var(--amber-txt);">Cliente paga diferencia: ${mxPesos(diferencia)}</span>`;
      else if (diferencia < 0)  html += `<span style="color:var(--red-txt);">Devolver al cliente: ${mxPesos(Math.abs(diferencia))}</span>`;
      else                       html += '<span style="color:var(--green-txt);">Sin diferencia de pago</span>';
    } else {
      html += '<span style="color:var(--txt3);">Selecciona el producto de cambio</span>';
    }
  }

  cont.innerHTML = html;
}

// ── Buscador producto de cambio ───────────────────────────────────────────────

function filtrarCambio() {
  const q    = document.getElementById('dev-cambio-buscar')?.value?.toLowerCase() ?? '';
  const cont = document.getElementById('dev-cambio-lista');
  if (!cont) return;

  const lista = Estado.productos.filter(p =>
    p.nombre.toLowerCase().includes(q) &&
    (p.lotes||[]).reduce((s,l) => s + l.stock, 0) > 0
  ).slice(0, 8);

  cont.innerHTML = lista.map(p => `
    <div class="dev-venta-row" data-prod-id="${p.id}"
      style="margin-bottom:4px;">
      <span style="font-size:16px;">${p.icono||'🌿'}</span>
      <span style="flex:1;font-size:13px;">${p.nombre}</span>
      <span style="font-size:13px;font-weight:500;color:var(--g1);">${mxPesos(p.precio)}</span>
    </div>
  `).join('');

  cont.querySelectorAll('[data-prod-id]').forEach(row => {
    row.addEventListener('mousedown', () => {
      const id = parseInt(row.dataset.prodId);
      seleccionarProdCambio(id);
    });
  });
}

function seleccionarProdCambio(id) {
  const prod = Estado.productos.find(p => p.id === id);
  if (!prod) return;
  _s.prodCambioSel = prod;

  const input  = document.getElementById('dev-cambio-buscar');
  const lista  = document.getElementById('dev-cambio-lista');
  const selEl  = document.getElementById('dev-cambio-sel');
  if (input) input.value = prod.nombre;
  if (lista) lista.innerHTML = '';
  if (selEl) {
    selEl.style.display = '';
    selEl.innerHTML = `${prod.icono||'🌿'} <strong>${prod.nombre}</strong> — ${mxPesos(prod.precio)}`;
  }
  _renderResumen();
}

// ── Confirmar ─────────────────────────────────────────────────────────────────

async function confirmar() {
  const tipo    = document.querySelector('input[name="dev-tipo"]:checked')?.value    || 'devolucion';
  const destino = document.querySelector('input[name="dev-destino"]:checked')?.value || 'inventario';
  const pagoReg = document.querySelector('input[name="dev-pago-regreso"]:checked')?.value || 'Efectivo';
  const motivo  = document.getElementById('dev-motivo-merma')?.value?.trim() ?? '';

  if (tipo === 'cambio' && !_s.prodCambioSel) {
    showNotif('⚠ Selecciona el producto de cambio');
    return;
  }

  const cajero   = Estado.config.cajero  || '';
  const tiendaId = Estado.config.tiendaId || 1;

  try {
    for (const prod of _s.prodsSel) {
      await API.registrarDevolucion({
        venta_id:           _s.ventaSel.id,
        producto_id:        prod.producto_id,
        nombre_prod:        prod.nombre,
        cantidad:           prod.qty_dev,
        // CRÍTICO: monto basado en precio_unit (con descuento proporcional)
        monto:              prod.precio_unit * prod.qty_dev,
        motivo:             tipo === 'cambio'
          ? `Cambio por ${_s.prodCambioSel?.nombre || 'otro producto'}`
          : (motivo || 'Devolución'),
        cajero,
        tienda_id:          tiendaId,
        regresar_inventario: destino === 'inventario',
        forma_pago_regreso: pagoReg,
      });
    }

    // Si es cambio, registrar nueva venta con el producto de cambio
    if (tipo === 'cambio' && _s.prodCambioSel) {
      await API.registrarVenta({
        cliente_id: _s.ventaSel.cliente_id || 1,
        tienda_id:  tiendaId,
        cajero,
        forma_pago: pagoReg === 'N/A' ? 'Efectivo' : pagoReg,
        total:      _s.prodCambioSel.precio,
        notas:      `Cambio por devolución ticket #${_s.ventaSel.id}`,
        items: [{
          producto_id: _s.prodCambioSel.id,
          nombre_prod: _s.prodCambioSel.nombre,
          cantidad:    1,
          precio_unit: _s.prodCambioSel.precio,
          subtotal:    _s.prodCambioSel.precio,
        }],
      });
    }

    cerrar();
    showNotif('✓ Movimiento registrado correctamente');

    // Recargar productos para actualizar stock
    const prods = await API.getProductos().catch(() => null);
    if (prods) { Estado.productos = prods; }

    // Notificar a ventas para re-renderizar
    document.dispatchEvent(new CustomEvent('pos:devolucion-completada'));
  } catch(e) {
    showNotif('⚠ Error al registrar movimiento');
    console.error(e);
  }
}

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  // Abrir modal
  document.addEventListener('pos:abrir-devolucion', abrirModal);

  // Tabs paso 1
  document.querySelectorAll('[data-dev-tab]').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.devTab));
  });

  // Buscar por número
  document.getElementById('dev-buscar-num-btn')?.addEventListener('click', buscarPorNumero);
  document.getElementById('dev-ticket-num')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscarPorNumero();
  });

  // Buscar en lista
  document.getElementById('dev-lista-buscar')?.addEventListener('input', _filtrarLista);

  // Navegación pasos
  document.getElementById('dev-btn-next')?.addEventListener('click', siguiente);
  document.getElementById('dev-btn-back')?.addEventListener('click', atras);
  document.getElementById('dev-btn-confirm')?.addEventListener('click', confirmar);
  document.getElementById('dev-btn-cancel')?.addEventListener('click', cerrar);

  // Cerrar al click fuera
  document.getElementById('modal-devolucion')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrar();
  });

  // Tipo de movimiento
  document.querySelectorAll('input[name="dev-tipo"]').forEach(r => {
    r.addEventListener('change', _onTipoChange);
  });

  // Destino producto
  document.querySelectorAll('input[name="dev-destino"]').forEach(r => {
    r.addEventListener('change', _onDestinoChange);
  });

  // Forma de pago regreso
  document.querySelectorAll('input[name="dev-pago-regreso"]').forEach(r => {
    r.addEventListener('change', _renderResumen);
  });

  // Buscador producto cambio
  document.getElementById('dev-cambio-buscar')?.addEventListener('input', filtrarCambio);
  document.getElementById('dev-cambio-buscar')?.addEventListener('blur', () => {
    setTimeout(() => {
      const lista = document.getElementById('dev-cambio-lista');
      if (lista) lista.innerHTML = '';
    }, 200);
  });
}

document.addEventListener('DOMContentLoaded', conectar);

export default { abrirModal, cerrar };

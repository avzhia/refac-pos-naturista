/* ═══════════════════════════════════════════════
   js/modules/clientes.js
   Gestión de clientes y su historial
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, confirmar, mxPesos, fechaHoyLocal } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

const _s = {
  clientes:  [],
  editId:    null,
};

// ── Inicialización ────────────────────────────────────────────────────────────

async function init() {
  try {
    const clientes = await API.getClientes();
    _s.clientes    = clientes;
    Estado.clientes = clientes;
  } catch(e) {
    showNotif('⚠ Error al cargar clientes');
    return;
  }
  _renderKPIs();
  render();
  _renderCumpleBanner();
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function _renderKPIs() {
  const mesActual = new Date().getMonth() + 1;
  const total     = _s.clientes.filter(c => c.tipo !== 'general').length;
  const frec      = _s.clientes.filter(c => c.tipo !== 'general' && (c.total_compras||0) >= 5).length;
  const cumple    = _s.clientes.filter(c => {
    if (!c.fecha_cumple) return false;
    const mes = parseInt(c.fecha_cumple.split('-')[1]);
    return mes === mesActual;
  }).length;
  const vtas      = _s.clientes.reduce((s, c) => s + (c.total_gastado||0), 0);

  _set('cl-kpi-total', total);
  _set('cl-kpi-frec',  frec);
  _set('cl-kpi-cump',  cumple);
  _set('cl-kpi-vtas',  mxPesos(vtas));
}

function _renderCumpleBanner() {
  const cont = document.getElementById('cl-cumple-banner');
  if (!cont) return;
  const mesActual = new Date().getMonth() + 1;
  const cumples   = _s.clientes.filter(c => {
    if (!c.fecha_cumple || c.tipo === 'general') return false;
    return parseInt(c.fecha_cumple.split('-')[1]) === mesActual;
  });
  if (!cumples.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = `
    <div class="cumple-banner">
      🎂 ${cumples.length} cliente(s) cumplen años este mes:
      ${cumples.map(c => `<strong>${c.nombre}</strong>`).join(', ')}
    </div>
  `;
}

// ── Render grid ───────────────────────────────────────────────────────────────

function render() {
  const q       = document.getElementById('cl-search-input')?.value?.toLowerCase() ?? '';
  const filtTipo = document.getElementById('cl-filt-tipo')?.value ?? '';
  const mesActual = new Date().getMonth() + 1;

  const lista = _s.clientes.filter(c => {
    if (q && !c.nombre.toLowerCase().includes(q) &&
        !(c.telefono||'').includes(q) &&
        !(c.email||'').toLowerCase().includes(q)) return false;

    if (filtTipo === 'frecuente'  && (c.total_compras||0) < 5)  return false;
    if (filtTipo === 'ocasional'  && (c.total_compras||0) >= 5) return false;
    if (filtTipo === 'cumple') {
      if (!c.fecha_cumple) return false;
      const mes = parseInt(c.fecha_cumple.split('-')[1]);
      if (mes !== mesActual) return false;
    }
    return true;
  });

  const grid = document.getElementById('cl-grid');
  if (!grid) return;
  if (!lista.length) {
    grid.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:20px 0;">Sin clientes con los filtros actuales.</div>';
    return;
  }

  grid.innerHTML = lista.map(c => _renderCard(c)).join('');
  grid.querySelectorAll('.cl-card').forEach(card => {
    card.addEventListener('click', () => abrirDetalle(parseInt(card.dataset.clienteId)));
  });
}

function _renderCard(c) {
  const esGeneral = c.tipo === 'general';
  const iniciales = c.nombre.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
  const tipoBadge = c.tipo === 'frecuente'
    ? '<span class="badge badge-frec">Frecuente</span>'
    : c.tipo === 'ocasional' ? '<span class="badge badge-ocas">Ocasional</span>' : '';

  return `
    <div class="cl-card ${esGeneral ? 'general' : ''}" data-cliente-id="${c.id}">
      <div class="cl-head">
        <div class="avatar ${esGeneral ? 'av-gen' : 'av-reg'}">${esGeneral ? '🌿' : iniciales}</div>
        <div>
          <div class="cl-name">${c.nombre} ${tipoBadge}</div>
          <div class="cl-since">Cliente desde ${c.cliente_desde || '—'}</div>
        </div>
      </div>
      <div class="cl-info-grid">
        <div><div class="ci-lbl">Teléfono</div><div class="ci-val">${c.telefono||'—'}</div></div>
        <div><div class="ci-lbl">Email</div><div class="ci-val" style="overflow:hidden;text-overflow:ellipsis;">${c.email||'—'}</div></div>
        <div><div class="ci-lbl">Cumpleaños</div><div class="ci-val">${c.fecha_cumple||'—'}</div></div>
        <div><div class="ci-lbl">Compras</div><div class="ci-val">${c.total_compras||0}</div></div>
      </div>
      ${c.notas ? `<div class="cl-notas">${c.notas}</div>` : ''}
      <div class="cl-footer">
        <span class="cl-total">${mxPesos(c.total_gastado||0)}</span>
        <span class="cl-compras">${c.total_compras||0} compra(s)</span>
      </div>
    </div>
  `;
}

// ── Detalle cliente ───────────────────────────────────────────────────────────

async function abrirDetalle(id) {
  const c = _s.clientes.find(x => x.id === id);
  if (!c) return;

  const hdr  = document.getElementById('cl-detail-hdr');
  const body = document.getElementById('cl-detail-body');
  const esGeneral = c.tipo === 'general';

  if (hdr) {
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:16px;font-weight:500;">${c.nombre}</div>
          <div style="font-size:12px;color:var(--txt3);">
            ${c.telefono||'Sin teléfono'} · ${c.email||'Sin email'}
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          ${!esGeneral ? `<button class="btn-green" id="cl-det-editar">✏ Editar</button>` : ''}
          ${!esGeneral ? `<button class="btn-outline" id="cl-det-eliminar" style="color:var(--red-txt);">🗑 Eliminar</button>` : ''}
          <button class="btn-cancel" id="cl-det-cerrar">✕ Cerrar</button>
        </div>
      </div>
    `;
    document.getElementById('cl-det-cerrar')?.addEventListener('click', cerrarDetalle);
    document.getElementById('cl-det-editar')?.addEventListener('click', () => { cerrarDetalle(); abrirForm(id); });
    document.getElementById('cl-det-eliminar')?.addEventListener('click', () => eliminarCliente(id));
  }

  if (body) {
    body.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:12px 0;">Cargando historial...</div>';
    document.getElementById('cl-detail-panel').classList.add('open');
    try {
      const ventas = await API.get(`/api/clientes/${id}/ventas`).catch(() => []);
      const filas = ventas.length
        ? ventas.map(v => `
            <div class="hist-row">
              <span style="color:var(--txt3);">${v.fecha?.substring(0,10)||'—'}</span>
              <span>${(v.items||[]).map(i=>i.nombre).join(', ').substring(0,40)||'—'}</span>
              <span style="font-weight:500;color:var(--g1);">${mxPesos(v.total)}</span>
            </div>
          `).join('')
        : '<div style="color:var(--txt3);font-size:13px;padding:8px;">Sin compras registradas.</div>';

      body.innerHTML = `
        <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div><span style="color:var(--txt3);">Total compras:</span> <strong>${c.total_compras||0}</strong></div>
          <div><span style="color:var(--txt3);">Total gastado:</span> <strong>${mxPesos(c.total_gastado||0)}</strong></div>
          <div><span style="color:var(--txt3);">Cumpleaños:</span> ${c.fecha_cumple||'—'}</div>
          <div><span style="color:var(--txt3);">Cliente desde:</span> ${c.cliente_desde||'—'}</div>
        </div>
        ${c.notas ? `<div class="cl-notas" style="margin-bottom:12px;">${c.notas}</div>` : ''}
        <div style="font-size:11px;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Historial de compras</div>
        ${filas}
      `;
    } catch(e) {
      body.innerHTML = '<div style="color:var(--red-txt);font-size:13px;">Error al cargar historial.</div>';
    }
  }
}

function cerrarDetalle() {
  document.getElementById('cl-detail-panel').classList.remove('open');
}

// ── Modal formulario ──────────────────────────────────────────────────────────

function abrirForm(id = null) {
  _s.editId = id;
  document.getElementById('modal-cliente-title').textContent = id ? 'Editar cliente' : 'Nuevo cliente';

  if (id) {
    const c = _s.clientes.find(x => x.id === id);
    if (!c) return;
    _val('cl-f-nombre', c.nombre);
    _val('cl-f-tel',    c.telefono || '');
    _val('cl-f-email',  c.email || '');
    _val('cl-f-cumple', c.fecha_cumple || '');
    _val('cl-f-desde',  c.cliente_desde || '');
    _val('cl-f-notas',  c.notas || '');
  } else {
    _val('cl-f-nombre', '');
    _val('cl-f-tel',    '');
    _val('cl-f-email',  '');
    _val('cl-f-cumple', '');
    _val('cl-f-desde',  fechaHoyLocal());
    _val('cl-f-notas',  '');
  }
  document.getElementById('modal-cliente').classList.add('open');
}

async function guardar() {
  const nombre = document.getElementById('cl-f-nombre')?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre'); return; }

  const data = {
    nombre,
    telefono:      document.getElementById('cl-f-tel')?.value?.trim()    || '',
    email:         document.getElementById('cl-f-email')?.value?.trim()   || '',
    fecha_cumple:  document.getElementById('cl-f-cumple')?.value          || null,
    cliente_desde: document.getElementById('cl-f-desde')?.value           || fechaHoyLocal(),
    notas:         document.getElementById('cl-f-notas')?.value?.trim()   || '',
    tipo:          'regular',
    activo:        true,
  };

  try {
    if (_s.editId) await API.editarCliente(_s.editId, data);
    else           await API.crearCliente(data);
    cerrarForm();
    await init();
    showNotif(`✓ Cliente ${_s.editId ? 'actualizado' : 'creado'}`);
  } catch(e) {
    showNotif('⚠ Error al guardar cliente');
  }
}

async function eliminarCliente(id) {
  const c = _s.clientes.find(x => x.id === id);
  if (c?.id === 1) { showNotif('⚠ El cliente Público General no se puede eliminar'); return; }
  const ok = await confirmar(`¿Eliminar a "${c?.nombre}"?`, 'Eliminar cliente');
  if (!ok) return;
  try {
    await API.eliminarCliente(id);
    cerrarDetalle();
    await init();
    showNotif('✓ Cliente eliminado');
  } catch(e) {
    showNotif('⚠ Error al eliminar cliente');
  }
}

function cerrarForm() {
  document.getElementById('modal-cliente').classList.remove('open');
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function _val(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  document.getElementById('cl-search-input')?.addEventListener('input', render);
  document.getElementById('cl-filt-tipo')?.addEventListener('change', render);
  document.getElementById('cl-btn-nuevo')?.addEventListener('click', () => abrirForm());
  document.getElementById('modal-cliente-save')?.addEventListener('click', guardar);
  document.getElementById('modal-cliente-cancel')?.addEventListener('click', cerrarForm);
  document.getElementById('modal-cliente')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarForm();
  });
  document.getElementById('cl-detail-panel')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarDetalle();
  });
  document.addEventListener('pos:navegar', e => {
    if (e.detail?.modulo === 'clientes') init();
  });
}

document.addEventListener('DOMContentLoaded', conectar);

export default { init, abrirForm };

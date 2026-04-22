/* ═══════════════════════════════════════════════
   js/modules/inventario.js
   Gestión de productos, lotes, categorías y proveedores
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, confirmar, mxPesos, fechaHoyLocal } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

const _s = {
  productos:     [],
  categorias:    [],
  proveedores:   [],
  editProdId:    null,
  editLoteId:    null,
  editLoteProdId: null,
  listaFiltrada: [],
};

// ── Helpers de fecha / stock ──────────────────────────────────────────────────

function diasHastaCaducidad(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const cad = new Date(fechaStr + 'T12:00:00');
  return Math.round((cad - hoy) / 86400000);
}

function stockProd(p) {
  return (p.lotes || []).filter(l => l.numero_lote !== 'DEV')
    .reduce((s, l) => s + (l.stock || 0), 0);
}

function proximaCaducidad(p) {
  const lotes = (p.lotes || []).filter(l => l.numero_lote !== 'DEV' && l.caduca && l.fecha_caducidad && l.stock > 0);
  if (!lotes.length) return null;
  lotes.sort((a, b) => new Date(a.fecha_caducidad) - new Date(b.fecha_caducidad));
  return lotes[0].fecha_caducidad;
}

// ── Inicialización ────────────────────────────────────────────────────────────

async function init() {
  try {
    const [prods, cats, provs] = await Promise.all([
      API.getProductos(),
      API.getCategorias(),
      API.getProveedores(),
    ]);
    _s.productos   = prods;
    _s.categorias  = cats;
    _s.proveedores = provs;
    Estado.productos = prods; // sincronizar con estado global
  } catch(e) {
    showNotif('⚠ Error al cargar inventario');
    return;
  }
  _renderKPIs();
  render();
  _poblarFiltros();
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function _renderKPIs() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let total = 0, bajo = 0, agotados = 0, prox30 = 0, vencidos = 0;
  let totalLotes = 0;

  _s.productos.forEach(p => {
    total++;
    const st = stockProd(p);
    if (st === 0) agotados++;
    else if (st <= (p.stock_min || 5)) bajo++;

    (p.lotes || []).filter(l => l.numero_lote !== 'DEV').forEach(l => {
      totalLotes++;
      if (!l.caduca || !l.fecha_caducidad) return;
      const dias = diasHastaCaducidad(l.fecha_caducidad);
      if (dias < 0) vencidos++;
      else if (dias <= 30) prox30++;
    });
  });

  _set('inv-kpi-total', total);
  _set('inv-kpi-lotes', `${totalLotes} lote(s)`);
  _set('inv-kpi-low',   bajo);
  _set('inv-kpi-out',   agotados);
  _set('inv-kpi-prox',  prox30);
  _set('inv-kpi-venc',  vencidos);
  _renderAlertas();
}

function _renderAlertas() {
  const cont = document.getElementById('inv-alertas');
  if (!cont) return;
  const alertas = [];
  _s.productos.forEach(p => {
    (p.lotes || []).filter(l => l.numero_lote !== 'DEV' && l.caduca && l.fecha_caducidad && l.stock > 0).forEach(l => {
      const dias = diasHastaCaducidad(l.fecha_caducidad);
      if (dias < 0)      alertas.push(`<div class="alerta-banner alerta-venc">⚠ ${p.nombre} — Lote ${l.numero_lote} VENCIDO</div>`);
      else if (dias <= 7) alertas.push(`<div class="alerta-banner alerta-prox">⏰ ${p.nombre} — Lote ${l.numero_lote} vence en ${dias} día(s)</div>`);
    });
  });
  cont.innerHTML = alertas.join('');
}

function _set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function _poblarFiltros() {
  const selCat   = document.getElementById('inv-filt-cat');
  const selProv  = document.getElementById('inv-filt-prov');
  const selMarca = document.getElementById('inv-filt-marca');
  if (selCat) {
    selCat.innerHTML = '<option value="">Todas las categorías</option>' +
      _s.categorias.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  }
  if (selProv) {
    selProv.innerHTML = '<option value="">Todos los proveedores</option>' +
      _s.proveedores.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
  }
  if (selMarca) {
    const marcas = [...new Set(
      (_s.productos || []).map(p => p.marca).filter(m => m && m !== 'Genérico')
    )].sort();
    const haySinMarca = (_s.productos || []).some(p => !p.marca || p.marca === 'Genérico');
    selMarca.innerHTML = '<option value="">Todas las marcas</option>' +
      marcas.map(m => `<option value="${m}">${m}</option>`).join('') +
      (haySinMarca ? '<option value="Genérico">Sin marca</option>' : '');
  }
}

function render() {
  const q        = document.getElementById('inv-search-input')?.value?.toLowerCase() ?? '';
  const catFilt  = document.getElementById('inv-filt-cat')?.value ?? '';
  const estFilt  = document.getElementById('inv-filt-est')?.value ?? '';
  const provFilt = document.getElementById('inv-filt-prov')?.value ?? '';
  const marcFilt = document.getElementById('inv-filt-marca')?.value ?? '';

  const lista = _s.productos.filter(p => {
    if (q) {
      const enNombre    = p.nombre.toLowerCase().includes(q);
      const enCategoria = p.categoria.toLowerCase().includes(q);
      const enMarca     = (p.marca||'').toLowerCase().includes(q);
      const enBarcode   = (p.codigo_barras||'').includes(q);
      const enProveedor = (p.lotes||[]).some(l => (l.proveedor_nombre||'').toLowerCase().includes(q));
      if (!enNombre && !enCategoria && !enMarca && !enBarcode && !enProveedor) return false;
    }
    if (catFilt && p.categoria !== catFilt) return false;
    if (marcFilt && (p.marca || 'Genérico') !== marcFilt) return false;
    if (provFilt) {
      const tieneP = (p.lotes||[]).some(l => l.proveedor_nombre === provFilt);
      if (!tieneP) return false;
    }
    if (estFilt) {
      const st   = stockProd(p);
      const cad  = proximaCaducidad(p);
      const dias = cad ? diasHastaCaducidad(cad) : null;
      if (estFilt === 'out'   && st > 0)                   return false;
      if (estFilt === 'low'   && !(st > 0 && st <= (p.stock_min||5))) return false;
      if (estFilt === 'stock' && st <= 0)                  return false;
      if (estFilt === 'venc'  && !(dias !== null && dias < 0)) return false;
      if (estFilt === 'prox'  && !(dias !== null && dias >= 0 && dias <= 30)) return false;
      if (estFilt === 'dev'   && !(p.lotes||[]).some(l => l.numero_lote === 'DEV' && l.stock > 0)) return false;
    }
    return true;
  });

  _s.listaFiltrada = lista;
  _renderTabla(lista);
}

// ── Tabla de productos ────────────────────────────────────────────────────────

function _renderTabla(lista) {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<div style="padding:20px;text-align:center;color:var(--txt3);font-size:13px;">Sin productos con los filtros actuales.</div>';
    return;
  }
  tbody.innerHTML = lista.map(p => _renderFilaProd(p)).join('');

  tbody.querySelectorAll('.inv-main-cells').forEach(row => {
    row.addEventListener('click', () => _toggleLotes(row, parseInt(row.dataset.prodId)));
  });
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const act = btn.dataset.action;
      const id  = parseInt(btn.dataset.id);
      const pid = parseInt(btn.dataset.pid || btn.dataset.id);
      if (act === 'edit-prod')   abrirFormProd(id);
      if (act === 'del-prod')    eliminarProducto(id);
      if (act === 'add-lote')    abrirFormLote(id);
      if (act === 'edit-lote')   abrirAjusteLote(id, pid);
      if (act === 'del-lote')    eliminarLote(id, pid);
    });
  });
}

function _cadBadge(cad) {
  if (!cad) return '<span style="color:var(--txt3)">—</span>';
  const dias = diasHastaCaducidad(cad);
  if (dias === null || isNaN(dias)) return `<span class="cad-badge cad-ok">${cad}</span>`;
  if (dias < 0)        return '<span class="cad-badge cad-venc">Vencido</span>';
  if (dias === 0)      return '<span class="cad-badge cad-prox">Hoy</span>';
  if (dias <= 7)       return `<span class="cad-badge cad-prox">${dias}d</span>`;
  if (dias <= 30)      return `<span class="cad-badge cad-prox">${dias}d</span>`;
  return `<span class="cad-badge cad-ok">${cad}</span>`;
}

function _estBadge(p) {
  const st   = stockProd(p);
  const cad  = proximaCaducidad(p);
  const dias = cad ? diasHastaCaducidad(cad) : null;
  const badges = [];

  if (st === 0) return '<span class="badge badge-out">Agotado</span>';
  if (dias !== null && !isNaN(dias) && dias < 0) return '<span class="badge badge-out">Vencido</span>';

  // Mostrar ambos badges si aplican simultaneamente
  if (st <= (p.stock_min||5))                              badges.push('<span class="badge badge-low">⚠ Stock bajo</span>');
  if (dias !== null && !isNaN(dias) && dias <= 30)         badges.push('<span class="badge badge-low">⏰ Vence pronto</span>');
  if (badges.length) return badges.join(' ');

  return '<span class="badge badge-ok">En stock</span>';
}

function _renderFilaProd(p) {
  const st  = stockProd(p);
  const cad = proximaCaducidad(p);
  const pct    = st > 0 ? Math.min(100, Math.round(st / Math.max(st, (p.stock_min||5) * 3) * 100)) : 0;
  const fillC  = st <= (p.stock_min||5) ? '#F5C84A' : 'var(--g3)';
  const lotesNodev = (p.lotes||[]).filter(l => l.numero_lote !== 'DEV');
  const lotesOrdenados = [
    ...(p.lotes||[]).filter(l => l.numero_lote !== 'DEV' && l.caduca && l.fecha_caducidad).sort((a,b) => new Date(a.fecha_caducidad)-new Date(b.fecha_caducidad)),
    ...(p.lotes||[]).filter(l => l.numero_lote !== 'DEV' && (!l.caduca || !l.fecha_caducidad)),
    ...(p.lotes||[]).filter(l => l.numero_lote === 'DEV' && l.stock > 0),
  ];

  return `
    <div class="inv-prod-row" id="inv-row-${p.id}">
      <div class="inv-main-cells" data-prod-id="${p.id}">
        <div class="inv-cell-prod">
          <span class="expand-icon" style="font-size:11px;color:var(--txt3);transition:transform .15s;">▶</span>
          <span style="font-size:15px;">${p.icono||'🌿'}</span>
          <div style="display:flex;flex-direction:column;gap:1px;min-width:0;">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:500;">${p.nombre}</span>
              ${p.marca && p.marca !== 'Genérico' ? `<span style="font-size:11px;color:var(--txt3);">${p.marca}</span>` : ''}
              <span style="font-size:12px;font-weight:600;color:var(--g2);">$${p.precio?.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              <span style="font-size:11px;color:var(--txt3);">${lotesNodev.length} lote(s)</span>
            </div>
          </div>
        </div>
        <div class="inv-cell"><span class="prod-cat-chip">${p.categoria}</span></div>
        <div class="inv-cell">
          <div style="display:flex;align-items:center;gap:5px;">
            <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${fillC};"></div></div>
            <span style="font-size:12px;font-weight:500;color:${fillC};">${st} uds</span>
          </div>
        </div>
        <div class="inv-cell" style="font-size:12px;">${_cadBadge(cad)}</div>
        <div class="inv-cell">${_estBadge(p)}</div>
        <div class="inv-cell-acc" onclick="event.stopPropagation()">
          <button class="lb" data-action="add-lote" data-id="${p.id}">+ Lote</button>
          <button class="lb" data-action="edit-prod" data-id="${p.id}">Editar</button>
          <button class="lb danger" data-action="del-prod" data-id="${p.id}">✕</button>
          ${p.url_ecommerce ? `<a class="lb ec-btn-inv" href="${p.url_ecommerce}" target="_blank" title="Ver en tienda online" onclick="event.stopPropagation()">🔗</a>` : ''}
        </div>
      </div>
      <div class="lotes-panel" id="lotes-${p.id}">
        <div class="lotes-title">Lotes (${lotesNodev.length})</div>
        ${lotesOrdenados.length
          ? lotesOrdenados.map(l => _renderFilaLote(l, p.id)).join('')
          : '<div style="font-size:12px;color:var(--txt3);">Sin lotes registrados.</div>'}
        <button class="btn-add-lote" data-action="add-lote" data-id="${p.id}">+ Agregar lote</button>
      </div>
    </div>
  `;
}

function _renderFilaLote(l, prodId) {
  const isDev = l.numero_lote === 'DEV';
  const dias = l.caduca && l.fecha_caducidad ? diasHastaCaducidad(l.fecha_caducidad) : null;
  let cadCls = 'cad-ok', cadTxt = l.caduca ? (l.fecha_caducidad || '—') : 'No caduca';
  if (dias !== null) {
    if (dias < 0)       { cadCls = 'cad-venc'; cadTxt = 'Vencido'; }
    else if (dias <= 30) { cadCls = 'cad-prox'; cadTxt = `${dias}d`; }
  }
  const prov = l.proveedor_nombre || '—';
  return `
    <div class="lote-row">
      <span style="font-weight:500;color:${isDev?'var(--amber-txt)':'var(--txt2)'};font-size:12px;">${isDev?'↩ DEV':l.numero_lote}</span>
      <span class="cad-badge ${cadCls}">${cadTxt}</span>
      <span style="font-weight:500;">${l.stock} uds</span>
      <span style="color:var(--txt3);">Costo: ${mxPesos(l.costo_unitario)} · ${prov}</span>
      <div style="display:flex;gap:4px;">
        <button class="lb" data-action="edit-lote" data-id="${l.id}" data-pid="${prodId}" title="Ajustar">Ajustar</button>
        <button class="lb danger" data-action="del-lote" data-id="${l.id}" data-pid="${prodId}" title="Eliminar">🗑</button>
      </div>
    </div>
  `;
}

function _toggleLotes(row, prodId) {
  const panel = document.getElementById(`lotes-${prodId}`);
  if (!panel) return;
  const abierto = panel.classList.toggle('open');
  row.classList.toggle('expanded', abierto);
}

// ── Catálogo de iconos naturistas ────────────────────────────────────────────

// ── Íconos — lista con metadatos de búsqueda ─────────────────────────────────
const ICONOS_DATA = [
  // Plantas y hierbas
  { ic:'🌿', t:'planta hierba natural verde hoja' },
  { ic:'🌱', t:'brote semilla planta nueva' },
  { ic:'🍃', t:'hoja planta verde natural' },
  { ic:'🌾', t:'trigo cereal grano semilla' },
  { ic:'🪴', t:'planta maceta interior' },
  { ic:'🌲', t:'árbol pino conífero' },
  { ic:'🌳', t:'árbol natural bosque' },
  { ic:'🌵', t:'cactus nopal suculenta' },
  { ic:'🍄', t:'hongo seta champiñón fungi' },
  { ic:'🪨', t:'mineral piedra roca sal' },
  { ic:'🌻', t:'girasol flor semilla aceite' },
  { ic:'🌸', t:'flor cereza rosa belleza' },
  { ic:'🌺', t:'flor hibisco belleza piel' },
  { ic:'🪷', t:'loto flor belleza spa' },
  // Tés e infusiones
  { ic:'🍵', t:'té infusión verde matcha' },
  { ic:'☕', t:'café té caliente taza' },
  { ic:'🫖', t:'tetera infusión té herbal' },
  { ic:'🧉', t:'mate infusión hierba' },
  { ic:'🫙', t:'frasco tarro conserva suplemento' },
  // Frutas, semillas y vegetales
  { ic:'🍋', t:'limón cítrico vitamina c' },
  { ic:'🍊', t:'naranja cítrico vitamina c' },
  { ic:'🍇', t:'uva antioxidante resveratrol' },
  { ic:'🫐', t:'arándano antioxidante berry' },
  { ic:'🍓', t:'fresa berry antioxidante' },
  { ic:'🥝', t:'kiwi vitamina c fruta' },
  { ic:'🍎', t:'manzana fruta fibra' },
  { ic:'🍏', t:'manzana verde fruta' },
  { ic:'🥑', t:'aguacate avocado omega grasa' },
  { ic:'🫒', t:'aceituna oliva aceite omega' },
  { ic:'🌰', t:'castaña nuez semilla' },
  { ic:'🥜', t:'cacahuate maní proteína nuez' },
  { ic:'🫘', t:'frijol legumbre proteína' },
  { ic:'🥥', t:'coco aceite coco grasa mct' },
  { ic:'🍯', t:'miel endulzante natural' },
  { ic:'🧄', t:'ajo allicina antibiótico' },
  { ic:'🧅', t:'cebolla allium antibiótico' },
  { ic:'🌶️', t:'chile capsaicina picante' },
  { ic:'🫛', t:'chícharo guisante legumbre' },
  // Suplementos y vitaminas
  { ic:'💊', t:'cápsula pastilla vitamina suplemento' },
  { ic:'🧴', t:'frasco suplemento líquido crema' },
  { ic:'💉', t:'inyectable ampolleta vitamina' },
  { ic:'⚗️', t:'extracto concentrado laboratorio' },
  { ic:'🔬', t:'investigación científico laboratorio' },
  { ic:'🧪', t:'fórmula extracto laboratorio' },
  { ic:'🫗', t:'líquido jarabe extracto' },
  { ic:'🧃', t:'jugo extracto bebida' },
  // Energía y rendimiento
  { ic:'⚡', t:'energía vitalidad rendimiento' },
  { ic:'🔋', t:'energía batería resistencia' },
  { ic:'💪', t:'músculo fuerza proteína rendimiento' },
  { ic:'🏃', t:'deporte ejercicio rendimiento' },
  { ic:'🧬', t:'genética adn celular' },
  { ic:'🫀', t:'corazón cardio circulación' },
  // Salud por sistema
  { ic:'🧠', t:'cerebro cognitivo memoria nootropico' },
  { ic:'❤️', t:'corazón amor cardio' },
  { ic:'🫁', t:'pulmón respiratorio bronquios' },
  { ic:'🦴', t:'hueso calcio articulación' },
  { ic:'🦷', t:'diente dental calcio' },
  { ic:'👁️', t:'ojo visión luteína' },
  { ic:'🩻', t:'hueso articulación rayos' },
  // Piel y belleza
  { ic:'✨', t:'brillo piel belleza luminosidad' },
  { ic:'💆', t:'relajación masaje bienestar' },
  { ic:'🧖', t:'spa cuidado piel facial' },
  // Aceites
  { ic:'💧', t:'agua hidratación líquido' },
  { ic:'🫧', t:'espuma limpieza jabón' },
  // Bienestar general
  { ic:'😴', t:'sueño descanso relajación melatonina' },
  { ic:'🧘', t:'yoga meditación bienestar relajación' },
  { ic:'🏋️', t:'pesas gimnasio proteína deportivo' },
  { ic:'🌞', t:'sol vitamina d energía' },
  { ic:'🌙', t:'noche sueño melatonina descanso' },
  { ic:'⭐', t:'estrella calidad premium' },
  { ic:'🌈', t:'multinutriente multivitamínico' },
  { ic:'🫚', t:'aceite extracto omega grasas' },
  { ic:'🧁', t:'endulzante dulce azúcar natural' },
];

function _renderIconGrid(inputId) {
  const panel  = document.getElementById('inv-icon-panel');
  const grid   = document.getElementById('inv-icon-grid');
  const input  = document.getElementById(inputId);
  const search = document.getElementById('inv-icon-search');
  if (!grid || !input) return;

  const q = search ? search.value.toLowerCase().trim() : '';
  const lista = q
    ? ICONOS_DATA.filter(d => d.t.includes(q) || d.ic === q)
    : ICONOS_DATA;

  grid.innerHTML = lista.map(d => `
    <div class="icon-opt ${input.value === d.ic ? 'sel' : ''}"
      data-ic="${d.ic}" title="${d.t}">${d.ic}</div>
  `).join('');

  grid.querySelectorAll('.icon-opt').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.ic;
      grid.querySelectorAll('.icon-opt').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      // Cerrar panel al seleccionar
      if (panel) panel.style.display = 'none';
      const toggle = document.getElementById('inv-icon-toggle');
      if (toggle) toggle.textContent = 'Elegir ícono ▾';
    });
  });
}

function _initIconToggle() {
  const toggle = document.getElementById('inv-icon-toggle');
  const panel  = document.getElementById('inv-icon-panel');
  const search = document.getElementById('inv-icon-search');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const open = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? 'Elegir ícono ▾' : 'Cerrar ▴';
    if (!open) {
      _renderIconGrid('inv-f-icon');
      search?.focus();
    }
  });

  search?.addEventListener('input', () => _renderIconGrid('inv-f-icon'));
}

// ── Modal Producto ────────────────────────────────────────────────────────────

async function abrirFormProd(id = null) {
  _s.editProdId = id;
  const titulo = document.getElementById('modal-prod-title');
  if (titulo) titulo.textContent = id ? 'Editar producto' : 'Agregar producto';

  // Asegurar que categorías estén cargadas
  if (!_s.categorias.length) {
    try { _s.categorias = await API.getCategorias(); } catch(e) {}
  }

  // Poblar select categorías
  const sel = document.getElementById('inv-f-cat');
  if (sel) sel.innerHTML = _s.categorias.map(c =>
    `<option value="${c.nombre}">${c.nombre}</option>`
  ).join('');

  if (id) {
    const p = _s.productos.find(x => x.id === id);
    if (!p) return;
    _val('inv-f-nombre',  p.nombre);
    _val('inv-f-icon',    p.icono || '🌿');
    _val('inv-f-precio',  p.precio);
    _val('inv-f-min',     p.stock_min || 5);
    _val('inv-f-barcode', p.codigo_barras || '');
    _val('inv-f-marca',   p.marca || '');
    _val('inv-f-url-ec',  p.url_ecommerce || '');
    if (sel) sel.value = p.categoria;
  } else {
    _val('inv-f-nombre',  '');
    _val('inv-f-icon',    '🌿');
    _val('inv-f-precio',  '');
    _val('inv-f-min',     '5');
    _val('inv-f-barcode', '');
    _val('inv-f-marca',   '');
    _val('inv-f-url-ec',  '');
  }
  // Cerrar panel de íconos al abrir modal
  const iconPanel = document.getElementById('inv-icon-panel');
  const iconToggle = document.getElementById('inv-icon-toggle');
  if (iconPanel) iconPanel.style.display = 'none';
  if (iconToggle) iconToggle.textContent = 'Elegir ícono ▾';
  document.getElementById('modal-prod').classList.add('open');
}

async function guardarProd() {
  const nombre  = document.getElementById('inv-f-nombre')?.value?.trim() ?? '';
  const cat     = document.getElementById('inv-f-cat')?.value ?? '';
  const icono   = document.getElementById('inv-f-icon')?.value?.trim() || '🌿';
  const precioStr = document.getElementById('inv-f-precio')?.value ?? '';
  const precio  = parseFloat(precioStr);
  const min     = parseInt(document.getElementById('inv-f-min')?.value ?? '5') || 5;
  const barcode  = document.getElementById('inv-f-barcode')?.value?.trim() || null;
  const marca    = document.getElementById('inv-f-marca')?.value?.trim() || 'Genérico';
  const urlEc    = document.getElementById('inv-f-url-ec')?.value?.trim() || null;

  if (!nombre)               { showNotif('⚠ Ingresa el nombre del producto'); return; }
  if (!cat)                  { showNotif('⚠ Selecciona una categoría'); return; }
  if (!precioStr || isNaN(precio) || precio < 0) { showNotif('⚠ Ingresa un precio válido'); return; }

  const data = { nombre, categoria: cat, icono, precio, stock_min: min, codigo_barras: barcode, marca, url_ecommerce: urlEc };
  try {
    if (_s.editProdId) await API.editarProducto(_s.editProdId, data);
    else               await API.crearProducto(data);
    cerrarModales();
    await init();
    showNotif(`✓ Producto ${_s.editProdId ? 'actualizado' : 'creado'}`);
  } catch(e) {
    console.error('[guardarProd]', e);
    showNotif('⚠ Error al guardar: ' + (e.message || 'revisa la consola'));
  }
}

async function eliminarProducto(id) {
  const p  = _s.productos.find(x => x.id === id);
  const st = p ? (p.lotes||[]).filter(l => l.numero_lote !== 'DEV').reduce((s,l) => s+l.stock,0) : 0;
  if (st > 0) { showNotif('⚠ No se puede eliminar: tiene lotes con stock'); return; }
  const ok = await confirmar(`¿Eliminar "${p?.nombre}"?`, 'Eliminar producto');
  if (!ok) return;
  try {
    await API.eliminarProducto(id);
    await init();
    showNotif('✓ Producto eliminado');
  } catch(e) {
    showNotif('⚠ Error al eliminar producto');
  }
}

// ── Modal Lote ────────────────────────────────────────────────────────────────

function _poblarSelectProv(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Sin proveedor</option>' +
    _s.proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}

function abrirFormLote(prodId) {
  _s.editLoteId    = null;
  _s.editLoteProdId = prodId;
  document.getElementById('modal-lote-title').textContent = 'Agregar lote';
  _val('inv-l-num',    '');  // vacío = se autogenera
  _val('inv-l-stock',  '');
  _val('inv-l-costo',  '');
  _val('inv-l-cad',    '');
  _val('inv-l-entrada', fechaHoyLocal());
  document.querySelector('input[name="inv-l-caduca"][value="1"]').checked = true;
  document.getElementById('inv-l-cad-row').style.display = '';
  _poblarSelectProv('inv-l-proveedor');
  document.getElementById('modal-lote').classList.add('open');
}

async function guardarLote() {
  let num       = document.getElementById('inv-l-num')?.value?.trim() ?? '';
  const caduca  = document.querySelector('input[name="inv-l-caduca"]:checked')?.value === '1';
  const cad     = document.getElementById('inv-l-cad')?.value ?? '';
  const stock   = parseInt(document.getElementById('inv-l-stock')?.value ?? '0');
  const costo   = parseFloat(document.getElementById('inv-l-costo')?.value ?? '0') || 0;
  const entrada = document.getElementById('inv-l-entrada')?.value ?? fechaHoyLocal();
  const provId  = parseInt(document.getElementById('inv-l-proveedor')?.value ?? '0') || null;

  // Autogenerar número de lote si se dejó vacío
  if (!num) {
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`;
    const seq   = String(Math.floor(Math.random() * 900) + 100); // 100-999
    num = `L-${fecha}-${seq}`;
    _val('inv-l-num', num);
  }
  if (stock < 1)          { showNotif('⚠ La cantidad debe ser mayor a 0'); return; }
  if (caduca && !cad)     { showNotif('⚠ Ingresa la fecha de caducidad'); return; }

  const data = {
    numero_lote:     num,
    caduca,
    fecha_caducidad: caduca ? cad : null,
    fecha_entrada:   entrada,
    stock,
    costo_unitario:  costo,
    proveedor_id:    provId,
  };
  try {
    await API.agregarLote(_s.editLoteProdId, data);
    cerrarModales();
    await init();
    showNotif('✓ Lote agregado');
  } catch(e) {
    showNotif('⚠ Error al agregar lote');
  }
}

function abrirAjusteLote(loteId, prodId) {
  _s.editLoteId     = loteId;
  _s.editLoteProdId = prodId;
  const prod = _s.productos.find(p => p.id === prodId);
  const lote = prod?.lotes?.find(l => l.id === loteId);
  if (!lote) return;

  _val('adj-l-num',    lote.numero_lote);
  _val('adj-l-stock',  lote.stock);
  _val('adj-l-costo',  lote.costo_unitario);
  _val('adj-l-cad',    lote.fecha_caducidad || '');
  _val('adj-l-entrada', lote.fecha_entrada || fechaHoyLocal());
  _val('adj-l-motivo-merma', '');

  const cadSi = document.querySelector('input[name="adj-l-caduca"][value="1"]');
  const cadNo = document.querySelector('input[name="adj-l-caduca"][value="0"]');
  if (lote.caduca) { if(cadSi) cadSi.checked = true; }
  else             { if(cadNo) cadNo.checked = true; document.getElementById('adj-l-cad-row').style.display = 'none'; }

  _poblarSelectProv('adj-l-proveedor');
  const adjProv = document.getElementById('adj-l-proveedor');
  if (adjProv && lote.proveedor_id) adjProv.value = lote.proveedor_id;

  document.getElementById('modal-adj-lote').classList.add('open');
}

async function guardarAjusteLote() {
  const stock   = parseInt(document.getElementById('adj-l-stock')?.value ?? '0');
  const costo   = parseFloat(document.getElementById('adj-l-costo')?.value ?? '0') || 0;
  const caduca  = document.querySelector('input[name="adj-l-caduca"]:checked')?.value === '1';
  const cad     = document.getElementById('adj-l-cad')?.value ?? '';
  const entrada = document.getElementById('adj-l-entrada')?.value ?? fechaHoyLocal();
  const provId  = parseInt(document.getElementById('adj-l-proveedor')?.value ?? '0') || null;
  const motivo  = document.getElementById('adj-l-motivo-merma')?.value?.trim() ?? '';

  if (stock < 0) { showNotif('⚠ Stock no puede ser negativo'); return; }

  try {
    // Obtener stock actual para detectar merma
    const prod      = _s.productos.find(p => p.id === _s.editLoteProdId);
    const loteActual = prod?.lotes?.find(l => l.id === _s.editLoteId);
    const diff       = (loteActual?.stock || 0) - stock;

    await API.editarLote(_s.editLoteId, {
      caduca, fecha_caducidad: caduca ? cad : null,
      fecha_entrada: entrada, stock, costo_unitario: costo, proveedor_id: provId,
    });

    // Registrar merma si hay motivo y reducción de stock
    if (motivo && diff > 0) {
      await API.registrarMerma({
        producto_id: _s.editLoteProdId,
        nombre_prod: prod?.nombre || '',
        lote_id:     _s.editLoteId,
        cantidad:    diff,
        motivo,
        cajero:      Estado.config.cajero || '',
        tienda_id:   Estado.config.tiendaId || 1,
      });
    }
    cerrarModales();
    await init();
    showNotif('✓ Lote actualizado');
  } catch(e) {
    showNotif('⚠ Error al actualizar lote');
  }
}

async function eliminarLote(loteId, prodId) {
  const prod = _s.productos.find(p => p.id === prodId);
  const lote = prod?.lotes?.find(l => l.id === loteId);
  if (lote?.stock > 0) { showNotif('⚠ No se puede eliminar: el lote tiene stock'); return; }
  const ok = await confirmar(`¿Eliminar lote "${lote?.numero_lote}"?`, 'Eliminar lote');
  if (!ok) return;
  try {
    await API.eliminarLote(loteId);
    await init();
    showNotif('✓ Lote eliminado');
  } catch(e) {
    showNotif('⚠ Error al eliminar lote');
  }
}

function toggleCaducidad(caduca, prefijo = 'inv-l') {
  const row = document.getElementById(`${prefijo}-cad-row`);
  if (row) row.style.display = caduca ? '' : 'none';
}

// ── Modal Categorías ──────────────────────────────────────────────────────────

async function abrirModalCats() {
  await _renderListaCats();
  document.getElementById('modal-cats').classList.add('open');
}

async function _renderListaCats() {
  const cont = document.getElementById('modal-cats-lista');
  if (!cont) return;
  cont.innerHTML = _s.categorias.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <span style="flex:1;font-size:13px;">${c.nombre}</span>
      <button class="lb danger" data-cat-id="${c.id}">🗑</button>
    </div>
  `).join('');
  cont.querySelectorAll('[data-cat-id]').forEach(btn => {
    btn.addEventListener('click', () => eliminarCategoria(parseInt(btn.dataset.catId)));
  });
}

async function crearCategoria() {
  const nombre = document.getElementById('modal-cats-nueva')?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre'); return; }
  try {
    await API.crearCategoria({ nombre, activa: true });
    document.getElementById('modal-cats-nueva').value = '';
    _s.categorias = await API.getCategorias();
    await _renderListaCats();
    _poblarFiltros();
    showNotif('✓ Categoría creada');
  } catch(e) {
    showNotif('⚠ Error al crear categoría');
  }
}

async function eliminarCategoria(id) {
  const cat  = _s.categorias.find(c => c.id === id);
  const enUso = _s.productos.some(p => p.categoria === cat?.nombre);
  if (enUso) { showNotif('⚠ No se puede eliminar: tiene productos asignados'); return; }
  const ok = await confirmar(`¿Eliminar categoría "${cat?.nombre}"?`, 'Eliminar categoría');
  if (!ok) return;
  try {
    await API.eliminarCategoria(id);
    _s.categorias = await API.getCategorias();
    await _renderListaCats();
    _poblarFiltros();
    showNotif('✓ Categoría eliminada');
  } catch(e) {
    showNotif('⚠ Error al eliminar categoría');
  }
}

// Abrir nueva categoría desde modal producto
function abrirNuevaCat() {
  document.getElementById('modal-cat').classList.add('open');
}

async function guardarNuevaCat() {
  const nombre = document.getElementById('cat-f-nombre')?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre'); return; }
  try {
    await API.crearCategoria({ nombre, activa: true });
    _s.categorias = await API.getCategorias();
    // Actualizar select del modal producto
    const sel = document.getElementById('inv-f-cat');
    if (sel) {
      sel.innerHTML = _s.categorias.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
      sel.value = nombre;
    }
    document.getElementById('modal-cat').classList.remove('open');
    document.getElementById('cat-f-nombre').value = '';
    showNotif('✓ Categoría creada');
  } catch(e) {
    showNotif('⚠ Error al crear categoría');
  }
}

// ── Modal Proveedores ─────────────────────────────────────────────────────────

async function abrirModalProvs() {
  await _renderListaProvs();
  document.getElementById('modal-provs').classList.add('open');
}

async function _renderListaProvs() {
  const cont = document.getElementById('modal-provs-lista');
  if (!cont) return;
  cont.innerHTML = _s.proveedores.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <span style="flex:1;font-size:13px;">${p.nombre}</span>
      <button class="lb danger" data-prov-id="${p.id}">🗑</button>
    </div>
  `).join('');
  cont.querySelectorAll('[data-prov-id]').forEach(btn => {
    btn.addEventListener('click', () => eliminarProveedor(parseInt(btn.dataset.provId)));
  });
}

async function crearProveedor() {
  const nombre = document.getElementById('modal-provs-nuevo')?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre'); return; }
  try {
    await API.crearProveedor({ nombre, activo: true });
    document.getElementById('modal-provs-nuevo').value = '';
    _s.proveedores = await API.getProveedores();
    await _renderListaProvs();
    _poblarFiltros();
    _poblarSelectProv('inv-l-proveedor');
    _poblarSelectProv('adj-l-proveedor');
    showNotif('✓ Proveedor creado');
  } catch(e) {
    showNotif('⚠ Error al crear proveedor');
  }
}

async function eliminarProveedor(id) {
  const prov   = _s.proveedores.find(p => p.id === id);
  const enUso  = _s.productos.some(p =>
    (p.lotes||[]).some(l => l.proveedor_id === id)
  );
  if (enUso) { showNotif('⚠ No se puede eliminar: tiene lotes asignados'); return; }
  const ok = await confirmar(`¿Eliminar proveedor "${prov?.nombre}"?`, 'Eliminar proveedor');
  if (!ok) return;
  try {
    await API.eliminarProveedor(id);
    _s.proveedores = await API.getProveedores();
    await _renderListaProvs();
    _poblarFiltros();
    showNotif('✓ Proveedor eliminado');
  } catch(e) {
    showNotif('⚠ Error al eliminar proveedor');
  }
}

// ── Importar CSV ──────────────────────────────────────────────────────────────

function abrirImportCSV() {
  document.getElementById('inv-csv-input')?.click();
}

async function procesarCSV(input) {
  const file = input.files?.[0];
  if (!file) return;

  // Leer con ISO-8859-1 para compatibilidad con archivos de Windows
  const buffer  = await file.arrayBuffer();
  const decoder = new TextDecoder('iso-8859-1');
  const raw     = decoder.decode(buffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const text    = raw.normalize('NFC');
  const lines   = text.split('\n').filter(l => l.trim());

  if (lines.length < 2) { showNotif('⚠ CSV vacío o sin datos'); return; }

  let cats = await API.getCategorias().then(r => r.map(c => c.nombre)).catch(() => []);
  const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());

  // Recolectar categorías nuevas y crearlas primero
  const catsNuevas = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g,'').trim());
    const row  = {};
    headers.forEach((h, idx) => row[h] = cols[idx] || '');
    const cat = (row['categoria'] || row['category'] || '').trim();
    if (cat && !cats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      catsNuevas.add(cat);
    }
  }
  for (const cat of catsNuevas) {
    try { await API.crearCategoria({ nombre: cat }); cats.push(cat); } catch(e) {}
  }

  // Importar productos SECUENCIALMENTE
  let importados = 0, errores = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g,'').trim());
    const row  = {};
    headers.forEach((h, idx) => row[h] = cols[idx] || '');
    const nombre  = row['nombre'] || row['product'] || row['producto'];
    const precio  = parseFloat(row['precio'] || row['price'] || '0');
    if (!nombre || isNaN(precio) || precio <= 0) { errores++; continue; }
    let cat = (row['categoria'] || row['category'] || '').trim();
    if (!cat || !cats.some(c => c.toLowerCase() === cat.toLowerCase())) cat = 'Otros';
    else cat = cats.find(c => c.toLowerCase() === cat.toLowerCase());
    const min     = parseInt(row['stock_minimo'] || row['min'] || '5') || 5;
    const barcode = row['codigo_barras'] || row['barcode'] || null;
    const marca   = row['marca'] || row['brand'] || 'Genérico';
    const urlEc   = row['url_ecommerce'] || row['url'] || null;
    try {
      await API.crearProducto({ nombre, categoria: cat, icono: '🌿', precio, stock_min: min, codigo_barras: barcode || null, marca, url_ecommerce: urlEc || null });
      importados++;
    } catch(e) { errores++; }
  }

  input.value = '';
  await init();
  showNotif(`✓ ${importados} productos importados${errores ? ` · ${errores} con error` : ''}`);
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────

function exportarPorLote() {
  const lista = _s.listaFiltrada || [];

  if (!lista.length) {
    showNotif('⚠ Sin productos con los filtros actuales');
    return;
  }

  const catFilt  = document.getElementById('inv-filt-cat')?.value  ?? '';
  const estFilt  = document.getElementById('inv-filt-est')?.value  ?? '';
  const provFilt = document.getElementById('inv-filt-prov')?.value ?? '';

  const filas = [['Producto','Marca','Categoría','Precio','Stock mín.','Lote','Proveedor','Stock lote','Costo unitario','Fecha entrada','Caducidad','Estado lote']];

  lista.forEach(p => {
    const lotesExport = (p.lotes||[]).filter(l => l.numero_lote !== 'DEV');
    if (lotesExport.length === 0) {
      // Producto sin lotes — exportar fila con datos del producto
      filas.push([p.nombre, p.marca||'Genérico', p.categoria, p.precio, p.stock_min||5, '—','—', 0, '—','—','—','Sin stock']);
    } else {
      lotesExport.forEach(l => {
        const dias = l.caduca && l.fecha_caducidad ? diasHastaCaducidad(l.fecha_caducidad) : null;
        let est = 'Normal';
        if (dias !== null) { if (dias < 0) est = 'Vencido'; else if (dias <= 30) est = 'Próximo a vencer'; }
        if (l.stock === 0) est = 'Sin stock';
        filas.push([
          p.nombre, p.marca||'Genérico', p.categoria, p.precio, p.stock_min||5,
          l.numero_lote, l.proveedor_nombre||'—', l.stock, l.costo_unitario,
          l.fecha_entrada||'—', l.fecha_caducidad||'—', est,
        ]);
      });
    }
  });

  const csv   = filas.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob  = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const partes = ['inventario'];
  if (catFilt)  partes.push(catFilt.replace(/\s/g,'_'));
  if (provFilt) partes.push(provFilt.replace(/\s/g,'_'));
  if (estFilt)  partes.push(estFilt);
  partes.push(fechaHoyLocal());

  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = partes.join('_') + '.csv';
  a.click();
}


function exportarPorProducto() {
  const lista = _s.listaFiltrada || [];
  if (!lista.length) { showNotif('⚠ Sin productos con los filtros actuales'); return; }

  const catFilt  = document.getElementById('inv-filt-cat')?.value  ?? '';
  const estFilt  = document.getElementById('inv-filt-est')?.value  ?? '';
  const provFilt = document.getElementById('inv-filt-prov')?.value ?? '';

  const filas = [['Producto','Marca','Categoría','Proveedores','Stock total','Stock mín.','Estado']];

  lista.forEach(p => {
    const st = stockProd(p);
    const proveedores = [...new Set(
      (p.lotes||[]).filter(l => l.numero_lote !== 'DEV' && l.proveedor_nombre)
                   .map(l => l.proveedor_nombre)
    )].join(', ') || '—';

    let estado = 'En stock';
    if (st === 0) estado = 'Agotado';
    else if (st <= (p.stock_min||5)) estado = 'Stock bajo';

    filas.push([p.nombre, p.marca||'Genérico', p.categoria, proveedores, st, p.stock_min||5, estado]);
  });

  const csv  = filas.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const partes = ['inventario_productos'];
  if (catFilt)  partes.push(catFilt.replace(/\s/g,'_'));
  if (provFilt) partes.push(provFilt.replace(/\s/g,'_'));
  if (estFilt)  partes.push(estFilt);
  partes.push(fechaHoyLocal());

  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = partes.join('_') + '.csv';
  a.click();
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function cerrarModales() {
  ['modal-prod','modal-lote','modal-adj-lote','modal-cats','modal-cat','modal-provs']
    .forEach(id => document.getElementById(id)?.classList.remove('open'));
}

function _val(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  // Filtros
  ['inv-search-input','inv-filt-cat','inv-filt-est','inv-filt-prov','inv-filt-marca'].forEach(id => {
    document.getElementById(id)?.addEventListener('input',  render);
    document.getElementById(id)?.addEventListener('change', render);
  });

  // Botones toolbar
  document.getElementById('inv-btn-nuevo-prod')?.addEventListener('click', () => abrirFormProd());
  document.getElementById('inv-btn-cats')?.addEventListener('click', abrirModalCats);
  document.getElementById('inv-btn-provs')?.addEventListener('click', abrirModalProvs);
  document.getElementById('inv-btn-import')?.addEventListener('click', abrirImportCSV);

  // Dropdown exportar
  const btnExport  = document.getElementById('inv-btn-export');
  const menuExport = document.getElementById('inv-export-menu');
  btnExport?.addEventListener('click', e => {
    e.stopPropagation();
    menuExport?.classList.toggle('open');
  });
  document.addEventListener('click', () => menuExport?.classList.remove('open'));
  document.getElementById('inv-export-producto')?.addEventListener('click', () => {
    menuExport?.classList.remove('open');
    exportarPorProducto();
  });
  document.getElementById('inv-export-lote')?.addEventListener('click', () => {
    menuExport?.classList.remove('open');
    exportarPorLote();
  });
  document.getElementById('inv-csv-input')?.addEventListener('change', e => procesarCSV(e.target));

  // Modal producto
  // Ícono — input manual actualiza selección en grid si está abierto
  document.getElementById('inv-f-icon')?.addEventListener('input', () => {
    const panel = document.getElementById('inv-icon-panel');
    if (panel && panel.style.display === 'block') _renderIconGrid('inv-f-icon');
  });
  _initIconToggle();

  // Autocompletado de marca
  const marcaInput = document.getElementById('inv-f-marca');
  const marcaDd    = document.getElementById('inv-marca-dd');
  if (marcaInput && marcaDd) {
    marcaInput.addEventListener('input', () => {
      const q = marcaInput.value.toLowerCase().trim();
      // Recolectar marcas únicas de productos actuales
      const marcas = [...new Set(
        (_s.productos || []).map(p => p.marca).filter(m => m && m !== 'Genérico')
      )];
      const filtradas = q
        ? marcas.filter(m => m.toLowerCase().includes(q))
        : marcas;
      if (!filtradas.length) { marcaDd.style.display = 'none'; return; }
      marcaDd.innerHTML = filtradas.map(m =>
        `<div style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);"
          onmousedown="event.preventDefault();document.getElementById('inv-f-marca').value='${m.replace(/'/g,"\'")}';document.getElementById('inv-marca-dd').style.display='none';"
          onmouseover="this.style.background='var(--g8)'" onmouseout="this.style.background=''">${m}</div>`
      ).join('');
      marcaDd.style.display = 'block';
    });
    marcaInput.addEventListener('blur', () => {
      setTimeout(() => { marcaDd.style.display = 'none'; }, 200);
    });
  }
  document.getElementById('modal-prod-save')?.addEventListener('click', guardarProd);
  document.getElementById('modal-prod-cancel')?.addEventListener('click', cerrarModales);
  document.getElementById('modal-prod')?.addEventListener('click', e => { if (e.target === e.currentTarget) cerrarModales(); });
  document.getElementById('inv-btn-nueva-cat-prod')?.addEventListener('click', abrirNuevaCat);

  // Modal lote
  document.getElementById('modal-lote-save')?.addEventListener('click', guardarLote);
  document.getElementById('modal-lote-cancel')?.addEventListener('click', cerrarModales);
  document.getElementById('modal-lote')?.addEventListener('click', e => { if (e.target === e.currentTarget) cerrarModales(); });
  document.getElementById('inv-l-nuevo-prov-btn')?.addEventListener('click', abrirModalProvs);
  document.querySelectorAll('input[name="inv-l-caduca"]').forEach(r => {
    r.addEventListener('change', () => toggleCaducidad(r.value === '1', 'inv-l'));
  });

  // Modal ajuste lote
  document.getElementById('modal-adj-lote-save')?.addEventListener('click', guardarAjusteLote);
  document.getElementById('modal-adj-lote-cancel')?.addEventListener('click', cerrarModales);
  document.getElementById('modal-adj-lote')?.addEventListener('click', e => { if (e.target === e.currentTarget) cerrarModales(); });
  document.getElementById('adj-l-nuevo-prov-btn')?.addEventListener('click', abrirModalProvs);
  document.querySelectorAll('input[name="adj-l-caduca"]').forEach(r => {
    r.addEventListener('change', () => toggleCaducidad(r.value === '1', 'adj-l'));
  });

  // Modal categorías
  document.getElementById('modal-cats-agregar-btn')?.addEventListener('click', crearCategoria);
  document.getElementById('modal-cats-cerrar-btn')?.addEventListener('click', () => document.getElementById('modal-cats').classList.remove('open'));
  document.getElementById('modal-cats-nueva')?.addEventListener('keydown', e => { if (e.key === 'Enter') crearCategoria(); });

  // Modal nueva cat (desde prod)
  document.getElementById('modal-cat-save')?.addEventListener('click', guardarNuevaCat);
  document.getElementById('modal-cat-cancel')?.addEventListener('click', () => document.getElementById('modal-cat').classList.remove('open'));

  // Modal proveedores
  document.getElementById('modal-provs-agregar-btn')?.addEventListener('click', crearProveedor);
  document.getElementById('modal-provs-cerrar-btn')?.addEventListener('click', () => document.getElementById('modal-provs').classList.remove('open'));
  document.getElementById('modal-provs-nuevo')?.addEventListener('keydown', e => { if (e.key === 'Enter') crearProveedor(); });

  // Navegar a inventario
  document.addEventListener('pos:navegar', e => {
    if (e.detail?.modulo === 'inventario') init();
  });
}

// ── Arranque ──────────────────────────────────────────────────────────────────

// ── Scanner código de barras en inventario ────────────────────────────────────

const _scan = { buffer: '', timer: null };

function _initScannerInv() {
  document.addEventListener('keydown', e => {
    // Solo actúa cuando el panel de inventario está activo
    if (!document.getElementById('panel-inventario')?.classList.contains('active')) return;
    // Si el foco está en un input/textarea/select, ignorar
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Enter') {
      if (_scan.buffer.length > 2) {
        const prod = (_s.productos || []).find(p => p.codigo_barras === _scan.buffer);
        if (prod) {
          // Filtrar por id único — no por nombre para evitar ambigüedades
          _s.listaFiltrada = [prod];
          _renderTabla([prod]);
          // Limpiar otros filtros visualmente
          const input = document.getElementById('inv-search-input');
          if (input) input.value = '';
          showNotif(prod.icono + ' ' + prod.nombre + ' — ' + mxPesos(prod.precio));
        } else {
          showNotif('⚠ Código no encontrado: ' + _scan.buffer);
        }
      }
      _scan.buffer = '';
      clearTimeout(_scan.timer);
      return;
    }

    if (e.key.length === 1) {
      _scan.buffer += e.key;
      clearTimeout(_scan.timer);
      _scan.timer = setTimeout(() => { _scan.buffer = ''; }, 100);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { conectar(); _initScannerInv(); });

export default { init, render, cerrarModales, abrirFormProd, abrirModalCats, abrirModalProvs };

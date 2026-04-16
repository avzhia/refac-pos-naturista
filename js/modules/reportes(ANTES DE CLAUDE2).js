/* ═══════════════════════════════════════════════
   js/modules/reportes.js
   Reconstruido desde el monolítico original
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, confirmar, mxPesos, fechaHoyLocal, fechaLocal, cerrarSesion } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

let _chartHoras  = null;
let _chartVentas = null;
let _conteo      = Object.fromEntries([1000,500,200,100,50,20,10,5,2,1].map(d=>[d,0]));
const _DENOMS    = [1000,500,200,100,50,20,10,5,2,1];
let _topCache    = {};
let _prodTablaData = [];
let _devRepData  = [];
let _mermasData  = [];
let _cierreData  = null;
let _ganProds    = [];
let _gastosData  = [];

// Exponer manejadores de conteo para los onclick generados dinámicamente
window._repCambiarConteo = (d, delta) => _cambiarConteo(d, delta);
window._repUpdateConteo  = (d, v)     => _updateConteo(d, v);

// ── Utilidades ────────────────────────────────────────────────────────────────

const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
const _fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function _calcPreset(tipo) {
  const hoy = new Date(); hoy.setHours(12,0,0,0);
  let desde, hasta = new Date(hoy);
  if (tipo === 'hoy')      { desde = new Date(hoy); }
  else if (tipo === 'ayer')     { desde = new Date(hoy); desde.setDate(desde.getDate()-1); hasta = new Date(desde); }
  else if (tipo === 'semana')   { desde = new Date(hoy); const dow = hoy.getDay()===0?7:hoy.getDay(); desde.setDate(hoy.getDate()-dow+1); }
  else if (tipo === 'mes')      { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); }
  else if (tipo === 'mes_ant')  { desde = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); }
  else if (tipo === 'año')      { desde = new Date(hoy.getFullYear(), 0, 1); }
  return { desde: _fmt(desde), hasta: _fmt(hasta) };
}

// ── setPanel ──────────────────────────────────────────────────────────────────

function setPanel(id, el) {
  document.querySelectorAll('.rep-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sec-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('rep-' + id)?.classList.add('active');
  if (el) el.classList.add('active');
  else document.querySelector(`.sec-tab[data-panel="${id}"]`)?.classList.add('active');

  if (id === 'ventas')       { setTimeout(() => renderVentas(), 80); return; }
  if (id === 'cierre')       { setTimeout(() => _renderConteo(), 50); return; }
  if (id === 'hoy')          { initHoy(); return; }
  if (id === 'mermas')       { _initMermas(); return; }
  if (id === 'devoluciones') { _initDevRep(); return; }
  if (id === 'ganancias')    { initGanancias(); return; }
  if (id === 'productos')    { _cargarDatosProductos(); }
  if (id === 'gastos')       { _conectarGastos(); gastoPreset('mes', document.querySelector('#rep-gastos .preset-btn.act') || document.querySelector('#rep-gastos .preset-btn')); }
}

// ── PANEL HOY ─────────────────────────────────────────────────────────────────

async function initHoy() {
  const act = document.querySelector('#rep-ventas .preset-btn.act');
  if (!act) {
    const mesBtn = document.querySelector('#rep-ventas .preset-btn[data-preset="mes"]');
    if (mesBtn) setPreset('mes', mesBtn);
  }
  try {
    const tid     = Estado.config.tiendaId || '';
    const resumen = await API.get(`/api/reportes/resumen?limite=200${tid?'&tienda_id='+tid:''}`);
    const pago    = resumen.por_forma_pago || {};
    const ef = pago['Efectivo']||0, tj = pago['Tarjeta']||0, tr = pago['Transfer.']||0;
    const maxP = Math.max(ef, tj, tr, 1);

    _set('rep-hoy-total',   mxPesos(resumen.total_ventas||0));
    _set('rep-hoy-tickets', resumen.num_tickets||0);
    _set('rep-hoy-prom',    mxPesos(resumen.ticket_promedio||0));

    const totalDev   = resumen.total_devoluciones || 0;
    const banner     = document.getElementById('rep-hoy-dev-banner');
    const bannerTxt  = document.getElementById('rep-hoy-dev-texto');
    if (banner && totalDev > 0) {
      banner.style.display = 'flex';
      const neto = (resumen.total_ventas||0) - totalDev;
      if (bannerTxt) bannerTxt.innerHTML =
        `↩ Devoluciones del día: <strong>- ${mxPesos(totalDev)}</strong> &nbsp;·&nbsp; Ventas netas: <strong>${mxPesos(neto)}</strong>`;
    } else if (banner) { banner.style.display = 'none'; }

    if (resumen.estrella) {
      _set('rep-hoy-estrella',     resumen.estrella.nombre);
      _set('rep-hoy-estrella-sub', `${resumen.estrella.uds} unidades vendidas`);
    } else {
      _set('rep-hoy-estrella',     '—');
      _set('rep-hoy-estrella-sub', 'Sin ventas hoy');
    }

    const pagosEl = document.getElementById('rep-hoy-pagos');
    if (pagosEl) pagosEl.innerHTML = `
      <div class="bar-row"><span class="bar-lbl">💵 Efectivo</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(ef/maxP*100)}%"></div></div><span class="bar-val">${mxPesos(ef)}</span></div>
      <div class="bar-row"><span class="bar-lbl">💳 Tarjeta</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(tj/maxP*100)}%;background:var(--g4)"></div></div><span class="bar-val">${mxPesos(tj)}</span></div>
      <div class="bar-row"><span class="bar-lbl">📲 Transfer.</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(tr/maxP*100)}%;background:var(--g5)"></div></div><span class="bar-val">${mxPesos(tr)}</span></div>`;

    _renderHoy(resumen.por_hora || {});
    _renderUltimas(resumen.ultimas || []);
    _topCache = { top_uds: resumen.top_productos||[], top_ing: resumen.top_productos||[], por_cat: resumen.por_categoria||{} };
    _renderProductos(_topCache);
  } catch(e) {
    console.error('[reportes] Error initHoy:', e);
    _renderUltimas([]);
    _renderHoy({});
    _renderProductos({});
  }
}

function _renderHoy(porHora) {
  setTimeout(() => {
    if (_chartHoras) { _chartHoras.destroy(); _chartHoras = null; }
    const canvas = document.getElementById('rep-chart-horas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const horas  = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
    const labels = horas.map(h => h.replace(':00','h'));
    const data   = horas.map(h => (porHora && porHora[h]) || 0);
    try {
      _chartHoras = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets:[{data, backgroundColor:'#4F8A28', borderRadius:4, borderSkipped:false}] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
          scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#6B8C4A'}},
                  y:{beginAtZero:true,grid:{color:'#D4E8B0'},ticks:{font:{size:10},color:'#6B8C4A',callback:v=>'$'+v}}} }
      });
    } catch(e) { console.error('[reportes] Chart horas:', e); }
  }, 150);
}

function _renderUltimas(data) {
  const ventas  = data || [];
  const conteoEl = document.getElementById('rep-hoy-conteo');
  if (conteoEl) conteoEl.textContent = ventas.length ? `— ${ventas.length} venta(s)` : '';
  const tbody = document.getElementById('rep-ultimas');
  if (!tbody) return;
  tbody.innerHTML = ventas.length
    ? ventas.map(v => {
        const hora    = v.hora || new Date(v.fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
        const cliente = v.cliente_nombre || v.cliente || '—';
        const pago    = v.forma_pago || v.pago || '—';
        const bc      = pago==='Tarjeta'?'badge-tj':pago==='Transfer.'?'badge-tr':'badge-ef';
        const prods   = v.items?.length ? v.items.map(i=>`${i.nombre} ×${i.cantidad}`).join(', ') : '—';
        return `<tr>
          <td style="color:var(--txt3);white-space:nowrap">${hora}</td>
          <td>${cliente}</td>
          <td style="color:var(--txt3)">${v.cajero||'—'}</td>
          <td style="font-size:12px;color:var(--txt2)">${prods}</td>
          <td><span class="badge ${bc}">${pago}</span></td>
          <td style="text-align:right;font-weight:500;color:var(--g1);white-space:nowrap">${mxPesos(v.total)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;">Sin ventas registradas hoy</td></tr>';
}

// ── PANEL VENTAS ──────────────────────────────────────────────────────────────

function setPreset(p, el) {
  document.querySelectorAll('#rep-ventas .preset-btn').forEach(b => b.classList.remove('act'));
  if (el) el.classList.add('act');
  const { desde, hasta } = _calcPreset(p);
  const dEl = document.getElementById('rep-fecha-desde');
  const hEl = document.getElementById('rep-fecha-hasta');
  if (dEl) dEl.value = desde;
  if (hEl) hEl.value = hasta;
  renderVentas();
}

function onRangoChange() {
  document.querySelectorAll('#rep-ventas .preset-btn').forEach(b => b.classList.remove('act'));
  renderVentas();
}

async function renderVentas() {
  const desdeStr = document.getElementById('rep-fecha-desde')?.value;
  const hastaStr = document.getElementById('rep-fecha-hasta')?.value;
  if (!desdeStr || !hastaStr) return;
  const desde = fechaLocal(desdeStr);
  const hasta  = fechaLocal(hastaStr);
  if (!desde || !hasta || hasta < desde) { showNotif('⚠ La fecha final debe ser mayor a la inicial'); return; }
  const dias = Math.round((hasta - desde) / 86400000) + 1;

  _set('rep-rango-info',
    `${desde.toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})} — ${hasta.toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})} · ${dias} día(s)`);
  _set('rep-chart-title', `Ventas del ${desdeStr} al ${hastaStr}`);

  try {
    const tid = Estado.config.tiendaId || '';
    const res = await API.get(`/api/reportes/ventas-periodo?desde=${desdeStr}&hasta=${hastaStr}${tid?'&tienda_id='+tid:''}`);

    _set('rep-k-total',   mxPesos(res.total||0));
    _set('rep-k-dias',    `${dias} día(s) seleccionados`);
    _set('rep-k-tickets', res.num_tickets||0);
    _set('rep-k-pdia',    `~${Math.round((res.num_tickets||0)/dias)} por día`);
    _set('rep-k-prom',    mxPesos(res.ticket_promedio||0));

    const porDia  = res.por_dia || {};
    const diasKeys = Object.keys(porDia);
    if (diasKeys.length) {
      const mejorDia = diasKeys.reduce((a,b) => porDia[a]>porDia[b]?a:b);
      _set('rep-k-mejor',     fechaLocal(mejorDia)?.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})||mejorDia);
      _set('rep-k-mejor-sub', mxPesos(porDia[mejorDia]));
    } else {
      _set('rep-k-mejor',     '—');
      _set('rep-k-mejor-sub', 'Sin ventas');
    }

    const labels = [], data = [];
    for (let i=0; i<dias; i++) {
      const d   = new Date(desde); d.setDate(d.getDate()+i);
      const key = d.toISOString().slice(0,10);
      labels.push(dias<=31
        ? d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit'})
        : d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}));
      data.push(porDia[key]||0);
    }

    if (_chartVentas) { _chartVentas.destroy(); _chartVentas = null; }
    const canvas = document.getElementById('rep-chart-ventas');
    if (canvas) {
      try {
        const ctx = canvas.getContext('2d');
        _chartVentas = new Chart(ctx, {
          type: dias===1?'bar':'line',
          data: { labels, datasets:[{data, borderColor:'#3D6B1E', backgroundColor:'#E2F0C8',
            fill:true, tension:.35, pointRadius:dias<=14?3:0, pointBackgroundColor:'#3D6B1E', borderRadius:dias===1?6:0}] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
            scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#6B8C4A',maxTicksLimit:Math.min(dias,8)}},
                    y:{beginAtZero:true,grid:{color:'#D4E8B0'},ticks:{font:{size:10},color:'#6B8C4A',callback:v=>'$'+v.toLocaleString('es-MX')}}}}
        });
      } catch(e) { console.error('[reportes] Chart ventas:', e); }
    }

    const pago = res.por_forma_pago||{};
    const ef=pago['Efectivo']||0, tj=pago['Tarjeta']||0, tr=pago['Transfer.']||0;
    const maxP = Math.max(ef,tj,tr,1);
    const bpEl = document.getElementById('rep-bar-pagos');
    if (bpEl) bpEl.innerHTML = `
      <div class="bar-row"><span class="bar-lbl">💵 Efectivo</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(ef/maxP*100)}%"></div></div><span class="bar-val">${mxPesos(ef)}</span></div>
      <div class="bar-row"><span class="bar-lbl">💳 Tarjeta</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(tj/maxP*100)}%;background:var(--g4)"></div></div><span class="bar-val">${mxPesos(tj)}</span></div>
      <div class="bar-row"><span class="bar-lbl">📲 Transfer.</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(tr/maxP*100)}%;background:var(--g5)"></div></div><span class="bar-val">${mxPesos(tr)}</span></div>`;

    const porCat    = res.por_categoria||{};
    const catEntries = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
    const maxCat    = catEntries.length?catEntries[0][1]:1;
    const bcEl = document.getElementById('rep-bar-cats');
    if (bcEl) bcEl.innerHTML = catEntries.length
      ? catEntries.map(([n,v],i)=>
          `<div class="bar-row"><span class="bar-lbl">${n}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxCat*100)}%;background:${['var(--g3)','var(--g4)','var(--g5)','#B5D98A','var(--border2)'][Math.min(i,4)]}"></div></div><span class="bar-val">${mxPesos(v)}</span></div>`
        ).join('')
      : '<div style="font-size:12px;color:var(--txt3);padding:8px 0;text-align:center;">Sin ventas en el periodo</div>';

    _renderProductos({ top_uds:res.top_uds||[], top_ing:res.top_ing||[], por_cat:porCat });
  } catch(e) {
    console.error('[reportes] Error renderVentas:', e);
    _set('rep-k-total','$0.00'); _set('rep-k-tickets','0'); _set('rep-k-prom','$0.00');
  }
}

// ── PANEL PRODUCTOS ───────────────────────────────────────────────────────────

async function _cargarDatosProductos() {
  _renderProductos(_topCache||{});
  try {
    const desdeStr = document.getElementById('rep-fecha-desde')?.value || fechaHoyLocal();
    const hastaStr = document.getElementById('rep-fecha-hasta')?.value || fechaHoyLocal();
    const tid = Estado.config.tiendaId||'';
    const res = await API.get(`/api/reportes/ventas-periodo?desde=${desdeStr}&hasta=${hastaStr}${tid?'&tienda_id='+tid:''}`);
    _topCache = { top_uds:res.top_uds||[], top_ing:res.top_ing||[], por_cat:res.por_categoria||{} };
    _renderProductos(_topCache);
  } catch(e) { console.error('[reportes] _cargarDatosProductos:', e); }
}

function _renderProductos(apiData) {
  const gcols = ['var(--g3)','var(--g4)','var(--g5)','#B5D98A','var(--border2)'];
  const vacio = '<div style="font-size:12px;color:var(--txt3);padding:12px 0;text-align:center;">Sin ventas en este periodo</div>';
  const tops   = apiData?.top_uds||[];
  const topIng = apiData?.top_ing||[];

  const tuEl = document.getElementById('rep-top-uds');
  if (tuEl) {
    if (tops.length) {
      const sorted = [...tops].sort((a,b)=>(b.uds||0)-(a.uds||0));
      const maxU = sorted[0].uds||1;
      tuEl.innerHTML = sorted.map((p,i)=>
        `<div class="bar-row"><span class="bar-lbl">${p.nombre}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.uds||0)/maxU*100)}%;background:${gcols[i]}"></div></div><span class="bar-val">${p.uds||0} uds</span></div>`
      ).join('');
    } else { tuEl.innerHTML = vacio; }
  }

  const tiEl = document.getElementById('rep-top-ing');
  if (tiEl) {
    if (topIng.length) {
      const sorted = [...topIng].sort((a,b)=>(b.ing||0)-(a.ing||0));
      const maxI = sorted[0].ing||1;
      tiEl.innerHTML = sorted.map((p,i)=>
        `<div class="bar-row"><span class="bar-lbl">${p.nombre}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.ing||0)/maxI*100)}%;background:${gcols[i]}"></div></div><span class="bar-val">${mxPesos(p.ing||0)}</span></div>`
      ).join('');
    } else { tiEl.innerHTML = vacio; }
  }

  _prodTablaData = (Estado.productos||[]).map(p => {
    const st  = (p.lotes||[]).reduce((s,l)=>s+l.stock,0);
    const vta = tops.find(t=>t.nombre===p.nombre);
    return { icon:p.icon||p.icono, nombre:p.nombre, cat:p.cat||p.categoria,
             uds:vta?vta.uds:0, ing:vta?vta.ing:0, st, min:p.min||p.stock_min||5 };
  });
  _filtrarProdTabla();
}

function _filtrarProdTabla() {
  const q    = (document.getElementById('rep-prod-buscar')?.value||'').toLowerCase();
  const data = _prodTablaData||[];
  const fil  = q ? data.filter(p=>p.nombre.toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q)) : data;
  const cnt  = document.getElementById('rep-prod-count');
  if (cnt) cnt.textContent = fil.length!==data.length ? `${fil.length} de ${data.length}` : `${data.length} productos`;
  const tbody = document.getElementById('rep-prod-tabla');
  if (!tbody) return;
  tbody.innerHTML = fil.length
    ? fil.map(p=>{
        const stC = p.st===0?'color:var(--red-txt)':p.st<=p.min?'color:#854F0B':'color:var(--g1)';
        return `<tr>
          <td><span style="font-size:14px;margin-right:5px">${p.icon||'🌿'}</span>${p.nombre}</td>
          <td style="color:var(--txt3)">${p.cat||'—'}</td>
          <td style="font-weight:500">${p.uds}</td>
          <td style="font-weight:500;color:var(--g1)">${mxPesos(p.ing)}</td>
          <td style="${stC};font-weight:500">${p.st}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:16px;">${q?'Sin coincidencias':'Sin productos registrados'}</td></tr>`;
}

// ── PANEL MERMAS ──────────────────────────────────────────────────────────────

function _initMermas() {
  const btn = document.querySelector('#rep-mermas .preset-btn');
  mermaPreset('mes', btn);
}

function mermaPreset(tipo, el) {
  document.querySelectorAll('#rep-mermas .preset-btn').forEach(b=>b.classList.remove('act'));
  if (el) el.classList.add('act');
  const { desde, hasta } = _calcPreset(tipo);
  const dEl = document.getElementById('merma-desde'); if (dEl) dEl.value = desde;
  const hEl = document.getElementById('merma-hasta'); if (hEl) hEl.value = hasta;
  cargarMermas();
}

async function cargarMermas() {
  const desde = document.getElementById('merma-desde')?.value;
  const hasta = document.getElementById('merma-hasta')?.value;
  if (!desde||!hasta) return;
  try {
    const mermas = await API.getMermas(desde, hasta);
    _mermasData = mermas;
    const totalUds = mermas.reduce((s,m)=>s+m.cantidad,0);
    const prods    = new Set(mermas.map(m=>m.nombre_prod)).size;
    let valor = 0;
    mermas.forEach(m => {
      const p = (Estado.productos||[]).find(x=>x.nombre===m.nombre_prod);
      if (p) valor += (p.precio||0)*m.cantidad;
    });
    _set('merma-kpi-total', totalUds);
    _set('merma-kpi-prods', prods);
    _set('merma-kpi-valor', mxPesos(valor));
    const tbody = document.getElementById('merma-tabla');
    if (tbody) tbody.innerHTML = mermas.length
      ? mermas.map(m=>{
          const d = new Date(m.fecha);
          return `<tr>
            <td style="color:var(--txt3)">${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</td>
            <td style="font-weight:500">${m.nombre_prod}</td>
            <td style="color:var(--txt3);font-size:12px">${m.lote_id||'—'}</td>
            <td style="font-weight:500;color:var(--red-txt)">${m.cantidad}</td>
            <td>${m.motivo||'—'}</td>
            <td style="color:var(--txt3)">${m.cajero||'—'}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;">Sin mermas en el periodo seleccionado</td></tr>';
  } catch(e) { showNotif('⚠ Error al cargar mermas'); }
}

function exportarMermas() {
  if (!_mermasData?.length) { showNotif('Sin datos para exportar'); return; }
  const filas = [['Fecha','Hora','Producto','Lote','Cantidad','Motivo','Cajero']];
  _mermasData.forEach(m=>{
    const d = new Date(m.fecha);
    filas.push([d.toLocaleDateString('es-MX'),d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
      m.nombre_prod,m.lote_id||'—',m.cantidad,m.motivo||'—',m.cajero||'—']);
  });
  _descargarCSV(filas, `mermas_${document.getElementById('merma-desde').value}_${document.getElementById('merma-hasta').value}.csv`);
  showNotif(`✓ Exportadas ${_mermasData.length} mermas`);
}

// ── PANEL DEVOLUCIONES ────────────────────────────────────────────────────────

function _initDevRep() {
  const btn = document.querySelector('#rep-devoluciones .preset-btn');
  devPreset('mes', btn);
}

function devPreset(tipo, el) {
  document.querySelectorAll('#rep-devoluciones .preset-btn').forEach(b=>b.classList.remove('act'));
  if (el) el.classList.add('act');
  const { desde, hasta } = _calcPreset(tipo);
  const dEl = document.getElementById('dev-rep-desde'); if (dEl) dEl.value = desde;
  const hEl = document.getElementById('dev-rep-hasta'); if (hEl) hEl.value = hasta;
  cargarDevRep();
}

async function cargarDevRep() {
  const desde = document.getElementById('dev-rep-desde')?.value;
  const hasta = document.getElementById('dev-rep-hasta')?.value;
  if (!desde||!hasta) return;
  const tid = Estado.config.tiendaId||'';
  try {
    const devs = await API.get(`/api/devoluciones?desde=${desde}&hasta=${hasta}${tid?'&tienda_id='+tid:''}`);
    _devRepData = devs;
    const totalMonto = devs.reduce((s,d)=>s+d.monto,0);
    const porProd = {};
    devs.forEach(d=>{
      if (!porProd[d.nombre_prod]) porProd[d.nombre_prod]={nombre:d.nombre_prod,veces:0,monto:0};
      porProd[d.nombre_prod].veces++;
      porProd[d.nombre_prod].monto+=d.monto;
    });
    const topProd = Object.values(porProd).sort((a,b)=>b.veces-a.veces);
    _set('devr-kpi-num',   devs.length);
    _set('devr-kpi-monto', mxPesos(totalMonto));
    _set('devr-kpi-prods', topProd.length);
    if (topProd.length) {
      _set('devr-kpi-top',     topProd[0].nombre);
      _set('devr-kpi-top-sub', `${topProd[0].veces} vez(ces) · ${mxPesos(topProd[0].monto)}`);
    } else {
      _set('devr-kpi-top','—'); _set('devr-kpi-top-sub','Sin devoluciones');
    }
    const gcols=['var(--red-txt)','#C0392B','#E74C3C','#EC7063','#F1948A'];
    const maxV = topProd.length?topProd[0].veces:1;
    const ppEl = document.getElementById('devr-por-prod');
    if (ppEl) ppEl.innerHTML = topProd.length
      ? topProd.slice(0,8).map((p,i)=>
          `<div class="bar-row"><span class="bar-lbl">${p.nombre}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(p.veces/maxV*100)}%;background:${gcols[Math.min(i,4)]}"></div></div><span class="bar-val">${p.veces}x · ${mxPesos(p.monto)}</span></div>`).join('')
      : '<div style="font-size:12px;color:var(--txt3);padding:12px 0;text-align:center;">Sin devoluciones en el periodo</div>';

    const porMotivo={};
    devs.forEach(d=>{ const m=d.motivo||'Sin motivo'; porMotivo[m]=(porMotivo[m]||0)+1; });
    const motivos=Object.entries(porMotivo).sort((a,b)=>b[1]-a[1]);
    const maxM=motivos.length?motivos[0][1]:1;
    const pmEl = document.getElementById('devr-por-motivo');
    if (pmEl) pmEl.innerHTML = motivos.length
      ? motivos.slice(0,6).map(([m,n],i)=>
          `<div class="bar-row"><span class="bar-lbl" style="font-size:11px;">${m}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/maxM*100)}%;background:var(--g4)"></div></div><span class="bar-val">${n}</span></div>`).join('')
      : '<div style="font-size:12px;color:var(--txt3);padding:12px 0;text-align:center;">Sin datos</div>';

    const tbody = document.getElementById('devr-tabla');
    if (tbody) tbody.innerHTML = devs.length
      ? devs.map(d=>{
          const fecha=new Date(d.fecha);
          return `<tr>
            <td style="color:var(--txt3);white-space:nowrap">${fecha.toLocaleDateString('es-MX')} ${fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</td>
            <td style="color:var(--txt3)">#${d.venta_id}</td>
            <td style="font-weight:500">${d.nombre_prod}</td>
            <td style="color:var(--red-txt);font-weight:500">${d.cantidad}</td>
            <td style="color:var(--red-txt);font-weight:500">${mxPesos(d.monto)}</td>
            <td style="font-size:12px">${d.motivo||'—'}</td>
            <td style="font-size:12px">${d.forma_pago_regreso||'Efectivo'}</td>
            <td style="color:var(--txt3)">${d.cajero||'—'}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--txt3);padding:20px;">Sin devoluciones en el periodo seleccionado</td></tr>';
  } catch(e) { showNotif('⚠ Error al cargar devoluciones'); console.error(e); }
}

function exportarDevRep() {
  if (!_devRepData?.length) { showNotif('Sin datos para exportar'); return; }
  const filas=[['Fecha','Hora','Ticket orig.','Producto','Cantidad','Monto','Motivo','Reintegro','Cajero']];
  _devRepData.forEach(d=>{
    const fecha=new Date(d.fecha);
    filas.push([fecha.toLocaleDateString('es-MX'),fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
      `#${d.venta_id}`,d.nombre_prod,d.cantidad,d.monto.toFixed(2),d.motivo||'—',d.forma_pago_regreso||'Efectivo',d.cajero||'—']);
  });
  const desde=document.getElementById('dev-rep-desde')?.value;
  const hasta=document.getElementById('dev-rep-hasta')?.value;
  _descargarCSV(filas,`devoluciones_${desde}_${hasta}.csv`);
  showNotif(`✓ Exportadas ${_devRepData.length} devoluciones`);
}

// ── PANEL CIERRE ──────────────────────────────────────────────────────────────

async function _renderConteo() {
  const fondo       = Estado.config.fondoInicial||0;
  const aperturaHora = Estado.config.apertura
    ? new Date(Estado.config.apertura).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})
    : new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});

  _set('cierre-cajero',   Estado.config.cajero||'—');
  _set('cierre-apertura', aperturaHora);
  _set('cierre-fondo',    mxPesos(fondo));
  _set('cierre-tickets',  '...');

  try {
    const hoy = fechaHoyLocal();
    const tid = Estado.config.tiendaId||'';
    const [ventasTodas, devsTodos] = await Promise.all([
      API.get(`/api/ventas?desde=${hoy}&hasta=${hoy}${tid?'&tienda_id='+tid:''}`),
      API.get(`/api/devoluciones?desde=${hoy}&hasta=${hoy}${tid?'&tienda_id='+tid:''}`),
    ]);
    const apertura = new Date(Estado.config.apertura||0);
    const ventas   = ventasTodas.filter(v=>new Date(v.fecha)>=apertura);
    const devs     = devsTodos.filter(d=>new Date(d.fecha)>=apertura);

    const efBruto = ventas.filter(v=>v.forma_pago==='Efectivo').reduce((s,v)=>s+v.total,0);
    const tjBruto = ventas.filter(v=>v.forma_pago==='Tarjeta').reduce((s,v)=>s+v.total,0);
    const trBruto = ventas.filter(v=>v.forma_pago==='Transfer.').reduce((s,v)=>s+v.total,0);
    const ventasBrutas = efBruto+tjBruto+trBruto;
    const efDev = devs.filter(d=>d.forma_pago_regreso==='Efectivo').reduce((s,d)=>s+d.monto,0);
    const tjDev = devs.filter(d=>d.forma_pago_regreso==='Tarjeta').reduce((s,d)=>s+d.monto,0);
    const trDev = devs.filter(d=>d.forma_pago_regreso==='Transfer.').reduce((s,d)=>s+d.monto,0);
    const totalDev    = efDev+tjDev+trDev;
    const efSistema   = efBruto-efDev;
    const tjSistema   = tjBruto-tjDev;
    const trSistema   = trBruto-trDev;
    const ventasNetas = ventasBrutas-totalDev;
    const numDev      = devs.length;

    _set('cierre-tickets',        `${ventas.length} venta(s)${numDev>0?` · ${numDev} dev.`:''}`);
    _set('cierre-ventas-brutas',  mxPesos(ventasBrutas));
    _set('cierre-ef-bruto',       mxPesos(efBruto));
    _set('cierre-tj-bruto',       mxPesos(tjBruto));
    _set('cierre-tr-bruto',       mxPesos(trBruto));
    _set('cierre-dev-total',      totalDev>0?`- ${mxPesos(totalDev)}`:'$0.00');
    _set('cierre-ventas-netas',   mxPesos(ventasNetas));
    _set('cierre-fondo2',         mxPesos(fondo));
    // Gastos del turno
    let totalGastos = 0;
    try {
      const hoyGastos = await API.get(`/api/gastos?desde=${hoy}&hasta=${hoy}${tid?'&tienda_id='+tid:''}`);
      totalGastos = hoyGastos
        .filter(g => new Date(g.fecha) >= apertura)
        .reduce((s, g) => s + g.monto, 0);
      _set('cierre-gastos-total', totalGastos > 0 ? `- ${mxPesos(totalGastos)}` : '$0.00');
      _set('cierre-total-esperado', mxPesos(efSistema + fondo - totalGastos));
    } catch(e) {
      _set('cierre-gastos-total', '$0.00');
      _set('cierre-total-esperado', mxPesos(efSistema+fondo));
    }
    _set('cierre-ef-sistema',     mxPesos(efSistema - totalGastos));
    _set('cierre-pago-ef',        mxPesos(efSistema));
    _set('cierre-pago-tj',        mxPesos(tjSistema));
    _set('cierre-pago-tr',        mxPesos(trSistema));
    const devEfRow = document.getElementById('cierre-dev-ef-row');
    if (devEfRow) devEfRow.style.display = efDev>0?'':'none';
    _set('cierre-dev-ef', `- ${mxPesos(efDev)}`);

    document.querySelectorAll('.pago-card').forEach((card,i)=>{
      const vals=[efSistema,tjSistema,trSistema];
      const valEl=card.querySelector('.pago-val');
      if (valEl) valEl.textContent=mxPesos(vals[i]||0);
    });

    _cierreData = { ventas, devs, efBruto, tjBruto, trBruto,
      efDev, tjDev, trDev, efSistema, tjSistema, trSistema,
      ventasBrutas, totalDev, ventasNetas };

    setTimeout(()=>_calcConteo(efSistema + fondo - totalGastos), 100);
  } catch(e) {
    console.error('[reportes] Error cierre:', e);
    _set('cierre-tickets','Error al cargar');
    showNotif('⚠ Error al cargar datos del cierre');
  }

  // Render denominaciones
  const conteoEl = document.getElementById('rep-conteo');
  if (conteoEl) conteoEl.innerHTML = _DENOMS.map(d=>{
    const tipo  = d>=20?'Billete':'Moneda';
    const color = d>=20?'var(--g1)':'var(--g2)';
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;background:var(--g8);border:1px solid var(--border);border-radius:10px;padding:8px 12px;">
      <div style="min-width:64px;">
        <div style="font-size:15px;font-weight:600;color:${color}">$${d.toLocaleString('es-MX')}</div>
        <div style="font-size:10px;color:var(--txt3)">${tipo}</div>
      </div>
      <button onclick="_repCambiarConteo(${d},-1)"
        style="width:38px;height:38px;border:1px solid var(--border2);border-radius:8px;background:#fff;font-size:20px;cursor:pointer;color:var(--g1);display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">−</button>
      <input type="number" min="0" id="rep-inp-${d}" value="${_conteo[d]}"
        style="width:60px;padding:6px 4px;border:1px solid var(--border2);border-radius:8px;font-size:16px;text-align:center;"
        oninput="_repUpdateConteo(${d},this.value)">
      <button onclick="_repCambiarConteo(${d},1)"
        style="width:38px;height:38px;border:1px solid var(--border2);border-radius:8px;background:var(--g2);font-size:20px;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">+</button>
      <div style="flex:1;text-align:right;">
        <span style="font-size:14px;font-weight:500;color:var(--g1)" id="rep-sub-${d}">$${(d*_conteo[d]).toLocaleString('es-MX')}</span>
      </div>
    </div>`;
  }).join('');
}

function _cambiarConteo(d, delta) {
  _conteo[d] = Math.max(0, (_conteo[d]||0)+delta);
  const inp = document.getElementById(`rep-inp-${d}`);
  if (inp) inp.value = _conteo[d];
  const sub = document.getElementById(`rep-sub-${d}`);
  if (sub) sub.textContent = '$'+(d*_conteo[d]).toLocaleString('es-MX');
  const ef = ((_cierreData?.efSistema)||0) + (Estado.config.fondoInicial||0);
  _calcConteo(ef);
}

function _updateConteo(d, v) {
  _conteo[d] = parseInt(v)||0;
  const sub = document.getElementById(`rep-sub-${d}`);
  if (sub) sub.textContent = '$'+(d*_conteo[d]).toLocaleString('es-MX');
  const ef = ((_cierreData?.efSistema)||0) + (Estado.config.fondoInicial||0);
  _calcConteo(ef);
}

function _calcConteo(efEsperado) {
  const tot = _DENOMS.reduce((s,d)=>s+d*_conteo[d],0);
  const ef  = efEsperado !== undefined ? efEsperado : ((_cierreData?.efSistema)||0)+(Estado.config.fondoInicial||0);
  _set('rep-conteo-total', mxPesos(tot));
  _set('rep-ef-contado',   mxPesos(tot));
  const diff = tot-ef;
  const e3   = document.getElementById('rep-diferencia');
  if (e3) {
    if (tot===0 && ef>0) {
      e3.textContent = `Cuenta $${ef.toLocaleString('es-MX')} en caja`;
      e3.style.color = 'var(--txt3)';
    } else {
      e3.textContent = diff===0?'✓ $0.00':(diff>0?'+':'')+mxPesos(Math.abs(diff));
      e3.style.color = diff===0?'var(--green-txt)':diff>0?'var(--blue-txt)':'var(--red-txt)';
    }
  }
}

async function confirmarCierre() {
  if (!Estado.config.cajero) { showNotif('⚠ Sin sesión activa'); return; }
  if (!_cierreData) await _renderConteo();
  const cd   = _cierreData||{};
  const fondo = Estado.config.fondoInicial||0;
  _set('mcierre-cajero',  Estado.config.cajero);
  _set('mcierre-tickets', cd.ventas?cd.ventas.length:0);
  _set('mcierre-total',   mxPesos(cd.ventasNetas||0));
  _set('mcierre-caja',    mxPesos((cd.efSistema||0)+fondo));
  document.getElementById('modal-cierre')?.classList.add('open');
}

async function confirmarCierreOk() {
  const fondo   = Estado.config.fondoInicial||0;
  const contado = _DENOMS.reduce((s,d)=>s+d*_conteo[d],0);
  const cd      = _cierreData||{};
  try {
    await API.registrarCierre({
      tienda_id:          Estado.config.tiendaId||1,
      cajero:             Estado.config.cajero,
      fecha_apertura:     Estado.config.apertura,
      fondo_inicial:      fondo,
      total_efectivo:     cd.efSistema||0,
      total_tarjeta:      (cd.tjBruto||0)-(cd.tjDev||0),
      total_transferencia:(cd.trBruto||0)-(cd.trDev||0),
      total_ventas:       cd.ventasNetas||0,
      efectivo_contado:   contado,
      diferencia:         contado-((cd.efSistema||0)+fondo),
      tickets:            cd.ventas?cd.ventas.length:0,
    });
    document.getElementById('modal-cierre')?.classList.remove('open');
    _DENOMS.forEach(d=>_conteo[d]=0);
    _cierreData = null;
    showNotif('✓ Cierre registrado — sesión cerrada');
    cerrarSesion();
  } catch(e) {
    showNotif('⚠ Error al registrar cierre'); console.error(e);
  }
}

// ── PANEL GANANCIAS ───────────────────────────────────────────────────────────

async function initGanancias() {
  const cats  = await API.get('/api/categorias').catch(()=>[]);
  const selCat = document.getElementById('gan-cat');
  if (selCat) selCat.innerHTML = '<option value="">Todas</option>' +
    cats.map(c=>`<option value="${c.nombre}">${c.nombre}</option>`).join('');
  _ganProds = Estado.productos?.length ? Estado.productos : await API.getProductos().catch(()=>[]);
  const ginp = document.getElementById('gan-prod-input'); if (ginp) ginp.value='';
  const gid  = document.getElementById('gan-prod-id');   if (gid)  gid.value='';
  const actBtn = document.querySelector('#rep-ganancias .preset-btn.act');
  ganPreset('mes', actBtn||document.querySelector('#rep-ganancias .preset-btn'));
}

function ganPreset(tipo, el) {
  document.querySelectorAll('#rep-ganancias .preset-btn').forEach(b=>b.classList.remove('act'));
  if (el) el.classList.add('act');
  const { desde, hasta } = _calcPreset(tipo);
  const dEl=document.getElementById('gan-desde'); if (dEl) dEl.value=desde;
  const hEl=document.getElementById('gan-hasta'); if (hEl) hEl.value=hasta;
  cargarGanancias();
}

function ganFiltrarProductos(q) {
  const dd  = document.getElementById('gan-prod-dd');
  if (!dd) return;
  const gid = document.getElementById('gan-prod-id'); if (gid) gid.value='';
  const lista = _ganProds.filter(p=>!q.trim()||p.nombre.toLowerCase().includes(q.toLowerCase())).slice(0,10);
  dd.innerHTML = lista.length
    ? lista.map(p=>
        `<div onmousedown="event.preventDefault();window._repGanSel(${p.id},'${p.nombre.replace(/'/g,"\\'")}')"
          style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);"
          onmouseover="this.style.background='var(--g8)'" onmouseout="this.style.background=''">${p.nombre}</div>`
      ).join('')
    : '<div style="padding:8px 12px;color:var(--txt3);font-size:13px;">Sin resultados</div>';
  dd.style.display='block';
}

window._repGanSel = (id, nombre) => {
  const inp = document.getElementById('gan-prod-input'); if (inp) inp.value=nombre;
  const gid = document.getElementById('gan-prod-id');   if (gid) gid.value=id;
  const dd  = document.getElementById('gan-prod-dd');   if (dd)  dd.style.display='none';
  cargarGanancias();
};

async function cargarGanancias() {
  const desde = document.getElementById('gan-desde')?.value;
  const hasta = document.getElementById('gan-hasta')?.value;
  if (!desde||!hasta) return;
  const cat  = document.getElementById('gan-cat')?.value||'';
  const prod = document.getElementById('gan-prod-id')?.value||'';
  let url = `/api/reportes/ganancias?desde=${desde}&hasta=${hasta}`;
  if (cat)  url+=`&categoria=${encodeURIComponent(cat)}`;
  if (prod) url+=`&producto_id=${prod}`;
  try {
    const res = await API.get(url);
    _set('gan-kpi-ing',    mxPesos(res.ingresos));
    _set('gan-kpi-costo',  mxPesos(res.costo));
    _set('gan-kpi-gan',    mxPesos(res.ganancia));
    _set('gan-kpi-margen', res.margen+'%');
    const color = res.ganancia>=0?'var(--g1)':'var(--red-txt)';
    const ganEl    = document.getElementById('gan-kpi-gan');    if (ganEl)    ganEl.style.color=color;
    const margenEl = document.getElementById('gan-kpi-margen'); if (margenEl) margenEl.style.color=color;
    const tbody = document.getElementById('gan-tabla-body');
    if (!tbody) return;
    tbody.innerHTML = res.detalle?.length
      ? res.detalle.map(d=>{
          const cg=d.ganancia>=0?'var(--g1)':'var(--red-txt)';
          return `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:7px 6px;">${d.nombre}</td>
            <td style="text-align:right;padding:7px 6px;">${d.cantidad}</td>
            <td style="text-align:right;padding:7px 6px;">${mxPesos(d.ingresos)}</td>
            <td style="text-align:right;padding:7px 6px;color:#854F0B;">${mxPesos(d.costo)}</td>
            <td style="text-align:right;padding:7px 6px;font-weight:500;color:${cg};">${mxPesos(d.ganancia)}</td>
            <td style="text-align:right;padding:7px 6px;color:${cg};">${d.margen}%</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--txt3);">Sin ventas en el periodo seleccionado</td></tr>';
  } catch(e) { showNotif('⚠ Error al cargar ganancias'); console.error(e); }
}

// ── EXPORTAR CSV ──────────────────────────────────────────────────────────────

function exportarHoy() {
  const hoy = fechaHoyLocal();
  const tid = Estado.config.tiendaId||'';
  API.get(`/api/ventas?desde=${hoy}&hasta=${hoy}${tid?'&tienda_id='+tid:''}`)
    .then(ventas=>{
      if (!ventas.length) { showNotif('Sin ventas hoy'); return; }
      const filas=[['Hora','Venta ID','Cliente','Cajero','Forma pago','Producto','Cantidad','Precio unit','Subtotal']];
      ventas.forEach(v=>{
        const d=new Date(v.fecha);
        const hora=d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
        if (v.items?.length) {
          v.items.forEach(item=>filas.push([hora,v.id,v.cliente_nombre||'—',v.cajero||'—',v.forma_pago,
            item.nombre,item.cantidad,item.precio_unit?.toFixed(2)||'—',item.subtotal?.toFixed(2)||'—']));
        } else {
          filas.push([hora,v.id,v.cliente_nombre||'—',v.cajero||'—',v.forma_pago,'—','—','—',v.total.toFixed(2)]);
        }
      });
      _descargarCSV(filas,`ventas_hoy_${hoy}.csv`);
      showNotif(`✓ Exportado — ${ventas.length} ventas de hoy`);
    }).catch(()=>showNotif('⚠ Error al exportar'));
}

function exportarCSV() {
  const desdeStr=document.getElementById('rep-fecha-desde')?.value;
  const hastaStr=document.getElementById('rep-fecha-hasta')?.value;
  if (!desdeStr||!hastaStr) { showNotif('⚠ Selecciona el rango de fechas'); return; }
  API.get(`/api/ventas?desde=${desdeStr}&hasta=${hastaStr}${Estado.config.tiendaId?'&tienda_id='+Estado.config.tiendaId:''}`)
    .then(ventas=>{
      if (!ventas.length) { showNotif('Sin ventas en el periodo seleccionado'); return; }
      const filas=[['Fecha','Hora','Venta ID','Cliente','Cajero','Forma pago','Producto','Cantidad','Precio unit','Subtotal']];
      ventas.forEach(v=>{
        const d=new Date(v.fecha);
        const fecha=d.toLocaleDateString('es-MX');
        const hora=d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
        if (v.items?.length) {
          v.items.forEach(item=>filas.push([fecha,hora,v.id,v.cliente_nombre||'—',v.cajero||'—',v.forma_pago,
            item.nombre,item.cantidad,item.precio_unit?.toFixed(2)||'—',item.subtotal?.toFixed(2)||'—']));
        } else {
          filas.push([fecha,hora,v.id,v.cliente_nombre||'—',v.cajero||'—',v.forma_pago,'—','—','—',v.total.toFixed(2)]);
        }
      });
      _descargarCSV(filas,`ventas_${desdeStr}_${hastaStr}.csv`);
      showNotif(`✓ CSV exportado — ${ventas.length} ventas`);
    }).catch(()=>showNotif('⚠ Error al exportar'));
}

function _descargarCSV(filas, nombre) {
  const csv  = filas.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href=url; a.download=nombre; a.click();
  URL.revokeObjectURL(url);
}

// ── PANEL GASTOS ─────────────────────────────────────────────────────────────

let _gastosConectado = false;

function _conectarGastos() {
  if (_gastosConectado) return;
  _gastosConectado = true;
  document.getElementById('gasto-desde')?.addEventListener('change', cargarGastos);
  document.getElementById('gasto-hasta')?.addEventListener('change', cargarGastos);
}

function gastoPreset(tipo, el) {
  document.querySelectorAll('#rep-gastos .preset-btn').forEach(b => b.classList.remove('act'));
  if (el) el.classList.add('act');
  const { desde, hasta } = _calcPreset(tipo);
  const dEl = document.getElementById('gasto-desde'); if (dEl) dEl.value = desde;
  const hEl = document.getElementById('gasto-hasta'); if (hEl) hEl.value = hasta;
  cargarGastos();
}

async function cargarGastos() {
  const desde = document.getElementById('gasto-desde')?.value;
  const hasta = document.getElementById('gasto-hasta')?.value;
  if (!desde || !hasta) return;
  const tid = Estado.config.tiendaId || '';
  try {
    const gastos = await API.get(`/api/gastos?desde=${desde}&hasta=${hasta}${tid ? '&tienda_id='+tid : ''}`);
    _gastosData = gastos;
    const total = gastos.reduce((s, g) => s + g.monto, 0);
    _set('gasto-kpi-total', mxPesos(total));
    _set('gasto-kpi-num',   gastos.length);
    _set('gasto-kpi-prom',  gastos.length ? mxPesos(total / gastos.length) : '$0.00');
    const tbody = document.getElementById('gasto-tabla');
    if (tbody) tbody.innerHTML = gastos.length
      ? gastos.map(g => {
          const fecha = new Date(g.fecha);
          return `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:7px 6px;color:var(--txt3);white-space:nowrap;">${fecha.toLocaleDateString('es-MX')} ${fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</td>
            <td style="padding:7px 6px;font-weight:500;">${g.descripcion}</td>
            <td style="padding:7px 6px;color:var(--txt3);">${g.categoria}</td>
            <td style="padding:7px 6px;color:var(--txt3);">${g.cajero || '—'}</td>
            <td style="padding:7px 6px;text-align:right;font-weight:500;color:var(--red-txt);">${mxPesos(g.monto)}</td>
            <td style="padding:7px 6px;text-align:center;">
              <button data-eliminar-gasto="${g.id}"
                style="border:none;background:var(--red-bg);color:var(--red-txt);border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px;">✕</button>
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;">Sin gastos en el periodo seleccionado</td></tr>';
  } catch(e) {
    showNotif('⚠ Error al cargar gastos');
    console.error('[gastos]', e);
  }
}

function abrirModalGasto() {
  const m = document.getElementById('modal-gasto');
  if (!m) { showNotif('⚠ Modal de gasto no encontrado'); return; }
  document.getElementById('gasto-f-monto').value = '';
  document.getElementById('gasto-f-desc').value  = '';
  document.getElementById('gasto-f-cat').value   = 'Otro';
  m.classList.add('open');
  setTimeout(() => document.getElementById('gasto-f-monto')?.focus(), 100);
}

async function guardarGasto() {
  const monto = parseFloat(document.getElementById('gasto-f-monto')?.value || '0');
  const desc  = document.getElementById('gasto-f-desc')?.value?.trim() || '';
  const cat   = document.getElementById('gasto-f-cat')?.value || 'Otro';
  if (!monto || monto <= 0) { showNotif('⚠ Ingresa un monto válido'); return; }
  if (!desc)                 { showNotif('⚠ Ingresa una descripción'); return; }
  try {
    await API.post('/api/gastos', {
      monto, descripcion: desc, categoria: cat,
      cajero:    Estado.config.cajero   || '',
      tienda_id: Estado.config.tiendaId || null,
    });
    document.getElementById('modal-gasto')?.classList.remove('open');
    await cargarGastos();
    showNotif('✓ Gasto registrado');
  } catch(e) {
    showNotif('⚠ Error al registrar gasto');
    console.error('[guardarGasto]', e);
  }
}

async function eliminarGasto(id) {
  const ok = await confirmar('¿Eliminar este gasto?', 'Eliminar gasto');
  if (!ok) return;
  try {
    await API.delete(`/api/gastos/${id}`);
    await cargarGastos();
    showNotif('✓ Gasto eliminado');
  } catch(e) { showNotif('⚠ Error al eliminar gasto'); }
}

// ── CONECTAR EVENTOS ──────────────────────────────────────────────────────────

function conectar() {
  // Tabs
  document.querySelectorAll('.sec-tab[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.panel, btn));
  });

  // Panel Ventas
  document.getElementById('rep-fecha-desde')?.addEventListener('change', onRangoChange);
  document.getElementById('rep-fecha-hasta')?.addEventListener('change', onRangoChange);
  document.querySelectorAll('#rep-ventas .preset-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => setPreset(btn.dataset.preset, btn));
  });
  document.getElementById('rep-exportar-csv-btn')?.addEventListener('click', exportarCSV);
  document.getElementById('rep-exportar-hoy-btn')?.addEventListener('click', exportarHoy);

  // Panel Productos
  document.getElementById('rep-prod-buscar')?.addEventListener('input', _filtrarProdTabla);

  // Panel Mermas
  document.getElementById('merma-desde')?.addEventListener('change', cargarMermas);
  document.getElementById('merma-hasta')?.addEventListener('change', cargarMermas);
  document.querySelectorAll('#rep-mermas .preset-btn[data-merma-preset]').forEach(btn => {
    btn.addEventListener('click', () => mermaPreset(btn.dataset.mermaPreset, btn));
  });
  document.getElementById('rep-exportar-mermas-btn')?.addEventListener('click', exportarMermas);

  // Panel Devoluciones
  document.getElementById('dev-rep-desde')?.addEventListener('change', cargarDevRep);
  document.getElementById('dev-rep-hasta')?.addEventListener('change', cargarDevRep);
  document.querySelectorAll('#rep-devoluciones .preset-btn[data-dev-preset]').forEach(btn => {
    btn.addEventListener('click', () => devPreset(btn.dataset.devPreset, btn));
  });
  document.getElementById('rep-exportar-dev-btn')?.addEventListener('click', exportarDevRep);

  // Panel Cierre
  document.getElementById('btn-realizar-cierre')?.addEventListener('click', confirmarCierre);
  document.getElementById('modal-cierre-confirm')?.addEventListener('click', confirmarCierreOk);
  document.getElementById('modal-cierre-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-cierre')?.classList.remove('open');
  });
  document.getElementById('modal-cierre')?.addEventListener('click', e => {
    if (e.target===e.currentTarget) document.getElementById('modal-cierre')?.classList.remove('open');
  });

  // Panel Ganancias
  document.getElementById('gan-desde')?.addEventListener('change', cargarGanancias);
  document.getElementById('gan-hasta')?.addEventListener('change', cargarGanancias);
  document.getElementById('gan-cat')?.addEventListener('change', cargarGanancias);
  document.querySelectorAll('#rep-ganancias .preset-btn[data-gan-preset]').forEach(btn => {
    btn.addEventListener('click', () => ganPreset(btn.dataset.ganPreset, btn));
  });
  document.getElementById('gan-prod-input')?.addEventListener('input', e => {
    const q = e.target.value;
    if (!q.trim()) {
      const gid = document.getElementById('gan-prod-id'); if (gid) gid.value='';
      const dd  = document.getElementById('gan-prod-dd');  if (dd)  dd.style.display='none';
      cargarGanancias();
    } else {
      ganFiltrarProductos(q);
    }
  });
  document.getElementById('gan-prod-input')?.addEventListener('blur', () => {
    setTimeout(()=>{ const dd=document.getElementById('gan-prod-dd'); if(dd) dd.style.display='none'; },200);
  });

  // Delegación de eventos para gastos — funciona independiente de conectar()
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.id === 'gasto-nuevo-btn' || t.closest('#gasto-nuevo-btn')) {
      abrirModalGasto(); return;
    }
    if (t.id === 'gasto-modal-save') { guardarGasto(); return; }
    if (t.id === 'gasto-modal-cancel') {
      document.getElementById('modal-gasto')?.classList.remove('open'); return;
    }
    if (t.dataset.gastoPreset) { gastoPreset(t.dataset.gastoPreset, t); return; }
    if (t.dataset.eliminarGasto) { eliminarGasto(parseInt(t.dataset.eliminarGasto)); return; }
  });

  // Navegar a reportes
  document.addEventListener('pos:navegar', e => {
    if (e.detail?.modulo === 'reportes') {
      // Inicializar preset si no tiene valor
      if (!document.getElementById('rep-fecha-desde')?.value) {
        const mesBtn = document.querySelector('#rep-ventas .preset-btn[data-preset="mes"]');
        const { desde, hasta } = _calcPreset('mes');
        const dEl=document.getElementById('rep-fecha-desde'); if(dEl) dEl.value=desde;
        const hEl=document.getElementById('rep-fecha-hasta'); if(hEl) hEl.value=hasta;
        if (mesBtn) mesBtn.classList.add('act');
      }
      setTimeout(() => initHoy(), 150);
    }
  });
}

document.addEventListener('DOMContentLoaded', conectar);

export default { initHoy, renderVentas, setPanel, cargarGanancias };

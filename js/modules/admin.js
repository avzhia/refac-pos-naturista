/* ═══════════════════════════════════════════════
   js/modules/admin.js
   Panel de administración del sistema
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import { showNotif, confirmar, actualizarLogo, actualizarNombreNegocio } from '../core/app.js';

// ── SHA-256 nativo ────────────────────────────────────────────────────────────

async function sha256(texto) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Abrir panel (via contraseña) ──────────────────────────────────────────────

function abrirLogin() {
  const modal = document.getElementById('modal-admin-pass');
  const input = document.getElementById('admin-pass-input');
  const error = document.getElementById('admin-pass-error');
  input.value = '';
  error.style.display = 'none';
  modal.classList.add('open');
  setTimeout(() => input.focus(), 100);
}

async function _confirmarLogin() {
  const input = document.getElementById('admin-pass-input');
  const error = document.getElementById('admin-pass-error');
  const pass  = input.value.trim();
  if (!pass) return;

  try {
    await API.adminLogin(pass);
    document.getElementById('modal-admin-pass').classList.remove('open');
    input.value = '';
    await abrirPanel();
  } catch(e) {
    error.style.display = '';
    input.value = '';
    input.focus();
  }
}

// ── Setup (primera vez) ───────────────────────────────────────────────────────

async function guardarSetup() {
  const pass    = document.getElementById('setup-pass')?.value?.trim() ?? '';
  const confirm = document.getElementById('setup-confirm')?.value?.trim() ?? '';

  if (pass.length < 4) { showNotif('⚠ Mínimo 4 caracteres'); return; }
  if (pass !== confirm)  { showNotif('⚠ Las contraseñas no coinciden'); return; }

  try {
    await API.setupAdmin(pass, confirm);
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('pos:init-login'));
    showNotif('✓ Configuración guardada');
  } catch(e) {
    showNotif('⚠ Error al guardar configuración');
  }
}

// ── Abrir panel de admin ──────────────────────────────────────────────────────

async function abrirPanel() {
  document.getElementById('admin-screen').classList.remove('hidden');
  await _cargarDatos();
}

async function _cargarDatos() {
  try {
    const [tiendas, cajeros] = await Promise.all([
      API.getTiendas(),
      API.get('/api/cajeros'),
    ]);
    _renderTiendas(tiendas);
    _renderCajeros(cajeros, tiendas);

    // Cargar nombre del negocio
    const cfg = await API.getConfig('nombre_negocio').catch(() => null);
    if (cfg?.valor) {
      document.getElementById('admin-nombre-negocio').value = cfg.valor;
    }

    // Poblar select de tiendas en el form de cajero
    const sel = document.getElementById('admin-nuevo-cajero-tienda');
    if (sel) {
      sel.innerHTML = tiendas.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
    }
  } catch(e) {
    showNotif('⚠ Error al cargar datos de administración');
  }
}

// ── Tiendas ───────────────────────────────────────────────────────────────────

function _renderTiendas(tiendas) {
  const cont = document.getElementById('admin-tiendas-lista');
  if (!cont) return;
  if (!tiendas.length) {
    cont.innerHTML = '<div style="font-size:13px;color:var(--txt3);">Sin tiendas registradas.</div>';
    return;
  }
  cont.innerHTML = tiendas.map(t => `
    <div style="border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:500;color:var(--txt2);margin-bottom:7px;">🏪 ${t.nombre}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <input type="text" id="tienda-nom-${t.id}" value="${t.nombre}"
          style="flex:1;min-width:110px;padding:6px 9px;border:1px solid var(--border2);border-radius:7px;font-size:13px;font-family:inherit;">
        <input type="text" id="tienda-dir-${t.id}" value="${t.direccion||''}" placeholder="Dirección (opcional)"
          style="flex:1;min-width:110px;padding:6px 9px;border:1px solid var(--border2);border-radius:7px;font-size:13px;font-family:inherit;">
        <button style="padding:6px 11px;border:none;border-radius:7px;background:var(--g2);color:#fff;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;" data-guardar-tienda="${t.id}">Guardar</button>
        <button style="padding:6px 9px;border:none;border-radius:7px;background:#FCEBEB;color:#A32D2D;cursor:pointer;font-size:13px;" data-eliminar-tienda="${t.id}">🗑</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-guardar-tienda]').forEach(btn => {
    btn.addEventListener('click', () => guardarTienda(parseInt(btn.dataset.guardarTienda)));
  });
  cont.querySelectorAll('[data-eliminar-tienda]').forEach(btn => {
    btn.addEventListener('click', () => eliminarTienda(parseInt(btn.dataset.eliminarTienda)));
  });
}

async function guardarTienda(id) {
  const nombre = document.getElementById(`tienda-nom-${id}`)?.value?.trim() ?? '';
  const dir    = document.getElementById(`tienda-dir-${id}`)?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ El nombre no puede estar vacío'); return; }
  try {
    await API.put(`/api/tiendas/${id}`, { nombre, direccion: dir, activa: true });
    await _cargarDatos();
    showNotif('✓ Tienda actualizada');
    if (!Estado.config.cajero) document.dispatchEvent(new CustomEvent('pos:init-login'));
  } catch(e) {
    showNotif('⚠ Error al guardar tienda');
  }
}

async function eliminarTienda(id) {
  const ok = await confirmar('¿Desactivar esta tienda?', 'Eliminar tienda');
  if (!ok) return;
  try {
    await API.put(`/api/tiendas/${id}/desactivar`, {});
    await _cargarDatos();
    showNotif('✓ Tienda desactivada');
    if (!Estado.config.cajero) document.dispatchEvent(new CustomEvent('pos:init-login'));
  } catch(e) {
    showNotif(e.message?.includes('al menos una') ? '⚠ Debe haber al menos una tienda activa' : '⚠ Error al eliminar tienda');
  }
}

async function crearTienda() {
  const nombre = document.getElementById('admin-nueva-tienda-nombre')?.value?.trim() ?? '';
  const dir    = document.getElementById('admin-nueva-tienda-dir')?.value?.trim()    ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre de la tienda'); return; }
  try {
    await API.crearTienda({ nombre, direccion: dir, activa: true });
    document.getElementById('admin-nueva-tienda-nombre').value = '';
    document.getElementById('admin-nueva-tienda-dir').value    = '';
    await _cargarDatos();
    showNotif('✓ Tienda creada');
    // Recargar login para mostrar nueva tienda
    if (!Estado.config.cajero) {
      document.dispatchEvent(new CustomEvent('pos:init-login'));
    }
  } catch(e) {
    showNotif('⚠ Error al crear tienda');
  }
}

// ── Cajeros ───────────────────────────────────────────────────────────────────

function _renderCajeros(cajeros, tiendas) {
  const cont = document.getElementById('admin-cajeros-lista');
  if (!cont) return;
  if (!cajeros.length) {
    cont.innerHTML = '<div style="font-size:13px;color:var(--txt3);">Sin cajeros registrados.</div>';
    return;
  }
  cont.innerHTML = cajeros.map(c => {
    const tienda = tiendas.find(t => t.id === c.tienda_id);
    return `
      <div style="border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:7px;">
          👤 ${c.nombre} <span style="font-size:11px;color:var(--txt3);font-weight:400;">${tienda?.nombre || '—'}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input type="password" class="pin-input" placeholder="PIN" maxlength="6"
            id="pin-cajero-${c.id}"
            style="flex:1;min-width:80px;padding:6px 9px;border:1px solid var(--border2);border-radius:7px;font-size:14px;font-family:inherit;text-align:center;letter-spacing:4px;">
          <button style="padding:6px 11px;border:none;border-radius:7px;background:var(--g2);color:#fff;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;" data-guardar-pin="${c.id}">Guardar PIN</button>
          <button style="padding:6px 9px;border:none;border-radius:7px;background:#FCEBEB;color:#A32D2D;cursor:pointer;font-size:13px;" data-eliminar-cajero="${c.id}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('[data-guardar-pin]').forEach(btn => {
    btn.addEventListener('click', () => guardarPin(parseInt(btn.dataset.guardarPin)));
  });
  cont.querySelectorAll('[data-eliminar-cajero]').forEach(btn => {
    btn.addEventListener('click', () => eliminarCajero(parseInt(btn.dataset.eliminarCajero)));
  });
}

async function eliminarCajero(id) {
  const ok = await confirmar('¿Eliminar este cajero?', 'Eliminar cajero');
  if (!ok) return;
  try {
    await API.delete(`/api/cajeros/${id}`);
    await _cargarDatos();
    showNotif('✓ Cajero eliminado');
    if (!Estado.config.cajero) document.dispatchEvent(new CustomEvent('pos:init-login'));
  } catch(e) {
    showNotif('⚠ Error al eliminar cajero');
  }
}

async function guardarPin(cajeroId) {
  const input = document.getElementById(`pin-cajero-${cajeroId}`);
  const pin   = input?.value?.trim() ?? '';
  try {
    await API.setPinCajero(cajeroId, pin);
    if (input) input.value = '';
    showNotif(pin.length >= 4 ? '✓ PIN actualizado' : '✓ PIN eliminado');
    await _cargarDatos();
  } catch(e) {
    showNotif('⚠ Error al guardar PIN');
  }
}

async function crearCajero() {
  const nombre   = document.getElementById('admin-nuevo-cajero-nombre')?.value?.trim() ?? '';
  const tiendaId = parseInt(document.getElementById('admin-nuevo-cajero-tienda')?.value ?? '0');
  const pinVal   = document.getElementById('admin-nuevo-cajero-pin')?.value?.trim()    ?? '';
  if (!nombre)   { showNotif('⚠ Ingresa el nombre del cajero'); return; }
  if (!tiendaId) { showNotif('⚠ Selecciona una tienda'); return; }
  try {
    // Crear cajero sin PIN primero
    const nuevo = await API.crearCajero({ nombre, tienda_id: tiendaId, activo: true });
    // Si hay PIN, asignarlo via endpoint que hashea en backend
    if (pinVal.length >= 4) {
      await API.setPinCajero(nuevo.id, pinVal);
    }
    document.getElementById('admin-nuevo-cajero-nombre').value = '';
    document.getElementById('admin-nuevo-cajero-pin').value    = '';
    await _cargarDatos();
    showNotif('✓ Cajero creado');
    if (!Estado.config.cajero) {
      document.dispatchEvent(new CustomEvent('pos:init-login'));
    }
  } catch(e) {
    showNotif('⚠ Error al crear cajero');
  }
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function previewLogo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const preview = document.getElementById('admin-logo-preview');
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
}

async function subirLogo() {
  const input = document.getElementById('admin-logo-input');
  const file  = input?.files?.[0];
  if (!file) { showNotif('⚠ Selecciona un archivo de imagen'); return; }
  try {
    const form = new FormData();
    form.append('file', file);
    await API.subirLogo(form);
    actualizarLogo();
    showNotif('✓ Logo actualizado');
  } catch(e) {
    showNotif('⚠ Error al subir logo');
    return;
  }
}

async function quitarLogo() {
  const ok = await confirmar('¿Quitar el logo de la tienda?', 'Quitar logo');
  if (!ok) return;
  try {
    await API.delete('/api/admin/logo');
    document.getElementById('admin-logo-preview').innerHTML = '<span style="font-size:28px;">🌿</span>';
    actualizarLogo();
    showNotif('✓ Logo quitado');
  } catch(e) {
    showNotif('⚠ Error al quitar logo');
  }
}

// ── Nombre del negocio ────────────────────────────────────────────────────────

async function guardarNombreNegocio() {
  const nombre = document.getElementById('admin-nombre-negocio')?.value?.trim() ?? '';
  if (!nombre) { showNotif('⚠ Ingresa el nombre del negocio'); return; }
  try {
    await API.setConfig('nombre_negocio', nombre);
    actualizarNombreNegocio(nombre);
    showNotif('✓ Nombre actualizado');
  } catch(e) {
    showNotif('⚠ Error al guardar nombre');
  }
}

// ── Cambiar contraseña ────────────────────────────────────────────────────────

async function cambiarPassword() {
  const actual = document.getElementById('admin-pass-actual')?.value?.trim() ?? '';
  const nueva  = document.getElementById('admin-pass-nueva')?.value?.trim()  ?? '';
  if (!actual || !nueva)  { showNotif('⚠ Completa ambos campos'); return; }
  if (nueva.length < 4)   { showNotif('⚠ Mínimo 4 caracteres'); return; }

  try {
    await API.cambiarPasswordAdmin(nueva, actual);
    document.getElementById('admin-pass-actual').value = '';
    document.getElementById('admin-pass-nueva').value  = '';
    showNotif('✓ Contraseña actualizada');
  } catch(e) {
    showNotif('⚠ Contraseña actual incorrecta');
  }
}

// ── Descargar respaldo ────────────────────────────────────────────────────────

function descargarRespaldo() {
  const fecha = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href     = `${API.BASE}/api/admin/backup`;
  a.download = `pos_backup_${fecha}.db`;
  a.click();
  showNotif('✓ Descargando respaldo...');
}

// ── Cerrar panel ──────────────────────────────────────────────────────────────

function cerrar() {
  document.getElementById('admin-screen').classList.add('hidden');
  // Limpiar campos sensibles
  ['admin-pass-actual', 'admin-pass-nueva'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Si no hay sesión activa, mostrar login y recargar cajeros/tiendas
  if (!Estado.config.cajero) {
    document.getElementById('login-screen')?.classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('pos:init-login'));
  }
}

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  // Setup (primera vez)
  document.getElementById('setup-btn')
    ?.addEventListener('click', guardarSetup);
  document.getElementById('setup-confirm')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') guardarSetup(); });

  // Modal contraseña admin
  document.getElementById('modal-admin-pass-ok')
    ?.addEventListener('click', _confirmarLogin);
  document.getElementById('admin-pass-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') _confirmarLogin(); });
  document.getElementById('modal-admin-pass-cancel')
    ?.addEventListener('click', () => {
      document.getElementById('modal-admin-pass').classList.remove('open');
      document.getElementById('admin-pass-input').value = '';
      document.getElementById('admin-pass-error').style.display = 'none';
    });

  // Cerrar panel
  document.getElementById('admin-cerrar-btn')
    ?.addEventListener('click', cerrar);

  // Tiendas
  document.getElementById('admin-crear-tienda-btn')
    ?.addEventListener('click', crearTienda);

  // Cajeros
  document.getElementById('admin-crear-cajero-btn')
    ?.addEventListener('click', crearCajero);

  // Logo
  document.getElementById('admin-logo-input')
    ?.addEventListener('change', e => previewLogo(e.target));
  document.getElementById('admin-subir-logo-btn')
    ?.addEventListener('click', subirLogo);
  document.getElementById('admin-quitar-logo-btn')
    ?.addEventListener('click', quitarLogo);

  // Nombre negocio
  document.getElementById('admin-guardar-nombre-btn')
    ?.addEventListener('click', guardarNombreNegocio);

  // Cambiar contraseña
  document.getElementById('admin-cambiar-pass-btn')
    ?.addEventListener('click', cambiarPassword);

  // Descargar respaldo
  document.getElementById('admin-descargar-respaldo-btn')
    ?.addEventListener('click', descargarRespaldo);

  // Evento global para abrir admin desde login
  document.addEventListener('pos:abrir-admin', abrirLogin);

  // Modal historial cierres
  document.getElementById('admin-historial-btn')?.addEventListener('click', () => {
    document.getElementById('modal-cierres')?.classList.add('open');
    _cargarCierres();
  });
  document.getElementById('modal-cierres-close')?.addEventListener('click', () => {
    document.getElementById('modal-cierres')?.classList.remove('open');
  });
  document.getElementById('modal-cierres')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('modal-cierres')?.classList.remove('open');
  });
}

// ── Arranque ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', conectar);

async function _cargarCierres() {
  const cont = document.getElementById('admin-cierres-lista');
  if (!cont) return;
  try {
    const cierres = await API.getCierres();
    if (!cierres.length) {
      cont.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:8px 0;">Sin cierres registrados.</div>';
      return;
    }
    const fmt = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n||0);
    const filas = cierres.map(cl => {
      const fecha    = new Date(cl.fecha_cierre);
      const fechaStr = fecha.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Mexico_City'});
      const horaStr  = fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'});
      const diff      = cl.diferencia || 0;
      const diffColor = diff === 0 ? 'var(--green-txt)' : diff > 0 ? 'var(--blue-txt)' : 'var(--red-txt)';
      const diffStr   = diff === 0 ? '✓ $0.00' : (diff > 0 ? '+' : '') + fmt(diff);
      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:7px 8px;color:var(--txt3);white-space:nowrap;">' + fechaStr + ' ' + horaStr + '</td>' +
        '<td style="padding:7px 8px;">' + (cl.cajero||'—') + '</td>' +
        '<td style="padding:7px 8px;text-align:right;">' + (cl.tickets||0) + '</td>' +
        '<td style="padding:7px 8px;text-align:right;font-weight:500;color:var(--g1);">' + fmt(cl.total_ventas) + '</td>' +
        '<td style="padding:7px 8px;text-align:right;">' + fmt(cl.efectivo_contado) + '</td>' +
        '<td style="padding:7px 8px;text-align:right;font-weight:600;color:' + diffColor + ';">' + diffStr + '</td>' +
        '</tr>';
    }).join('');
    cont.innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
        '<thead><tr style="background:var(--g8);color:var(--txt2);">' +
          '<th style="padding:7px 8px;text-align:left;border-bottom:1px solid var(--border);">Fecha cierre</th>' +
          '<th style="padding:7px 8px;text-align:left;border-bottom:1px solid var(--border);">Cajero</th>' +
          '<th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);">Tickets</th>' +
          '<th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);">Ventas netas</th>' +
          '<th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);">Ef. contado</th>' +
          '<th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);">Diferencia</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>';
  } catch(e) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--red-txt);padding:8px 0;">⚠ Error al cargar cierres.</div>';
  }
}

export default { abrirLogin, guardarSetup };

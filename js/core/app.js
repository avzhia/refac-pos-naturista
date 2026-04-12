/* ═══════════════════════════════════════════════
   js/core/app.js
   Navegación, utilidades globales y arranque
═══════════════════════════════════════════════ */

import API    from './api.js';
import Estado from './estado.js';

// ── Formateo de moneda ────────────────────────────────────────────────────────

export function mxPesos(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
  }).format(n ?? 0);
}

// ── Fechas sin desfase UTC ────────────────────────────────────────────────────

export function fechaHoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function fechaLocal(str) {
  // Evita que "2024-01-15" se interprete como UTC medianoche
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function calcPreset(tipo) {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  let desde, hasta = new Date(hoy);

  if (tipo === 'hoy')      { desde = new Date(hoy); }
  else if (tipo === 'ayer')    { desde = new Date(hoy); desde.setDate(desde.getDate()-1); hasta = new Date(desde); }
  else if (tipo === 'semana')  {
    desde = new Date(hoy);
    const dow = hoy.getDay() === 0 ? 7 : hoy.getDay(); // lunes=1 … domingo=7
    desde.setDate(hoy.getDate() - dow + 1);
  }
  else if (tipo === 'mes')     { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); }
  else if (tipo === 'mes_ant') { desde = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); }
  else if (tipo === 'año')     { desde = new Date(hoy.getFullYear(), 0, 1); }

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { desde: fmt(desde), hasta: fmt(hasta) };
}

// ── Notificación toast ────────────────────────────────────────────────────────

let _notifTimer = null;

export function showNotif(msg) {
  const el = document.getElementById('app-notif');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Modal de confirmación genérico ───────────────────────────────────────────

export function confirmar(msg, titulo = '¿Estás seguro?') {
  return new Promise(resolve => {
    const modal  = document.getElementById('modal-confirm');
    const titEl  = document.getElementById('modal-confirm-title');
    const msgEl  = document.getElementById('modal-confirm-msg');
    const btnOk  = document.getElementById('modal-confirm-btn');
    const btnCan = document.getElementById('modal-confirm-cancel');

    titEl.textContent = titulo;
    msgEl.textContent = msg;
    modal.classList.add('open');

    const cleanup = (val) => {
      modal.classList.remove('open');
      btnOk.removeEventListener('click', onOk);
      btnCan.removeEventListener('click', onCancel);
      resolve(val);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    btnOk.addEventListener('click', onOk);
    btnCan.addEventListener('click', onCancel);
  });
}

// ── Navegación entre panels ───────────────────────────────────────────────────

export function irA(modulo) {
  // Ocultar todos los panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Desactivar todos los tabs
  document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));

  // Activar panel y tab correspondiente
  const panel = document.getElementById(`panel-${modulo}`);
  const tab   = document.getElementById(`tab-${modulo}`);
  if (panel) panel.classList.add('active');
  if (tab)   tab.classList.add('active');

  // Siempre disparar — fuerza recarga aunque ya esté en ese panel
  document.dispatchEvent(new CustomEvent('pos:navegar', { detail: { modulo } }));
}

// Versión sin recarga (para navegación interna sin reinicializar)
export function irASilencioso(modulo) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById(`panel-${modulo}`);
  const tab   = document.getElementById(`tab-${modulo}`);
  if (panel) panel.classList.add('active');
  if (tab)   tab.classList.add('active');
}

// ── Logo y nombre del negocio ─────────────────────────────────────────────────

export function actualizarLogo() {
  const url = `${API.BASE}/logo.png?t=${Date.now()}`;
  const imgs = ['header-logo-img', 'login-logo-img', 'login-logo-img2', 'admin-logo-preview'];

  // Header y login
  ['header-logo-img', 'login-logo-img', 'login-logo-img2'].forEach(id => {
    const img = document.getElementById(id);
    if (!img) return;
    const tester = new Image();
    tester.onload = () => {
      img.src = url;
      img.style.display = 'inline-block';
      const emoji = document.getElementById(id.replace('-img', '-emoji').replace('header-logo', 'header-logo'));
      if (emoji) emoji.style.display = 'none';
    };
    tester.onerror = () => {
      img.style.display = 'none';
      const emojiId = id === 'header-logo-img' ? 'header-logo-emoji'
        : id === 'login-logo-img'  ? 'login-logo-emoji'
        : 'login-logo-emoji2';
      const emoji = document.getElementById(emojiId);
      if (emoji) emoji.style.display = '';
    };
    tester.src = url;
  });

  // Preview en admin
  const preview = document.getElementById('admin-logo-preview');
  if (preview) {
    const tester = new Image();
    tester.onload = () => {
      preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
    };
    tester.onerror = () => {
      preview.innerHTML = '<span style="font-size:28px;">🌿</span>';
    };
    tester.src = url;
  }
}

export function actualizarNombreNegocio(nombre) {
  if (!nombre) return;
  Estado.config.negocio = nombre;
  // Header topbar
  const headerEl = document.getElementById('header-negocio');
  if (headerEl) headerEl.textContent = nombre;
  // Login — el nombre aparece junto al emoji en .login-logo
  ['login-logo-emoji', 'login-logo-emoji2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `🌿 ${nombre}`;
  });
  document.title = `${nombre} POS`;
}

// ── Cerrar sesión ────────────────────────────────────────────────────────────────

export function cerrarSesion() {
  Estado.cerrarSesion();
  // Ocultar sistema
  document.getElementById('login-screen')?.classList.remove('hidden');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Resetear badge
  const badge = document.getElementById('cajero-badge');
  if (badge) badge.textContent = 'Cajero';
  // Recargar tiendas y cajeros
  document.dispatchEvent(new CustomEvent('pos:init-login'));
}

// ── Reloj ─────────────────────────────────────────────────────────────────────

function iniciarReloj() {
  const el = document.getElementById('app-clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Mexico_City' });
  };
  tick();
  setInterval(tick, 1000);
}

// ── Actualizar badge de cajero en topbar ──────────────────────────────────────

export function actualizarBadgeCajero() {
  const badge = document.getElementById('cajero-badge');
  if (badge && Estado.config.cajero) {
    badge.textContent = `${Estado.config.cajero} · ${Estado.config.tiendaNombre || ''}`;
  }
}

// ── Conectar navtabs ──────────────────────────────────────────────────────────

function conectarNavtabs() {
  document.querySelectorAll('.navtab').forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.id?.replace('tab-', '');
      if (id) irA(id);
    });
  });
  document.getElementById('btn-cerrar-sesion')
    ?.addEventListener('click', cerrarSesion);
}

// ── ARRANQUE ─────────────────────────────────────────────────────────────────

async function arrancar() {
  iniciarReloj();
  conectarNavtabs();

  const haySesion = Estado.cargarSesion();

  if (haySesion) {
    // Sesión activa — mostrar sistema
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('setup-screen')?.classList.add('hidden');
    actualizarBadgeCajero();
    irA('ventas');

    // Cargar nombre de negocio y logo
    try {
      const cfg = await API.getConfig('nombre_negocio');
      if (cfg?.valor) actualizarNombreNegocio(cfg.valor);
    } catch(e) {}
    actualizarLogo();

  } else {
    // Sin sesión — verificar si se necesita setup
    try {
      const res = await API.setupRequired();
      if (res?.required) {
        // Primera vez — mostrar setup
        document.getElementById('setup-screen')?.classList.remove('hidden');
        document.getElementById('login-screen')?.classList.add('hidden');
      } else {
        // Hay contraseña — mostrar login normal
        document.getElementById('login-screen')?.classList.remove('hidden');
        document.getElementById('setup-screen')?.classList.add('hidden');
        // Cargar nombre/logo para el login
        try {
          const cfgNombre = await API.getConfig('nombre_negocio');
          if (cfgNombre?.valor) actualizarNombreNegocio(cfgNombre.valor);
        } catch(e) {}
        actualizarLogo();
        // Disparar evento para que login.js cargue tiendas y cajeros
        document.dispatchEvent(new CustomEvent('pos:init-login'));
      }
    } catch(e) {
      // Backend no responde
      document.getElementById('login-screen')?.classList.remove('hidden');
      document.getElementById('setup-screen')?.classList.add('hidden');
      document.dispatchEvent(new CustomEvent('pos:init-login'));
    }
  }
}

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', arrancar);

// ── Exportaciones ─────────────────────────────────────────────────────────────

export default {
  irA,
  showNotif,
  confirmar,
  mxPesos,
  fechaHoyLocal,
  fechaLocal,
  calcPreset,
  actualizarLogo,
  actualizarNombreNegocio,
  actualizarBadgeCajero,
  cerrarSesion,
};

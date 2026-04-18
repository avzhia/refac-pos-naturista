/* ═══════════════════════════════════════════════
   js/modules/login.js
   Flujo de autenticación: tienda → cajero → PIN → fondo
═══════════════════════════════════════════════ */

import API    from '../core/api.js';
import Estado from '../core/estado.js';
import App, { showNotif, actualizarBadgeCajero, actualizarLogo, actualizarNombreNegocio, irA } from '../core/app.js';

// ── Estado interno ────────────────────────────────────────────────────────────

const _state = {
  tiendas:    [],
  cajeros:    [],
  tiendaSel:  null,
  cajeroSel:  null,
};

// ── SHA-256 nativo (SubtleCrypto) ─────────────────────────────────────────────

async function sha256(texto) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Renderizado ───────────────────────────────────────────────────────────────

function renderTiendas() {
  const cont = document.getElementById('login-tiendas');
  if (!cont) return;
  if (!_state.tiendas.length) {
    cont.innerHTML = '<div style="font-size:13px;color:var(--txt3);padding:8px;">Sin tiendas registradas. Abre Administración ⚙ para crear una.</div>';
    return;
  }
  cont.innerHTML = _state.tiendas.map(t => `
    <div class="login-opt ${_state.tiendaSel?.id === t.id ? 'sel' : ''}"
      data-tienda-id="${t.id}">
      ${t.nombre}
      <div class="opt-sub">${t.direccion || 'Sin dirección'}</div>
    </div>
  `).join('');

  cont.querySelectorAll('.login-opt').forEach(el => {
    el.addEventListener('click', () => seleccionarTienda(parseInt(el.dataset.tiendaId)));
  });
}

function renderCajeros() {
  const cont = document.getElementById('login-cajeros');
  if (!cont) return;
  const filtrados = _state.cajeros.filter(c =>
    c.activo && c.tienda_id === _state.tiendaSel?.id
  );
  if (!filtrados.length) {
    cont.innerHTML = '<div style="font-size:13px;color:var(--txt3);padding:8px;">Sin cajeros en esta tienda.</div>';
    return;
  }
  cont.innerHTML = filtrados.map(c => `
    <div class="login-opt ${_state.cajeroSel?.id === c.id ? 'sel' : ''}"
      data-cajero-id="${c.id}">
      ${c.nombre}
      ${c.tiene_pin
          ? '<div class="opt-sub" style="display:flex;align-items:center;gap:3px;margin-top:3px;"><span style=\"font-size:10px;background:#FFF3CD;color:#7D4E00;border:1px solid #FAC775;border-radius:10px;padding:1px 6px;font-weight:500;\">🔒 Con PIN</span></div>'
          : ''}
    </div>
  `).join('');

  cont.querySelectorAll('.login-opt').forEach(el => {
    el.addEventListener('click', () => seleccionarCajero(parseInt(el.dataset.cajeroId)));
  });
}

// ── Selección ─────────────────────────────────────────────────────────────────

function seleccionarTienda(id) {
  _state.tiendaSel  = _state.tiendas.find(t => t.id === id) || null;
  _state.cajeroSel  = null;
  document.getElementById('login-pin-section').style.display = 'none';
  document.getElementById('login-pin').value = '';
  _checkBtn();
  renderTiendas();
  renderCajeros();
}

function seleccionarCajero(id) {
  _state.cajeroSel = _state.cajeros.find(c => c.id === id) || null;
  const pinSection = document.getElementById('login-pin-section');
  const pinInput   = document.getElementById('login-pin');
  if (_state.cajeroSel?.tiene_pin) {
    pinSection.style.display = '';
    pinInput.value = '';
    pinInput.focus();
  } else {
    pinSection.style.display = 'none';
    pinInput.value = '';
  }
  _checkBtn();
  renderCajeros();
}

// ── Validación del botón ──────────────────────────────────────────────────────

function _checkBtn() {
  const btn        = document.getElementById('login-btn');
  const fondo      = document.getElementById('login-fondo');
  const fondoError = document.getElementById('login-fondo-error');
  const fondoRow   = document.getElementById('login-fondo-row');
  if (!btn) return;

  if (!_state.tiendaSel || !_state.cajeroSel) {
    btn.disabled = true;
    if (fondoError) fondoError.style.display = 'none';
    return;
  }

  // Consultar turno activo para decidir si mostrar fondo
  API.get(`/api/turnos/activo?cajero_id=${_state.cajeroSel.id}&tienda_id=${_state.tiendaSel.id}`)
    .then(resp => {
      if (resp?.activo) {
        // Hay turno activo — ocultar fondo y habilitar botón
        if (fondoRow) fondoRow.style.display = 'none';
        if (fondoError) fondoError.style.display = 'none';
        btn.disabled = false;
      } else {
        // No hay turno — mostrar fondo y validar
        if (fondoRow) fondoRow.style.display = '';
        const listo = (fondo?.value ?? '') !== '';
        btn.disabled = !listo;
        if (fondoError) {
          fondoError.style.display = (!listo) ? '' : 'none';
        }
      }
    })
    .catch(() => {
      // Error de red — mostrar fondo normalmente
      if (fondoRow) fondoRow.style.display = '';
      const listo = (fondo?.value ?? '') !== '';
      btn.disabled = !listo;
    });
}

// ── Entrar ────────────────────────────────────────────────────────────────────

async function entrar() {
  const fondoInput = document.getElementById('login-fondo');
  const fondoError = document.getElementById('login-fondo-error');
  const pinInput   = document.getElementById('login-pin');

  // Validar PIN si aplica
  if (_state.cajeroSel?.tiene_pin) {
    const pinVal = pinInput?.value?.trim() ?? '';
    if (!pinVal) {
      showNotif('⚠ Ingresa tu PIN');
      pinInput?.focus();
      return;
    }
    try {
      const res = await API.get(`/api/cajeros/verificar-pin?cajero_id=${_state.cajeroSel.id}&pin=${encodeURIComponent(pinVal)}`);
      if (!res?.ok) {
        showNotif('⚠ PIN incorrecto');
        pinInput.value = '';
        pinInput?.focus();
        return;
      }
    } catch(e) {
      showNotif('⚠ PIN incorrecto');
      pinInput.value = '';
      pinInput?.focus();
      return;
    }
  }

  // Consultar si hay turno activo en backend
  let turnoActivo = null;
  try {
    const turnoResp = await API.get(`/api/turnos/activo?cajero_id=${_state.cajeroSel.id}&tienda_id=${_state.tiendaSel.id}`);
    if (turnoResp?.activo) turnoActivo = turnoResp;
  } catch(e) {}

  // Si no hay turno activo, validar fondo
  if (!turnoActivo) {
    const fondo = parseFloat(fondoInput?.value ?? '');
    if (!fondoInput?.value || isNaN(fondo)) {
      fondoError.style.display = '';
      fondoInput?.focus();
      return;
    }
    fondoError.style.display = 'none';

    // Abrir turno nuevo
    try {
      const nuevoTurno = await API.post('/api/turnos/abrir', {
        cajero_id:     _state.cajeroSel.id,
        tienda_id:     _state.tiendaSel.id,
        fondo_inicial: fondo,
      });
      Estado.config.fondoInicial = fondo;
      Estado.config.apertura     = nuevoTurno.fecha_apertura;
      Estado.config.turnoId      = nuevoTurno.turno_id;
    } catch(e) {
      Estado.config.fondoInicial = fondo;
      Estado.config.apertura     = new Date().toISOString();
      Estado.config.turnoId      = null;
    }
  } else {
    // Retomar turno existente
    Estado.config.fondoInicial = turnoActivo.fondo_inicial;
    Estado.config.apertura     = turnoActivo.fecha_apertura;
    Estado.config.turnoId      = turnoActivo.turno_id;
  }

  // Guardar sesión
  Estado.config.cajero       = _state.cajeroSel.nombre;
  Estado.config.cajeroId     = _state.cajeroSel.id;
  Estado.config.tiendaId     = _state.tiendaSel.id;
  Estado.config.tiendaNombre = _state.tiendaSel.nombre;
  Estado.guardarSesion();

  // Actualizar UI
  actualizarBadgeCajero();
  document.getElementById('login-screen').classList.add('hidden');
  irA('ventas');

  // Disparar evento para que ventas.js inicialice
  document.dispatchEvent(new CustomEvent('pos:navegar', { detail: { modulo: 'ventas' } }));
}

// ── Init público — carga tiendas y cajeros ────────────────────────────────────

async function init() {
  try {
    const [tiendas, cajeros] = await Promise.all([
      API.getTiendas(),
      API.get('/api/cajeros'), // todos, sin filtro — filtramos en cliente
    ]);
    _state.tiendas = tiendas.filter(t => t.activa);
    _state.cajeros = cajeros;
  } catch(e) {
    document.getElementById('login-tiendas').innerHTML =
      '<div style="font-size:13px;color:var(--red-txt);padding:8px;">⚠ Sin conexión al servidor.<br>Asegúrate de que el backend esté corriendo.</div>';
    return;
  }

  // Reset selección
  _state.tiendaSel = null;
  _state.cajeroSel = null;
  document.getElementById('login-pin-section').style.display = 'none';
  document.getElementById('login-pin').value   = '';
  document.getElementById('login-fondo').value = '';
  document.getElementById('login-fondo-error').style.display = 'none';
  _checkBtn();
  renderTiendas();
  renderCajeros();
}

// ── Conectar eventos ──────────────────────────────────────────────────────────

function conectar() {
  // Botón entrar
  document.getElementById('login-btn')
    ?.addEventListener('click', entrar);

  // Enter en PIN pasa al fondo
  document.getElementById('login-pin')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-fondo')?.focus();
    });

  // Enter en fondo NO entra — solo actualiza estado del botón
  document.getElementById('login-fondo')
    ?.addEventListener('input', _checkBtn);

  // Botón ⚙ abre admin
  document.getElementById('login-admin-btn')
    ?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('pos:abrir-admin'));
    });

  // Escuchar evento de init-login desde app.js
  document.addEventListener('pos:init-login', init);
}

// ── Arranque ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', conectar);

export default { init };

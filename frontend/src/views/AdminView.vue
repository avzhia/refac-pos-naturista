<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const router = useRouter()
const auth   = useAuthStore()
const ui     = useUiStore()

// ── Auth gate ─────────────────────────────────────────────────────────────────
const autenticado  = ref(false)
const gatePassword = ref('')
const gateError    = ref('')
const gateLoading  = ref(false)

async function autenticar() {
  if (!gatePassword.value) return
  gateError.value    = ''
  gateLoading.value  = true
  try {
    await api.post('/admin/login', { password: gatePassword.value })
    autenticado.value  = true
    await cargarTodo()
  } catch (e) {
    gateError.value    = e.response?.data?.detail || 'Contraseña incorrecta'
    gatePassword.value = ''
  } finally {
    gateLoading.value = false
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const tab  = ref('negocio')
const tabs = [
  { id: 'negocio',   label: '🏪 Negocio'   },
  { id: 'tiendas',   label: '📍 Tiendas'   },
  { id: 'cajeros',   label: '👤 Cajeros'   },
  { id: 'seguridad', label: '🔐 Seguridad' },
  { id: 'datos',     label: '📦 Datos'     },
]

async function cargarTodo() {
  await Promise.all([cargarNegocio(), cargarTiendas(), cargarCajeros()])
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEGOCIO — nombre + logo
// ═══════════════════════════════════════════════════════════════════════════════
const nombreNegocio  = ref('')
const nombreLoading  = ref(false)
const logoPreviewUrl = ref(null)
const logoFile       = ref(null)
const logoLoading    = ref(false)

async function cargarNegocio() {
  try {
    const { data } = await api.get('/admin/config/nombre_negocio')
    nombreNegocio.value = data.valor
  } catch { /* sin config todavía */ }
  logoPreviewUrl.value = '/api/admin/logo?t=' + Date.now()
}

async function guardarNombre() {
  if (!nombreNegocio.value.trim()) return
  nombreLoading.value = true
  try {
    await api.post('/admin/config', { clave: 'nombre_negocio', valor: nombreNegocio.value.trim() })
    ui.success('Nombre actualizado')
  } catch {
    ui.error('Error al guardar nombre')
  } finally {
    nombreLoading.value = false
  }
}

function onLogoChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value       = file
  logoPreviewUrl.value = URL.createObjectURL(file)
}

async function subirLogo() {
  if (!logoFile.value) return
  logoLoading.value = true
  try {
    const form = new FormData()
    form.append('file', logoFile.value)
    await api.post('/admin/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    logoFile.value = null
    ui.success('Logo actualizado')
  } catch {
    ui.error('Error al subir logo')
  } finally {
    logoLoading.value = false
  }
}

async function quitarLogo() {
  if (!confirm('¿Quitar el logo de la tienda?')) return
  try {
    await api.delete('/admin/logo')
    logoPreviewUrl.value = null
    ui.success('Logo quitado')
  } catch {
    ui.error('Error al quitar logo')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIENDAS
// ═══════════════════════════════════════════════════════════════════════════════
const tiendas        = ref([])
const tiendaEdits    = ref({})
const showFormTienda = ref(false)
const nuevaTienda    = ref({ nombre: '', direccion: '' })
const tiendaLoading  = ref(false)

async function cargarTiendas() {
  const { data } = await api.get('/tiendas')
  tiendas.value    = data
  tiendaEdits.value = {}
  data.forEach(t => {
    tiendaEdits.value[t.id] = { nombre: t.nombre, direccion: t.direccion || '' }
  })
}

async function guardarTienda(id) {
  const edit = tiendaEdits.value[id]
  if (!edit.nombre.trim()) return
  try {
    await api.put(`/tiendas/${id}`, { nombre: edit.nombre.trim(), direccion: edit.direccion.trim() })
    await cargarTiendas()
    ui.success('Tienda actualizada')
  } catch {
    ui.error('Error al guardar tienda')
  }
}

async function desactivarTienda(id) {
  if (!confirm('¿Desactivar esta tienda?')) return
  try {
    await api.put(`/tiendas/${id}/desactivar`, {})
    await cargarTiendas()
    ui.success('Tienda desactivada')
  } catch (e) {
    ui.error(e.response?.data?.detail || 'Error al desactivar tienda')
  }
}

async function crearTienda() {
  if (!nuevaTienda.value.nombre.trim()) return
  tiendaLoading.value = true
  try {
    await api.post('/tiendas', { nombre: nuevaTienda.value.nombre.trim(), direccion: nuevaTienda.value.direccion.trim() })
    nuevaTienda.value    = { nombre: '', direccion: '' }
    showFormTienda.value = false
    await cargarTiendas()
    ui.success('Tienda creada')
  } catch {
    ui.error('Error al crear tienda')
  } finally {
    tiendaLoading.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAJEROS
// ═══════════════════════════════════════════════════════════════════════════════
const cajeros        = ref([])
const pinInputs      = ref({})
const showFormCajero = ref(false)
const nuevoCajero    = ref({ nombre: '', tienda_id: null, pin: '' })
const cajeroLoading  = ref(false)

async function cargarCajeros() {
  const { data } = await api.get('/cajeros')
  cajeros.value  = data
  pinInputs.value = {}
  data.forEach(c => { pinInputs.value[c.id] = '' })
}

async function guardarPin(cajeroId) {
  const pin = pinInputs.value[cajeroId] ?? ''
  try {
    await api.put(`/cajeros/${cajeroId}/pin`, { pin })
    pinInputs.value[cajeroId] = ''
    await cargarCajeros()
    ui.success(pin.length >= 4 ? 'PIN actualizado' : 'PIN eliminado')
  } catch {
    ui.error('Error al guardar PIN')
  }
}

async function eliminarCajero(id) {
  if (!confirm('¿Eliminar este cajero?')) return
  try {
    await api.delete(`/cajeros/${id}`)
    await cargarCajeros()
    ui.success('Cajero eliminado')
  } catch {
    ui.error('Error al eliminar cajero')
  }
}

async function crearCajero() {
  if (!nuevoCajero.value.nombre.trim() || !nuevoCajero.value.tienda_id) return
  cajeroLoading.value = true
  try {
    const { data: nuevo } = await api.post('/cajeros', {
      nombre:    nuevoCajero.value.nombre.trim(),
      tienda_id: nuevoCajero.value.tienda_id,
    })
    if (nuevoCajero.value.pin.length >= 4) {
      await api.put(`/cajeros/${nuevo.id}/pin`, { pin: nuevoCajero.value.pin })
    }
    nuevoCajero.value    = { nombre: '', tienda_id: null, pin: '' }
    showFormCajero.value = false
    await cargarCajeros()
    ui.success('Cajero creado')
  } catch {
    ui.error('Error al crear cajero')
  } finally {
    cajeroLoading.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEGURIDAD — cambiar contraseña
// ═══════════════════════════════════════════════════════════════════════════════
const passActual  = ref('')
const passNueva   = ref('')
const passError   = ref('')
const passLoading = ref(false)

async function cambiarPassword() {
  passError.value = ''
  if (!passActual.value || !passNueva.value) { passError.value = 'Completa ambos campos'; return }
  if (passNueva.value.length < 4)            { passError.value = 'Mínimo 4 caracteres'; return }
  passLoading.value = true
  try {
    // schema AdminSetup: password=nueva, confirm=actual
    await api.put('/admin/password', { password: passNueva.value, confirm: passActual.value })
    passActual.value = ''
    passNueva.value  = ''
    ui.success('Contraseña actualizada')
  } catch (e) {
    passError.value = e.response?.data?.detail || 'Contraseña actual incorrecta'
  } finally {
    passLoading.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATOS — respaldo + historial de cierres
// ═══════════════════════════════════════════════════════════════════════════════
const cierres        = ref([])
const cierresLoading = ref(false)

async function cargarCierres() {
  cierresLoading.value = true
  try {
    const { data } = await api.get('/cierres')
    cierres.value = data
  } catch {
    ui.error('Error al cargar historial')
  } finally {
    cierresLoading.value = false
  }
}

function descargarRespaldo() {
  const fecha = new Date().toISOString().split('T')[0]
  const a = document.createElement('a')
  a.href     = `/api/admin/backup`
  a.download = `pos_backup_${fecha}.sql`
  a.click()
  ui.success('Descargando respaldo…')
}

const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const fmtFecha = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-4 pb-20">

    <!-- ── Auth gate ──────────────────────────────────────────────────────────── -->
    <div v-if="!autenticado" class="flex items-center justify-center min-h-[60vh]">
      <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div class="text-center mb-6">
          <span class="text-5xl">⚙️</span>
          <h2 class="text-xl font-bold text-gray-800 mt-3">Panel de Administración</h2>
          <p class="text-sm text-gray-400 mt-1">Ingresa la contraseña maestra para continuar</p>
        </div>
        <div class="space-y-3">
          <input v-model="gatePassword" type="password" placeholder="Contraseña maestra"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            @keyup.enter="autenticar" autofocus />
          <p v-if="gateError" class="text-red-500 text-sm">{{ gateError }}</p>
          <button @click="autenticar" :disabled="gateLoading || !gatePassword"
            class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-semibold text-sm transition-colors">
            {{ gateLoading ? 'Verificando…' : 'Acceder' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Panel ─────────────────────────────────────────────────────────────── -->
    <div v-else>
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">⚙️ Administración</h1>
        <button v-if="!auth.turnoActivo" @click="router.push('/login')"
          class="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Volver al login
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        <button v-for="t in tabs" :key="t.id"
          @click="tab = t.id; t.id === 'datos' && cargarCierres()"
          class="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors"
          :class="tab === t.id
            ? 'bg-green-700 text-white shadow'
            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'">
          {{ t.label }}
        </button>
      </div>

      <!-- ══ NEGOCIO ══════════════════════════════════════════════════════════ -->
      <div v-if="tab === 'negocio'" class="space-y-5">

        <div class="bg-white rounded-2xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-700 mb-4">Nombre del negocio</h3>
          <div class="flex gap-2">
            <input v-model="nombreNegocio" type="text" placeholder="Ej. Tienda Naturista Centro"
              class="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              @keyup.enter="guardarNombre" />
            <button @click="guardarNombre" :disabled="nombreLoading || !nombreNegocio.trim()"
              class="px-5 py-2.5 bg-green-700 text-white rounded-xl hover:bg-green-800 disabled:opacity-50 text-sm font-medium transition-colors">
              {{ nombreLoading ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-700 mb-4">Logo de la tienda</h3>
          <div class="flex items-start gap-5">
            <div class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
              <img v-if="logoPreviewUrl" :src="logoPreviewUrl" class="w-full h-full object-contain"
                @error="logoPreviewUrl = null" />
              <span v-else class="text-3xl">🌿</span>
            </div>
            <div class="flex-1 space-y-2">
              <label class="block">
                <span class="text-xs text-gray-500 mb-1 block">PNG, JPG o SVG</span>
                <input type="file" accept="image/*" @change="onLogoChange"
                  class="block w-full text-sm text-gray-500
                    file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                    file:text-xs file:font-medium file:bg-green-50 file:text-green-700
                    hover:file:bg-green-100" />
              </label>
              <div class="flex gap-2">
                <button @click="subirLogo" :disabled="logoLoading || !logoFile"
                  class="px-4 py-1.5 bg-green-700 text-white rounded-lg text-xs font-medium hover:bg-green-800 disabled:opacity-50 transition-colors">
                  {{ logoLoading ? 'Subiendo…' : '⬆ Subir logo' }}
                </button>
                <button @click="quitarLogo"
                  class="px-4 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors">
                  🗑 Quitar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TIENDAS ══════════════════════════════════════════════════════════ -->
      <div v-if="tab === 'tiendas'" class="space-y-4">

        <div v-for="t in tiendas" :key="t.id" class="bg-white rounded-2xl shadow-sm p-4">
          <p class="text-xs text-gray-400 mb-2 font-medium">🏪 ID {{ t.id }}</p>
          <div class="flex gap-2 flex-wrap">
            <input v-model="tiendaEdits[t.id].nombre" type="text" placeholder="Nombre *"
              class="flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input v-model="tiendaEdits[t.id].direccion" type="text" placeholder="Dirección (opcional)"
              class="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button @click="guardarTienda(t.id)"
              class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition-colors whitespace-nowrap">
              Guardar
            </button>
            <button @click="desactivarTienda(t.id)"
              class="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors">
              🗑
            </button>
          </div>
        </div>

        <p v-if="!tiendas.length" class="text-center text-gray-400 text-sm py-6">Sin tiendas registradas</p>

        <div class="bg-white rounded-2xl shadow-sm p-4">
          <button @click="showFormTienda = !showFormTienda"
            class="flex items-center gap-2 text-green-700 font-medium text-sm hover:text-green-900 transition-colors">
            <span class="text-lg leading-none">{{ showFormTienda ? '−' : '+' }}</span>
            Nueva tienda
          </button>
          <div v-if="showFormTienda" class="mt-3 space-y-2">
            <input v-model="nuevaTienda.nombre" type="text" placeholder="Nombre de la tienda *"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input v-model="nuevaTienda.direccion" type="text" placeholder="Dirección (opcional)"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div class="flex gap-2">
              <button @click="showFormTienda = false"
                class="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button @click="crearTienda" :disabled="tiendaLoading || !nuevaTienda.nombre.trim()"
                class="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors">
                {{ tiendaLoading ? 'Creando…' : 'Crear tienda' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ CAJEROS ══════════════════════════════════════════════════════════ -->
      <div v-if="tab === 'cajeros'" class="space-y-4">

        <div v-for="c in cajeros" :key="c.id" class="bg-white rounded-2xl shadow-sm p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="font-medium text-gray-800 text-sm">{{ c.nombre }}</p>
              <p class="text-xs text-gray-400">{{ c.tienda_nombre }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="c.tiene_pin"
                class="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
                🔒 Con PIN
              </span>
              <button @click="eliminarCajero(c.id)"
                class="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors">
                🗑
              </button>
            </div>
          </div>
          <div class="flex gap-2">
            <input v-model="pinInputs[c.id]" type="password" inputmode="numeric"
              maxlength="6" placeholder="PIN (4–6 dígitos) · vacío = quitar"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button @click="guardarPin(c.id)"
              class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition-colors whitespace-nowrap">
              Guardar PIN
            </button>
          </div>
        </div>

        <p v-if="!cajeros.length" class="text-center text-gray-400 text-sm py-6">Sin cajeros registrados</p>

        <div class="bg-white rounded-2xl shadow-sm p-4">
          <button @click="showFormCajero = !showFormCajero"
            class="flex items-center gap-2 text-green-700 font-medium text-sm hover:text-green-900 transition-colors">
            <span class="text-lg leading-none">{{ showFormCajero ? '−' : '+' }}</span>
            Nuevo cajero
          </button>
          <div v-if="showFormCajero" class="mt-3 space-y-2">
            <input v-model="nuevoCajero.nombre" type="text" placeholder="Nombre del cajero *"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <select v-model="nuevoCajero.tienda_id"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option :value="null" disabled>Seleccionar tienda *</option>
              <option v-for="t in tiendas" :key="t.id" :value="t.id">{{ t.nombre }}</option>
            </select>
            <input v-model="nuevoCajero.pin" type="password" inputmode="numeric"
              maxlength="6" placeholder="PIN opcional (mín. 4 dígitos)"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div class="flex gap-2">
              <button @click="showFormCajero = false"
                class="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button @click="crearCajero"
                :disabled="cajeroLoading || !nuevoCajero.nombre.trim() || !nuevoCajero.tienda_id"
                class="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors">
                {{ cajeroLoading ? 'Creando…' : 'Crear cajero' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ SEGURIDAD ════════════════════════════════════════════════════════ -->
      <div v-if="tab === 'seguridad'">
        <div class="bg-white rounded-2xl shadow-sm p-5 max-w-sm">
          <h3 class="font-semibold text-gray-700 mb-4">Cambiar contraseña maestra</h3>
          <div class="space-y-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Contraseña actual</label>
              <input v-model="passActual" type="password" placeholder="••••••"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Contraseña nueva (mín. 4 caracteres)</label>
              <input v-model="passNueva" type="password" placeholder="••••••"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                @keyup.enter="cambiarPassword" />
            </div>
            <p v-if="passError" class="text-red-500 text-sm">{{ passError }}</p>
            <button @click="cambiarPassword" :disabled="passLoading || !passActual || !passNueva"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-semibold text-sm transition-colors">
              {{ passLoading ? 'Actualizando…' : 'Actualizar contraseña' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══ DATOS ════════════════════════════════════════════════════════════ -->
      <div v-if="tab === 'datos'" class="space-y-5">

        <div class="bg-white rounded-2xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-700 mb-2">Respaldo de base de datos</h3>
          <p class="text-sm text-gray-400 mb-4">Descarga un volcado SQL del estado actual.</p>
          <button @click="descargarRespaldo"
            class="px-5 py-2.5 bg-green-700 text-white rounded-xl hover:bg-green-800 text-sm font-medium transition-colors">
            ⬇ Descargar respaldo
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-700">Historial de cierres de caja</h3>
            <button @click="cargarCierres"
              class="text-xs text-green-700 hover:text-green-900 font-medium">
              ↺ Actualizar
            </button>
          </div>

          <div v-if="cierresLoading" class="text-center py-8 text-gray-400 text-sm">Cargando…</div>

          <p v-else-if="!cierres.length" class="text-center py-8 text-gray-400 text-sm">
            Sin cierres registrados
          </p>

          <div v-else class="overflow-x-auto -mx-5 px-5">
            <table class="w-full text-sm border-collapse min-w-[540px]">
              <thead>
                <tr class="border-b border-gray-200 text-xs text-gray-500">
                  <th class="pb-2 text-left font-medium">Fecha cierre</th>
                  <th class="pb-2 text-left font-medium">Cajero</th>
                  <th class="pb-2 text-right font-medium">Tickets</th>
                  <th class="pb-2 text-right font-medium">Ventas netas</th>
                  <th class="pb-2 text-right font-medium">Ef. contado</th>
                  <th class="pb-2 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cl in cierres" :key="cl.id" class="border-b border-gray-100 last:border-0">
                  <td class="py-2.5 text-gray-500 whitespace-nowrap text-xs">{{ fmtFecha(cl.fecha_cierre) }}</td>
                  <td class="py-2.5 text-gray-800">{{ cl.cajero || '—' }}</td>
                  <td class="py-2.5 text-right text-gray-600">{{ cl.tickets || 0 }}</td>
                  <td class="py-2.5 text-right font-medium text-green-700">{{ fmt(cl.total_ventas) }}</td>
                  <td class="py-2.5 text-right text-gray-600">{{ fmt(cl.efectivo_contado) }}</td>
                  <td class="py-2.5 text-right font-semibold"
                    :class="(cl.diferencia || 0) === 0
                      ? 'text-green-600'
                      : (cl.diferencia || 0) > 0 ? 'text-blue-600' : 'text-red-600'">
                    {{ (cl.diferencia || 0) === 0
                        ? '✓ $0.00'
                        : ((cl.diferencia > 0 ? '+' : '') + fmt(cl.diferencia)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

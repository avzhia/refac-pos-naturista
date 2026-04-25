<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import api from '../api'

const router = useRouter()
const auth   = useAuthStore()
const ui     = useUiStore()

// ── Login flow ────────────────────────────────────────────────────────────────
// step: setup | tienda | cajero | pin | fondo
const step    = ref('tienda')
const loading = ref(false)

const tiendas            = ref([])
const cajeros            = ref([])
const tiendaSeleccionada = ref(null)
const cajeroSeleccionado = ref(null)
const pinInput           = ref('')
const pinError           = ref('')
const fondoInicial       = ref(0)

// Primer setup (contraseña maestra nueva)
const adminPassword = ref('')
const adminConfirm  = ref('')
const adminError    = ref('')

// ── Panel de administración ───────────────────────────────────────────────────
const showAdmin      = ref(false)
const adminStep      = ref('auth')   // 'auth' | 'panel'
const adminPwd       = ref('')
const adminPwdError  = ref('')
const adminLoading   = ref(false)

const adminTiendas   = ref([])
const adminCajeros   = ref([])

const showFormTienda  = ref(false)
const showFormCajero  = ref(false)
const nuevaTienda     = ref({ nombre: '', direccion: '' })
const nuevoCajero     = ref({ nombre: '', tienda_id: null })
const formLoading     = ref(false)

// ── Inicialización ────────────────────────────────────────────────────────────
onMounted(async () => {
  if (auth.turnoActivo) { router.push('/ventas'); return }
  await checkSetup()
})

async function checkSetup() {
  try {
    const { data } = await api.get('/admin/setup-required')
    if (data.required) {
      step.value = 'setup'
    } else {
      await loadTiendas()
    }
  } catch {
    ui.error('No se pudo conectar con el servidor')
  }
}

// ── Primer setup ──────────────────────────────────────────────────────────────
async function setupAdmin() {
  adminError.value = ''
  if (adminPassword.value !== adminConfirm.value) {
    adminError.value = 'Las contraseñas no coinciden'; return
  }
  loading.value = true
  try {
    await api.post('/admin/setup', { password: adminPassword.value, confirm: adminConfirm.value })
    ui.success('Contraseña maestra configurada')
    await loadTiendas()
  } catch (e) {
    adminError.value = e.response?.data?.detail || 'Error al configurar'
  } finally {
    loading.value = false
  }
}

// ── Login flow ────────────────────────────────────────────────────────────────
async function loadTiendas() {
  const { data } = await api.get('/tiendas')
  tiendas.value = data
  if (data.length === 0) {
    step.value = 'sin-tienda'
  } else if (data.length === 1) {
    await selectTienda(data[0])
  } else {
    step.value = 'tienda'
  }
}

async function selectTienda(tienda) {
  tiendaSeleccionada.value = tienda
  const { data } = await api.get('/cajeros')
  cajeros.value = data.filter(c => c.tienda_id === tienda.id)
  step.value = 'cajero'
}

function selectCajero(cajero) {
  cajeroSeleccionado.value = cajero
  if (cajero.tiene_pin) {
    pinInput.value = ''
    pinError.value = ''
    step.value = 'pin'
  } else {
    step.value = 'fondo'
  }
}

async function verificarPin() {
  if (!pinInput.value) return
  pinError.value = ''
  loading.value = true
  try {
    await api.get('/cajeros/verificar-pin', {
      params: { cajero_id: cajeroSeleccionado.value.id, pin: pinInput.value },
    })
    step.value = 'fondo'
  } catch {
    pinError.value = 'PIN incorrecto'
    pinInput.value = ''
  } finally {
    loading.value = false
  }
}

async function abrirTurno() {
  loading.value = true
  try {
    const { data } = await api.post('/turnos/abrir', {
      cajero_id:     cajeroSeleccionado.value.id,
      tienda_id:     tiendaSeleccionada.value.id,
      fondo_inicial: fondoInicial.value,
    })
    auth.setSession(
      cajeroSeleccionado.value,
      tiendaSeleccionada.value,
      { id: data.turno_id, fondo_inicial: data.fondo_inicial, fecha_apertura: data.fecha_apertura },
    )
    router.push('/ventas')
  } catch (e) {
    ui.error(e.response?.data?.detail || 'Error al abrir turno')
  } finally {
    loading.value = false
  }
}

// ── Panel de administración ───────────────────────────────────────────────────
function abrirAdmin() {
  adminPwd.value      = ''
  adminPwdError.value = ''
  adminStep.value     = 'auth'
  showAdmin.value     = true
}

function cerrarAdmin() {
  showAdmin.value     = false
  showFormTienda.value = false
  showFormCajero.value = false
}

async function autenticarAdmin() {
  adminPwdError.value = ''
  adminLoading.value  = true
  try {
    await api.post('/admin/login', { password: adminPwd.value })
    await cargarDatosAdmin()
    adminStep.value = 'panel'
  } catch (e) {
    adminPwdError.value = e.response?.data?.detail || 'Contraseña incorrecta'
  } finally {
    adminLoading.value = false
  }
}

async function cargarDatosAdmin() {
  const [t, c] = await Promise.all([api.get('/tiendas'), api.get('/cajeros')])
  adminTiendas.value = t.data
  adminCajeros.value = c.data
}

function cajerosDetienda(tiendaId) {
  return adminCajeros.value.filter(c => c.tienda_id === tiendaId)
}

async function crearTienda() {
  if (!nuevaTienda.value.nombre.trim()) return
  formLoading.value = true
  try {
    await api.post('/tiendas', nuevaTienda.value)
    ui.success('Tienda creada')
    nuevaTienda.value    = { nombre: '', direccion: '' }
    showFormTienda.value = false
    await cargarDatosAdmin()
  } catch (e) {
    ui.error(e.response?.data?.detail || 'Error al crear tienda')
  } finally {
    formLoading.value = false
  }
}

async function crearCajero() {
  if (!nuevoCajero.value.nombre.trim() || !nuevoCajero.value.tienda_id) return
  formLoading.value = true
  try {
    await api.post('/cajeros', nuevoCajero.value)
    ui.success('Cajero creado')
    nuevoCajero.value    = { nombre: '', tienda_id: null }
    showFormCajero.value = false
    await cargarDatosAdmin()
  } catch (e) {
    ui.error(e.response?.data?.detail || 'Error al crear cajero')
  } finally {
    formLoading.value = false
  }
}

async function guardarYCerrar() {
  cerrarAdmin()
  await loadTiendas()
}
</script>

<template>
  <div class="min-h-screen bg-green-50 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">

      <!-- Header -->
      <div class="text-center mb-8">
        <div class="w-20 h-20 bg-green-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span class="text-4xl">🌿</span>
        </div>
        <h1 class="text-2xl font-bold text-green-900">TiendaNaturistaMX</h1>
        <p class="text-green-600 text-sm mt-1">Punto de Venta</p>
      </div>

      <!-- Card -->
      <div class="bg-white rounded-2xl shadow-lg p-6 relative">

        <!-- Botón ⚙️ administración -->
        <button
          v-if="step !== 'setup'"
          @click="router.push('/admin')"
          class="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl"
          title="Administración"
        >⚙️</button>

        <!-- ── Primer setup ── -->
        <template v-if="step === 'setup'">
          <h2 class="text-lg font-semibold text-gray-800 mb-1">Configuración inicial</h2>
          <p class="text-sm text-gray-500 mb-4">Crea la contraseña maestra del sistema.</p>
          <div class="space-y-3">
            <input v-model="adminPassword" type="password" placeholder="Contraseña"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
            <input v-model="adminConfirm" type="password" placeholder="Confirmar contraseña"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              @keyup.enter="setupAdmin" />
            <p v-if="adminError" class="text-red-500 text-sm">{{ adminError }}</p>
            <button @click="setupAdmin" :disabled="loading"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-medium text-sm transition-colors">
              {{ loading ? 'Guardando…' : 'Configurar' }}
            </button>
          </div>
        </template>

        <!-- ── Sin tiendas ── -->
        <template v-else-if="step === 'sin-tienda'">
          <div class="text-center py-4">
            <p class="text-3xl mb-3">🏪</p>
            <h2 class="text-base font-semibold text-gray-700 mb-1">No hay tiendas configuradas</h2>
            <p class="text-sm text-gray-400 mb-4">Usa el botón ⚙️ para crear una tienda y un cajero.</p>
            <button @click="router.push('/admin')"
              class="px-5 py-2 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 transition-colors">
              ⚙️ Abrir configuración
            </button>
          </div>
        </template>

        <!-- ── Selección de tienda ── -->
        <template v-else-if="step === 'tienda'">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Selecciona tu tienda</h2>
          <div class="space-y-2">
            <button v-for="t in tiendas" :key="t.id" @click="selectTienda(t)"
              class="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors">
              <p class="font-medium text-gray-800">{{ t.nombre }}</p>
              <p v-if="t.direccion" class="text-xs text-gray-500 mt-0.5">{{ t.direccion }}</p>
            </button>
          </div>
        </template>

        <!-- ── Selección de cajero ── -->
        <template v-else-if="step === 'cajero'">
          <div class="flex items-center gap-2 mb-4">
            <button @click="tiendas.length > 1 ? step = 'tienda' : null"
              class="text-green-600 hover:text-green-800 text-lg">←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">¿Quién eres?</h2>
              <p class="text-xs text-gray-400">{{ tiendaSeleccionada?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-2">
            <button v-for="c in cajeros" :key="c.id" @click="selectCajero(c)"
              class="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors flex justify-between items-center">
              <span class="font-medium text-gray-800">{{ c.nombre }}</span>
              <span v-if="c.tiene_pin" class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">🔒 PIN</span>
            </button>
            <div v-if="!cajeros.length" class="text-center py-4 text-gray-400 text-sm">
              No hay cajeros. Usa ⚙️ para crear uno.
            </div>
          </div>
        </template>

        <!-- ── PIN ── -->
        <template v-else-if="step === 'pin'">
          <div class="flex items-center gap-2 mb-4">
            <button @click="step = 'cajero'" class="text-green-600 hover:text-green-800 text-lg">←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">Ingresa tu PIN</h2>
              <p class="text-xs text-gray-400">{{ cajeroSeleccionado?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-3">
            <input v-model="pinInput" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-2xl tracking-[0.5em]"
              :class="{ 'border-red-400 ring-2 ring-red-200': pinError }"
              @keyup.enter="verificarPin" />
            <p v-if="pinError" class="text-red-500 text-sm text-center">{{ pinError }}</p>
            <button @click="verificarPin" :disabled="loading || !pinInput"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-medium text-sm transition-colors">
              {{ loading ? 'Verificando…' : 'Continuar' }}
            </button>
          </div>
        </template>

        <!-- ── Fondo inicial ── -->
        <template v-else-if="step === 'fondo'">
          <div class="flex items-center gap-2 mb-4">
            <button @click="step = cajeroSeleccionado?.tiene_pin ? 'pin' : 'cajero'"
              class="text-green-600 hover:text-green-800 text-lg">←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">Fondo inicial</h2>
              <p class="text-xs text-gray-400">{{ cajeroSeleccionado?.nombre }} · {{ tiendaSeleccionada?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-3">
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input v-model.number="fondoInicial" type="number" min="0" step="0.01" placeholder="0.00"
                class="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
                @keyup.enter="abrirTurno" />
            </div>
            <button @click="abrirTurno" :disabled="loading"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-semibold text-sm transition-colors">
              {{ loading ? 'Abriendo turno…' : '🚀 Abrir turno' }}
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>

  <!-- ── Modal: Panel de administración ─────────────────────────────────────── -->
  <teleport to="body">
    <div v-if="showAdmin" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      @click.self="cerrarAdmin">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">

        <!-- Header del modal -->
        <div class="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h3 class="font-bold text-gray-800">
            {{ adminStep === 'auth' ? '🔐 Acceso de administrador' : '⚙️ Configuración' }}
          </h3>
          <button @click="cerrarAdmin" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <!-- ── Auth ── -->
        <div v-if="adminStep === 'auth'" class="p-5 space-y-3">
          <p class="text-sm text-gray-500">Ingresa la contraseña maestra para administrar tiendas y cajeros.</p>
          <input v-model="adminPwd" type="password" placeholder="Contraseña maestra"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            @keyup.enter="autenticarAdmin" autofocus />
          <p v-if="adminPwdError" class="text-red-500 text-sm">{{ adminPwdError }}</p>
          <button @click="autenticarAdmin" :disabled="adminLoading || !adminPwd"
            class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-medium text-sm transition-colors">
            {{ adminLoading ? 'Verificando…' : 'Acceder' }}
          </button>
        </div>

        <!-- ── Panel ── -->
        <div v-else class="overflow-y-auto flex-1 p-5 space-y-6">

          <!-- Tiendas -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-semibold text-gray-700">🏪 Tiendas</h4>
              <button @click="showFormTienda = !showFormTienda"
                class="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors font-medium">
                + Nueva
              </button>
            </div>

            <!-- Formulario nueva tienda -->
            <div v-if="showFormTienda" class="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
              <input v-model="nuevaTienda.nombre" type="text" placeholder="Nombre de la tienda *"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input v-model="nuevaTienda.direccion" type="text" placeholder="Dirección (opcional)"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <div class="flex gap-2">
                <button @click="showFormTienda = false"
                  class="flex-1 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100">
                  Cancelar
                </button>
                <button @click="crearTienda" :disabled="formLoading || !nuevaTienda.nombre.trim()"
                  class="flex-1 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 font-medium">
                  {{ formLoading ? 'Guardando…' : 'Crear tienda' }}
                </button>
              </div>
            </div>

            <!-- Lista de tiendas -->
            <div class="space-y-1.5">
              <div v-for="t in adminTiendas" :key="t.id"
                class="flex items-center px-3 py-2 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800">{{ t.nombre }}</p>
                  <p v-if="t.direccion" class="text-xs text-gray-400 truncate">{{ t.direccion }}</p>
                </div>
                <span class="text-xs text-gray-400 shrink-0 ml-2">
                  {{ cajerosDetienda(t.id).length }} cajero(s)
                </span>
              </div>
              <p v-if="!adminTiendas.length" class="text-sm text-gray-400 text-center py-3">
                Sin tiendas — crea una arriba
              </p>
            </div>
          </section>

          <!-- Cajeros -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-semibold text-gray-700">👤 Cajeros</h4>
              <button @click="showFormCajero = !showFormCajero" :disabled="!adminTiendas.length"
                class="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors font-medium disabled:opacity-40">
                + Nuevo
              </button>
            </div>

            <!-- Formulario nuevo cajero -->
            <div v-if="showFormCajero" class="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
              <input v-model="nuevoCajero.nombre" type="text" placeholder="Nombre del cajero *"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select v-model="nuevoCajero.tienda_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                <option :value="null" disabled>Seleccionar tienda *</option>
                <option v-for="t in adminTiendas" :key="t.id" :value="t.id">{{ t.nombre }}</option>
              </select>
              <div class="flex gap-2">
                <button @click="showFormCajero = false"
                  class="flex-1 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100">
                  Cancelar
                </button>
                <button @click="crearCajero"
                  :disabled="formLoading || !nuevoCajero.nombre.trim() || !nuevoCajero.tienda_id"
                  class="flex-1 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 font-medium">
                  {{ formLoading ? 'Guardando…' : 'Crear cajero' }}
                </button>
              </div>
            </div>

            <!-- Lista de cajeros -->
            <div class="space-y-1.5">
              <div v-for="c in adminCajeros" :key="c.id"
                class="flex items-center px-3 py-2 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800">{{ c.nombre }}</p>
                  <p class="text-xs text-gray-400">{{ c.tienda_nombre }}</p>
                </div>
                <span v-if="c.tiene_pin" class="text-xs text-gray-400 shrink-0 ml-2">🔒 PIN</span>
              </div>
              <p v-if="!adminCajeros.length" class="text-sm text-gray-400 text-center py-3">
                Sin cajeros — crea uno arriba
              </p>
            </div>
          </section>
        </div>

        <!-- Footer del modal -->
        <div v-if="adminStep === 'panel'" class="px-5 py-4 border-t shrink-0">
          <button @click="guardarYCerrar"
            class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 font-semibold text-sm transition-colors">
            ✓ Listo — ir al login
          </button>
        </div>

      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import api from '../api'

const router = useRouter()
const auth   = useAuthStore()
const ui     = useUiStore()

// step: setup | tienda | cajero | pin | fondo
const step    = ref('tienda')
const loading = ref(false)

const tiendas          = ref([])
const cajeros          = ref([])
const tiendaSeleccionada = ref(null)
const cajeroSeleccionado = ref(null)

const pinInput = ref('')
const pinError = ref('')
const fondoInicial = ref(0)

const adminPassword = ref('')
const adminConfirm  = ref('')
const adminError    = ref('')

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

async function setupAdmin() {
  adminError.value = ''
  if (adminPassword.value !== adminConfirm.value) {
    adminError.value = 'Las contraseñas no coinciden'; return
  }
  loading.value = true
  try {
    await api.post('/admin/setup', { password: adminPassword.value, confirm: adminConfirm.value })
    ui.success('Contraseña configurada correctamente')
    await loadTiendas()
  } catch (e) {
    adminError.value = e.response?.data?.detail || 'Error al configurar'
  } finally {
    loading.value = false
  }
}

async function loadTiendas() {
  const { data } = await api.get('/tiendas')
  tiendas.value = data
  if (data.length === 1) {
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
      <div class="bg-white rounded-2xl shadow-lg p-6">

        <!-- Setup admin -->
        <template v-if="step === 'setup'">
          <h2 class="text-lg font-semibold text-gray-800 mb-1">Configuración inicial</h2>
          <p class="text-sm text-gray-500 mb-4">Crea la contraseña maestra del sistema.</p>
          <div class="space-y-3">
            <input
              v-model="adminPassword"
              type="password"
              placeholder="Contraseña"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
            <input
              v-model="adminConfirm"
              type="password"
              placeholder="Confirmar contraseña"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              @keyup.enter="setupAdmin"
            />
            <p v-if="adminError" class="text-red-500 text-sm">{{ adminError }}</p>
            <button
              @click="setupAdmin"
              :disabled="loading"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-medium text-sm transition-colors"
            >
              {{ loading ? 'Guardando…' : 'Configurar' }}
            </button>
          </div>
        </template>

        <!-- Selección de tienda -->
        <template v-else-if="step === 'tienda'">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Selecciona tu tienda</h2>
          <div class="space-y-2">
            <button
              v-for="t in tiendas"
              :key="t.id"
              @click="selectTienda(t)"
              class="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <p class="font-medium text-gray-800">{{ t.nombre }}</p>
              <p v-if="t.direccion" class="text-xs text-gray-500 mt-0.5">{{ t.direccion }}</p>
            </button>
          </div>
        </template>

        <!-- Selección de cajero -->
        <template v-else-if="step === 'cajero'">
          <div class="flex items-center gap-2 mb-4">
            <button @click="tiendas.length > 1 ? step = 'tienda' : null" class="text-green-600 hover:text-green-800 text-lg">←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">¿Quién eres?</h2>
              <p class="text-xs text-gray-400">{{ tiendaSeleccionada?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-2">
            <button
              v-for="c in cajeros"
              :key="c.id"
              @click="selectCajero(c)"
              class="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors flex justify-between items-center"
            >
              <span class="font-medium text-gray-800">{{ c.nombre }}</span>
              <span v-if="c.tiene_pin" class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">🔒 PIN</span>
            </button>
          </div>
        </template>

        <!-- PIN -->
        <template v-else-if="step === 'pin'">
          <div class="flex items-center gap-2 mb-4">
            <button @click="step = 'cajero'" class="text-green-600 hover:text-green-800 text-lg">←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">Ingresa tu PIN</h2>
              <p class="text-xs text-gray-400">{{ cajeroSeleccionado?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-3">
            <input
              v-model="pinInput"
              type="password"
              inputmode="numeric"
              maxlength="6"
              placeholder="••••••"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-2xl tracking-[0.5em]"
              :class="{ 'border-red-400 ring-2 ring-red-200': pinError }"
              @keyup.enter="verificarPin"
            />
            <p v-if="pinError" class="text-red-500 text-sm text-center">{{ pinError }}</p>
            <button
              @click="verificarPin"
              :disabled="loading || !pinInput"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-medium text-sm transition-colors"
            >
              {{ loading ? 'Verificando…' : 'Continuar' }}
            </button>
          </div>
        </template>

        <!-- Fondo inicial -->
        <template v-else-if="step === 'fondo'">
          <div class="flex items-center gap-2 mb-4">
            <button
              @click="step = cajeroSeleccionado?.tiene_pin ? 'pin' : 'cajero'"
              class="text-green-600 hover:text-green-800 text-lg"
            >←</button>
            <div>
              <h2 class="text-lg font-semibold text-gray-800 leading-tight">Fondo inicial</h2>
              <p class="text-xs text-gray-400">{{ cajeroSeleccionado?.nombre }} · {{ tiendaSeleccionada?.nombre }}</p>
            </div>
          </div>
          <div class="space-y-3">
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input
                v-model.number="fondoInicial"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
                @keyup.enter="abrirTurno"
              />
            </div>
            <button
              @click="abrirTurno"
              :disabled="loading"
              class="w-full bg-green-700 text-white py-2.5 rounded-xl hover:bg-green-800 disabled:opacity-50 font-semibold text-sm transition-colors"
            >
              {{ loading ? 'Abriendo turno…' : '🚀 Abrir turno' }}
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

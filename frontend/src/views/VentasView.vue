<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import api from '../api'

const auth = useAuthStore()
const ui   = useUiStore()

// ── Datos ─────────────────────────────────────────────────────────────────────
const productos  = ref([])
const clientes   = ref([])
const categorias = ref([])
const cargando   = ref(true)

// ── Filtros catálogo ──────────────────────────────────────────────────────────
const busqueda        = ref('')
const categoriaActiva = ref('Todas')

// ── Carrito ───────────────────────────────────────────────────────────────────
const carrito = ref([])

// ── Cliente ───────────────────────────────────────────────────────────────────
const clienteId          = ref(1)
const busquedaCliente    = ref('')
const showClienteModal   = ref(false)

// ── Pago ──────────────────────────────────────────────────────────────────────
const showPagoModal    = ref(false)
const formaPago        = ref('Efectivo')
const efectivoRecibido = ref(0)
const procesando       = ref(false)

// ── Ticket ────────────────────────────────────────────────────────────────────
const showTicket  = ref(false)
const ultimaVenta = ref(null)

// ── Mobile: vista activa ──────────────────────────────────────────────────────
const vistaMovil = ref('catalogo') // 'catalogo' | 'carrito'

onMounted(async () => {
  await Promise.all([cargarProductos(), cargarClientes()])
  cargando.value = false
})

async function cargarProductos() {
  const { data } = await api.get('/productos')
  productos.value = data
  categorias.value = [...new Set(data.map(p => p.categoria))].sort()
}

async function cargarClientes() {
  const { data } = await api.get('/clientes')
  clientes.value = data
}

// ── Computed ──────────────────────────────────────────────────────────────────
const productosFiltrados = computed(() => {
  let list = productos.value.filter(p => stockDe(p) > 0)
  if (categoriaActiva.value !== 'Todas')
    list = list.filter(p => p.categoria === categoriaActiva.value)
  if (busqueda.value) {
    const q = busqueda.value.toLowerCase()
    list = list.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo_barras ?? '').includes(q) ||
      (p.marca ?? '').toLowerCase().includes(q),
    )
  }
  return list
})

const totalCarrito    = computed(() => carrito.value.reduce((s, i) => s + i.subtotal, 0))
const cantidadItems   = computed(() => carrito.value.reduce((s, i) => s + i.cantidad, 0))
const cambio          = computed(() => Math.max(0, efectivoRecibido.value - totalCarrito.value))
const clienteActual   = computed(() => clientes.value.find(c => c.id === clienteId.value))
const clientesFiltrados = computed(() => {
  if (!busquedaCliente.value) return clientes.value.slice(0, 30)
  const q = busquedaCliente.value.toLowerCase()
  return clientes.value.filter(c =>
    c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q),
  )
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt      = (n) => (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const stockDe  = (p) => p.lotes.reduce((s, l) => s + l.stock, 0)

// ── Catálogo ──────────────────────────────────────────────────────────────────
function agregarAlCarrito(producto) {
  const existente = carrito.value.find(i => i.producto_id === producto.id)
  const stock = stockDe(producto)
  if (existente) {
    if (existente.cantidad >= stock) { ui.warning(`Stock máximo: ${stock}`); return }
    existente.cantidad++
    existente.subtotal = existente.cantidad * existente.precio_unit
  } else {
    carrito.value.push({
      producto_id: producto.id,
      nombre_prod: producto.nombre,
      cantidad:    1,
      precio_unit: producto.precio,
      subtotal:    producto.precio,
    })
  }
  vistaMovil.value = 'carrito'
}

function onBusquedaEnter() {
  if (!busqueda.value) return
  const match = productosFiltrados.value.find(p => p.codigo_barras === busqueda.value)
  if (match) { agregarAlCarrito(match); busqueda.value = '' }
}

// ── Carrito ───────────────────────────────────────────────────────────────────
function cambiarCantidad(item, delta) {
  const prod  = productos.value.find(p => p.id === item.producto_id)
  const stock = prod ? stockDe(prod) : 9999
  const nueva = item.cantidad + delta
  if (nueva <= 0) { carrito.value = carrito.value.filter(i => i !== item); return }
  if (nueva > stock) { ui.warning(`Solo hay ${stock} en stock`); return }
  item.cantidad = nueva
  item.subtotal = nueva * item.precio_unit
}

function quitarItem(item) {
  carrito.value = carrito.value.filter(i => i !== item)
}

function limpiarCarrito() {
  carrito.value        = []
  clienteId.value      = 1
  formaPago.value      = 'Efectivo'
  efectivoRecibido.value = 0
  vistaMovil.value     = 'catalogo'
}

// ── Pago ──────────────────────────────────────────────────────────────────────
function abrirPago() {
  if (!carrito.value.length) { ui.warning('El carrito está vacío'); return }
  efectivoRecibido.value = Math.ceil(totalCarrito.value / 10) * 10
  showPagoModal.value = true
}

async function confirmarVenta() {
  procesando.value = true
  try {
    const { data } = await api.post('/ventas', {
      cliente_id: clienteId.value,
      tienda_id:  auth.tienda.id,
      cajero:     auth.nombreCajero,
      forma_pago: formaPago.value,
      total:      totalCarrito.value,
      notas:      '',
      items:      carrito.value,
    })

    ultimaVenta.value = {
      id:        data.venta_id,
      fecha:     new Date().toLocaleString('es-MX'),
      cajero:    auth.nombreCajero,
      tienda:    auth.nombreTienda,
      cliente:   clienteActual.value?.nombre || 'Público General',
      formaPago: formaPago.value,
      total:     totalCarrito.value,
      efectivo:  formaPago.value === 'Efectivo' ? efectivoRecibido.value : null,
      cambio:    formaPago.value === 'Efectivo' ? cambio.value : null,
      items:     [...carrito.value],
    }

    showPagoModal.value = false
    showTicket.value    = true
    limpiarCarrito()
    await cargarProductos()
    ui.success('Venta registrada')
  } catch (e) {
    ui.error(e.response?.data?.detail || 'Error al registrar la venta')
  } finally {
    procesando.value = false
  }
}
</script>

<template>
  <!-- Cargando -->
  <div v-if="cargando" class="flex items-center justify-center h-64 text-gray-400">
    Cargando productos…
  </div>

  <div v-else class="flex flex-col h-full">

    <!-- ── Tabs móvil ──────────────────────────────────────────────────────── -->
    <div class="md:hidden flex border-b border-gray-200 bg-white">
      <button
        v-for="tab in [{ id:'catalogo', label:'Catálogo', icon:'🗂️' }, { id:'carrito', label:`Carrito (${cantidadItems})`, icon:'🛒' }]"
        :key="tab.id"
        @click="vistaMovil = tab.id"
        class="flex-1 py-2.5 text-sm font-medium transition-colors"
        :class="vistaMovil === tab.id ? 'border-b-2 border-green-700 text-green-700' : 'text-gray-500'"
      >
        {{ tab.icon }} {{ tab.label }}
      </button>
    </div>

    <!-- ── Layout principal ────────────────────────────────────────────────── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- Catálogo -->
      <div
        class="flex flex-col flex-1 min-w-0 border-r border-gray-200"
        :class="vistaMovil === 'carrito' ? 'hidden md:flex' : 'flex'"
      >
        <!-- Búsqueda -->
        <div class="p-3 bg-white border-b border-gray-100">
          <input
            v-model="busqueda"
            type="text"
            placeholder="Buscar o escanear código de barras…"
            class="w-full px-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            @keydown.enter="onBusquedaEnter"
          />
        </div>

        <!-- Categorías -->
        <div class="flex gap-1.5 px-3 py-2 overflow-x-auto bg-white border-b border-gray-100 shrink-0">
          <button
            v-for="cat in ['Todas', ...categorias]"
            :key="cat"
            @click="categoriaActiva = cat"
            class="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
            :class="categoriaActiva === cat
              ? 'bg-green-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Grid de productos -->
        <div class="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 content-start">
          <button
            v-for="p in productosFiltrados"
            :key="p.id"
            @click="agregarAlCarrito(p)"
            class="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-green-400 hover:shadow-sm transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <div class="text-3xl mb-1.5 leading-none">{{ p.icono }}</div>
            <p class="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight mb-1">{{ p.nombre }}</p>
            <p v-if="p.marca && p.marca !== 'Genérico'" class="text-[10px] text-gray-400 truncate">{{ p.marca }}</p>
            <p class="text-sm font-bold text-green-700 mt-1.5">{{ fmt(p.precio) }}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">Stock: {{ stockDe(p) }}</p>
          </button>

          <div v-if="!productosFiltrados.length" class="col-span-full text-center text-gray-400 py-16">
            <p class="text-2xl mb-2">🔍</p>
            <p class="text-sm">Sin resultados</p>
          </div>
        </div>
      </div>

      <!-- Carrito -->
      <div
        class="flex flex-col bg-white w-full md:w-72 lg:w-80 shrink-0"
        :class="vistaMovil === 'catalogo' ? 'hidden md:flex' : 'flex'"
      >
        <!-- Cliente seleccionado -->
        <button
          @click="showClienteModal = true"
          class="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left w-full"
        >
          <span class="text-lg shrink-0">👤</span>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] text-gray-400 uppercase tracking-wide">Cliente</p>
            <p class="text-sm font-medium text-gray-800 truncate">
              {{ clienteActual?.nombre || 'Público General' }}
            </p>
          </div>
          <span class="text-gray-300 text-xs shrink-0">▼</span>
        </button>

        <!-- Items del carrito -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="!carrito.length" class="flex flex-col items-center justify-center h-40 text-gray-300 select-none">
            <span class="text-4xl mb-2">🛒</span>
            <p class="text-sm">Carrito vacío</p>
          </div>

          <div v-else class="divide-y divide-gray-50">
            <div
              v-for="item in carrito"
              :key="item.producto_id"
              class="flex items-center gap-2 px-3 py-2.5"
            >
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{{ item.nombre_prod }}</p>
                <p class="text-sm font-bold text-green-700 mt-0.5">{{ fmt(item.subtotal) }}</p>
                <p class="text-[10px] text-gray-400">{{ fmt(item.precio_unit) }} c/u</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  @click="cambiarCantidad(item, -1)"
                  class="w-7 h-7 rounded-full bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-base transition-colors"
                >−</button>
                <span class="w-7 text-center text-sm font-semibold">{{ item.cantidad }}</span>
                <button
                  @click="cambiarCantidad(item, 1)"
                  class="w-7 h-7 rounded-full bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700 flex items-center justify-center text-base transition-colors"
                >+</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer: total + cobrar -->
        <div class="border-t border-gray-200 p-3 space-y-2.5">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">{{ cantidadItems }} {{ cantidadItems === 1 ? 'producto' : 'productos' }}</span>
            <span class="text-2xl font-bold text-green-700">{{ fmt(totalCarrito) }}</span>
          </div>
          <div class="flex gap-2">
            <button
              v-if="carrito.length"
              @click="limpiarCarrito"
              class="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              title="Limpiar carrito"
            >🗑️</button>
            <button
              @click="abrirPago"
              :disabled="!carrito.length"
              class="flex-1 py-2.5 bg-green-700 text-white rounded-xl font-bold text-sm hover:bg-green-800 disabled:opacity-40 transition-colors"
            >
              Cobrar {{ carrito.length ? fmt(totalCarrito) : '' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Modal: Cliente ──────────────────────────────────────────────────────── -->
  <teleport to="body">
    <div v-if="showClienteModal" class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" @click.self="showClienteModal = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div class="flex items-center justify-between p-4 border-b shrink-0">
          <h3 class="font-semibold text-gray-800">Seleccionar cliente</h3>
          <button @click="showClienteModal = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div class="p-3 shrink-0">
          <input
            v-model="busquedaCliente"
            type="text"
            placeholder="Buscar por nombre o teléfono…"
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            autofocus
          />
        </div>
        <div class="overflow-y-auto flex-1 px-3 pb-3 space-y-0.5">
          <button
            v-for="c in clientesFiltrados"
            :key="c.id"
            @click="clienteId = c.id; showClienteModal = false; busquedaCliente = ''"
            class="w-full text-left px-3 py-2 rounded-xl hover:bg-green-50 transition-colors"
            :class="clienteId === c.id ? 'bg-green-50 ring-1 ring-green-400' : ''"
          >
            <p class="text-sm font-medium text-gray-800">{{ c.nombre }}</p>
            <p v-if="c.telefono" class="text-xs text-gray-400">{{ c.telefono }}</p>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Pago ─────────────────────────────────────────────────────── -->
    <div v-if="showPagoModal" class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" @click.self="showPagoModal = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div class="flex items-center justify-between p-4 border-b">
          <h3 class="font-semibold text-gray-800">Cobrar venta</h3>
          <button @click="showPagoModal = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div class="p-4 space-y-4">

          <!-- Total -->
          <div class="text-center py-2">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Total a cobrar</p>
            <p class="text-4xl font-bold text-green-700 mt-1">{{ fmt(totalCarrito) }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ clienteActual?.nombre || 'Público General' }}</p>
          </div>

          <!-- Forma de pago -->
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="fp in ['Efectivo', 'Tarjeta', 'Transferencia']"
              :key="fp"
              @click="formaPago = fp"
              class="py-3 rounded-xl text-xs font-semibold border-2 transition-colors flex flex-col items-center gap-1"
              :class="formaPago === fp
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'"
            >
              <span class="text-xl">{{ fp === 'Efectivo' ? '💵' : fp === 'Tarjeta' ? '💳' : '📲' }}</span>
              {{ fp }}
            </button>
          </div>

          <!-- Efectivo recibido -->
          <div v-if="formaPago === 'Efectivo'" class="space-y-3">
            <div>
              <label class="text-xs text-gray-500 font-medium uppercase tracking-wide">Efectivo recibido</label>
              <div class="relative mt-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input
                  v-model.number="efectivoRecibido"
                  type="number"
                  min="0"
                  step="1"
                  class="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-xl font-bold"
                />
              </div>
            </div>

            <!-- Accesos rápidos -->
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="n in [50, 100, 200, 500, 1000]"
                :key="n"
                @click="efectivoRecibido = n"
                class="px-3 py-1 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 font-medium transition-colors"
              >${{ n }}</button>
              <button
                @click="efectivoRecibido = Math.ceil(totalCarrito / 10) * 10"
                class="px-3 py-1 text-xs bg-green-100 rounded-lg hover:bg-green-200 text-green-700 font-medium transition-colors"
              >Exacto</button>
            </div>

            <!-- Cambio -->
            <div
              class="flex justify-between items-center px-4 py-3 rounded-xl font-semibold"
              :class="efectivoRecibido >= totalCarrito ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'"
            >
              <span class="text-sm">{{ efectivoRecibido >= totalCarrito ? 'Cambio' : 'Falta' }}</span>
              <span class="text-lg">
                {{ fmt(efectivoRecibido >= totalCarrito ? cambio : totalCarrito - efectivoRecibido) }}
              </span>
            </div>
          </div>

          <!-- Confirmar -->
          <button
            @click="confirmarVenta"
            :disabled="procesando || (formaPago === 'Efectivo' && efectivoRecibido < totalCarrito)"
            class="w-full bg-green-700 text-white py-3.5 rounded-xl font-bold text-base hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {{ procesando ? 'Procesando…' : '✓ Confirmar venta' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Ticket ──────────────────────────────────────────────────── -->
    <div v-if="showTicket && ultimaVenta" class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-xs max-h-[90vh] flex flex-col">
        <div class="p-4 text-center border-b shrink-0">
          <p class="text-3xl mb-1">✅</p>
          <h3 class="font-bold text-gray-800">Venta registrada</h3>
          <p class="text-xs text-gray-400 mt-0.5">Ticket #{{ ultimaVenta.id }}</p>
        </div>

        <div class="overflow-y-auto flex-1 p-4 font-mono text-xs space-y-1 text-gray-700">
          <p class="text-center font-bold text-sm">{{ ultimaVenta.tienda }}</p>
          <p class="text-center text-gray-500">{{ ultimaVenta.fecha }}</p>
          <p class="text-center text-gray-500">Cajero: {{ ultimaVenta.cajero }}</p>
          <p class="text-center text-gray-500">Cliente: {{ ultimaVenta.cliente }}</p>
          <div class="border-t border-dashed border-gray-300 my-2"></div>
          <div v-for="item in ultimaVenta.items" :key="item.producto_id" class="flex justify-between gap-2">
            <span class="truncate">{{ item.nombre_prod }} ×{{ item.cantidad }}</span>
            <span class="shrink-0">{{ fmt(item.subtotal) }}</span>
          </div>
          <div class="border-t border-dashed border-gray-300 my-2"></div>
          <div class="flex justify-between font-bold text-sm">
            <span>TOTAL</span><span>{{ fmt(ultimaVenta.total) }}</span>
          </div>
          <div class="flex justify-between text-gray-500">
            <span>Pago</span><span>{{ ultimaVenta.formaPago }}</span>
          </div>
          <template v-if="ultimaVenta.efectivo != null">
            <div class="flex justify-between text-gray-500">
              <span>Recibido</span><span>{{ fmt(ultimaVenta.efectivo) }}</span>
            </div>
            <div class="flex justify-between text-gray-500">
              <span>Cambio</span><span>{{ fmt(ultimaVenta.cambio) }}</span>
            </div>
          </template>
        </div>

        <div class="p-4 pt-0 shrink-0">
          <button
            @click="showTicket = false"
            class="w-full bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-800 transition-colors"
          >
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

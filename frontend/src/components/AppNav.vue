<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import api from '../api'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const ui     = useUiStore()

const navItems = [
  { path: '/ventas',       label: 'Ventas',       icon: '🛒' },
  { path: '/inventario',   label: 'Inventario',   icon: '📦' },
  { path: '/clientes',     label: 'Clientes',     icon: '👥' },
  { path: '/devoluciones', label: 'Devoluciones', icon: '↩️' },
  { path: '/reportes',     label: 'Reportes',     icon: '📊' },
  { path: '/admin',        label: 'Admin',        icon: '⚙️' },
]

const confirmClose = ref(false)

async function cerrarTurno() {
  if (!confirmClose.value) {
    confirmClose.value = true
    setTimeout(() => { confirmClose.value = false }, 3000)
    return
  }
  try {
    await api.post(`/turnos/cerrar/${auth.turno.id}`)
    auth.clearSession()
    router.push('/login')
  } catch {
    ui.error('Error al cerrar el turno')
    confirmClose.value = false
  }
}
</script>

<template>
  <header class="bg-green-700 text-white shadow-md">
    <div class="flex items-center justify-between px-4 h-13">

      <!-- Tienda + cajero -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xl shrink-0">🌿</span>
        <div class="min-w-0 hidden sm:block leading-tight">
          <p class="text-sm font-semibold truncate">{{ auth.nombreTienda }}</p>
          <p class="text-xs text-green-200 truncate">{{ auth.nombreCajero }}</p>
        </div>
      </div>

      <!-- Nav links — desktop -->
      <nav class="hidden md:flex items-center gap-0.5">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="route.path === item.path
            ? 'bg-green-600 text-white'
            : 'text-green-100 hover:bg-green-600/70'"
        >
          <span>{{ item.icon }}</span>
          <span class="hidden lg:inline">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- Cerrar turno -->
      <button
        @click="cerrarTurno"
        class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0"
        :class="confirmClose
          ? 'bg-red-500 text-white animate-pulse'
          : 'text-green-100 hover:bg-green-600/70'"
      >
        {{ confirmClose ? '¿Cerrar turno?' : '🚪 Salir' }}
      </button>
    </div>

    <!-- Nav links — mobile (bottom strip) -->
    <nav class="md:hidden border-t border-green-600 flex overflow-x-auto">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex flex-col items-center justify-center px-2 py-1.5 text-xs flex-1 min-w-[4rem] transition-colors"
        :class="route.path === item.path
          ? 'bg-green-600 text-white'
          : 'text-green-200 hover:bg-green-600/60'"
      >
        <span class="text-base">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </header>
</template>

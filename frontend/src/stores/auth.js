import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'pos_session'

export const useAuthStore = defineStore('auth', () => {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')

  const cajero = ref(saved?.cajero || null)
  const tienda = ref(saved?.tienda || null)
  const turno  = ref(saved?.turno  || null)

  const turnoActivo   = computed(() => !!turno.value)
  const nombreCajero  = computed(() => cajero.value?.nombre || '')
  const nombreTienda  = computed(() => tienda.value?.nombre || '')

  function setSession(cajeroData, tiendaData, turnoData) {
    cajero.value = cajeroData
    tienda.value = tiendaData
    turno.value  = turnoData
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cajero: cajeroData,
      tienda: tiendaData,
      turno:  turnoData,
    }))
  }

  function clearSession() {
    cajero.value = null
    tienda.value = null
    turno.value  = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return { cajero, tienda, turno, turnoActivo, nombreCajero, nombreTienda, setSession, clearSession }
})

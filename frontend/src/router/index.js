import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/',              redirect: '/ventas' },
  { path: '/login',         component: () => import('../views/LoginView.vue') },
  { path: '/ventas',        component: () => import('../views/VentasView.vue'),       meta: { requiresAuth: true } },
  { path: '/inventario',    component: () => import('../views/InventarioView.vue'),   meta: { requiresAuth: true } },
  { path: '/clientes',      component: () => import('../views/ClientesView.vue'),     meta: { requiresAuth: true } },
  { path: '/devoluciones',  component: () => import('../views/DevolucionesView.vue'), meta: { requiresAuth: true } },
  { path: '/reportes',      component: () => import('../views/ReportesView.vue'),     meta: { requiresAuth: true } },
  { path: '/admin',         component: () => import('../views/AdminView.vue'),        meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore()
    if (!auth.turnoActivo) return '/login'
  }
})

export default router

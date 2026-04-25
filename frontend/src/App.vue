<script setup>
import { useAuthStore } from './stores/auth'
import AppNav from './components/AppNav.vue'
import ToastList from './components/ToastList.vue'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <AppNav v-if="auth.turnoActivo" />
    <main class="flex-1 overflow-auto">
      <router-view />
    </main>
    <ToastList />
  </div>
</template>

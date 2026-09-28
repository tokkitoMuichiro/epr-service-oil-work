import { createRouter, createWebHistory } from 'vue-router'
import { ContractsPage } from '@/pages/contracts'
import { HomePage } from '@/pages/home'
import { PersonnelPage } from '@/pages/personnel'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/contracts', name: 'contracts', component: ContractsPage },
    { path: '/personnel', name: 'personnel', component: PersonnelPage },
  ],
})

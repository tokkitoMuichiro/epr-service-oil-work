import { createApp } from 'vue'
import App from './app/App.vue'
import { setupApp } from './app/providers'
import { captureEmbedTokenFromLocation } from '@/shared/lib/embed'
import './app/styles/index.css'

captureEmbedTokenFromLocation()

const app = createApp(App)
setupApp(app)
app.mount('#app')

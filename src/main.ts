import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initPreferences } from './stores/editor'

initPreferences()

createApp(App).mount('#app')

// Dev-only functional smoke test: open /?demo=1&selftest=1
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search)
  if (params.get('selftest') === '1') {
    void import('./dev/selftest').then((module) => {
      const start = () => {
        window.setTimeout(() => {
          void module.runSelfTest()
        }, 400)
      }
      if (document.readyState === 'complete') start()
      else window.addEventListener('load', start, { once: true })
    })
  }
}

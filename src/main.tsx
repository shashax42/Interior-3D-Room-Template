import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Handles for poking at the app from the browser console during development.
if (import.meta.env.DEV) {
  Promise.all([import('./store'), import('./geometry/cameraSolve'), import('./photo/handles')]).then(([store, solve, handles]) => {
    Object.assign(window, { __dev: { useStore: store.useStore, ...solve, ...handles } })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

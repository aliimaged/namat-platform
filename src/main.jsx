import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../shared/components/ErrorBoundary.jsx'
import './styles/index.css'
import PassportDashboard from './PassportDashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PassportDashboard />
    </ErrorBoundary>
  </StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ProjectProvider } from './context/ProjectContext'
import { AuthProvider } from './context/AuthContext'
import './styles.css'
import './polish.css'
import './shell.css'
import './auth.css'
import './mobile.css'
import './flat.css'
import './mobile-nav.css'
import './nav.css'
import './professional.css'
import './mobile-polish.css'
import './refine.css'
import './datepicker.css'
import './mobile-shell.css'
import './layout-fix.css'
import './designer-fix.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ProjectProvider>
        <App />
      </ProjectProvider>
    </AuthProvider>
  </React.StrictMode>
)

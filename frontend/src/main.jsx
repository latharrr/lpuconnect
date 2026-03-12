import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId="184945357599-gsm4f58m1t25gsqp22mh7stl6i6i6va9.apps.googleusercontent.com">
    <App />
  </GoogleOAuthProvider>
)

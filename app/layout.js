// app/layout.js
import './globals.css'
import { Ubuntu } from 'next/font/google'
import RegisterSW from '../components/RegisterSW'
import InstallPrompt from '../components/InstallPrompt'

// Carrega a fonte do Google
const ubuntu = Ubuntu({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Intento | Mentoria',
  description: 'Plataforma de mentoria Intento — vestibulares e ENEM',
  applicationName: 'Intento',
  appleWebApp: {
    capable: true,
    title: 'Intento',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/icons/icon-180.png',
  },
  manifest: '/manifest.webmanifest',
}

export const viewport = {
  themeColor: '#060242',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Splash screens iOS — só aparecem quando app está instalado (Add to Home Screen).
// Apple exige tamanho exato + media query por device.
const SPLASH_IOS = [
  { file: 'iphone-se',          dw: 375, dh: 667, dpr: 2 },
  { file: 'iphone-xr-11',       dw: 414, dh: 896, dpr: 2 },
  { file: 'iphone-x-xs-11pro',  dw: 375, dh: 812, dpr: 3 },
  { file: 'iphone-12-13-14',    dw: 390, dh: 844, dpr: 3 },
  { file: 'iphone-14-pro',      dw: 393, dh: 852, dpr: 3 },
  { file: 'iphone-xs-max-11pm', dw: 414, dh: 896, dpr: 3 },
  { file: 'iphone-12-13-14-pm', dw: 428, dh: 926, dpr: 3 },
  { file: 'iphone-14-15-pm',    dw: 430, dh: 932, dpr: 3 },
  { file: 'ipad',               dw: 768, dh: 1024, dpr: 2 },
  { file: 'ipad-air',           dw: 834, dh: 1112, dpr: 2 },
  { file: 'ipad-pro-12',        dw: 1024, dh: 1366, dpr: 2 },
]

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        {SPLASH_IOS.map(s => (
          <link
            key={s.file}
            rel="apple-touch-startup-image"
            href={`/splash/${s.file}.png`}
            media={`(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className={ubuntu.className}>
        <RegisterSW />
        <InstallPrompt />
        {children}
      </body>
    </html>
  )
}

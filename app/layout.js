// app/layout.js
import './globals.css'
import { Ubuntu } from 'next/font/google'

// Carrega a fonte do Google
const ubuntu = Ubuntu({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Intento | Mentoria',
  description: 'Painel do Aluno Intento',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      {/* A MÁGICA ACONTECE AQUI: Aplicamos a classe da fonte diretamente no Body */}
      <body className={ubuntu.className}>
        {children}
      </body>
    </html>
  )
}
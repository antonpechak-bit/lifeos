import type { Metadata, Viewport } from 'next'
import './globals.css'
import SwRegister from './sw-register'

export const metadata: Metadata = {
  title: 'Life OS — Диагностика',
  description: 'Human State Intelligence Platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Life OS',
  },
  icons: {
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#07090D',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  )
}

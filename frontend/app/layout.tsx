import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import { Providers } from './providers'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'

export const metadata = {
  title: 'DELOS Oracle - Brazilian Macro Data',
  description: 'Brazilian tokenized securities platform with on-chain macro oracle',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="bg-white shadow-sm border-b">
            <div className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-8">
                  <Link href="/" className="text-xl font-bold text-primary">
                    DELOS Oracle
                  </Link>
                  <div className="flex space-x-4">
                    <Link href="/" className="text-gray-600 hover:text-primary">
                      Dashboard
                    </Link>
                    <Link href="/issue" className="text-gray-600 hover:text-primary">
                      Issue Debenture
                    </Link>
                    <Link href="/portfolio" className="text-gray-600 hover:text-primary">
                      Portfolio
                    </Link>
                  </div>
                </div>
                <ConnectButton />
              </div>
            </div>
          </nav>
          <main className="min-h-screen">
            {children}
          </main>
          <footer className="bg-gray-100 border-t mt-auto">
            <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600">
              <p>DELOS - Brazilian Macro Oracle Platform</p>
              <p className="mt-1">Arbitrum Sepolia Testnet</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  )
}

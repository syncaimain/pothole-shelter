import type {ReactNode} from 'react'

export const metadata = {
  title: 'Pothole Adoption Agency',
  description: 'Real NYC 311 pothole complaints from Queens, waiting for their forever pavement.',
}

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

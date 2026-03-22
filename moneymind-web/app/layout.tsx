import './globals.css'

export const metadata = {
  title: 'MoneyMind - AI Smart Expense Tracker',
  description: 'Track your expenses and income with AI-powered insights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}

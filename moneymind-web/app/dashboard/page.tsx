export default function SimpleDashboard() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        MoneyMind Dashboard
      </h1>
      <p style={{ color: '#666' }}>AI Smart Expense Tracker</p>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginTop: '2rem' 
      }}>
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.5rem', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
        }}>
          <h3 style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
            Total Income
          </h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>
            ฿42,500
          </p>
        </div>
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.5rem', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
        }}>
          <h3 style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
            Total Expense
          </h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>
            ฿28,340
          </p>
        </div>
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.5rem', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
        }}>
          <h3 style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
            Net Savings
          </h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
            ฿14,160
          </p>
        </div>
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.5rem', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
        }}>
          <h3 style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
            Transactions
          </h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#666' }}>
            47
          </p>
        </div>
      </div>
    </div>
  )
}

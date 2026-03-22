'use client'

export default function SimpleDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">MoneyMind Dashboard</h1>
      <p className="text-gray-600">AI Smart Expense Tracker</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Income</h3>
          <p className="text-2xl font-bold text-green-600">฿42,500</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Expense</h3>
          <p className="text-2xl font-bold text-red-600">฿28,340</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Net Savings</h3>
          <p className="text-2xl font-bold text-blue-600">฿14,160</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Transactions</h3>
          <p className="text-2xl font-bold text-gray-600">47</p>
        </div>
      </div>
    </div>
  )
}

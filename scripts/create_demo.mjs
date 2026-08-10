// Create demo tenant with sample data for landing page demo
const BASE = 'http://localhost:3001/api'; // Run on server

async function main() {
  const res = await fetch(`${BASE}/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer DEMO_SETUP' },
    body: JSON.stringify({
      slug: 'demo',
      nama: 'Demo Jurnalku',
      email: 'admin@jurnal.cc.cd',
      plan: 'pro',
      max_siswa: 500,
      max_gtk: 50
    })
  });
  const data = await res.json();
  console.log('Tenant created:', data);
}

main().catch(console.error);

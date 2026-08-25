async function testEndpoints() {
  const base = 'http://localhost:5000/api/v1';
  const endpoints = [
    '/health',
    '/meta/filters',
    '/dashboard/summary?yearBE=2569',
    '/dashboard/detail?yearBE=2569&mode=SAP',
    '/dashboard/detail?yearBE=2569&mode=BI&dimension=area',
    '/dashboard/trend?yearBE=2569',
    '/dashboard/watchlist?yearBE=2569'
  ];

  console.log('Testing endpoints on port 5000...\n');
  for (const ep of endpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(base + ep);
      const data = await res.json();
      const elapsed = Date.now() - t0;
      console.log(`[PASS] ${ep} (${elapsed}ms) - status: ${res.status}`);
      if (ep.includes('/summary')) {
        console.log('   -> Revenue:', (data.data?.totalRevenue || 0).toLocaleString(), 'บาท | Target:', (data.data?.revenueTargetAmount || 0).toLocaleString(), 'บาท');
      }
      if (ep.includes('/detail')) {
        console.log('   -> Breakdown items:', data.data?.breakdown?.length, '| SourceSummary:', data.data?.sourceSummary?.length);
      }
      if (ep.includes('/trend')) {
        console.log('   -> Months loaded:', data.data?.length);
      }
      if (ep.includes('/watchlist')) {
        console.log('   -> Offices count:', data.data?.length);
      }
    } catch (err) {
      console.error(`[FAIL] ${ep} - error:`, err.message);
    }
  }
}
testEndpoints();

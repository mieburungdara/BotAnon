/**
 * test_server_logic.js
 * Simulates the new bot.js server logic to ensure Health Check and Webhook handler can coexist.
 */
const http = require('http');

const MOCK_WEBHOOK_PATH = '/telegraf/mock-token';
const IS_WEBHOOK = true;

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);

  // 1. Webhook Handler Simulation
  if (IS_WEBHOOK && req.url === MOCK_WEBHOOK_PATH) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: 'Webhook signal received' }));
  }

  // 2. Health Monitoring
  const headers = { 'Content-Type': 'application/json' };
  if (req.url === '/health' || req.url === '/health/live') {
    res.writeHead(200, headers);
    return res.end(JSON.stringify({ status: 'ok', uptime: 123, mode: 'webhook' }));
  }

  // 3. Not Found
  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: 'not_found' }));
});

const PORT = 3999;
server.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  
  // Test Health Check
  http.get(`http://localhost:${PORT}/health`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Health Check Response:', data);
      
      // Test Webhook Path
      http.get(`http://localhost:${PORT}${MOCK_WEBHOOK_PATH}`, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', () => {
          console.log('Webhook Path Response:', data2);
          process.exit(0);
        });
      });
    });
  });
});

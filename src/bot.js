         try {
           const dbCheck = await db.query('SELECT 1 as healthy');
           const dbHealthy = Array.isArray(dbCheck) && dbCheck.length > 0;
           if (dbHealthy) {
             res.writeHead(200, headers);
             return res.end(JSON.stringify({ status: 'ready', db: 'connected' }));
           }
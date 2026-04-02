const { db, initDB } = require('./src/database');

async function runTest() {
  console.log('--- STARTING DB SMOKE TEST ---');
  try {
    // 1. Initialize DB
    console.log('Initializing DB...');
    await initDB();
    console.log('DB Initialized.');

    // 2. Test simple query
    console.log('Testing simple query...');
    const users = await db.query('SELECT count(*) as count FROM users');
    console.log('User count:', users.rows[0].count);

    // 3. Test Transaction
    console.log('Testing transaction...');
    await db.transaction(async (tx) => {
      // FIX Bug #3 & #4: Use await and tx.query instead of db.query
      // Create a dummy user
      const tid = Date.now().toString();
      await tx.query('INSERT INTO users (telegram_id, username) VALUES ($1, $2)', [tid, 'testuser']);
      console.log('User inserted inside transaction.');
      
      const check = await tx.query('SELECT * FROM users WHERE telegram_id = $1', [tid]);
      if (check.rows.length === 0) throw new Error('Transaction failed to see its own insert!');
      console.log('Transaction verified insert.');
    });
    console.log('Transaction committed successfully.');

    console.log('--- TEST PASSED ---');
    process.exit(0);
  } catch (err) {
    console.error('--- TEST FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

runTest();

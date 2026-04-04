
const { db } = require('../src/database');
const logger = require('../src/utils/logger');

async function manageDatabase() {
  console.log('=== BotAnon Database Manager ===');
  try {
    // 1. Ambil data user
    const users = await db.query('SELECT id, telegram_id, username, first_name, state, report_count FROM users');
    console.log('--- Current Users Matrix ---');
    console.table(users.rows);

    // 2. Beri tahu user mana yang terdeteksi sebagai "test"
    const testUsers = users.rows.filter(u => 
      (u.username && u.username.toLowerCase().includes('test')) || 
      (u.first_name && u.first_name.toLowerCase().includes('test')) ||
      (u.telegram_id.toString().length < 5)
    );
    
    if (testUsers.length > 0) {
      console.log('--- Test Users Found ---');
      console.table(testUsers);
    } else {
      console.log('No specific test users found by name pattern.');
    }

    // Tanyakan konfirmasi atau langsung lakukan jika diperintah (di sini saya akan lakukan sesuai instruksi user)
    console.log('\n--- EXECUTING RESET PROTOCOL ---');

    // Hapus data yang tidak diperlukan
    await db.query('DELETE FROM messages');
    console.log('✅ Messages cleared');
    
    await db.query('DELETE FROM chats');
    console.log('✅ Chats cleared');
    
    await db.query('DELETE FROM reports');
    console.log('✅ Reports cleared');
    
    await db.query('DELETE FROM reputations');
    console.log('✅ Reputations cleared');
    
    await db.query('DELETE FROM matchmaking_queue');
    console.log('✅ Matchmaking queue cleared');
    
    await db.query('DELETE FROM sessions');
    console.log('✅ Sessions cleared (logged out all users)');

    // Hapus user test
    for (const u of testUsers) {
      await db.query('DELETE FROM users WHERE id = $1', [u.id]);
      console.log(`🗑️ Deleted test user: ${u.username || u.first_name} (${u.telegram_id})`);
    }

    // Reset status user yang tersisa
    await db.query("UPDATE users SET state = 'idle', report_count = 0");
    console.log('✅ All remaining users reset to IDLE with 0 reports');

    console.log('\n=== RESET COMPLETED SUCCESSFULLY ===');
    
  } catch (err) {
    console.error('❌ Error during database management:', err);
  } finally {
    process.exit(0);
  }
}

manageDatabase();

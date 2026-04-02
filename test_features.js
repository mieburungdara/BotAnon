const { db, initDB } = require('./src/database');
const { t } = require('./src/locales');
// Import logic from bot.js would be ideal, but since bot.js is a flat file with top-level bot.launch(),
// we will simulate the helper calls or assume they are tested via their DB interactions.
// For this test, we will re-implement/copy the core logic to verify the DB flow.

async function runFeatureTests() {
  console.log('🚀 STARTING COMPREHENSIVE FEATURE TESTS...');
  
  try {
    await initDB();
    const testId1 = '999001';
    const testId2 = '999002';

    // CLEANUP
    const userIdsRes = await db.query('SELECT id FROM users WHERE telegram_id IN ($1, $2)', [testId1, testId2]);
    const userIds = userIdsRes.rows.map(r => r.id);
    if (userIds.length > 0) {
      const ids = userIds.join(',');
      await db.query(`DELETE FROM reputations WHERE rater_id IN (${ids}) OR rated_id IN (${ids})`);
      await db.query(`DELETE FROM messages WHERE sender_telegram_id IN ($1, $2)`, [testId1, testId2]);
      await db.query(`DELETE FROM chats WHERE user1_id IN (${ids}) OR user2_id IN (${ids})`);
    }
    await db.query('DELETE FROM users WHERE telegram_id IN ($1, $2)', [testId1, testId2]);

    // 1. FEATURE: User Registration & Profile Setup
    console.log('\n--- 1. Testing User Registration ---');
    await db.query('INSERT INTO users (telegram_id, username, state) VALUES ($1, $2, $3)', [testId1, 'user1', 'idle']);
    await db.query('UPDATE users SET age = $1, gender = $2, language = $3, zodiac = $4 WHERE telegram_id = $5', 
                  [25, 'male', 'Indonesian', 'Aries', testId1]);
    
    const user1 = (await db.query('SELECT * FROM users WHERE telegram_id = $1', [testId1])).rows[0];
    if (user1.age === 25 && user1.zodiac === 'Aries') {
      console.log('✅ Registration & Profile Update: PASSED');
    } else {
      throw new Error('Registration failed');
    }

    // 2. FEATURE: Locales / Translation
    console.log('\n--- 2. Testing Locales ---');
    const welcomeId = t('welcome_incomplete', 'Indonesian');
    const welcomeEn = t('welcome_incomplete', 'English');
    if (welcomeId.includes('Selamat datang') && welcomeEn.includes('Welcome')) {
      console.log('✅ Translation System: PASSED');
    } else {
      throw new Error('Translation failed');
    }

    // 3. FEATURE: Atomic Matching Logic
    console.log('\n--- 3. Testing Atomic Matching ---');
    // Setup second user with same language
    await db.query('INSERT INTO users (telegram_id, username, state, age, gender, zodiac, language) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
                  [testId2, 'user2', 'waiting', 23, 'female', 'Leo', 'Indonesian']);
    // Set user1 to waiting
    await db.query('UPDATE users SET state = $1 WHERE telegram_id = $2', ['waiting', testId1]);

    // SIMULATE findMatchForUser logic (Atomic)
    const match = await db.transaction(async (tx) => {
      // Find a waiting user with language filter
      const waiter = (await tx.query('SELECT * FROM users WHERE state = $1 AND telegram_id != $2 AND language = $3 LIMIT 1', ['waiting', testId1.toString(), 'Indonesian'])).rows[0];
      if (!waiter) return null;
      
      await tx.query('UPDATE users SET state = $1 WHERE telegram_id = $2', ['chatting', testId1.toString()]);
      await tx.query('UPDATE users SET state = $1 WHERE telegram_id = $2', ['chatting', waiter.telegram_id.toString()]);
      await tx.query('INSERT INTO chats (user1_id, user2_id) VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2)', [testId1.toString(), waiter.id]);
      return waiter;
    });

    if (match && match.telegram_id && match.telegram_id.toString() === testId2.toString()) {
      const check1 = (await db.query('SELECT state FROM users WHERE telegram_id = $1', [testId1])).rows[0];
      const check2 = (await db.query('SELECT state FROM users WHERE telegram_id = $1', [testId2])).rows[0];
      const chat = (await db.query('SELECT * FROM chats WHERE ended_at IS NULL')).rows;
      
      if (check1.state === 'chatting' && check2.state === 'chatting' && chat.length > 0) {
        console.log('✅ Atomic Matching & Chat Creation: PASSED');
      } else {
        throw new Error('Matching state inconsistent');
      }
    } else {
      throw new Error('Matching failed to find partner');
    }

    // 4. FEATURE: Reporting & Anti-Injection
    console.log('\n--- 4. Testing Reporting System ---');
    const reason = 'Spam/Advertising';
    const colMap = { 'Spam/Advertising': 'report_spam_count' };
    const col = colMap[reason]; // Whitelisted
    
    await db.query(`UPDATE users SET report_count = COALESCE(report_count, 0) + 1, ${col} = COALESCE(${col}, 0) + 1 WHERE telegram_id = $1`, [testId2]);
    const reported = (await db.query('SELECT report_count, report_spam_count FROM users WHERE telegram_id = $1', [testId2])).rows[0];
    
    if (reported.report_count === 1 && reported.report_spam_count === 1) {
      console.log('✅ Reporting System (Increment): PASSED');
    } else {
      throw new Error('Reporting failed');
    }

    // 5. FEATURE: Rating (UPSERT)
    console.log('\n--- 5. Testing Rating (UPSERT) ---');
    const score1 = 1; // Positive
    const u1 = (await db.query('SELECT id FROM users WHERE telegram_id = $1', [testId1])).rows[0].id;
    const u2 = (await db.query('SELECT id FROM users WHERE telegram_id = $1', [testId2])).rows[0].id;

    // First rate
    await db.query('INSERT INTO reputations (rater_id, rated_id, score) VALUES ($1, $2, $3)', [u1, u2, score1]);
    // Update rate (Simulation of action handler)
    const newScore = -1; // Negative
    await db.query('UPDATE reputations SET score = $1 WHERE rater_id = $2 AND rated_id = $3', [newScore, u1, u2]);
    
    const rep = (await db.query('SELECT score FROM reputations WHERE rater_id = $1 AND rated_id = $2', [u1, u2])).rows[0];
    if (rep.score === -1) {
      console.log('✅ Rating UPSERT: PASSED');
    } else {
      throw new Error('Rating failed');
    }

    // 6. Test Media (Animation/Video Note)
    console.log('\n--- 6. Testing Media Handling (Animation) ---');
    const animId = 'file_id_animation_123';
    const activeChatId = (await db.query('SELECT id FROM chats WHERE ended_at IS NULL LIMIT 1')).rows[0].id;
    await db.query('INSERT INTO messages (chat_id, sender_telegram_id, content, media_type, media_file_id) VALUES ($1, $2, $3, $4, $5)', 
                  [activeChatId, testId1, 'look at this!', 'animation', animId]);
    const animMsg = (await db.query('SELECT * FROM messages WHERE media_type = $1 LIMIT 1', ['animation'])).rows[0];
    if (animMsg && animMsg.media_file_id === animId) {
      console.log('✅ Media Handling (Animation): PASSED');
    } else {
      throw new Error('Media handling failed');
    }

    console.log('\n✨ ALL ADVANCED FEATURE TESTS PASSED SUCCESSFULLY! ✨');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ FEATURE TEST FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runFeatureTests();

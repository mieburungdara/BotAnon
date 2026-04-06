       // ✅ Fetch full details for the initiator WITH LOCK to prevent concurrent match attempts
       const uRes = await tx.query('SELECT * FROM users WHERE telegram_id = ? FOR UPDATE', [tid]);
       const user = uRes[0];
       if (!user) return null;

       const targetLang = userLang || user.language || 'English';

       // ✅ Fetch full details for the partner in queue
       const qQuery = 'SELECT * FROM users WHERE state = ? AND language = ? AND id != ? ORDER BY waiting_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED';
       const qRes = await tx.query(qQuery, ['waiting', targetLang, user.id]);
       const waitingUser = qRes[0];

       if (waitingUser) {
         // We found a match! Directly update both users to 'chatting' and clear waiting_at
         const newChat = await transitionToChatting(user.telegram_id, waitingUser.telegram_id, tx);
         return { user, waitingUser, chat: newChat };
       }
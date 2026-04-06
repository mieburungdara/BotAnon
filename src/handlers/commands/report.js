     const historyCheck = await db.query('SELECT sender_telegram_id FROM messages WHERE chat_id = ? AND sender_telegram_id != ? LIMIT 1', [lastChat.id, tid.toString()]);
     if (historyCheck.length > 0) {
       const oldPartner = await getUserByTelegramId(historyCheck[0].sender_telegram_id);
       pId = oldPartner ? oldPartner.id : null;
     }
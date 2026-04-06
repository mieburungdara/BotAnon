/**
 * State Machine Engine — Centralized, atomic state transitions for users and chats.
 */
const { query, queryOne, transaction } = require('../database');
const logger = require('../utils/logger');
const { updateUserState } = require('./userService');
const { getActiveChatByTelegramId, getPartnerTelegramId, endChat } = require('./chatService');

/**
 * Transitions a user to IDLE.
 * If they are in a chat, it securely ends the chat and transitions the partner to IDLE as well.
 */
async function transitionToIdle(telegramId) {
    return transaction(async (tx) => {
        const chat = await getActiveChatByTelegramId(telegramId, tx);
        let partnerTid = null;
        if (chat) {
            partnerTid = getPartnerTelegramId(chat, telegramId);
            await endChat(chat.id, tx);
            if (partnerTid) await updateUserState(partnerTid, 'idle', tx);
        }
        await updateUserState(telegramId, 'idle', tx);
        return { chat, partnerTid };
    });
}

/**
 * Transitions a user to WAITING (the queue).
 * If they are in a chat, it ends it, and moves the partner to IDLE.
 */
async function transitionToWaiting(telegramId) {
    return transaction(async (tx) => {
        const chat = await getActiveChatByTelegramId(telegramId, tx);
        let partnerTid = null;
        if (chat) {
            partnerTid = getPartnerTelegramId(chat, telegramId);
            await endChat(chat.id, tx);
            if (partnerTid) await updateUserState(partnerTid, 'idle', tx);
        }
        await updateUserState(telegramId, 'waiting', tx);
        return { chat, partnerTid };
    });
}

/**
 * Specifically for 403 Forbidden errors (Bot Blocked).
 * Transitions the blocked user to IDLE, and the innocent user back to WAITING.
 */
async function transitionOnBlock(innocentTid, blockedTid) {
    return transaction(async (tx) => {
        const chat = await getActiveChatByTelegramId(innocentTid, tx);
        if (chat) await endChat(chat.id, tx);
        
        await updateUserState(blockedTid, 'idle', tx);
        await updateUserState(innocentTid, 'waiting', tx);
        
        return { chat };
    });
}

/**
 * Transitions two users into a CHAT.
 * MUST be run within an existing transaction to prevent locks.
 */
async function transitionToChatting(tid1, tid2, tx) {
    await updateUserState(tid1, 'chatting', tx);
    await updateUserState(tid2, 'chatting', tx);
    
    // ✅ FIX Bug #C: For MySQL, we need to get the inserted ID differently
    // Since we're in a transaction, we can use the MySQL-specific approach
    const info = await tx.query(
        'INSERT INTO chats (user1_telegram_id, user2_telegram_id) VALUES (?, ?)', 
        [tid1.toString(), tid2.toString()]
    );
    
    if (info.affectedRows === 0) {
        throw new Error(`Failed to create chat record between ${tid1} and ${tid2}`);
    }
    
    // Get the inserted chat record
    const res = await tx.query('SELECT * FROM chats WHERE id = ?', [info.insertId]);
    return res[0];
}

module.exports = {
    transitionToIdle,
    transitionToWaiting,
    transitionOnBlock,
    transitionToChatting
};
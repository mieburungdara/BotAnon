/**
 * Report Service — report-related database operations and evidence extraction.
 */
const { query } = require('../database');
const logger = require('../utils/logger');

async function createReport(reporterId, reportedId, reason, details) {
  try {
    const info = await query('INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES (?, ?, ?, ?)', [reporterId, reportedId, reason, details]);
    
    if (info.affectedRows > 0) {
      const res = await query('SELECT * FROM reports WHERE id = ?', [info.insertId]);
      return res[0];
    }
    return undefined;
  } catch (err) {
    logger.error(err, 'Error in createReport');
    return undefined;
  }
}

async function incrementReportCount(reportedId, reason) {
  const colMap = { 'Spam/Advertising': 'report_spam_count', 'Harassment/Abuse': 'report_harassment_count', 'Inappropriate Content': 'report_inappropriate_count', 'Other': 'report_other_count' };
  const col = colMap[reason] || 'report_other_count';
  
  const validColumns = ['report_spam_count', 'report_harassment_count', 'report_inappropriate_count', 'report_other_count'];
  if (!validColumns.includes(col)) {
    logger.error({ col }, 'Invalid column name for report increment');
    return undefined;
  }
  
  try {
    const info = await query(`UPDATE users SET report_count = COALESCE(report_count, 0) + 1, ${col} = COALESCE(${col}, 0) + 1 WHERE id = ?`, [reportedId]);
    
    if (info.affectedRows > 0) {
      const res = await query('SELECT * FROM users WHERE id = ?', [reportedId]);
      return res[0];
    }
    return undefined;
  } catch (err) {
    logger.error(err, 'Error incrementing report count');
    return undefined;
  }
}

function extractEvidenceFromReply(replyToMessage) {
  let ev = '';
  if (replyToMessage) {
    const rm = replyToMessage;
    let type = 'text', fid = '', content = rm.text || rm.caption || '';
    if (rm.photo && rm.photo.length > 0) { type = 'photo'; fid = rm.photo[rm.photo.length - 1].file_id; }
    else if (rm.video && rm.video.file_id) { type = 'video'; fid = rm.video.file_id; }
    else if (rm.animation && rm.animation.file_id) { type = 'animation'; fid = rm.animation.file_id; }
    else if (rm.document && rm.document.file_id) { type = 'document'; fid = rm.document.file_id; }
    else if (rm.voice && rm.voice.file_id) { type = 'voice'; fid = rm.voice.file_id; }
    else if (rm.audio && rm.audio.file_id) { type = 'audio'; fid = rm.audio.file_id; }
    else if (rm.sticker && rm.sticker.file_id) { type = 'sticker'; fid = rm.sticker.file_id; }
    else if (rm.video_note && rm.video_note.file_id) { type = 'video_note'; fid = rm.video_note.file_id; }
    else if (rm.location) { type = 'location'; }
    else if (rm.contact) { type = 'contact'; }
    ev = `[EVIDENCE] Type: ${type}${fid ? ' | FID: '+fid : ''}${content ? ' | Content: '+content : ''}`;
    // FIX Bug #89: Don't return evidence string if there's no actual content
    if (type === 'text' && !fid && !content) ev = '';
  }
  return ev;
}

function extractEvidenceFromMessage(msg) {
  let ev = "";
  if (msg.photo && msg.photo.length > 0) ev = `[MEDIA_PHOTO] file_id: ${msg.photo[msg.photo.length-1].file_id}${msg.caption ? ' | Caption: ' + msg.caption : ''}`;
  else if (msg.video && msg.video.file_id) ev = `[MEDIA_VIDEO] file_id: ${msg.video.file_id}${msg.caption ? ' | Caption: ' + msg.caption : ''}`;
  else if (msg.animation && msg.animation.file_id) ev = `[MEDIA_ANIMATION] file_id: ${msg.animation.file_id}${msg.caption ? ' | Caption: ' + msg.caption : ''}`;
  else if (msg.voice && msg.voice.file_id) ev = `[MEDIA_VOICE] file_id: ${msg.voice.file_id}`;
  else if (msg.document && msg.document.file_id) ev = `[MEDIA_DOC] file_id: ${msg.document.file_id}`;
  else if (msg.audio && msg.audio.file_id) ev = `[MEDIA_AUDIO] file_id: ${msg.audio.file_id}`;
  else if (msg.sticker && msg.sticker.file_id) ev = `[MEDIA_STICKER] file_id: ${msg.sticker.file_id}`;
  else if (msg.video_note && msg.video_note.file_id) ev = `[MEDIA_VIDEO_NOTE] file_id: ${msg.video_note.file_id}`;
  else if (msg.location) ev = `[MEDIA_LOCATION] lat: ${msg.location.latitude}, lon: ${msg.location.longitude}`;
  else if (msg.contact) ev = `[MEDIA_CONTACT] name: ${msg.contact.first_name}, phone: ${msg.contact.phone_number}`;
  else if (msg.text) ev = msg.text;
  else if (msg.caption) ev = msg.caption;
  return ev;
}

module.exports = {
  createReport,
  incrementReportCount,
  extractEvidenceFromReply,
  extractEvidenceFromMessage,
};
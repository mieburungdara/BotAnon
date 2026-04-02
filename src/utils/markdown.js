/**
 * Escape MarkdownV2 special characters to prevent Telegram parse errors.
 * MarkdownV2 requires escaping ALL of: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param {string} text - The text to escape
 * @returns {string} Escaped text safe for Telegram MarkdownV2 parse mode
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

module.exports = { escapeMarkdown };

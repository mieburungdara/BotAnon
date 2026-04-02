/**
 * Escape Markdown special characters to prevent parse errors.
 * Only escapes characters that are actually special in Telegram MarkdownV1.
 * @param {string} text - The text to escape
 * @returns {string} Escaped text safe for Telegram Markdown parse mode
 */
function escapeMarkdown(text) {
  return text ? text.replace(/([_*\[\]()~`>#+\-=|{}\\])/g, '\\$1') : text;
}

module.exports = { escapeMarkdown };

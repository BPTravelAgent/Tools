/**
 * ═════════════════════════════════════════════════════════════════════════
 * BP TRAVEL TOOLS — AUTH SECURITY & PASSWORD HASHING ENGINE (v1.0)
 * Cryptographic SHA-256 Hashing with Username Salting & Backward Compatibility
 * ═════════════════════════════════════════════════════════════════════════
 */

(function (window) {
  'use strict';

  const SALT_PREFIX = 'slw_salt_v1_';

  /**
   * Hashes a password using SHA-256 with per-user salt.
   * Output format: "sha256:<64-char-hex-digest>"
   * @param {string} password - Raw input password
   * @param {string} username - Target username for salting
   * @returns {Promise<string>}
   */
  async function slwHashPassword(password, username) {
    if (!password) return '';
    const u = (username || '').toLowerCase().trim();
    const saltedString = `${SALT_PREFIX}${u}_${password}`;

    const cryptoObj = (window.crypto && window.crypto.subtle) ? window.crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (cryptoObj && cryptoObj.subtle) {
      const msgBuffer = new TextEncoder().encode(saltedString);
      const hashBuffer = await cryptoObj.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return 'sha256:' + hex;
    }

    throw new Error('Web Cryptography API is required for secure authentication.');
  }

  /**
   * Verifies an input password against a stored credential.
   * Supports both SHA-256 hashes and backward-compatible legacy plaintext passwords.
   * @param {string} inputPassword - User-entered password from form
   * @param {string} storedCredential - Stored password string from DB
   * @param {string} username - Target username
   * @returns {Promise<boolean>}
   */
  async function slwVerifyPassword(inputPassword, storedCredential, username) {
    if (!inputPassword || !storedCredential) return false;

    // Check if stored in secure SHA-256 format
    if (storedCredential.startsWith('sha256:')) {
      const computedHash = await slwHashPassword(inputPassword, username);
      return computedHash === storedCredential;
    }

    // Backward-compatible fallback for legacy plain text passwords
    return inputPassword === storedCredential;
  }

  // Export globally
  window.slwHashPassword = slwHashPassword;
  window.slwVerifyPassword = slwVerifyPassword;
})(typeof window !== 'undefined' ? window : globalThis);

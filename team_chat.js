/**
 * ═════════════════════════════════════════════════════════════════════════
 * BP TRAVEL TOOLS — TEAM REAL-TIME CHAT & COLLABORATION ENGINE (v2.0)
 * Modern Enterprise WhatsApp-Style Real-Time Team Messenger
 * ═════════════════════════════════════════════════════════════════════════
 * Features:
 *  - Real-time Firestore Messaging & Live Sync
 *  - Clear for Me & Clear for Everyone (WhatsApp-style dual clearing)
 *  - Swipe / Click-to-Reply with Quote Previews & Jump-to-Message
 *  - Voice Notes (Microphone recording, WebM audio, waveform player, 1x/1.5x/2x speed)
 *  - WhatsApp Double Blue Checkmarks (Sent, Delivered, Read receipts)
 *  - WhatsApp Emoji Picker Panel (categorized tabs) & Message Quick Reactions
 *  - Live In-Chat Search with instant term highlighting
 *  - Real-time Typing Indicator ("... is typing")
 *  - Copy message text & Fullscreen Lightbox Image Viewer
 *  - Smart Canvas Image Compression (5MB -> ~40KB WebP)
 *  - Direct Clipboard Paste (Ctrl+V screenshots) & Drag-and-drop
 *  - Web Audio Chime & Chrome Desktop Notifications (with taskbar alert)
 */

(function () {
  'use strict';

  function initChatWhenReady() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
      setTimeout(initChatWhenReady, 300);
      return;
    }
    setupBPChat();
  }

  function setupBPChat() {
    const db = firebase.firestore();

    // Sound configuration
    let soundEnabled = localStorage.getItem('bp_chat_sound') !== 'false';

    // State Variables
    let isChatOpen = false;
    let unreadCount = 0;
    let currentDraftImageBase64 = null;
    let currentReplyTo = null; // { id, senderName, text, isImage, isVoice }
    let lastSeenTimestamp = parseInt(localStorage.getItem('bp_chat_last_seen') || '0', 10);
    let messagesCache = [];
    let peerPresence = {}; // { [userId]: { lastSeenMillis: number, isOnline: boolean } }
    let currentSearchQuery = '';

    // Voice Recording State
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingInterval = null;
    let recordingSeconds = 0;
    let isRecordingAudio = false;

    // Typing State
    let typingBroadcastTimeout = null;
    let lastTypingBroadcast = 0;

    // Helper: Current User Info
    function getCurrentUser() {
      const userKey = sessionStorage.getItem('slw_user_v3') || localStorage.getItem('slw_user_v3');
      if (!userKey) return null;

      let displayName = userKey.charAt(0).toUpperCase() + userKey.slice(1);
      if (window.USERS && window.USERS[userKey] && window.USERS[userKey].name) {
        displayName = window.USERS[userKey].name;
      }

      let isBuddhikaAdmin = (userKey === 'admin');
      if (isBuddhikaAdmin) {
        displayName = 'Buddhika Prabod';
      }

      let avatarUrl = null;
      if (window.USERS && window.USERS[userKey] && window.USERS[userKey].avatar) {
        avatarUrl = window.USERS[userKey].avatar;
      } else if (localStorage.getItem('slw_avatar_' + userKey)) {
        avatarUrl = localStorage.getItem('slw_avatar_' + userKey);
      } else if (isBuddhikaAdmin) {
        avatarUrl = 'Dp/Image.png';
      }

      return {
        id: userKey,
        name: displayName,
        isAdmin: isBuddhikaAdmin,
        avatar: avatarUrl
      };
    }

    // ── Build DOM Elements ──
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'bp-chat-trigger';
    triggerBtn.title = 'Open BP Team Chat';
    triggerBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      <span class="bp-chat-badge" style="display:none;">0</span>
    `;

    const chatWindow = document.createElement('div');
    chatWindow.className = 'bp-chat-window hidden';
    chatWindow.innerHTML = `
      <!-- Search Overlay -->
      <div class="bp-chat-search-wrap hidden" id="bpSearchWrap">
        <input type="text" class="bp-search-input" id="bpSearchInput" placeholder="Search in chat..." autocomplete="off">
        <span class="bp-search-count" id="bpSearchCount"></span>
        <button type="button" class="bp-chat-btn-icon" id="bpBtnCloseSearch" title="Close Search">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Header -->
      <div class="bp-chat-header">
        <div class="bp-chat-header-info">
          <div class="bp-chat-avatar-ring" id="bpChatHeaderAvatar">
            <img src="Dp/Image.png" alt="BP" onerror="this.outerHTML='<span>BP</span>'">
          </div>
          <div class="bp-chat-title-wrap">
            <span class="bp-chat-title">BP Team Messenger</span>
            <span class="bp-chat-status" id="bpChatHeaderStatus">
              <span class="bp-chat-online-dot"></span> Live Team Room
            </span>
          </div>
        </div>
        <div class="bp-chat-header-actions">
          <button class="bp-chat-btn-icon" id="bpBtnSearchToggle" title="Search messages">
            <i class="fas fa-search"></i>
          </button>
          <button class="bp-chat-btn-icon ${soundEnabled ? '' : 'muted'}" id="bpBtnMuteSound" title="Toggle Sound">
            <i class="fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}"></i>
          </button>
          <button class="bp-chat-btn-icon" id="bpBtnClearChat" title="Clear Chat Options">
            <i class="fas fa-broom"></i>
          </button>
          <button class="bp-chat-btn-icon" id="bpBtnCloseChat" title="Close Chat">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Notification Permission Banner -->
      <div class="bp-chat-notif-banner hidden" id="bpNotifBanner">
        <div class="bp-notif-banner-content">
          <i class="fas fa-bell"></i>
          <span>Enable Chrome desktop alerts to get notified when minimized</span>
        </div>
        <div class="bp-notif-banner-actions">
          <button type="button" class="bp-notif-banner-btn" id="bpBtnEnableNotif">Enable</button>
          <button type="button" class="bp-notif-banner-close" id="bpBtnDismissNotif" title="Dismiss">&times;</button>
        </div>
      </div>

      <!-- Drag & Drop Overlay -->
      <div class="bp-chat-drop-overlay" id="bpDropOverlay">
        <i class="fas fa-cloud-arrow-up" style="font-size:32px;"></i>
        <span>Drop Image to Share with Team</span>
      </div>

      <!-- Clear Chat Modal -->
      <div class="bp-chat-clear-modal hidden" id="bpClearModal">
        <div class="bp-clear-card">
          <div class="bp-clear-header">
            <i class="fas fa-broom" style="color:#f59e0b; font-size:22px;"></i>
            <h3>Clear Chat Options</h3>
          </div>
          <p>Select how you want to clear your team messenger history:</p>
          <div class="bp-clear-actions">
            <button class="bp-clear-btn bp-clear-me" id="bpBtnClearForMe">
              <div class="bp-clear-btn-title"><i class="fas fa-user-slash"></i> Clear for Me</div>
              <div class="bp-clear-btn-desc">Clears messages only on your screen. Team members keep their chat.</div>
            </button>
            <button class="bp-clear-btn bp-clear-all" id="bpBtnClearForEveryone">
              <div class="bp-clear-btn-title"><i class="fas fa-trash-can"></i> Delete for Everyone</div>
              <div class="bp-clear-btn-desc">Permanently deletes message history from Firebase for all users.</div>
            </button>
          </div>
          <button class="bp-clear-cancel" id="bpBtnCancelClear">Cancel</button>
        </div>
      </div>

      <!-- Messages Feed -->
      <div class="bp-chat-messages" id="bpChatMessages">
        <div style="text-align:center; padding:30px; color:#94a3b8; font-size:12px;">
          <i class="fas fa-spinner fa-spin" style="font-size:20px; margin-bottom:8px;"></i><br>
          Connecting to Real-time Team Hub...
        </div>
      </div>

      <!-- WhatsApp Emoji Picker Panel -->
      <div class="bp-emoji-picker-panel hidden" id="bpEmojiPanel">
        <div class="bp-emoji-tabs">
          <button type="button" class="bp-emoji-tab active" data-cat="smileys">😊</button>
          <button type="button" class="bp-emoji-tab" data-cat="hands">👍</button>
          <button type="button" class="bp-emoji-tab" data-cat="travel">✈️</button>
          <button type="button" class="bp-emoji-tab" data-cat="hearts">❤️</button>
        </div>
        <div class="bp-emoji-grid" id="bpEmojiGrid"></div>
      </div>

      <!-- Input Area -->
      <div class="bp-chat-input-area">
        <!-- Reply / Quote Banner Preview -->
        <div class="bp-chat-reply-preview hidden" id="bpReplyPreview">
          <div class="bp-reply-preview-left">
            <span class="bp-reply-preview-title" id="bpReplySender">Replying to User</span>
            <span class="bp-reply-preview-text" id="bpReplyText">Snippet</span>
          </div>
          <button type="button" class="bp-reply-preview-close" id="bpBtnCancelReply" title="Cancel Reply">&times;</button>
        </div>

        <!-- Draft Image Attachment Preview -->
        <div class="bp-chat-draft-preview hidden" id="bpDraftPreview">
          <img class="bp-chat-draft-thumb" id="bpDraftThumb" src="" alt="Draft Image">
          <div class="bp-chat-draft-info">
            <strong>Image Attached</strong><br>
            <span id="bpDraftSize">Compressed & Ready</span>
          </div>
          <button type="button" class="bp-chat-draft-remove" id="bpBtnRemoveDraft" title="Remove Image">&times;</button>
        </div>

        <!-- Input Row -->
        <div class="bp-chat-input-row" id="bpInputRow">
          <!-- Text Input Mode -->
          <button type="button" class="bp-chat-action-btn" id="bpBtnToggleEmoji" title="Insert Emoji">
            <i class="far fa-face-smile"></i>
          </button>

          <input type="file" id="bpFileInput" accept="image/*" style="display:none;">
          <button type="button" class="bp-chat-action-btn" id="bpBtnPickFile" title="Attach Image or Screenshot">
            <i class="fas fa-paperclip"></i>
          </button>

          <textarea class="bp-chat-textarea" id="bpChatInput" placeholder="Type a message or paste screenshot..." rows="1"></textarea>

          <!-- Voice Recording Bar (hidden until mic is clicked) -->
          <div class="bp-chat-recording-bar hidden" id="bpRecordingBar">
            <div class="bp-rec-status">
              <span class="bp-rec-dot"></span>
              <span id="bpRecTimer">00:00</span>
            </div>
            <div class="bp-rec-actions">
              <button type="button" class="bp-rec-btn-cancel" id="bpBtnCancelVoice" title="Cancel Recording">
                <i class="fas fa-trash"></i>
              </button>
              <button type="button" class="bp-rec-btn-send" id="bpBtnSendVoice" title="Send Voice Message">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>

          <!-- Send Button (switches to Mic button when text is empty) -->
          <button type="button" class="bp-chat-btn-send" id="bpBtnSendMsg" title="Send (Enter)">
            <i class="fas fa-paper-plane"></i>
          </button>
          <button type="button" class="bp-chat-btn-mic" id="bpBtnVoiceRecord" title="Record Voice Message">
            <i class="fas fa-microphone"></i>
          </button>
        </div>

        <div class="bp-chat-footer-tip">
          <span>Tip: Paste screenshot with <b>Ctrl + V</b></span>
          <span id="bpCharCount"></span>
        </div>
      </div>
    `;

    // Lightbox Image Viewer Modal
    const lightbox = document.createElement('div');
    lightbox.className = 'bp-chat-lightbox hidden';
    lightbox.innerHTML = `
      <img id="bpLightboxImg" src="" alt="Fullscreen Image">
      <div class="bp-chat-lightbox-actions">
        <a id="bpLightboxDownload" class="bp-lightbox-btn" download="bp_team_image.png" href="">
          <i class="fas fa-download"></i> Download Image
        </a>
        <button class="bp-lightbox-btn" id="bpLightboxClose">
          <i class="fas fa-times"></i> Close
        </button>
      </div>
    `;

    document.body.appendChild(triggerBtn);
    document.body.appendChild(chatWindow);
    document.body.appendChild(lightbox);

    // Elements references
    const badgeEl = triggerBtn.querySelector('.bp-chat-badge');
    const messagesEl = document.getElementById('bpChatMessages');
    const inputEl = document.getElementById('bpChatInput');
    const sendBtn = document.getElementById('bpBtnSendMsg');
    const voiceBtn = document.getElementById('bpBtnVoiceRecord');
    const fileInput = document.getElementById('bpFileInput');
    const pickFileBtn = document.getElementById('bpBtnPickFile');
    const draftPreview = document.getElementById('bpDraftPreview');
    const draftThumb = document.getElementById('bpDraftThumb');
    const removeDraftBtn = document.getElementById('bpBtnRemoveDraft');
    const muteBtn = document.getElementById('bpBtnMuteSound');
    const clearBtn = document.getElementById('bpBtnClearChat');
    const closeBtn = document.getElementById('bpBtnCloseChat');
    const dropOverlay = document.getElementById('bpDropOverlay');
    const notifBanner = document.getElementById('bpNotifBanner');
    const enableNotifBtn = document.getElementById('bpBtnEnableNotif');
    const dismissNotifBtn = document.getElementById('bpBtnDismissNotif');

    // WhatsApp Reply Elements
    const replyPreview = document.getElementById('bpReplyPreview');
    const replySender = document.getElementById('bpReplySender');
    const replyText = document.getElementById('bpReplyText');
    const cancelReplyBtn = document.getElementById('bpBtnCancelReply');

    // Voice Note Elements
    const recordingBar = document.getElementById('bpRecordingBar');
    const recTimer = document.getElementById('bpRecTimer');
    const cancelVoiceBtn = document.getElementById('bpBtnCancelVoice');
    const sendVoiceBtn = document.getElementById('bpBtnSendVoice');

    // Clear Modal Elements
    const clearModal = document.getElementById('bpClearModal');
    const btnClearForMe = document.getElementById('bpBtnClearForMe');
    const btnClearForEveryone = document.getElementById('bpBtnClearForEveryone');
    const btnCancelClear = document.getElementById('bpBtnCancelClear');

    // Search Elements
    const searchWrap = document.getElementById('bpSearchWrap');
    const searchInput = document.getElementById('bpSearchInput');
    const searchCount = document.getElementById('bpSearchCount');
    const searchToggleBtn = document.getElementById('bpBtnSearchToggle');
    const closeSearchBtn = document.getElementById('bpBtnCloseSearch');

    // Emoji Picker Elements
    const emojiPanel = document.getElementById('bpEmojiPanel');
    const emojiToggleBtn = document.getElementById('bpBtnToggleEmoji');
    const emojiGrid = document.getElementById('bpEmojiGrid');
    const emojiTabs = emojiPanel.querySelectorAll('.bp-emoji-tab');

    // ── Emoji Categories Map ──
    const EMOJI_CATEGORIES = {
      smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '🤫', '🤔', '🤐', '🤗', '🥳', '😎', '🤓', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '🥱', '😴', '🤤'],
      hands: ['👍', '👎', '👏', '🙌', '👐', '🤝', '✌️', '🤞', '👊', '✊', '🤛', '🤜', '🤚', '👋', '✍️', '🙏', '💪', '👈', '👉', '👆', '👇', '👌', '🤌', '🤏', '🤙'],
      travel: ['✈️', '🛫', '🛬', '🛩️', '🏝️', '🏖️', '🏨', '🏰', '🗺️', '🚗', '🚕', '🚌', '🚆', '🚢', '🛥️', '☀️', '🌴', '💼', '📁', '📊', '📈', '📋', '📞', '📱', '⏰', '📅', '🎫', '🛂'],
      hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💖', '💗', '💓', '💞', '💕', '✨', '⭐', '🌟', '💥', '🔥', '🚀', '🎉', '🎊', '🏆', '💯', '☕']
    };

    function renderEmojiGrid(cat = 'smileys') {
      emojiGrid.innerHTML = '';
      const list = EMOJI_CATEGORIES[cat] || EMOJI_CATEGORIES.smileys;
      list.forEach(emoji => {
        const item = document.createElement('div');
        item.className = 'bp-emoji-item';
        item.textContent = emoji;
        item.onclick = () => insertEmoji(emoji);
        emojiGrid.appendChild(item);
      });
    }

    function insertEmoji(emoji) {
      const start = inputEl.selectionStart || 0;
      const end = inputEl.selectionEnd || 0;
      const val = inputEl.value;
      inputEl.value = val.substring(0, start) + emoji + val.substring(end);
      inputEl.selectionStart = inputEl.selectionEnd = start + emoji.length;
      inputEl.focus();
      updateInputMode();
    }

    emojiTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        emojiTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderEmojiGrid(tab.getAttribute('data-cat'));
      });
    });

    emojiToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = emojiPanel.classList.contains('hidden');
      if (isHidden) {
        renderEmojiGrid('smileys');
        emojiPanel.classList.remove('hidden');
        emojiToggleBtn.classList.add('active');
      } else {
        emojiPanel.classList.add('hidden');
        emojiToggleBtn.classList.remove('active');
      }
    });

    document.addEventListener('click', (e) => {
      if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn && !emojiToggleBtn.contains(e.target)) {
        emojiPanel.classList.add('hidden');
        emojiToggleBtn.classList.remove('active');
      }
    });

    // ── Input Mode Toggle (Send vs Mic) ──
    function updateInputMode() {
      const hasText = inputEl.value.trim().length > 0;
      const hasImage = currentDraftImageBase64 !== null;

      if (hasText || hasImage) {
        sendBtn.style.display = 'flex';
        voiceBtn.style.display = 'none';
      } else {
        sendBtn.style.display = 'none';
        voiceBtn.style.display = 'flex';
      }
    }
    updateInputMode();

    // ── Tab Title Blinker ──
    let originalDocTitle = document.title;
    let titleBlinkInterval = null;

    function startTitleBlink(senderName) {
      if (titleBlinkInterval) return;
      let toggle = false;
      titleBlinkInterval = setInterval(() => {
        document.title = toggle ? `(1) 💬 ${senderName} sent a message!` : originalDocTitle;
        toggle = !toggle;
      }, 1000);
    }

    function stopTitleBlink() {
      if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
        document.title = originalDocTitle;
      }
    }

    window.addEventListener('focus', stopTitleBlink);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) stopTitleBlink();
    });

    // ── Dual Sound Engine (WAV Audio + Web Audio API) ──
    function generateChimeWavUrl() {
      const sampleRate = 22050;
      const duration = 0.38;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);

      function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      }

      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + numSamples * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, numSamples * 2, true);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const freq = t < 0.12 ? 659.25 : 880.0;
        const env = Math.max(0, 1 - t / duration);
        const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.32;
        view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      }

      const blob = new Blob([buffer], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    }

    let chimeAudio = null;
    try {
      chimeAudio = new Audio(generateChimeWavUrl());
    } catch (e) {}

    let sharedAudioCtx = null;
    function unlockAudio() {
      if (chimeAudio) {
        try { chimeAudio.load(); } catch (e) {}
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
          if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
        }
      } catch (e) {}
    }

    ['click', 'keydown', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, unlockAudio, { passive: true, once: true });
    });

    function playChime() {
      if (!soundEnabled) return;
      if (chimeAudio) {
        chimeAudio.currentTime = 0;
        const p = chimeAudio.play();
        if (p !== undefined) {
          p.catch(() => playWebAudioFallback());
          return;
        }
      }
      playWebAudioFallback();
    }

    function playWebAudioFallback() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = sharedAudioCtx || new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880.0, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      } catch (e) {}
    }

    // ── Chrome Desktop System Notifications ──
    function triggerDesktopNotification(senderName, messageText, avatarUrl) {
      startTitleBlink(senderName);

      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const title = `${senderName} • BP Team`;
      const options = {
        body: messageText || 'Sent a new message',
        icon: avatarUrl || 'Dp/Image.png',
        badge: 'Dp/Image.png',
        tag: 'bp-team-chat-' + Date.now(),
        renotify: true,
        requireInteraction: false
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          if (reg && reg.showNotification) {
            reg.showNotification(title, options).catch(() => {
              showNativeNotification(title, options);
            });
          } else {
            showNativeNotification(title, options);
          }
        }).catch(() => showNativeNotification(title, options));
      } else {
        showNativeNotification(title, options);
      }
    }

    function showNativeNotification(title, options) {
      try {
        const notif = new Notification(title, options);
        notif.onclick = function () {
          window.focus();
          if (!isChatOpen) toggleChat();
          this.close();
        };
      } catch (err) {
        console.warn('Native notification failed:', err);
      }
    }

    async function requestNotificationPermission(showWelcomeTest = true) {
      if (!('Notification' in window)) return;
      try {
        const permission = await Notification.requestPermission();
        updateNotificationBanner();
        if (permission === 'granted' && showWelcomeTest) {
          triggerDesktopNotification('BP Travel Tools', '✅ Chrome desktop alerts are active! You will be notified even when minimized.');
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }

    function updateNotificationBanner() {
      if (!notifBanner) return;
      if (!('Notification' in window)) {
        notifBanner.classList.add('hidden');
        return;
      }
      if (Notification.permission === 'default' && localStorage.getItem('bp_notif_banner_dismissed') !== 'true') {
        notifBanner.classList.remove('hidden');
      } else {
        notifBanner.classList.add('hidden');
      }
    }

    if (enableNotifBtn) {
      enableNotifBtn.addEventListener('click', () => requestNotificationPermission(true));
    }
    if (dismissNotifBtn) {
      dismissNotifBtn.addEventListener('click', () => {
        localStorage.setItem('bp_notif_banner_dismissed', 'true');
        updateNotificationBanner();
      });
    }

    // ── Smart Client-Side Image Compressor (5MB -> 40KB WebP) ──
    async function compressImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round((width * MAX_HEIGHT) / height);
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            let dataUrl = canvas.toDataURL('image/webp', 0.75);
            if (!dataUrl.startsWith('data:image/webp')) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            }
            resolve(dataUrl);
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function handleSelectedImage(file) {
      if (!file || !file.type.startsWith('image/')) return;
      try {
        draftThumb.src = '';
        draftPreview.classList.remove('hidden');
        document.getElementById('bpDraftSize').textContent = 'Optimizing image...';

        const compressed = await compressImageFile(file);
        currentDraftImageBase64 = compressed;
        draftThumb.src = compressed;

        const sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
        document.getElementById('bpDraftSize').textContent = `Optimized: ~${sizeKb} KB`;
        updateInputMode();
        inputEl.focus();
      } catch (err) {
        console.error('Image compression failed:', err);
        alert('Could not process image.');
        clearDraftImage();
      }
    }

    function clearDraftImage() {
      currentDraftImageBase64 = null;
      draftThumb.src = '';
      draftPreview.classList.add('hidden');
      fileInput.value = '';
      updateInputMode();
    }

    removeDraftBtn.addEventListener('click', clearDraftImage);

    // ── Direct Clipboard Paste (Ctrl+V Screenshots) ──
    window.addEventListener('paste', (e) => {
      if (!isChatOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleSelectedImage(blob);
            e.preventDefault();
            break;
          }
        }
      }
    });

    // ── Drag and Drop onto Chat Window ──
    ['dragenter', 'dragover'].forEach((evName) => {
      chatWindow.addEventListener(evName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach((evName) => {
      chatWindow.addEventListener(evName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.remove('active');
      });
    });

    chatWindow.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleSelectedImage(files[0]);
      }
    });

    pickFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSelectedImage(e.target.files[0]);
      }
    });

    // ── WhatsApp Reply Handlers ──
    window.bpReplyToMessage = function (msgId) {
      const doc = messagesCache.find(d => d.id === msgId);
      if (!doc) return;
      const data = doc.data();

      let snippet = data.text || '';
      if (!snippet && data.image) snippet = '📷 Photo';
      if (!snippet && data.audio) snippet = '🎤 Voice Note';

      currentReplyTo = {
        id: msgId,
        senderName: data.senderName || 'User',
        text: snippet.substring(0, 100),
        isImage: !!data.image,
        isVoice: !!data.audio
      };

      replySender.textContent = `Replying to ${currentReplyTo.senderName}`;
      replyText.textContent = currentReplyTo.text;
      replyPreview.classList.remove('hidden');
      inputEl.focus();
    };

    function clearReply() {
      currentReplyTo = null;
      replyPreview.classList.add('hidden');
    }

    cancelReplyBtn.addEventListener('click', clearReply);

    window.bpScrollToMessage = function (targetMsgId) {
      const targetRow = document.getElementById('msg-row-' + targetMsgId);
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRow.classList.add('highlighted');
        setTimeout(() => targetRow.classList.remove('highlighted'), 1800);
      }
    };

    // ── WhatsApp Voice Note Recorder Engine ──
    async function startVoiceRecording() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Audio recording is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }

        mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(250);
        isRecordingAudio = true;
        recordingSeconds = 0;

        // Show recording UI
        inputEl.style.display = 'none';
        pickFileBtn.style.display = 'none';
        emojiToggleBtn.style.display = 'none';
        sendBtn.style.display = 'none';
        voiceBtn.style.display = 'none';
        recordingBar.classList.remove('hidden');

        recTimer.textContent = '00:00';
        recordingInterval = setInterval(() => {
          recordingSeconds++;
          const m = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
          const s = String(recordingSeconds % 60).padStart(2, '0');
          recTimer.textContent = `${m}:${s}`;
          if (recordingSeconds >= 60) finishAndSendVoiceRecording();
        }, 1000);
      } catch (err) {
        console.error('Microphone access denied:', err);
        alert('Could not access microphone: ' + err.message + '\nPlease enable microphone permissions in Chrome.');
      }
    }

    function cancelVoiceRecording() {
      if (!isRecordingAudio) return;
      clearInterval(recordingInterval);
      isRecordingAudio = false;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      resetRecordingUI();
    }

    function finishAndSendVoiceRecording() {
      if (!isRecordingAudio || !mediaRecorder) return;
      clearInterval(recordingInterval);
      isRecordingAudio = false;

      const duration = Math.max(1, recordingSeconds);

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          resetRecordingUI();

          const reader = new FileReader();
          reader.onload = async () => {
            const base64Audio = reader.result;
            await sendVoiceMessage(base64Audio, duration);
          };
          reader.readAsDataURL(audioBlob);
        } catch (e) {
          console.error('Audio processing error:', e);
          resetRecordingUI();
        }
      };

      mediaRecorder.stop();
    }

    function resetRecordingUI() {
      recordingBar.classList.add('hidden');
      inputEl.style.display = 'block';
      pickFileBtn.style.display = 'flex';
      emojiToggleBtn.style.display = 'flex';
      updateInputMode();
      inputEl.focus();
    }

    voiceBtn.addEventListener('click', startVoiceRecording);
    cancelVoiceBtn.addEventListener('click', cancelVoiceRecording);
    sendVoiceBtn.addEventListener('click', finishAndSendVoiceRecording);

    // ── Send Voice Message ──
    async function sendVoiceMessage(base64Audio, duration) {
      const user = getCurrentUser();
      if (!user) return;

      try {
        const newMsg = {
          text: '',
          image: null,
          audio: base64Audio,
          audioDuration: duration,
          replyTo: currentReplyTo,
          senderId: user.id,
          senderName: user.name,
          senderAvatar: user.avatar || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          createdMillis: Date.now(),
          reactions: {}
        };

        await db.collection('bp_team_chat').add(newMsg);
        clearReply();
        playChime();
      } catch (err) {
        console.error('Error sending voice message:', err);
        alert('Failed to send voice note: ' + err.message);
      }
    }

    // ── Send Standard Message ──
    async function sendMessage() {
      const user = getCurrentUser();
      if (!user) {
        alert('Please log in to participate in team chat.');
        return;
      }

      const text = inputEl.value.trim();
      const imagePayload = currentDraftImageBase64;
      const replyPayload = currentReplyTo;

      if (!text && !imagePayload) return;

      sendBtn.disabled = true;

      try {
        const newMsg = {
          text: text,
          image: imagePayload || null,
          audio: null,
          audioDuration: null,
          replyTo: replyPayload,
          senderId: user.id,
          senderName: user.name,
          senderAvatar: user.avatar || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          createdMillis: Date.now(),
          reactions: {}
        };

        await db.collection('bp_team_chat').add(newMsg);

        // Reset input & reply
        inputEl.value = '';
        inputEl.style.height = 'auto';
        clearDraftImage();
        clearReply();
        updateInputMode();

        // Broadcast stop typing
        broadcastTyping(false);
      } catch (err) {
        console.error('Error sending message:', err);
        alert('Failed to send message: ' + err.message);
      } finally {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-grow textarea & update send/mic button
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(90, inputEl.scrollHeight) + 'px';
      updateInputMode();
      broadcastTyping(true);
    });

    // ── Live Typing Indicator Engine ──
    function broadcastTyping(isTyping) {
      const user = getCurrentUser();
      if (!user) return;

      const now = Date.now();
      if (isTyping) {
        if (now - lastTypingBroadcast > 2000) {
          lastTypingBroadcast = now;
          db.collection('bp_chat_presence').doc('typing_' + user.id).set({
            userId: user.id,
            userName: user.name,
            timestamp: now
          }, { merge: true }).catch(() => {});
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          broadcastTyping(false);
        }, 3000);
      } else {
        clearTimeout(typingTimeout);
        db.collection('bp_chat_presence').doc('typing_' + user.id).delete().catch(() => {});
      }
    }

    // Listen for peer typing
    db.collection('bp_chat_presence').onSnapshot(snapshot => {
      const currentUserId = getCurrentUser()?.id;
      let activeTyper = null;
      const cutoff = Date.now() - 4000;

      snapshot.forEach(doc => {
        if (doc.id.startsWith('typing_')) {
          const data = doc.data();
          if (data.userId !== currentUserId && data.timestamp > cutoff) {
            activeTyper = data.userName;
          }
        } else {
          // General presence for read receipts
          peerPresence[doc.id] = doc.data();
        }
      });

      const statusEl = document.getElementById('bpChatHeaderStatus');
      if (statusEl) {
        if (activeTyper) {
          statusEl.innerHTML = `<span class="bp-chat-typing-indicator"><span class="bp-typing-dots"><span></span><span></span><span></span></span> ${escapeHtml(activeTyper)} is typing...</span>`;
        } else {
          statusEl.innerHTML = `<span class="bp-chat-online-dot"></span> Live Team Room`;
        }
      }
    }, () => {});

    // ── Emoji Reaction Handler ──
    window.bpReactMessage = async function (msgId, emoji) {
      const user = getCurrentUser();
      if (!user) return;

      try {
        const msgRef = db.collection('bp_team_chat').doc(msgId);
        const doc = await msgRef.get();
        if (!doc.exists) return;

        const data = doc.data();
        const reactions = data.reactions || {};
        const currentUsers = reactions[emoji] || [];

        const userIdx = currentUsers.indexOf(user.id);
        if (userIdx > -1) {
          currentUsers.splice(userIdx, 1);
          if (currentUsers.length === 0) {
            delete reactions[emoji];
          } else {
            reactions[emoji] = currentUsers;
          }
        } else {
          currentUsers.push(user.id);
          reactions[emoji] = currentUsers;
        }

        await msgRef.update({ reactions });
      } catch (err) {
        console.error('Reaction update error:', err);
      }
    };

    // ── Delete Message Options (Delete for Me vs Delete for Everyone) ──
    window.bpDeleteMessageOptions = function (msgId) {
      const user = getCurrentUser();
      if (!user) return;

      const doc = messagesCache.find(d => d.id === msgId);
      if (!doc) return;
      const data = doc.data();
      const isMine = data.senderId === user.id;

      let promptMsg = 'Delete Message:\n\n';
      promptMsg += '1: Delete for Me (Hides from your screen)\n';
      if (isMine || user.isAdmin) {
        promptMsg += '2: Delete for Everyone (Removes from Cloud)\n';
      }
      promptMsg += '\nEnter 1 or 2 (or Cancel):';

      const choice = prompt(promptMsg, '1');
      if (choice === '1') {
        const deletedKey = 'bp_chat_deleted_msgs_' + user.id;
        const currentList = JSON.parse(localStorage.getItem(deletedKey) || '[]');
        currentList.push(msgId);
        localStorage.setItem(deletedKey, JSON.stringify(currentList));
        renderMessages(messagesCache);
      } else if (choice === '2' && (isMine || user.isAdmin)) {
        db.collection('bp_team_chat').doc(msgId).delete().catch(e => alert(e.message));
      }
    };

    // ── Copy Message Text ──
    window.bpCopyMessage = function (text) {
      navigator.clipboard.writeText(text).then(() => {
        const tip = document.createElement('div');
        tip.style = 'position:fixed; bottom:120px; right:40px; background:#1e293b; color:white; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:700; z-index:999999; box-shadow:0 6px 20px rgba(0,0,0,0.3); animation:bpFadeIn 0.2s ease;';
        tip.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i> Message copied!';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 1800);
      });
    };

    // ── Voice Note Audio Player Controller ──
    let activeAudioObj = null;
    let activeVoiceId = null;
    let playbackSpeed = 1.0;

    window.bpToggleVoicePlay = function (msgId, audioSrc) {
      const playBtn = document.getElementById('voice-btn-' + msgId);
      const timeLabel = document.getElementById('voice-time-' + msgId);
      const waveform = document.getElementById('voice-wave-' + msgId);

      if (activeVoiceId === msgId && activeAudioObj) {
        if (!activeAudioObj.paused) {
          activeAudioObj.pause();
          if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
          return;
        } else {
          activeAudioObj.play();
          if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
          return;
        }
      }

      // Stop previous
      if (activeAudioObj) {
        activeAudioObj.pause();
        const prevBtn = document.getElementById('voice-btn-' + activeVoiceId);
        if (prevBtn) prevBtn.innerHTML = '<i class="fas fa-play"></i>';
      }

      activeVoiceId = msgId;
      activeAudioObj = new Audio(audioSrc);
      activeAudioObj.playbackRate = playbackSpeed;

      if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';

      activeAudioObj.ontimeupdate = () => {
        if (!activeAudioObj.duration) return;
        const cur = activeAudioObj.currentTime;
        const dur = activeAudioObj.duration;
        const m = Math.floor(cur / 60);
        const s = String(Math.floor(cur % 60)).padStart(2, '0');
        if (timeLabel) timeLabel.textContent = `${m}:${s}`;

        // Update waveform bars
        if (waveform) {
          const bars = waveform.querySelectorAll('.bp-wave-bar');
          const progressRatio = cur / dur;
          const playedCount = Math.floor(progressRatio * bars.length);
          bars.forEach((bar, idx) => {
            if (idx <= playedCount) {
              bar.classList.add('played');
            } else {
              bar.classList.remove('played');
            }
          });
        }
      };

      activeAudioObj.onended = () => {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (waveform) {
          waveform.querySelectorAll('.bp-wave-bar').forEach(b => b.classList.remove('played'));
        }
      };

      activeAudioObj.play().catch(console.error);
    };

    window.bpChangeVoiceSpeed = function (msgId) {
      if (playbackSpeed === 1.0) playbackSpeed = 1.5;
      else if (playbackSpeed === 1.5) playbackSpeed = 2.0;
      else playbackSpeed = 1.0;

      const badge = document.getElementById('voice-speed-' + msgId);
      if (badge) badge.textContent = playbackSpeed + 'x';

      if (activeAudioObj && activeVoiceId === msgId) {
        activeAudioObj.playbackRate = playbackSpeed;
      }
    };

    // ── Lightbox Image Viewer ──
    window.bpOpenLightbox = function (imgUrl) {
      document.getElementById('bpLightboxImg').src = imgUrl;
      const downloadA = document.getElementById('bpLightboxDownload');
      downloadA.href = imgUrl;
      downloadA.download = `BP_Chat_${Date.now()}.png`;
      lightbox.classList.remove('hidden');
    };

    document.getElementById('bpLightboxClose').addEventListener('click', () => {
      lightbox.classList.add('hidden');
    });

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.add('hidden');
    });

    // ── Clear Chat Modal Controls ──
    clearBtn.addEventListener('click', () => {
      clearModal.classList.remove('hidden');
    });

    btnCancelClear.addEventListener('click', () => {
      clearModal.classList.add('hidden');
    });

    // Option 1: Clear for Me
    btnClearForMe.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) return;

      localStorage.setItem('bp_chat_cleared_before_' + user.id, Date.now().toString());
      clearModal.classList.add('hidden');
      renderMessages(messagesCache);
    });

    // Option 2: Delete for Everyone (Firestore Chunk Clear)
    btnClearForEveryone.addEventListener('click', async () => {
      if (!confirm('Are you absolutely sure you want to permanently delete all messages for the entire team? This cannot be undone.')) return;

      btnClearForEveryone.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting for Everyone...';
      try {
        const snap = await db.collection('bp_team_chat').get();
        if (snap.empty) {
          alert('Chat history is already empty.');
          clearModal.classList.add('hidden');
          return;
        }

        const docs = snap.docs;
        const CHUNK_SIZE = 450;
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          const chunk = docs.slice(i, i + CHUNK_SIZE);
          const batch = db.batch();
          chunk.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }

        clearModal.classList.add('hidden');
        alert(`Chat history cleared successfully (${docs.length} messages permanently deleted).`);
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      } finally {
        btnClearForEveryone.innerHTML = '<div class="bp-clear-btn-title"><i class="fas fa-trash-can"></i> Delete for Everyone</div><div class="bp-clear-btn-desc">Permanently deletes message history from Firebase for all users.</div>';
      }
    });

    window.bpRestoreLocalHistory = function () {
      const user = getCurrentUser();
      if (!user) return;
      localStorage.removeItem('bp_chat_cleared_before_' + user.id);
      renderMessages(messagesCache);
    };

    // ── Search in Chat Controls ──
    searchToggleBtn.addEventListener('click', () => {
      searchWrap.classList.toggle('hidden');
      if (!searchWrap.classList.contains('hidden')) {
        searchInput.focus();
      } else {
        currentSearchQuery = '';
        renderMessages(messagesCache);
      }
    });

    closeSearchBtn.addEventListener('click', () => {
      searchWrap.classList.add('hidden');
      currentSearchQuery = '';
      renderMessages(messagesCache);
    });

    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      renderMessages(messagesCache);
    });

    // ── Render Messages Feed (with WhatsApp Polish) ──
    function renderMessages(docs) {
      const currentUser = getCurrentUser();
      const currentUserId = currentUser ? currentUser.id : null;
      const isAdmin = currentUser && currentUser.isAdmin;

      const clearedBefore = parseInt(localStorage.getItem('bp_chat_cleared_before_' + (currentUserId || 'default')) || '0', 10);
      const locallyDeletedList = JSON.parse(localStorage.getItem('bp_chat_deleted_msgs_' + (currentUserId || 'default')) || '[]');

      // Filter locally cleared or deleted messages
      const visibleDocs = docs.filter(doc => {
        if (locallyDeletedList.includes(doc.id)) return false;
        const d = doc.data();
        const created = d.createdMillis || (d.timestamp ? d.timestamp.toMillis() : 0);
        return created >= clearedBefore;
      });

      // Search match filtering & counting
      let matchCount = 0;
      if (currentSearchQuery) {
        visibleDocs.forEach(doc => {
          const d = doc.data();
          if ((d.text && d.text.toLowerCase().includes(currentSearchQuery)) || 
              (d.senderName && d.senderName.toLowerCase().includes(currentSearchQuery))) {
            matchCount++;
          }
        });
        if (searchCount) searchCount.textContent = `${matchCount} found`;
      } else if (searchCount) {
        searchCount.textContent = '';
      }

      if (visibleDocs.length === 0) {
        let emptyMsg = `
          <div style="text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px;">
            <i class="fas fa-comments" style="font-size:34px; color:#cbd5e1; margin-bottom:12px;"></i><br>
            <strong>Team Messenger is Ready!</strong><br>
            Send a message, voice note, or screenshot to start collaborating.
          </div>
        `;
        if (clearedBefore > 0) {
          emptyMsg = `
            <div class="bp-chat-cleared-banner">
              <span>Messages cleared on this device.</span>
              <span class="bp-cleared-restore-link" onclick="bpRestoreLocalHistory()">Restore All History</span>
            </div>
            ${emptyMsg}
          `;
        }
        messagesEl.innerHTML = emptyMsg;
        return;
      }

      let html = '';
      if (clearedBefore > 0) {
        html += `
          <div class="bp-chat-cleared-banner">
            <span>Older messages cleared on this device.</span>
            <span class="bp-cleared-restore-link" onclick="bpRestoreLocalHistory()">Restore History</span>
          </div>
        `;
      }

      let lastDateStr = '';

      visibleDocs.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const isMine = data.senderId === currentUserId;

        // Search highlight
        const isSearchMatch = currentSearchQuery && (
          (data.text && data.text.toLowerCase().includes(currentSearchQuery)) ||
          (data.senderName && data.senderName.toLowerCase().includes(currentSearchQuery))
        );

        // Date divider
        const timeObj = data.timestamp ? data.timestamp.toDate() : (data.createdMillis ? new Date(data.createdMillis) : new Date());
        const dateStr = timeObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateStr !== lastDateStr) {
          html += `<div class="bp-chat-date-sep">${dateStr}</div>`;
          lastDateStr = dateStr;
        }

        const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Avatar for incoming
        let avatarHtml = '';
        if (!isMine) {
          const userAvatar = (window.USERS && window.USERS[data.senderId]?.avatar) || 
                             localStorage.getItem('slw_avatar_' + data.senderId) || 
                             data.senderAvatar || 
                             (data.senderId === 'admin' ? 'Dp/Image.png' : null);
          if (userAvatar) {
            avatarHtml = `<img class="bp-msg-avatar" src="${userAvatar}" alt="${escapeHtml(data.senderName)}">`;
          } else {
            const initial = (data.senderName || 'U').charAt(0).toUpperCase();
            avatarHtml = `<div class="bp-msg-avatar">${initial}</div>`;
          }
        }

        // WhatsApp Quoted / Reply Preview
        let quotedHtml = '';
        if (data.replyTo) {
          quotedHtml = `
            <div class="bp-quoted-msg" onclick="bpScrollToMessage('${data.replyTo.id}')">
              <span class="bp-quoted-sender">${escapeHtml(data.replyTo.senderName)}</span>
              <span class="bp-quoted-text">${escapeHtml(data.replyTo.text || (data.replyTo.isImage ? '📷 Photo' : (data.replyTo.isVoice ? '🎤 Voice Note' : 'Message')))}</span>
            </div>
          `;
        }

        // Voice Note Player
        let voiceHtml = '';
        if (data.audio) {
          const durSec = data.audioDuration || 6;
          const durMin = Math.floor(durSec / 60);
          const durSecRemain = String(Math.floor(durSec % 60)).padStart(2, '0');
          const timeFormatted = `${durMin}:${durSecRemain}`;

          // Waveform bars simulation
          const barHeights = [14, 22, 10, 18, 24, 16, 20, 26, 12, 18, 22, 14, 20, 16, 12, 18];
          let barsHtml = '';
          barHeights.forEach(h => {
            barsHtml += `<div class="bp-wave-bar" style="height:${h}px;"></div>`;
          });

          voiceHtml = `
            <div class="bp-voice-msg-player">
              <button type="button" class="bp-voice-play-btn" id="voice-btn-${id}" onclick="bpToggleVoicePlay('${id}', '${data.audio}')">
                <i class="fas fa-play"></i>
              </button>
              <div class="bp-voice-waveform" id="voice-wave-${id}" onclick="bpToggleVoicePlay('${id}', '${data.audio}')">
                ${barsHtml}
              </div>
              <div class="bp-voice-info-col">
                <span class="bp-voice-time" id="voice-time-${id}">${timeFormatted}</span>
                <span class="bp-voice-speed-badge" id="voice-speed-${id}" onclick="bpChangeVoiceSpeed('${id}')">1x</span>
              </div>
            </div>
          `;
        }

        // Image Attachment
        let imgHtml = '';
        if (data.image) {
          imgHtml = `
            <div class="bp-chat-attachment" onclick="bpOpenLightbox('${data.image}')">
              <img src="${data.image}" alt="Attached Photo" loading="lazy">
              <span class="bp-chat-img-zoom-hint"><i class="fas fa-magnifying-glass-plus"></i> View</span>
            </div>
          `;
        }

        // Action Toolbar on Hover (WhatsApp Style)
        const actionsHtml = `
          <div class="bp-msg-actions">
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '👍')" title="Thumbs up">👍</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '❤️')" title="Love">❤️</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '😂')" title="Laugh">😂</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '✈️')" title="Travel">✈️</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '🔥')" title="Fire">🔥</button>
            <button class="bp-btn-action-icon" onclick="bpReplyToMessage('${id}')" title="Reply"><i class="fas fa-reply"></i></button>
            ${data.text ? `<button class="bp-btn-action-icon" onclick="bpCopyMessage('${escapeHtml(data.text)}')" title="Copy text"><i class="fas fa-copy"></i></button>` : ''}
            <button class="bp-btn-action-icon delete" onclick="bpDeleteMessageOptions('${id}')" title="Delete message"><i class="fas fa-trash"></i></button>
          </div>
        `;

        // Format message text with search highlighting & linkification
        let formattedText = data.text ? linkifyText(escapeHtml(data.text)) : '';
        if (currentSearchQuery && formattedText) {
          const regex = new RegExp(`(${escapeRegExp(currentSearchQuery)})`, 'gi');
          formattedText = formattedText.replace(regex, '<mark class="bp-search-hit">$1</mark>');
        }

        // WhatsApp Double Checkmark Status (Read Receipts)
        let ticksHtml = '';
        if (isMine) {
          const createdMillis = data.createdMillis || 0;
          let isReadByPeer = false;

          Object.keys(peerPresence).forEach(peerId => {
            if (peerId !== currentUserId && !peerId.startsWith('typing_')) {
              if (peerPresence[peerId].lastSeenMillis >= createdMillis) {
                isReadByPeer = true;
              }
            }
          });

          if (isReadByPeer) {
            ticksHtml = `<span class="bp-ticks read" title="Read by team">✓✓</span>`;
          } else {
            ticksHtml = `<span class="bp-ticks delivered" title="Delivered">✓✓</span>`;
          }
        }

        // Reactions rendering
        let reactionsHtml = '';
        if (data.reactions && Object.keys(data.reactions).length > 0) {
          reactionsHtml = '<div class="bp-msg-reactions">';
          for (const [emoji, users] of Object.entries(data.reactions)) {
            if (users && users.length > 0) {
              const reactedByMe = users.includes(currentUserId);
              reactionsHtml += `
                <span class="bp-reaction-pill" style="${reactedByMe ? 'border-color:#3b82f6; background:#eff6ff;' : ''}" onclick="bpReactMessage('${id}', '${emoji}')">
                  ${emoji} ${users.length}
                </span>
              `;
            }
          }
          reactionsHtml += '</div>';
        }

        html += `
          <div class="bp-msg-row ${isMine ? 'outgoing' : 'incoming'} ${isSearchMatch ? 'highlighted' : ''}" id="msg-row-${id}">
            ${avatarHtml}
            <div class="bp-msg-bubble-wrap">
              ${!isMine ? `<span class="bp-msg-sender-name">${escapeHtml(data.senderName)}</span>` : ''}
              <div class="bp-msg-bubble">
                ${actionsHtml}
                ${quotedHtml}
                ${formattedText ? `<div>${formattedText}</div>` : ''}
                ${imgHtml}
                ${voiceHtml}
              </div>
              ${reactionsHtml}
              <div class="bp-msg-footer">
                <span>${timeStr}</span>
                ${ticksHtml}
              </div>
            </div>
          </div>
        `;
      });

      const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop <= messagesEl.clientHeight + 90;
      messagesEl.innerHTML = html;

      if (wasAtBottom || isChatOpen) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    function escapeRegExp(string) {
      return string.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
    }

    function linkifyText(text) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:underline; font-weight:600;">${url}</a>`;
      });
    }

    // ── Real-time Firestore Listener ──
    let isInitialLoad = true;
    db.collection('bp_team_chat')
      .orderBy('createdMillis', 'asc')
      .limitToLast(200)
      .onSnapshot((snapshot) => {
        messagesCache = snapshot.docs;
        renderMessages(messagesCache);

        if (!isInitialLoad && snapshot.docChanges) {
          let hasNewIncoming = false;
          let latestIncomingDoc = null;
          const currentUserId = getCurrentUser()?.id;

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data();
              if (d.senderId !== currentUserId) {
                hasNewIncoming = true;
                latestIncomingDoc = d;
              }
            }
          });

          if (hasNewIncoming && latestIncomingDoc) {
            playChime();

            const isTabInBackground = document.hidden || !document.hasFocus();
            if (isTabInBackground || !isChatOpen) {
              unreadCount++;
              updateBadge();

              let notifBody = latestIncomingDoc.text;
              if (!notifBody && latestIncomingDoc.image) notifBody = '📷 Sent a photo';
              if (!notifBody && latestIncomingDoc.audio) notifBody = '🎤 Sent a voice note';

              triggerDesktopNotification(
                latestIncomingDoc.senderName || 'Team Member',
                notifBody || 'Sent a new message',
                latestIncomingDoc.senderAvatar
              );
            }
          }
        }
        isInitialLoad = false;
      }, (err) => {
        console.error('Firestore chat error:', err);
      });

    function updateBadge() {
      if (unreadCount > 0) {
        badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badgeEl.style.display = 'flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Update presence timestamp in Firestore for read receipts
    function updatePresence() {
      const user = getCurrentUser();
      if (!user) return;
      db.collection('bp_chat_presence').doc(user.id).set({
        lastSeenMillis: Date.now(),
        name: user.name,
        isOnline: true
      }, { merge: true }).catch(() => {});
    }

    // ── Open / Close Chat Controls ──
    function toggleChat() {
      isChatOpen = !isChatOpen;
      if (isChatOpen) {
        chatWindow.classList.remove('hidden');
        triggerBtn.classList.add('active');
        unreadCount = 0;
        updateBadge();
        stopTitleBlink();
        lastSeenTimestamp = Date.now();
        localStorage.setItem('bp_chat_last_seen', lastSeenTimestamp.toString());
        updatePresence();

        setTimeout(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
          inputEl.focus();
        }, 100);

        updateNotificationBanner();
        if ('Notification' in window && Notification.permission === 'default') {
          requestNotificationPermission(false);
        }
      } else {
        chatWindow.classList.add('hidden');
        triggerBtn.classList.remove('active');
        emojiPanel.classList.add('hidden');
        if (isRecordingAudio) cancelVoiceRecording();
      }
    }

    triggerBtn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', () => {
      isChatOpen = false;
      chatWindow.classList.add('hidden');
      triggerBtn.classList.remove('active');
      emojiPanel.classList.add('hidden');
      if (isRecordingAudio) cancelVoiceRecording();
    });

    // Sound toggle
    muteBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('bp_chat_sound', soundEnabled.toString());
      muteBtn.classList.toggle('muted', !soundEnabled);
      muteBtn.querySelector('i').className = `fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}`;
      if (soundEnabled) {
        playChime();
        if ('Notification' in window && Notification.permission === 'default') {
          requestNotificationPermission(true);
        }
      }
    });

    // Check auth visibility
    function checkVisibility() {
      const user = getCurrentUser();
      if (!user) {
        triggerBtn.style.display = 'none';
        chatWindow.classList.add('hidden');
      } else {
        triggerBtn.style.display = 'flex';
        const headerAvatarEl = document.getElementById('bpChatHeaderAvatar');
        if (headerAvatarEl) {
          if (user.avatar) {
            headerAvatarEl.innerHTML = `<img src="${user.avatar}" alt="${escapeHtml(user.name)}">`;
          } else {
            const init = (user.name || 'U').charAt(0).toUpperCase();
            headerAvatarEl.innerHTML = `<span>${init}</span>`;
          }
        }
      }
    }

    window.bpRefreshChatAuth = checkVisibility;
    setInterval(checkVisibility, 2000);
    setInterval(updatePresence, 30000); // Heartbeat presence
    checkVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatWhenReady);
  } else {
    initChatWhenReady();
  }
})();

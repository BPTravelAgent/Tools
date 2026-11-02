/**
 * ═════════════════════════════════════════════════════════════════════════
 * BP TRAVEL TOOLS — TEAM REAL-TIME CHAT & COLLABORATION ENGINE (v3.0)
 * WhatsApp-Style 1-on-1 Direct Messaging & Multi-Channel Privacy Hub
 * ═════════════════════════════════════════════════════════════════════════
 * Key Architecture:
 *  - Contact List / Conversations View (1-on-1 Direct Chats + Team Room)
 *  - End-to-end Room & Participant Privacy Scoping
 *  - WhatsApp Quoted Replies, Voice Notes, Blue Ticks, Emoji Picker
 *  - Per-Room Dual Clear (Clear for Me vs Delete for Everyone)
 *  - Real-time Typing Indicators per conversation
 *  - Unread Badges per contact and global badge on launcher
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
    let currentDraftImageBase64 = null;
    let currentReplyTo = null; // { id, senderName, text, isImage, isVoice }
    let messagesCache = [];
    let peerPresence = {}; // { [userId]: { lastSeenMillis: number, isOnline: boolean } }
    let currentSearchQuery = '';
    let contactSearchQuery = '';

    // Active Conversation Room State
    // Default room is 'general'
    let currentRoomId = 'general';
    let currentRoomMeta = {
      id: 'general',
      type: 'general',
      name: 'Team Room (General)',
      isDirect: false,
      peerUserKey: null
    };

    // Voice Recording State
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingInterval = null;
    let recordingSeconds = 0;
    let isRecordingAudio = false;

    // Typing State
    let typingTimeout = null;

    // Safe Firestore Date / Timestamp Parser
    function safeParseDate(ts, fallbackMillis) {
      if (!ts) return fallbackMillis ? new Date(fallbackMillis) : new Date();
      if (typeof ts.toDate === 'function') {
        try { return ts.toDate(); } catch (e) {}
      }
      if (ts.seconds) return new Date(ts.seconds * 1000);
      if (typeof ts === 'string' || typeof ts === 'number') {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d;
      }
      return fallbackMillis ? new Date(fallbackMillis) : new Date();
    }
    let lastTypingBroadcast = 0;

    // ── Real-time Team Users Listener (for 1-on-1 Direct Messaging Contacts) ──
    let teamUsers = {};

    // Initial fallback from cached/existing window.USERS or localStorage
    if (typeof window !== "undefined" && window.USERS && Object.keys(window.USERS).length > 0) {
      teamUsers = { ...window.USERS };
    }
    // Also check known default users
    ['admin', 'samadhi'].forEach(k => {
      if (!teamUsers[k]) {
        const cached = localStorage.getItem('slw_avatar_' + k);
        teamUsers[k] = {
          id: k,
          name: k.charAt(0).toUpperCase() + k.slice(1),
          avatar: cached || (k === 'admin' ? 'Dp/Image.png' : null)
        };
      }
    });

    if (typeof db !== "undefined") {
      db.collection('slw_credentials').onSnapshot(snapshot => {
        const freshUsers = {};
        snapshot.forEach(doc => {
          const d = doc.data() || {};
          const cached = localStorage.getItem('slw_avatar_' + doc.id);
          freshUsers[doc.id] = {
            id: doc.id,
            name: d.name || (doc.id.charAt(0).toUpperCase() + doc.id.slice(1)),
            avatar: d.avatar || cached || (doc.id === 'admin' ? 'Dp/Image.png' : null),
            role: d.role || (doc.id === 'admin' ? 'admin' : 'agent'),
            ...d
          };
        });
        // Always ensure admin exists
        if (!freshUsers['admin']) {
          const cachedAdmin = localStorage.getItem('slw_avatar_admin');
          freshUsers['admin'] = { id: 'admin', name: 'Admin', role: 'admin', avatar: cachedAdmin || 'Dp/Image.png' };
        }
        teamUsers = freshUsers;
        window.USERS = { ...teamUsers };

        // Auto-configure to 1-on-1 direct room if only 1 peer exists in the team
        const myUser = getCurrentUser();
        if (myUser) {
          const peerKeys = Object.keys(teamUsers).filter(k => k !== myUser.id);
          if (peerKeys.length === 1 && (currentRoomId === "general" || !currentRoomMeta.isDirect)) {
            const peerKey = peerKeys[0];
            const peer = teamUsers[peerKey] || {};
            const peerName = peer.name || (peerKey.charAt(0).toUpperCase() + peerKey.slice(1));
            const peerAvatar = peer.avatar || localStorage.getItem("slw_avatar_" + peerKey) || (peerKey === "admin" ? "Dp/Image.png" : null);
            const dmRoomId = getDirectRoomId(myUser.id, peerKey);
            window.bpOpenRoom(dmRoomId, peerName, true, peerKey, peerAvatar);
          }
        }

        renderContactsList();

        // If currently viewing a direct chat, update header name/avatar if changed
        if (currentRoomMeta.isDirect && currentRoomMeta.peerUserKey && teamUsers[currentRoomMeta.peerUserKey]) {
          const p = teamUsers[currentRoomMeta.peerUserKey];
          convTitle.textContent = p.name;
          if (p.avatar) {
            convHeaderAvatar.innerHTML = `<img src="${p.avatar}" alt="${escapeHtml(p.name)}">`;
          }
        }
      }, err => {
        console.warn('team_chat: slw_credentials onSnapshot error', err);
      });
    }

    // Helper: Current User Info
    function getCurrentUser() {
      const userKey = sessionStorage.getItem('slw_user_v3') || localStorage.getItem('slw_user_v3');
      if (!userKey) return null;

      const userObj = teamUsers[userKey] || (window.USERS && window.USERS[userKey]) || {};
      let displayName = userObj.name || (userKey.charAt(0).toUpperCase() + userKey.slice(1));

      let isBuddhikaAdmin = (userKey === 'admin');
      if (isBuddhikaAdmin) {
        displayName = 'Buddhika Prabod';
      }

      let avatarUrl = userObj.avatar || localStorage.getItem('slw_avatar_' + userKey) || (isBuddhikaAdmin ? 'Dp/Image.png' : null);

      return {
        id: userKey,
        name: displayName,
        isAdmin: isBuddhikaAdmin,
        avatar: avatarUrl
      };
    }

    // Deterministic 1-on-1 Room ID Generator
    function getDirectRoomId(userA, userB) {
      return 'dm_' + [userA, userB].sort().join('_');
    }

    // ── Build Floating Trigger Button ──
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'bp-chat-trigger';
    triggerBtn.title = 'Open BP Team Chat';
    triggerBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      <span class="bp-chat-badge" style="display:none;">0</span>
    `;

    // ── Build Main Multi-Pane Chat Window ──
    const chatWindow = document.createElement('div');
    chatWindow.className = 'bp-chat-window hidden';
    chatWindow.innerHTML = `
      <div class="bp-chat-views-wrapper" id="bpViewsWrapper">
        
        <!-- ══════════════════════════════════════════════════════
             PANE 1: CONTACTS / CONVERSATIONS LIST
             ══════════════════════════════════════════════════════ -->
        <div class="bp-chat-pane" id="bpPaneList">
          <div class="bp-list-header">
            <div class="bp-list-header-user">
              <div class="bp-chat-avatar-ring" style="width:34px;height:34px;" id="bpListHeaderAvatar">
                <img src="Dp/Image.png" alt="My Profile">
              </div>
              <span class="bp-list-user-name">Team Chats</span>
            </div>
            <div class="bp-list-header-actions">
              <button class="bp-chat-btn-icon ${soundEnabled ? '' : 'muted'}" id="bpBtnMuteSoundList" title="Toggle Sound">
                <i class="fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}"></i>
              </button>
              <button class="bp-chat-btn-icon" id="bpBtnCloseChatList" title="Close">
                <i class="fas fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- Contact Search Bar -->
          <div class="bp-list-search-bar">
            <i class="fas fa-search" style="color:#94a3b8; font-size:12px;"></i>
            <input type="text" class="bp-list-search-input" id="bpContactSearchInput" placeholder="Search people or rooms..." autocomplete="off">
          </div>

          <!-- Contacts Scroll Area -->
          <div class="bp-contacts-scroll" id="bpContactsScroll">
            <!-- Dynamically populated contacts -->
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             PANE 2: ACTIVE CONVERSATION MESSAGES & INPUT
             ══════════════════════════════════════════════════════ -->
        <div class="bp-chat-pane" id="bpPaneConv">
          <!-- In-Conversation Search Overlay -->
          <div class="bp-chat-search-wrap hidden" id="bpSearchWrap">
            <input type="text" class="bp-search-input" id="bpSearchInput" placeholder="Search in this chat..." autocomplete="off">
            <span class="bp-search-count" id="bpSearchCount"></span>
            <button type="button" class="bp-chat-btn-icon" id="bpBtnCloseSearch" title="Close Search">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- Conversation Header -->
          <div class="bp-conv-header">
            <div class="bp-conv-header-left">
              <button type="button" class="bp-btn-back" id="bpBtnBackToList" title="Back to Chat List">
                <i class="fas fa-arrow-left"></i>
              </button>
              <div class="bp-chat-avatar-ring" style="width:34px;height:34px;" id="bpConvHeaderAvatar">
                <img src="Dp/Image.png" alt="Active Room">
              </div>
              <div class="bp-conv-title-wrap">
                <span class="bp-conv-title" id="bpConvTitle">Team Room</span>
                <span class="bp-conv-status" id="bpConvStatus">
                  <span class="bp-conv-online-dot"></span> Live Chat
                </span>
              </div>
            </div>
            <div class="bp-chat-header-actions">
              <button class="bp-chat-btn-icon" id="bpBtnSearchToggle" title="Search messages">
                <i class="fas fa-search"></i>
              </button>
              <button class="bp-chat-btn-icon ${soundEnabled ? '' : 'muted'}" id="bpBtnMuteSoundConv" title="Toggle Sound">
                <i class="fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}"></i>
              </button>
              <button class="bp-chat-btn-icon" id="bpBtnClearChat" title="Clear Chat Options">
                <i class="fas fa-broom"></i>
              </button>
              <button class="bp-chat-btn-icon" id="bpBtnCloseChatConv" title="Close Chat">
                <i class="fas fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- Notification Permission Banner -->
          <div class="bp-chat-notif-banner hidden" id="bpNotifBanner">
            <div class="bp-notif-banner-content">
              <i class="fas fa-bell"></i>
              <span>Enable Chrome alerts to get notified when minimized</span>
            </div>
            <div class="bp-notif-banner-actions">
              <button type="button" class="bp-notif-banner-btn" id="bpBtnEnableNotif">Enable</button>
              <button type="button" class="bp-notif-banner-close" id="bpBtnDismissNotif" title="Dismiss">&times;</button>
            </div>
          </div>

          <!-- Drag & Drop Overlay -->
          <div class="bp-chat-drop-overlay" id="bpDropOverlay">
            <i class="fas fa-cloud-arrow-up" style="font-size:32px;"></i>
            <span>Drop Image to Share</span>
          </div>

          <!-- Messages Feed -->
          <div class="bp-chat-messages" id="bpChatMessages">
            <div style="text-align:center; padding:30px; color:#94a3b8; font-size:12px;">
              <i class="fas fa-spinner fa-spin" style="font-size:20px; margin-bottom:8px;"></i><br>
              Connecting to Private Channel...
            </div>
          </div>

          <!-- WhatsApp Emoji Picker Panel -->
          <div class="bp-emoji-picker-panel hidden" id="bpEmojiPanel">
            <div class="bp-emoji-tabs">
              <button type="button" class="bp-emoji-tab animoji-tab active" data-cat="animated">⚡ Animoji</button>
              <button type="button" class="bp-emoji-tab" data-cat="smileys">😊</button>
              <button type="button" class="bp-emoji-tab" data-cat="hands">👍</button>
              <button type="button" class="bp-emoji-tab" data-cat="travel">✈️</button>
              <button type="button" class="bp-emoji-tab" data-cat="hearts">❤️</button>
            </div>
            <div class="bp-emoji-grid" id="bpEmojiGrid"></div>
            <div class="bp-emoji-footer-tip" id="bpEmojiTip">✨ Click any Animoji with empty input to send Sticker!</div>
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
              <button type="button" class="bp-chat-action-btn" id="bpBtnToggleEmoji" title="Insert Emoji">
                <i class="far fa-face-smile"></i>
              </button>

              <input type="file" id="bpFileInput" accept="image/*" style="display:none;">
              <button type="button" class="bp-chat-action-btn" id="bpBtnPickFile" title="Attach Image or Screenshot">
                <i class="fas fa-paperclip"></i>
              </button>

              <textarea class="bp-chat-textarea" id="bpChatInput" placeholder="Type a message or paste screenshot..." rows="1"></textarea>

              <!-- Voice Recording Bar -->
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

              <!-- Send & Mic Buttons -->
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
        </div>

      </div>

      <!-- Clear Chat Modal (Full Window Overlay) -->
      <div class="bp-chat-clear-modal hidden" id="bpClearModal">
        <div class="bp-clear-card">
          <div class="bp-clear-header">
            <i class="fas fa-broom" style="color:#f59e0b; font-size:22px;"></i>
            <h3>Clear Chat Options</h3>
          </div>
          <p id="bpClearModalDesc">Select how you want to clear this conversation:</p>
          <div class="bp-clear-actions">
            <button class="bp-clear-btn bp-clear-me" id="bpBtnClearForMe">
              <div class="bp-clear-btn-title"><i class="fas fa-user-slash"></i> Clear for Me</div>
              <div class="bp-clear-btn-desc">Clears messages only on your screen. The other party keeps their chat.</div>
            </button>
            <button class="bp-clear-btn bp-clear-all" id="bpBtnClearForEveryone">
              <div class="bp-clear-btn-title"><i class="fas fa-trash-can"></i> Delete for Everyone</div>
              <div class="bp-clear-btn-desc">Permanently deletes this conversation history from Firebase for both users.</div>
            </button>
          </div>
          <button class="bp-clear-cancel" id="bpBtnCancelClear">Cancel</button>
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
    const viewsWrapper = document.getElementById('bpViewsWrapper');
    const badgeEl = triggerBtn.querySelector('.bp-chat-badge');
    const contactsScroll = document.getElementById('bpContactsScroll');
    const contactSearchInput = document.getElementById('bpContactSearchInput');
    const btnBackToList = document.getElementById('bpBtnBackToList');
    const convTitle = document.getElementById('bpConvTitle');
    const convStatus = document.getElementById('bpConvStatus');
    const convHeaderAvatar = document.getElementById('bpConvHeaderAvatar');
    const listHeaderAvatar = document.getElementById('bpListHeaderAvatar');

    const messagesEl = document.getElementById('bpChatMessages');
    const inputEl = document.getElementById('bpChatInput');
    const sendBtn = document.getElementById('bpBtnSendMsg');
    const voiceBtn = document.getElementById('bpBtnVoiceRecord');
    const fileInput = document.getElementById('bpFileInput');
    const pickFileBtn = document.getElementById('bpBtnPickFile');
    const draftPreview = document.getElementById('bpDraftPreview');
    const draftThumb = document.getElementById('bpDraftThumb');
    const removeDraftBtn = document.getElementById('bpBtnRemoveDraft');
    const clearBtn = document.getElementById('bpBtnClearChat');
    const dropOverlay = document.getElementById('bpDropOverlay');
    const notifBanner = document.getElementById('bpNotifBanner');
    const enableNotifBtn = document.getElementById('bpBtnEnableNotif');
    const dismissNotifBtn = document.getElementById('bpBtnDismissNotif');

    // Mute & Close buttons on both panes
    const muteBtnList = document.getElementById('bpBtnMuteSoundList');
    const muteBtnConv = document.getElementById('bpBtnMuteSoundConv');
    const closeBtnList = document.getElementById('bpBtnCloseChatList');
    const closeBtnConv = document.getElementById('bpBtnCloseChatConv');

    // Reply Elements
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
    const clearModalDesc = document.getElementById('bpClearModalDesc');
    const btnClearForMe = document.getElementById('bpBtnClearForMe');
    const btnClearForEveryone = document.getElementById('bpBtnClearForEveryone');
    const btnCancelClear = document.getElementById('bpBtnCancelClear');

    // Search in Conversation Elements
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

    // ── Google Noto Animated 3D Emojis Catalog ──
    const ANIMATED_EMOJIS = [
      { emoji: '😂', code: '1f602', name: 'Laughing Tears' },
      { emoji: '🤣', code: '1f923', name: 'ROFL' },
      { emoji: '❤️', code: '2764_fe0f', name: 'Red Heart' },
      { emoji: '🔥', code: '1f525', name: 'Fire Flame' },
      { emoji: '👍', code: '1f44d', name: 'Thumbs Up' },
      { emoji: '✈️', code: '2708_fe0f', name: 'Airplane' },
      { emoji: '🚀', code: '1f680', name: 'Rocket Launch' },
      { emoji: '🎉', code: '1f389', name: 'Party Popper' },
      { emoji: '😍', code: '1f60d', name: 'Heart Eyes' },
      { emoji: '😎', code: '1f60e', name: 'Cool Sunglasses' },
      { emoji: '👏', code: '1f44f', name: 'Clapping Hands' },
      { emoji: '✨', code: '2728', name: 'Sparkles' },
      { emoji: '👋', code: '1f44b', name: 'Waving Hand' },
      { emoji: '🤔', code: '1f914', name: 'Thinking' },
      { emoji: '😘', code: '1f618', name: 'Blowing Kiss' },
      { emoji: '🥰', code: '1f970', name: 'Smiling with Hearts' },
      { emoji: '🤩', code: '1f929', name: 'Star Struck' },
      { emoji: '💯', code: '1f4af', name: '100 Points' },
      { emoji: '😭', code: '1f62d', name: 'Loud Crying' },
      { emoji: '🥳', code: '1f973', name: 'Party Face' },
      { emoji: '🤑', code: '1f911', name: 'Money Face' },
      { emoji: '😱', code: '1f631', name: 'Shocked Scream' },
      { emoji: '💪', code: '1f4aa', name: 'Flex Bicep' },
      { emoji: '🙏', code: '1f64f', name: 'Praying Hands' },
      { emoji: '☕', code: '2615', name: 'Coffee Cup' },
      { emoji: '⭐', code: '2b50', name: 'Golden Star' },
      { emoji: '💖', code: '1f496', name: 'Sparkle Heart' },
      { emoji: '🥺', code: '1f97a', name: 'Pleading Eyes' },
      { emoji: '😴', code: '1f634', name: 'Sleeping Zzz' },
      { emoji: '🤯', code: '1f92f', name: 'Mind Blown' },
      { emoji: '😋', code: '1f60b', name: 'Delicious' },
      { emoji: '😜', code: '1f61c', name: 'Wink Tongue' },
      { emoji: '😇', code: '1f607', name: 'Angel Halo' },
      { emoji: '😁', code: '1f601', name: 'Beaming Grin' },
      { emoji: '🤝', code: '1f91d', name: 'Handshake' },
      { emoji: '✌️', code: '270c_fe0f', name: 'Victory Peace' }
    ];

    const ANIMATED_EMOJI_LOOKUP = {};
    ANIMATED_EMOJIS.forEach(item => {
      ANIMATED_EMOJI_LOOKUP[item.emoji] = item.code;
    });

    function getAnimojiUrl(code) {
      return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
    }

    // Helper: Format message text replacing emojis with inline animated WebP
    function formatAnimatedEmojis(escapedText) {
      if (!escapedText) return "";
      let formatted = escapedText;
      for (const [em, code] of Object.entries(ANIMATED_EMOJI_LOOKUP)) {
        if (formatted.includes(em)) {
          const imgTag = `<img class="bp-inline-animoji" src="${getAnimojiUrl(code)}" alt="${em}" title="${em}" loading="lazy">`;
          formatted = formatted.split(em).join(imgTag);
        }
      }
      return formatted;
    }

    // Send Standalone Animated Emoji Sticker
    async function sendAnimatedSticker(emoji, code) {
      const user = getCurrentUser();
      if (!user) return;

      try {
        const isDirect = currentRoomMeta.isDirect;
        const participants = isDirect ? [user.id, currentRoomMeta.peerUserKey].sort() : ["all"];
        const newMsg = {
          text: emoji,
          animoji: code,
          image: null,
          audio: null,
          audioDuration: null,
          replyTo: currentReplyTo,
          roomId: currentRoomId,
          chatType: isDirect ? "direct" : "general",
          participants: participants,
          senderId: user.id,
          senderName: user.name,
          senderAvatar: user.avatar || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          createdMillis: Date.now(),
          reactions: {}
        };

        await db.collection("bp_team_chat").add(newMsg);
        clearReply();
        emojiPanel.classList.add("hidden");
        emojiToggleBtn.classList.remove("active");
        playChime();
        markActiveRoomSeen();
      } catch (err) {
        console.error("Error sending animoji sticker:", err);
      }
    }

    window.bpHandleAnimojiClick = function(emoji, code) {
      const hasText = inputEl.value.trim().length > 0;
      if (!hasText) {
        // Send as animated sticker immediately!
        sendAnimatedSticker(emoji, code);
      } else {
        // Insert into text
        insertEmoji(emoji);
      }
    };

    // ── Emoji Categories Map ──
    const EMOJI_CATEGORIES = {
      smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '🤫', '🤔', '🤐', '🤗', '🥳', '😎', '🤓', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '🥱', '😴', '🤤'],
      hands: ['👍', '👎', '👏', '🙌', '👐', '🤝', '✌️', '🤞', '👊', '✊', '🤛', '🤜', '🤚', '👋', '✍️', '🙏', '💪', '👈', '👉', '👆', '👇', '👌', '🤌', '🤏', '🤙'],
      travel: ['✈️', '🛫', '🛬', '🛩️', '🏝️', '🏖️', '🏨', '🏰', '🗺️', '🚗', '🚕', '🚌', '🚆', '🚢', '🛥️', '☀️', '🌴', '💼', '📁', '📊', '📈', '📋', '📞', '📱', '⏰', '📅', '🎫', '🛂'],
      hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💖', '💗', '💓', '💞', '💕', '✨', '⭐', '🌟', '💥', '🔥', '🚀', '🎉', '🎊', '🏆', '💯', '☕']
    };

    function renderEmojiGrid(cat = 'animated') {
      emojiGrid.innerHTML = '';
      const tipEl = document.getElementById('bpEmojiTip');

      if (cat === 'animated') {
        if (tipEl) tipEl.textContent = '✨ Click any Animoji to send animated sticker!';
        ANIMATED_EMOJIS.forEach(item => {
          const div = document.createElement('div');
          div.className = 'bp-animoji-grid-item';
          div.title = item.name;
          div.onclick = () => window.bpHandleAnimojiClick(item.emoji, item.code);
          div.innerHTML = `<img src="${getAnimojiUrl(item.code)}" alt="${item.emoji}" loading="lazy">`;
          emojiGrid.appendChild(div);
        });
        return;
      }

      if (tipEl) tipEl.textContent = 'Click an emoji to insert into your message';
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
        renderEmojiGrid('animated');
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

    if (enableNotifBtn) enableNotifBtn.addEventListener('click', () => requestNotificationPermission(true));
    if (dismissNotifBtn) dismissNotifBtn.addEventListener('click', () => {
      localStorage.setItem('bp_notif_banner_dismissed', 'true');
      updateNotificationBanner();
    });

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
        alert('Could not access microphone: ' + err.message);
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

    // ── Send Voice Message (with Room Scoping) ──
    async function sendVoiceMessage(base64Audio, duration) {
      const user = getCurrentUser();
      if (!user) return;

      try {
        const isDirect = currentRoomMeta.isDirect;
        const participants = isDirect ? [user.id, currentRoomMeta.peerUserKey].sort() : ['all'];

        const newMsg = {
          text: '',
          image: null,
          audio: base64Audio,
          audioDuration: duration,
          replyTo: currentReplyTo,
          roomId: currentRoomId,
          chatType: isDirect ? 'direct' : 'general',
          participants: participants,
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
        markActiveRoomSeen();
      } catch (err) {
        console.error('Error sending voice message:', err);
        alert('Failed to send voice note: ' + err.message);
      }
    }

    // ── Send Standard Message (with Room Scoping) ──
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
        const isDirect = currentRoomMeta.isDirect;
        const participants = isDirect ? [user.id, currentRoomMeta.peerUserKey].sort() : ['all'];

        const newMsg = {
          text: text,
          image: imagePayload || null,
          audio: null,
          audioDuration: null,
          replyTo: replyPayload,
          roomId: currentRoomId,
          chatType: isDirect ? 'direct' : 'general',
          participants: participants,
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
        markActiveRoomSeen();

        // Broadcast stop typing
        try {
          if (typeof broadcastTyping === 'function') broadcastTyping(false);
        } catch (e) {
          console.warn('broadcastTyping error:', e);
        }
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

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(90, inputEl.scrollHeight) + 'px';
      updateInputMode();
      broadcastTyping(true);
    });

    // ── Live Typing Indicator Engine (Scoped to Room) ──
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
            roomId: currentRoomId,
            timestamp: now
          }, { merge: true }).catch(() => {});
        }

        if (typeof typingTimeout !== "undefined" && typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        typingTimeout = setTimeout(() => {
          broadcastTyping(false);
        }, 3000);
      } else {
        clearTimeout(typingTimeout);
        db.collection('bp_chat_presence').doc('typing_' + user.id).delete().catch(() => {});
      }
    }

    // Listen for peer typing & presence
    db.collection('bp_chat_presence').onSnapshot(snapshot => {
      const currentUserId = getCurrentUser()?.id;
      let activeTyper = null;
      const cutoff = Date.now() - 4000;

      snapshot.forEach(doc => {
        if (doc.id.startsWith('typing_')) {
          const data = doc.data();
          if (data.userId !== currentUserId && data.roomId === currentRoomId && data.timestamp > cutoff) {
            activeTyper = data.userName;
          }
        } else {
          peerPresence[doc.id] = doc.data();
        }
      });

      if (convStatus) {
        if (activeTyper) {
          convStatus.innerHTML = `<span class="bp-chat-typing-indicator"><span class="bp-typing-dots"><span></span><span></span><span></span></span> ${escapeHtml(activeTyper)} is typing...</span>`;
        } else {
          updateConvStatusText();
        }
      }
      renderContactsList();
    }, () => {});

    function updateConvStatusText() {
      if (!convStatus) return;
      if (!currentRoomMeta.isDirect) {
        convStatus.innerHTML = `<span class="bp-conv-online-dot"></span> Company Room`;
      } else {
        const peer = peerPresence[currentRoomMeta.peerUserKey];
        if (peer && peer.lastSeenMillis && (Date.now() - peer.lastSeenMillis < 120000)) {
          convStatus.innerHTML = `<span class="bp-conv-online-dot"></span> Online`;
        } else {
          convStatus.innerHTML = `<i class="fas fa-lock" style="font-size:9px;color:#94a3b8;"></i> End-to-end Private Chat`;
        }
      }
    }

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

    // ── Delete Message Options ──
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
        tip.style = 'position:fixed; bottom:120px; right:40px; background:#1e293b; color:white; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:700; z-index:999999; box-shadow:0 6px 20px rgba(0,0,0,0.3);';
        tip.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i> Message copied!';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 1800);
      });
    };

    // ── Voice Note Player Controller ──
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

        if (waveform) {
          const bars = waveform.querySelectorAll('.bp-wave-bar');
          const progressRatio = cur / dur;
          const playedCount = Math.floor(progressRatio * bars.length);
          bars.forEach((bar, idx) => {
            if (idx <= playedCount) bar.classList.add('played');
            else bar.classList.remove('played');
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

    // ── Clear Chat Modal Controls (Scoped to current conversation) ──
    clearBtn.addEventListener('click', () => {
      clearModalDesc.textContent = currentRoomMeta.isDirect 
        ? `Select how you want to clear your private chat with ${currentRoomMeta.name}:`
        : 'Select how you want to clear the Team Room:';
      clearModal.classList.remove('hidden');
    });

    btnCancelClear.addEventListener('click', () => {
      clearModal.classList.add('hidden');
    });

    clearModal.addEventListener('click', (e) => {
      if (e.target === clearModal) clearModal.classList.add('hidden');
    });

    // Option 1: Clear for Me
    btnClearForMe.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) return;

      localStorage.setItem('bp_chat_cleared_before_' + user.id + '_' + currentRoomId, Date.now().toString());
      clearModal.classList.add('hidden');
      renderMessages(messagesCache);
      renderContactsList();
    });

    // Option 2: Delete for Everyone (Firestore Chunk Clear for this room)
    btnClearForEveryone.addEventListener('click', async () => {
      if (!confirm('Are you absolutely sure you want to permanently delete messages in this room? This cannot be undone.')) return;

      btnClearForEveryone.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
      try {
        const snap = await db.collection('bp_team_chat').get();
        const docs = snap.docs.filter(d => {
          const data = d.data();
          const rId = data.roomId || 'general';
          return rId === currentRoomId;
        });

        if (docs.length === 0) {
          alert('Chat history in this room is already empty.');
          clearModal.classList.add('hidden');
          return;
        }

        const CHUNK_SIZE = 450;
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          const chunk = docs.slice(i, i + CHUNK_SIZE);
          const batch = db.batch();
          chunk.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }

        clearModal.classList.add('hidden');
        alert(`Conversation cleared successfully (${docs.length} messages permanently removed).`);
        renderMessages(messagesCache);
        renderContactsList();
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      } finally {
        btnClearForEveryone.innerHTML = '<div class="bp-clear-btn-title"><i class="fas fa-trash-can"></i> Delete for Everyone</div><div class="bp-clear-btn-desc">Permanently deletes this conversation history from Firebase for both users.</div>';
      }
    });

    window.bpRestoreLocalHistory = function () {
      const user = getCurrentUser();
      if (!user) return;
      localStorage.removeItem('bp_chat_cleared_before_' + user.id + '_' + currentRoomId);
      renderMessages(messagesCache);
      renderContactsList();
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

    // ── Contact Search Input ──
    contactSearchInput.addEventListener('input', (e) => {
      contactSearchQuery = e.target.value.trim().toLowerCase();
      renderContactsList();
    });

    // ── Switch Conversation Room ──
    window.bpOpenRoom = function (roomId, roomName, isDirect, peerKey, avatarUrl) {
      currentRoomId = roomId;
      currentRoomMeta = {
        id: roomId,
        type: isDirect ? 'direct' : 'general',
        name: roomName,
        isDirect: isDirect,
        peerUserKey: peerKey,
        avatar: avatarUrl
      };

      const user = getCurrentUser();
      if (user) {
        localStorage.setItem('bp_active_room_' + user.id, roomId);
      }

      // Update Header
      convTitle.textContent = roomName;
      updateConvStatusText();

      if (avatarUrl) {
        convHeaderAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(roomName)}">`;
      } else if (isDirect) {
        const init = roomName.charAt(0).toUpperCase();
        convHeaderAvatar.innerHTML = `<span>${init}</span>`;
      } else {
        convHeaderAvatar.innerHTML = '<i class="fas fa-users" style="color:#1d4ed8; font-size:15px; position:relative; z-index:2;"></i>';
      }

      // Mark seen
      markActiveRoomSeen();

      // Clear search
      currentSearchQuery = '';
      if (searchWrap) searchWrap.classList.add('hidden');

      // Slide to Conversation View
      viewsWrapper.classList.add('show-conv');
      renderMessages(messagesCache);
      renderContactsList();

      setTimeout(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        inputEl.focus();
      }, 100);
    };

    // Back button to contacts
    btnBackToList.addEventListener('click', () => {
      viewsWrapper.classList.remove('show-conv');
      renderContactsList();
    });

    function markActiveRoomSeen() {
      const user = getCurrentUser();
      if (!user) return;

      const seenKey = 'bp_seen_' + user.id + '_' + currentRoomId;
      localStorage.setItem(seenKey, Date.now().toString());

      // Update Firestore presence for this room so peer gets blue double ticks!
      db.collection('bp_chat_presence').doc(user.id + '_' + currentRoomId).set({
        lastSeenMillis: Date.now(),
        userId: user.id,
        roomId: currentRoomId
      }, { merge: true }).catch(() => {});
    }

    // ── Privacy Filter Helper ──
    function isMessageVisibleToMe(data, myUserId) {
      if (!data) return false;
      const isDirect = data.chatType === 'direct';
      if (!isDirect) return true; // General room messages visible to all team members
      // Direct message: MUST have myUserId in participants or senderId
      if (data.senderId === myUserId) return true;
      if (data.participants && data.participants.includes(myUserId)) return true;
      return false; // Privacy: not permitted
    }

    // ── Render Contacts & Rooms List (Pane 1) ──
    function renderContactsList() {
      const user = getCurrentUser();
      if (!user) return;

      // Robust users map with fallback defaults
      const baseDefaults = {
        'admin': { id: 'admin', name: 'Buddhika Prabod', avatar: localStorage.getItem('slw_avatar_admin') || 'Dp/Image.png' },
        'samadhi': { id: 'samadhi', name: 'Samadhi', avatar: localStorage.getItem('slw_avatar_samadhi') || null }
      };
      let allUsers = Object.keys(teamUsers).length > 0 ? { ...teamUsers } : { ...baseDefaults, ...(window.USERS || {}) };
      if (!allUsers['admin']) allUsers['admin'] = baseDefaults['admin'];
      if (!allUsers['samadhi'] && !localStorage.getItem('slw_deleted_samadhi')) allUsers['samadhi'] = baseDefaults['samadhi'];
      const userKeys = Object.keys(allUsers).filter(k => k !== user.id);

      contactsScroll.innerHTML = '';

      // Check if General room should be shown (ONLY when 2+ peers exist, i.e. 3+ members total in company)
      const shouldShowGeneral = userKeys.length > 1;
      let generalUnreadCount = 0;

      // ── 1. Company General Room (Hidden when there is only 1 user besides admin) ──
      if (shouldShowGeneral) {
        const generalDocs = messagesCache.filter(doc => {
          const d = doc.data();
          const rId = d.roomId || 'general';
          return rId === 'general' && isMessageVisibleToMe(d, user.id);
        });

        const lastGenDoc = generalDocs.length > 0 ? generalDocs[generalDocs.length - 1].data() : null;
        let lastGenSnippet = 'Company-wide announcements & discussion';
        let lastGenTime = '';
        if (lastGenDoc) {
          lastGenSnippet = lastGenDoc.text || (lastGenDoc.image ? '📷 Photo' : (lastGenDoc.audio ? '🎤 Voice note' : 'Message'));
          const t = safeParseDate(lastGenDoc.timestamp, lastGenDoc.createdMillis);
          lastGenTime = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const lastGenSeen = parseInt(localStorage.getItem('bp_seen_' + user.id + '_general') || '0', 10);
        generalDocs.forEach(doc => {
          const d = doc.data();
          if (d.senderId !== user.id && (d.createdMillis || 0) > lastGenSeen) {
            generalUnreadCount++;
          }
        });

        if (!contactSearchQuery || 'team room general'.includes(contactSearchQuery)) {
          const genDiv = document.createElement('div');
          genDiv.className = `bp-contact-item ${currentRoomId === 'general' ? 'active' : ''}`;
          genDiv.onclick = () => window.bpOpenRoom('general', 'Team Room (General)', false, null, null);
          genDiv.innerHTML = `
            <div class="bp-contact-avatar-wrap">
              <div class="bp-contact-avatar-circle" style="background:#e0e7ff;">
                <i class="fas fa-users" style="color:#2563eb; font-size:16px;"></i>
              </div>
              <div class="bp-contact-online-badge"></div>
            </div>
            <div class="bp-contact-info">
              <div class="bp-contact-top-row">
                <span class="bp-contact-name">Team Room (General)</span>
                <span class="bp-contact-time">${lastGenTime}</span>
              </div>
              <div class="bp-contact-bottom-row">
                <span class="bp-contact-snippet ${generalUnreadCount > 0 ? 'unread-bold' : ''}">${escapeHtml(lastGenSnippet)}</span>
                ${generalUnreadCount > 0 ? `<span class="bp-contact-unread-badge">${generalUnreadCount}</span>` : ''}
              </div>
            </div>
          `;
          contactsScroll.appendChild(genDiv);
        }

        // Section Label: Direct Messages (only shown when General Room is also visible)
        const dmLabel = document.createElement('div');
        dmLabel.className = 'bp-contact-section-label';
        dmLabel.textContent = 'Direct Messages (Private)';
        contactsScroll.appendChild(dmLabel);
      }

      let totalUnreadAllRooms = shouldShowGeneral ? generalUnreadCount : 0;

      if (userKeys.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'bp-contact-empty-hint';
        emptyDiv.style.cssText = 'padding: 20px 16px; text-align: center; color: #94a3b8; font-size: 13px; font-weight: 500;';
        emptyDiv.innerHTML = '<i class="fas fa-user-clock" style="margin-bottom:6px; display:block; font-size:20px; opacity:0.6;"></i>No other team members available';
        contactsScroll.appendChild(emptyDiv);
      }

      // ── 2. Direct Messages (1-on-1 with each Team Member) ──
      userKeys.forEach(peerKey => {
        try {
          const peer = allUsers[peerKey] || {};
        const peerName = peer.name || (peerKey.charAt(0).toUpperCase() + peerKey.slice(1));
        const peerAvatar = peer.avatar || localStorage.getItem('slw_avatar_' + peerKey) || (peerKey === 'admin' ? 'Dp/Image.png' : null);
        const roomId = getDirectRoomId(user.id, peerKey);

        if (contactSearchQuery && !peerName.toLowerCase().includes(contactSearchQuery) && !peerKey.includes(contactSearchQuery)) {
          return;
        }

        // Filter messages for this DM room
        const dmDocs = messagesCache.filter(doc => {
          const d = doc.data();
          return d.roomId === roomId && isMessageVisibleToMe(d, user.id);
        });

        const lastDmDoc = dmDocs.length > 0 ? dmDocs[dmDocs.length - 1].data() : null;
        let lastDmSnippet = 'No messages yet';
        let lastDmTime = '';
        if (lastDmDoc) {
          lastDmSnippet = (lastDmDoc.senderId === user.id ? 'You: ' : '') + (lastDmDoc.text || (lastDmDoc.image ? '📷 Photo' : (lastDmDoc.audio ? '🎤 Voice note' : 'Message')));
          const t = safeParseDate(lastDmDoc.timestamp, lastDmDoc.createdMillis);
          lastDmTime = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const lastDmSeen = parseInt(localStorage.getItem('bp_seen_' + user.id + '_' + roomId) || '0', 10);
        let dmUnreadCount = 0;
        dmDocs.forEach(doc => {
          const d = doc.data();
          if (d.senderId !== user.id && (d.createdMillis || 0) > lastDmSeen) {
            dmUnreadCount++;
          }
        });

        totalUnreadAllRooms += dmUnreadCount;

        // Presence check
        const isOnline = peerPresence[peerKey] && peerPresence[peerKey].lastSeenMillis && (Date.now() - peerPresence[peerKey].lastSeenMillis < 120000);

        const contactDiv = document.createElement('div');
        contactDiv.className = `bp-contact-item ${currentRoomId === roomId ? 'active' : ''}`;
        contactDiv.onclick = () => window.bpOpenRoom(roomId, peerName, true, peerKey, peerAvatar);

        let avatarInner = '';
        if (peerAvatar) {
          avatarInner = `<img src="${peerAvatar}" alt="${escapeHtml(peerName)}">`;
        } else {
          avatarInner = `<span>${peerName.charAt(0).toUpperCase()}</span>`;
        }

        contactDiv.innerHTML = `
          <div class="bp-contact-avatar-wrap">
            <div class="bp-chat-avatar-ring" style="width:38px;height:38px;">
              ${avatarInner}
            </div>
            <div class="bp-contact-online-badge ${isOnline ? '' : 'offline'}"></div>
          </div>
          <div class="bp-contact-info">
            <div class="bp-contact-top-row">
              <span class="bp-contact-name">${escapeHtml(peerName)}</span>
              <span class="bp-contact-time">${lastDmTime}</span>
            </div>
            <div class="bp-contact-bottom-row">
              <span class="bp-contact-snippet ${dmUnreadCount > 0 ? 'unread-bold' : ''}">${escapeHtml(lastDmSnippet)}</span>
              ${dmUnreadCount > 0 ? `<span class="bp-contact-unread-badge">${dmUnreadCount}</span>` : ''}
            </div>
          </div>
        `;

        contactsScroll.appendChild(contactDiv);
        } catch (contactErr) {
          console.warn('Error rendering contact item for ' + peerKey, contactErr);
        }
      });

      // Update global floating trigger badge
      if (totalUnreadAllRooms > 0) {
        badgeEl.textContent = totalUnreadAllRooms > 9 ? '9+' : totalUnreadAllRooms;
        badgeEl.style.display = 'flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // ── Render Messages Feed (Pane 2) ──
    function renderMessages(docs) {
      const currentUser = getCurrentUser();
      const currentUserId = currentUser ? currentUser.id : null;
      if (!currentUserId) return;

      const clearedBefore = parseInt(localStorage.getItem('bp_chat_cleared_before_' + currentUserId + '_' + currentRoomId) || '0', 10);
      const locallyDeletedList = JSON.parse(localStorage.getItem('bp_chat_deleted_msgs_' + currentUserId) || '[]');

      // Filter messages strictly for current active room and privacy
      const visibleDocs = docs.filter(doc => {
        if (locallyDeletedList.includes(doc.id)) return false;
        const d = doc.data();
        const rId = d.roomId || 'general';
        if (rId !== currentRoomId) return false;
        if (!isMessageVisibleToMe(d, currentUserId)) return false;

        const created = d.createdMillis || (d.timestamp ? d.timestamp.toMillis() : 0);
        return created >= clearedBefore;
      });

      // Search match filtering in current room
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
            <i class="fas ${currentRoomMeta.isDirect ? 'fa-user-lock' : 'fa-comments'}" style="font-size:34px; color:#cbd5e1; margin-bottom:12px;"></i><br>
            <strong>${currentRoomMeta.isDirect ? 'Private 1-on-1 Chat' : 'Team Room'}</strong><br>
            ${currentRoomMeta.isDirect ? 'Messages sent here are end-to-end confidential between you and ' + escapeHtml(currentRoomMeta.name) : 'Start collaborating with the team.'}
          </div>
        `;
        if (clearedBefore > 0) {
          emptyMsg = `
            <div class="bp-chat-cleared-banner">
              <span>Messages cleared on this device.</span>
              <span class="bp-cleared-restore-link" onclick="bpRestoreLocalHistory()">Restore History</span>
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

        const isSearchMatch = currentSearchQuery && (
          (data.text && data.text.toLowerCase().includes(currentSearchQuery)) ||
          (data.senderName && data.senderName.toLowerCase().includes(currentSearchQuery))
        );

        const timeObj = safeParseDate(data.timestamp, data.createdMillis);
        const dateStr = timeObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateStr !== lastDateStr) {
          html += `<div class="bp-chat-date-sep">${dateStr}</div>`;
          lastDateStr = dateStr;
        }

        const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Avatar for incoming
        let avatarHtml = '';
        if (!isMine) {
          const userAvatar = (teamUsers[data.senderId]?.avatar) ||
                             (window.USERS && window.USERS[data.senderId]?.avatar) || 
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

        // Quoted / Reply Preview
        let quotedHtml = '';
        if (data.replyTo) {
          quotedHtml = `
            <div class="bp-quoted-msg" onclick="bpScrollToMessage('${data.replyTo.id}')">
              <span class="bp-quoted-sender">${escapeHtml(data.replyTo.senderName)}</span>
              <span class="bp-quoted-text">${escapeHtml(data.replyTo.animoji ? '⚡ Animated Sticker' : (data.replyTo.text || (data.replyTo.isImage ? '📷 Photo' : (data.replyTo.isVoice ? '🎤 Voice Note' : 'Message'))))}</span>
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

        // Action Toolbar on Hover
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

        // Animoji Sticker & Animated Text formatting
        let isSticker = false;
        let stickerCode = data.animoji || null;
        const trimmedRawText = (data.text || '').trim();

        // If text is purely 1 known animated emoji, treat as full sticker!
        if (!stickerCode && !data.image && !data.audio && ANIMATED_EMOJI_LOOKUP[trimmedRawText]) {
          stickerCode = ANIMATED_EMOJI_LOOKUP[trimmedRawText];
        }

        let stickerHtml = '';
        let formattedText = '';

        if (stickerCode && !data.image && !data.audio && (!data.text || data.text.trim() === '' || ANIMATED_EMOJI_LOOKUP[trimmedRawText])) {
          isSticker = true;
          stickerHtml = `
            <div class="bp-msg-animoji-sticker">
              <img src="${getAnimojiUrl(stickerCode)}" alt="Animoji" loading="lazy">
            </div>
          `;
        } else if (data.text) {
          formattedText = linkifyText(escapeHtml(data.text));
          formattedText = formatAnimatedEmojis(formattedText);
          if (currentSearchQuery && formattedText) {
            const regex = new RegExp(`(${escapeRegExp(currentSearchQuery)})`, 'gi');
            formattedText = formattedText.replace(regex, '<mark class="bp-search-hit">$1</mark>');
          }
        }

        // WhatsApp Double Blue Checkmarks (Read Receipts)
        let ticksHtml = '';
        if (isMine) {
          const createdMillis = data.createdMillis || 0;
          let isReadByPeer = false;

          if (currentRoomMeta.isDirect && currentRoomMeta.peerUserKey) {
            const peerKey = currentRoomMeta.peerUserKey;
            const presenceKey = peerKey + '_' + currentRoomId;
            if (peerPresence[presenceKey] && peerPresence[presenceKey].lastSeenMillis >= createdMillis) {
              isReadByPeer = true;
            }
          }

          if (isReadByPeer) {
            ticksHtml = `<span class="bp-ticks read" title="Read">✓✓</span>`;
          } else {
            ticksHtml = `<span class="bp-ticks delivered" title="Delivered">✓✓</span>`;
          }
        }

        // Reactions
        let reactionsHtml = '';
        if (data.reactions && Object.keys(data.reactions).length > 0) {
          reactionsHtml = '<div class="bp-msg-reactions">';
          for (const [emoji, users] of Object.entries(data.reactions)) {
            if (users && users.length > 0) {
              const reactedByMe = users.includes(currentUserId);
              reactionsHtml += `
                <span class="bp-reaction-pill" style="${reactedByMe ? 'border-color:#3b82f6; background:#eff6ff;' : ''}" onclick="bpReactMessage('${id}', '${emoji}')">
                  ${ANIMATED_EMOJI_LOOKUP[emoji] ? `<img class="bp-reaction-animoji" src="${getAnimojiUrl(ANIMATED_EMOJI_LOOKUP[emoji])}" alt="${emoji}">` : emoji} ${users.length}
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
              ${!isMine && !currentRoomMeta.isDirect ? `<span class="bp-msg-sender-name">${escapeHtml(data.senderName)}</span>` : ''}
              <div class="bp-msg-bubble ${isSticker ? 'is-sticker' : ''}">
                ${actionsHtml}
                ${quotedHtml}
                ${stickerHtml}
                ${formattedText ? `<div class="bp-msg-text">${formattedText}</div>` : ''}
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
      .limitToLast(250)
      .onSnapshot((snapshot) => {
        messagesCache = snapshot.docs;
        renderContactsList();
        renderMessages(messagesCache);

        if (!isInitialLoad && snapshot.docChanges) {
          const currentUserId = getCurrentUser()?.id;

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data();
              if (d.senderId !== currentUserId && isMessageVisibleToMe(d, currentUserId)) {
                const allU = Object.keys(teamUsers).length > 0 ? teamUsers : (window.USERS || {});
                const pKeys = Object.keys(allU).filter(k => k !== currentUserId);
                if (pKeys.length <= 1 && (d.roomId || 'general') === 'general') {
                  return; // Skip general room alerts when hidden
                }
                playChime();

                const isTabInBackground = document.hidden || !document.hasFocus();
                const isThisRoomOpen = isChatOpen && viewsWrapper.classList.contains('show-conv') && (d.roomId || 'general') === currentRoomId;

                if (isTabInBackground || !isThisRoomOpen) {
                  let notifBody = d.text;
                  if (!notifBody && d.image) notifBody = '📷 Sent a photo';
                  if (!notifBody && d.audio) notifBody = '🎤 Sent a voice note';

                  triggerDesktopNotification(
                    d.senderName || 'Team Member',
                    notifBody || 'Sent a new message',
                    d.senderAvatar
                  );
                }
              }
            }
          });
        }
        isInitialLoad = false;
      }, (err) => {
        console.error('Firestore chat error:', err);
      });

    // ── Open / Close Chat Controls ──
    function toggleChat() {
      isChatOpen = !isChatOpen;
      if (isChatOpen) {
        chatWindow.classList.remove('hidden');
        triggerBtn.classList.add('active');
        stopTitleBlink();

        // Restore active room or stay in contact list
        const user = getCurrentUser();
        if (user) {
          // Update profile avatar in list header
          if (listHeaderAvatar) {
            if (user.avatar) {
              listHeaderAvatar.innerHTML = `<img src="${user.avatar}" alt="${escapeHtml(user.name)}">`;
            } else {
              listHeaderAvatar.innerHTML = `<span>${user.name.charAt(0).toUpperCase()}</span>`;
            }
          }

          const allUsers = Object.keys(teamUsers).length > 0 ? teamUsers : (window.USERS || {});
          const userKeys = Object.keys(allUsers).filter(k => k !== user.id);

          if (userKeys.length === 1) {
            // Automatically open 1-on-1 private chat with the only team peer
            const peerKey = userKeys[0];
            const peer = allUsers[peerKey] || {};
            const peerName = peer.name || (peerKey.charAt(0).toUpperCase() + peerKey.slice(1));
            const peerAvatar = peer.avatar || localStorage.getItem('slw_avatar_' + peerKey) || (peerKey === 'admin' ? 'Dp/Image.png' : null);
            const dmRoomId = getDirectRoomId(user.id, peerKey);
            window.bpOpenRoom(dmRoomId, peerName, true, peerKey, peerAvatar);
          } else {
            const savedRoom = localStorage.getItem('bp_active_room_' + user.id);
            if (savedRoom && savedRoom !== 'general' && savedRoom.startsWith('dm_')) {
              viewsWrapper.classList.add('show-conv');
            } else {
              viewsWrapper.classList.remove('show-conv');
            }
          }
        }

        renderContactsList();
        renderMessages(messagesCache);
        markActiveRoomSeen();

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
    closeBtnList.addEventListener('click', () => {
      isChatOpen = false;
      chatWindow.classList.add('hidden');
      triggerBtn.classList.remove('active');
    });
    closeBtnConv.addEventListener('click', () => {
      isChatOpen = false;
      chatWindow.classList.add('hidden');
      triggerBtn.classList.remove('active');
    });

    // Sound toggle on both headers
    function toggleSoundState() {
      soundEnabled = !soundEnabled;
      localStorage.setItem('bp_chat_sound', soundEnabled.toString());
      [muteBtnList, muteBtnConv].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('muted', !soundEnabled);
        btn.querySelector('i').className = `fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}`;
      });
      if (soundEnabled) {
        playChime();
        if ('Notification' in window && Notification.permission === 'default') {
          requestNotificationPermission(true);
        }
      }
    }

    if (muteBtnList) muteBtnList.addEventListener('click', toggleSoundState);
    if (muteBtnConv) muteBtnConv.addEventListener('click', toggleSoundState);

    // Heartbeat presence update
    function updateMyPresence() {
      const user = getCurrentUser();
      if (!user) return;
      db.collection('bp_chat_presence').doc(user.id).set({
        lastSeenMillis: Date.now(),
        name: user.name,
        isOnline: true
      }, { merge: true }).catch(() => {});
    }

    function checkVisibility() {
      const user = getCurrentUser();
      if (!user) {
        triggerBtn.style.display = 'none';
        chatWindow.classList.add('hidden');
      } else {
        triggerBtn.style.display = 'flex';
      }
    }

    window.bpRefreshChatAuth = checkVisibility;
    setInterval(checkVisibility, 2000);
    setInterval(updateMyPresence, 30000);
    checkVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatWhenReady);
  } else {
    initChatWhenReady();
  }
})();

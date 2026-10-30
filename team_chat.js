/**
 * ═════════════════════════════════════════════════════════════════════════
 * BP TRAVEL TOOLS — TEAM REAL-TIME CHAT & COLLABORATION ENGINE
 * ═════════════════════════════════════════════════════════════════════════
 * Features:
 *  - Real-time Firestore Messaging (onSnapshot)
 *  - Smart Canvas Image Compression (5MB -> 40KB WebP)
 *  - Direct Clipboard Paste (Ctrl+V screenshots from Snipping Tool)
 *  - Drag & Drop Image Sharing
 *  - Web Audio API notification chime (no external audio files required)
 *  - Fullscreen Lightbox Image Viewer & Download
 *  - Emoji Quick Reactions (👍, ❤️, 😂, ✈️, 🔥)
 *  - Unread Message Badge counter
 *  - Admin Clear / Retention Controls
 */

(function () {
  'use strict';

  // Wait for Firebase Firestore to be initialized
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

    // State
    let isChatOpen = false;
    let unreadCount = 0;
    let currentDraftImageBase64 = null;
    let lastSeenTimestamp = parseInt(localStorage.getItem('bp_chat_last_seen') || '0', 10);
    let messagesCache = [];

    // Helper: Current User Info
    function getCurrentUser() {
      const userKey = sessionStorage.getItem('slw_user_v3') || localStorage.getItem('slw_user_v3');
      if (!userKey) return null;

      let displayName = userKey.charAt(0).toUpperCase() + userKey.slice(1);
      if (window.USERS && window.USERS[userKey] && window.USERS[userKey].name) {
        displayName = window.USERS[userKey].name;
      }

      let isBuddhikaAdmin = false;
      let avatarUrl = null;

      if (userKey === 'admin') {
        displayName = 'Buddhika Prabod';
        isBuddhikaAdmin = true;
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
      <!-- Header -->
      <div class="bp-chat-header">
        <div class="bp-chat-header-info">
          <div class="bp-chat-avatar-ring">
            <img src="Dp/Image.png" alt="BP" onerror="this.outerHTML='<span>BP</span>'">
          </div>
          <div class="bp-chat-title-wrap">
            <span class="bp-chat-title">BP Team Messenger</span>
            <span class="bp-chat-status">
              <span class="bp-chat-online-dot"></span> Live Team Room
            </span>
          </div>
        </div>
        <div class="bp-chat-header-actions">
          <button class="bp-chat-btn-icon ${soundEnabled ? '' : 'muted'}" id="bpBtnMuteSound" title="Toggle Sound">
            <i class="fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}"></i>
          </button>
          <button class="bp-chat-btn-icon" id="bpBtnClearChat" title="Clear Chat History (Admin Only)" style="display:none;">
            <i class="fas fa-trash-can"></i>
          </button>
          <button class="bp-chat-btn-icon" id="bpBtnCloseChat" title="Close Chat">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Drag & Drop Overlay -->
      <div class="bp-chat-drop-overlay" id="bpDropOverlay">
        <i class="fas fa-cloud-arrow-up" style="font-size:32px;"></i>
        <span>Drop Image to Share with Team</span>
      </div>

      <!-- Messages Feed -->
      <div class="bp-chat-messages" id="bpChatMessages">
        <div style="text-align:center; padding:30px; color:#94a3b8; font-size:12px;">
          <i class="fas fa-spinner fa-spin" style="font-size:20px; margin-bottom:8px;"></i><br>
          Connecting to Real-time Team Hub...
        </div>
      </div>

      <!-- Input Area -->
      <div class="bp-chat-input-area">
        <!-- Draft Image Attachment Preview -->
        <div class="bp-chat-draft-preview hidden" id="bpDraftPreview">
          <img class="bp-chat-draft-thumb" id="bpDraftThumb" src="" alt="Draft Image">
          <div class="bp-chat-draft-info">
            <strong>Image Attached</strong><br>
            <span id="bpDraftSize">Compressed & Ready</span>
          </div>
          <button type="button" class="bp-chat-draft-remove" id="bpBtnRemoveDraft" title="Remove Image">&times;</button>
        </div>

        <div class="bp-chat-input-row">
          <textarea class="bp-chat-textarea" id="bpChatInput" placeholder="Type a message or press Ctrl+V to paste screenshot..." rows="1"></textarea>
          
          <input type="file" id="bpFileInput" accept="image/*" style="display:none;">
          <button type="button" class="bp-chat-action-btn" id="bpBtnPickFile" title="Attach Image or Screenshot">
            <i class="fas fa-paperclip"></i>
          </button>

          <button type="button" class="bp-chat-btn-send" id="bpBtnSendMsg" title="Send (Enter)">
            <i class="fas fa-paper-plane"></i>
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

    // Elements
    const badgeEl = triggerBtn.querySelector('.bp-chat-badge');
    const messagesEl = document.getElementById('bpChatMessages');
    const inputEl = document.getElementById('bpChatInput');
    const sendBtn = document.getElementById('bpBtnSendMsg');
    const fileInput = document.getElementById('bpFileInput');
    const pickFileBtn = document.getElementById('bpBtnPickFile');
    const draftPreview = document.getElementById('bpDraftPreview');
    const draftThumb = document.getElementById('bpDraftThumb');
    const removeDraftBtn = document.getElementById('bpBtnRemoveDraft');
    const muteBtn = document.getElementById('bpBtnMuteSound');
    const clearBtn = document.getElementById('bpBtnClearChat');
    const closeBtn = document.getElementById('bpBtnCloseChat');
    const dropOverlay = document.getElementById('bpDropOverlay');

    // ── Web Audio Notification Chime (No External Audio Files) ──
    function playChime() {
      if (!soundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Two-tone cheerful chime (E5 -> A5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.setValueAtTime(880.00, now + 0.1); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      } catch (err) {
        // AudioContext might be blocked until user gesture, ignore safely
      }
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

            // Compress to WebP (quality 0.75) with JPEG fallback
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

    // Handle Image Selection/Pasting
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
        inputEl.focus();
      } catch (err) {
        console.error('Image compression failed:', err);
        alert('Could not process image. Please try another image format.');
        clearDraftImage();
      }
    }

    function clearDraftImage() {
      currentDraftImageBase64 = null;
      draftThumb.src = '';
      draftPreview.classList.add('hidden');
      fileInput.value = '';
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

    // File input picker
    pickFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSelectedImage(e.target.files[0]);
      }
    });

    // ── Send Message ──
    async function sendMessage() {
      const user = getCurrentUser();
      if (!user) {
        alert('Please log in to participate in team chat.');
        return;
      }

      const text = inputEl.value.trim();
      const imagePayload = currentDraftImageBase64;

      if (!text && !imagePayload) return;

      sendBtn.disabled = true;

      try {
        const newMsg = {
          text: text,
          image: imagePayload || null,
          senderId: user.id,
          senderName: user.name,
          senderAvatar: user.avatar || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          createdMillis: Date.now(),
          reactions: {}
        };

        await db.collection('bp_team_chat').add(newMsg);

        // Reset input
        inputEl.value = '';
        inputEl.style.height = 'auto';
        clearDraftImage();
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

    // Auto-grow textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(90, inputEl.scrollHeight) + 'px';
    });

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
          // Remove reaction
          currentUsers.splice(userIdx, 1);
          if (currentUsers.length === 0) {
            delete reactions[emoji];
          } else {
            reactions[emoji] = currentUsers;
          }
        } else {
          // Add reaction
          currentUsers.push(user.id);
          reactions[emoji] = currentUsers;
        }

        await msgRef.update({ reactions });
      } catch (err) {
        console.error('Reaction update error:', err);
      }
    };

    // ── Delete Message Handler ──
    window.bpDeleteMessage = async function (msgId) {
      if (!confirm('Delete this message for everyone?')) return;
      try {
        await db.collection('bp_team_chat').doc(msgId).delete();
      } catch (err) {
        console.error('Delete error:', err);
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
      if (e.target === lightbox) {
        lightbox.classList.add('hidden');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!lightbox.classList.contains('hidden')) {
          lightbox.classList.add('hidden');
        } else if (isChatOpen) {
          toggleChat();
        }
      }
    });

    // ── Render Messages Feed ──
    function renderMessages(docs) {
      const currentUser = getCurrentUser();
      const currentUserId = currentUser ? currentUser.id : null;
      const isAdmin = currentUser && currentUser.isAdmin;

      if (docs.length === 0) {
        messagesEl.innerHTML = `
          <div style="text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px;">
            <i class="fas fa-comments" style="font-size:32px; color:#cbd5e1; margin-bottom:12px;"></i><br>
            <strong>Team Chat Room is Ready!</strong><br>
            Send a message or paste a screenshot to start collaborating.
          </div>
        `;
        return;
      }

      let html = '';
      let lastDateStr = '';

      docs.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const isMine = data.senderId === currentUserId;

        // Date divider
        const timeObj = data.timestamp ? data.timestamp.toDate() : (data.createdMillis ? new Date(data.createdMillis) : new Date());
        const dateStr = timeObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateStr !== lastDateStr) {
          html += `<div class="bp-chat-date-sep">${dateStr}</div>`;
          lastDateStr = dateStr;
        }

        const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Avatar
        let avatarHtml = '';
        if (!isMine) {
          if (data.senderAvatar) {
            avatarHtml = `<img class="bp-msg-avatar" src="${data.senderAvatar}" alt="${escapeHtml(data.senderName)}">`;
          } else {
            const initial = (data.senderName || 'U').charAt(0).toUpperCase();
            avatarHtml = `<div class="bp-msg-avatar">${initial}</div>`;
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

        // Image attachment
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
        const canDelete = isMine || isAdmin;
        const actionsHtml = `
          <div class="bp-msg-actions">
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '👍')" title="Thumbs up">👍</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '❤️')" title="Love">❤️</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '😂')" title="Laugh">😂</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '✈️')" title="Travel">✈️</button>
            <button class="bp-btn-react" onclick="bpReactMessage('${id}', '🔥')" title="Fire">🔥</button>
            ${canDelete ? `<button class="bp-btn-delete-msg" onclick="bpDeleteMessage('${id}')" title="Delete message"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        `;

        // Format message text with linkification
        const formattedText = data.text ? linkifyText(escapeHtml(data.text)) : '';

        html += `
          <div class="bp-msg-row ${isMine ? 'outgoing' : 'incoming'}">
            ${avatarHtml}
            <div class="bp-msg-bubble-wrap">
              ${!isMine ? `<span class="bp-msg-sender-name">${escapeHtml(data.senderName)}</span>` : ''}
              <div class="bp-msg-bubble">
                ${actionsHtml}
                ${formattedText ? `<div>${formattedText}</div>` : ''}
                ${imgHtml}
              </div>
              ${reactionsHtml}
              <div class="bp-msg-footer">
                <span>${timeStr}</span>
                ${isMine ? '<i class="fas fa-check" style="font-size:9px;"></i>' : ''}
              </div>
            </div>
          </div>
        `;
      });

      const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop <= messagesEl.clientHeight + 80;
      messagesEl.innerHTML = html;

      // Auto-scroll to bottom if already near bottom or just opened
      if (wasAtBottom || isChatOpen) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
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
      .limitToLast(150)
      .onSnapshot((snapshot) => {
        messagesCache = snapshot.docs;
        renderMessages(messagesCache);

        if (!isInitialLoad && snapshot.docChanges) {
          let hasNewIncoming = false;
          const currentUserId = getCurrentUser()?.id;

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data();
              if (d.senderId !== currentUserId) {
                hasNewIncoming = true;
              }
            }
          });

          if (hasNewIncoming) {
            playChime();
            if (!isChatOpen) {
              unreadCount++;
              updateBadge();
            }
          }
        }
        isInitialLoad = false;
      }, (err) => {
        console.error('Firestore chat error:', err);
        messagesEl.innerHTML = `
          <div style="padding:20px; color:#ef4444; font-size:12px; text-align:center;">
            Connection error: ${err.message}<br>Please check network connection.
          </div>
        `;
      });

    function updateBadge() {
      if (unreadCount > 0) {
        badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badgeEl.style.display = 'flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // ── Open / Close Chat Controls ──
    function toggleChat() {
      isChatOpen = !isChatOpen;
      if (isChatOpen) {
        chatWindow.classList.remove('hidden');
        triggerBtn.classList.add('active');
        unreadCount = 0;
        updateBadge();
        lastSeenTimestamp = Date.now();
        localStorage.setItem('bp_chat_last_seen', lastSeenTimestamp.toString());
        setTimeout(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
          inputEl.focus();
        }, 100);

        // Check if admin to show clear button
        const user = getCurrentUser();
        if (user && user.isAdmin) {
          clearBtn.style.display = 'flex';
        } else {
          clearBtn.style.display = 'none';
        }
      } else {
        chatWindow.classList.add('hidden');
        triggerBtn.classList.remove('active');
      }
    }

    triggerBtn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', () => {
      isChatOpen = false;
      chatWindow.classList.add('hidden');
      triggerBtn.classList.remove('active');
    });

    // Sound toggle button
    muteBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('bp_chat_sound', soundEnabled.toString());
      muteBtn.classList.toggle('muted', !soundEnabled);
      muteBtn.querySelector('i').className = `fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}`;
      if (soundEnabled) playChime();
    });

    // Clear chat button (Admin only)
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear the entire chat history for everyone? This cannot be undone.')) return;
      clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const snap = await db.collection('bp_team_chat').get();
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        alert('Chat history cleared successfully.');
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      } finally {
        clearBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
      }
    });

    // Visibility change: check user login
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
    setInterval(checkVisibility, 1500);
    checkVisibility();
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatWhenReady);
  } else {
    initChatWhenReady();
  }
})();

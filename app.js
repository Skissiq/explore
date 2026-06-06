var App = {
  profile: null,
  apiClient: null,
  conversations: [],
  activeConvId: null,
  messages: [],
  pollTimer: null,

  init: function () {
    var self = this;
    self.apiClient = new ApiClient(CONFIG.APPS_SCRIPT_URL);

    // Bind UI
    document.getElementById('emptyNewChatBtn').onclick = function () { self.showNewChatModal(); };
    document.getElementById('newChatBtn').onclick = function () { self.showNewChatModal(); };
    document.getElementById('cancelNewChat').onclick = function () { self.hideNewChatModal(); };
    document.getElementById('closeNewChatModal').onclick = function () { self.hideNewChatModal(); };
    document.getElementById('confirmNewChat').onclick = function () { self.createConversation(); };
    document.getElementById('newChatName').onkeydown = function (e) { if (e.key === 'Enter') self.createConversation(); };
    document.getElementById('cancelAddParticipant').onclick = function () { self.hideParticipantModal(); };
    document.getElementById('closeParticipantModal').onclick = function () { self.hideParticipantModal(); };
    document.getElementById('confirmAddParticipant').onclick = function () { self.addParticipant(); };
    document.getElementById('participantEmail').onkeydown = function (e) { if (e.key === 'Enter') self.addParticipant(); };
    document.getElementById('logoutBtn').onclick = function () { self.logout(); };
    document.getElementById('sendBtn').onclick = function () { self.sendMessage(); };
    document.getElementById('messageInput').onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendMessage(); }
    };
    document.getElementById('addParticipantBtn').onclick = function () { self.showParticipantModal(); };
    document.getElementById('newChatModal').onclick = function (e) { if (e.target === e.currentTarget) self.hideNewChatModal(); };
    document.getElementById('addParticipantModal').onclick = function (e) { if (e.target === e.currentTarget) self.hideParticipantModal(); };

    // Init Google Sign-In
    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: function (res) { self.handleCredential(res); },
      cancel_on_tap_outside: false
    });

    // Try restore session
    var saved = localStorage.getItem('chatapp_idtoken');
    var expiry = localStorage.getItem('chatapp_idtoken_expiry');
    if (saved && expiry && Date.now() < parseInt(expiry)) {
      try {
        var payload = decodeJWT(saved);
        self.profile = {
          email: payload.email,
          name: payload.name || payload.email,
          picture: payload.picture || ''
        };
        self.apiClient.setIdToken(saved);
        self.showLoading(true);
        self.initApp().then(function () {
          self.showLoading(false);
        }).catch(function (e) {
          self.showLogin();
          self.showLoading(false);
        });
      } catch (e) {
        self.showLogin();
      }
    } else {
      self.showLogin();
    }
  },

  handleCredential: function (response) {
    var self = this;
    var payload = decodeJWT(response.credential);
    self.profile = {
      email: payload.email,
      name: payload.name || payload.email,
      picture: payload.picture || ''
    };
    self.apiClient.setIdToken(response.credential);
    localStorage.setItem('chatapp_idtoken', response.credential);
    localStorage.setItem('chatapp_idtoken_expiry', String((payload.iat + 3600) * 1000));
    self.showLoading(true);
    self.initApp().catch(function (e) {
      self.toast('初始化失敗: ' + e.message, 'error');
      self.showLoading(false);
    });
  },

  initApp: function () {
    var self = this;
    return self.apiClient.call('init').then(function () {
      self.showApp();
      return self.loadConversations();
    });
  },

  showLoading: function (show) {
    document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
  },

  showLogin: function () {
    var self = this;
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    google.accounts.id.renderButton(
      document.getElementById('gSignInButton'),
      { type: 'standard', shape: 'pill', size: 'large', text: 'signin_with', theme: 'outline' }
    );
    self.showLoading(false);
  },

  showApp: function () {
    var self = this;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    var avatar = document.getElementById('userAvatar');
    avatar.src = self.profile.picture || '';
    avatar.onerror = function () { avatar.style.display = 'none'; };
    document.getElementById('userName').textContent = self.profile.name || '';
    document.getElementById('userEmail').textContent = self.profile.email || '';
    self.showLoading(false);
  },

  loadConversations: function () {
    var self = this;
    return self.apiClient.call('getConversations').then(function (convs) {
      self.conversations = convs || [];
      self.renderConversationList();
      if (convs.length > 0) {
        if (!self.activeConvId) {
          return self.selectConversation(convs[0].id);
        }
        var found = false;
        for (var i = 0; i < convs.length; i++) {
          if (convs[i].id === self.activeConvId) { found = true; break; }
        }
        if (found) {
          return self.selectConversation(self.activeConvId);
        }
        self.showEmptyState();
      } else {
        self.showEmptyState();
      }
    }).catch(function (e) {
      self.toast('載入對話失敗: ' + e.message, 'error');
    });
  },

  renderConversationList: function () {
    var self = this;
    var list = document.getElementById('conversationList');
    list.innerHTML = '';
    if (self.conversations.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">尚無對話，點擊 + 建立</div>';
      return;
    }
    var sorted = self.conversations.slice().sort(function (a, b) {
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
    for (var i = 0; i < sorted.length; i++) {
      var conv = sorted[i];
      var div = document.createElement('div');
      div.className = 'conv-item' + (conv.id === self.activeConvId ? ' active' : '');
      var lastMsg = conv.lastMessage || '暫無訊息';
      var time = conv.updatedAt || conv.createdAt || '';
      div.innerHTML = [
        '<div class="conv-top">',
          '<span class="conv-name">', self._escape(conv.name), '</span>',
          '<span class="conv-time">', time ? self._formatTime(time) : '', '</span>',
        '</div>',
        '<div class="conv-preview">', self._escape(lastMsg), '</div>',
        '<button class="conv-delete">刪除</button>'
      ].join('');
      (function (cid) {
        div.onclick = function (e) {
          if (e.target.classList.contains('conv-delete')) {
            self.deleteConversation(cid);
            return;
          }
          self.selectConversation(cid);
        };
      })(conv.id);
      list.appendChild(div);
    }
  },

  showEmptyState: function () {
    this.activeConvId = null;
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
  },

  selectConversation: function (convId) {
    var self = this;
    self.activeConvId = convId;
    var conv = null;
    for (var i = 0; i < self.conversations.length; i++) {
      if (self.conversations[i].id === convId) { conv = self.conversations[i]; break; }
    }
    if (!conv) return;

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.getElementById('chatName').textContent = conv.name;
    document.getElementById('chatParticipants').textContent =
      (conv.participants || []).length > 0 ? '參與者: ' + (conv.participants || []).join(', ') : '';

    self.renderConversationList();
    self.showLoading(true);
    self.apiClient.call('getMessages', { convId: convId }).then(function (msgs) {
      self.messages = msgs || [];
      self.renderMessages();
      self.startPolling();
      self.showLoading(false);
    }).catch(function (e) {
      self.toast('載入訊息失敗: ' + e.message, 'error');
      self.showLoading(false);
    });
  },

  renderMessages: function () {
    var self = this;
    var container = document.getElementById('messageList');
    container.innerHTML = '';
    if (self.messages.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:14px">尚無訊息，輸入第一則訊息開始對話</div>';
      return;
    }
    var lastDate = '';
    var myEmail = self.profile.email;
    for (var i = 0; i < self.messages.length; i++) {
      var msg = self.messages[i];
      var msgDate = new Date(msg.timestamp).toLocaleDateString('zh-TW');
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        var divider = document.createElement('div');
        divider.className = 'day-divider';
        var today = new Date().toLocaleDateString('zh-TW');
        var yesterday = new Date(Date.now() - 86400000).toLocaleDateString('zh-TW');
        divider.textContent = msgDate === today ? '今天' : msgDate === yesterday ? '昨天' : msgDate;
        container.appendChild(divider);
      }
      var isOwn = msg.sender === myEmail;
      var wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper ' + (isOwn ? 'own' : 'other');
      var initials = (msg.senderName || msg.sender || '?').charAt(0).toUpperCase();
      wrapper.innerHTML = [
        '<div class="message-avatar">', self._escape(initials), '</div>',
        '<div class="message-content">',
          isOwn ? '' : '<div class="message-meta"><span class="message-sender">' + self._escape(msg.senderName || msg.sender) + '</span></div>',
          '<div class="message-bubble">', self._escape(msg.content), '</div>',
          '<div class="message-meta"><span class="message-time">', self._formatTime(msg.timestamp), '</span></div>',
        '</div>'
      ].join('');
      container.appendChild(wrapper);
    }
    self.scrollToBottom();
  },

  scrollToBottom: function () {
    var mc = document.getElementById('messageContainer');
    requestAnimationFrame(function () { mc.scrollTop = mc.scrollHeight; });
  },

  sendMessage: function () {
    var self = this;
    var input = document.getElementById('messageInput');
    var content = input.value.trim();
    if (!content || !self.activeConvId) return;

    document.getElementById('sendBtn').disabled = true;
    var msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      content: content,
      timestamp: new Date().toISOString()
    };

    input.value = '';
    input.focus();

    self.apiClient.call('addMessage', { convId: self.activeConvId, message: JSON.stringify(msg) }).then(function () {
      msg.sender = self.profile.email;
      msg.senderName = self.profile.name;
      self.messages.push(msg);
      self.renderMessages();
      for (var i = 0; i < self.conversations.length; i++) {
        if (self.conversations[i].id === self.activeConvId) {
          self.conversations[i].updatedAt = msg.timestamp;
          self.conversations[i].lastMessage = content;
          break;
        }
      }
      self.renderConversationList();
      document.getElementById('sendBtn').disabled = false;
    }).catch(function (e) {
      self.toast('傳送失敗: ' + e.message, 'error');
      document.getElementById('sendBtn').disabled = false;
    });
  },

  startPolling: function () {
    var self = this;
    self.stopPolling();
    self.pollTimer = setInterval(function () { self.checkForUpdates(); }, CONFIG.POLL_INTERVAL);
  },

  stopPolling: function () {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  checkForUpdates: function () {
    var self = this;
    if (!self.activeConvId) return;
    self.apiClient.call('getMessages', { convId: self.activeConvId }).then(function (msgs) {
      if (msgs.length !== self.messages.length) {
        self.messages = msgs || [];
        self.renderMessages();
        if (msgs.length > 0) {
          var last = msgs[msgs.length - 1];
          for (var i = 0; i < self.conversations.length; i++) {
            if (self.conversations[i].id === self.activeConvId) {
              self.conversations[i].updatedAt = last.timestamp;
              self.conversations[i].lastMessage = last.content;
              break;
            }
          }
          self.renderConversationList();
        }
      }
    }).catch(function () {});
  },

  createConversation: function () {
    var self = this;
    var input = document.getElementById('newChatName');
    var name = input.value.trim();
    if (!name) { self.toast('請輸入對話名稱', 'error'); return; }

    self.showLoading(true);
    self.apiClient.call('createConversation', { name: name }).then(function (result) {
      var now = new Date().toISOString();
      var conv = {
        id: result.convId,
        name: name,
        participants: [self.profile.email],
        createdBy: self.profile.email,
        createdAt: now,
        updatedAt: now,
        lastMessage: ''
      };
      self.conversations.unshift(conv);
      self.hideNewChatModal();
      input.value = '';
      self.renderConversationList();
      return self.selectConversation(conv.id);
    }).catch(function (e) {
      self.toast('建立失敗: ' + e.message, 'error');
    }).then(function () {
      self.showLoading(false);
    });
  },

  addParticipant: function () {
    var self = this;
    var input = document.getElementById('participantEmail');
    var email = input.value.trim();
    if (!email) { self.toast('請輸入 Email', 'error'); return; }
    if (!self.activeConvId) return;

    self.showLoading(true);
    self.apiClient.call('addParticipant', { convId: self.activeConvId, email: email }).then(function () {
      for (var i = 0; i < self.conversations.length; i++) {
        if (self.conversations[i].id === self.activeConvId) {
          if (self.conversations[i].participants.indexOf(email) === -1) {
            self.conversations[i].participants.push(email);
          }
          document.getElementById('chatParticipants').textContent = '參與者: ' + self.conversations[i].participants.join(', ');
          break;
        }
      }
      self.hideParticipantModal();
      input.value = '';
      self.toast('已新增參與者: ' + email, 'success');
      self.showLoading(false);
    }).catch(function (e) {
      self.toast('新增失敗: ' + e.message, 'error');
      self.showLoading(false);
    });
  },

  deleteConversation: function (convId) {
    var self = this;
    if (!confirm('確定刪除此對話？')) return;
    self.showLoading(true);
    self.apiClient.call('deleteConversation', { convId: convId }).then(function () {
      var newList = [];
      for (var i = 0; i < self.conversations.length; i++) {
        if (self.conversations[i].id !== convId) newList.push(self.conversations[i]);
      }
      self.conversations = newList;
      if (self.activeConvId === convId) {
        self.showEmptyState();
        self.stopPolling();
      }
      self.renderConversationList();
      self.showLoading(false);
    }).catch(function (e) {
      self.toast('刪除失敗: ' + e.message, 'error');
      self.showLoading(false);
    });
  },

  showNewChatModal: function () {
    document.getElementById('newChatModal').classList.remove('hidden');
    document.getElementById('newChatName').focus();
  },

  hideNewChatModal: function () {
    document.getElementById('newChatModal').classList.add('hidden');
    document.getElementById('newChatName').value = '';
  },

  showParticipantModal: function () {
    if (!this.activeConvId) { this.toast('請先選擇一個對話', 'error'); return; }
    document.getElementById('addParticipantModal').classList.remove('hidden');
    document.getElementById('participantEmail').focus();
  },

  hideParticipantModal: function () {
    document.getElementById('addParticipantModal').classList.add('hidden');
    document.getElementById('participantEmail').value = '';
  },

  logout: function () {
    this.stopPolling();
    this.profile = null;
    this.conversations = [];
    this.activeConvId = null;
    this.messages = [];
    localStorage.removeItem('chatapp_idtoken');
    localStorage.removeItem('chatapp_idtoken_expiry');
    this.showLogin();
  },

  toast: function (msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type || '';
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  },

  _escape: function (str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  _formatTime: function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    var date = d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
    return date + ' ' + time;
  }
};

function decodeJWT(token) {
  var base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return JSON.parse(atob(base64));
}

document.addEventListener('DOMContentLoaded', function () { App.init(); });

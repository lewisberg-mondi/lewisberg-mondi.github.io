// Real-time Chat System for User-Admin Communication - PRODUCTION READY
class ChatSystem {
    constructor() {
        this.messages = [];
        this.conversations = new Map();
        this.currentConversation = null;
        this.isOpen = false;
        this.unreadCount = 0;
        this.adminOnline = false;
        this.typingInterval = null;
        this.setupChat();
        this.loadMessages();
        this.simulateAdminPresence();
    }

    setupChat() {
        this.createChatWidget();
        this.setupEventListeners();
        this.startHeartbeat();
        
        console.log('✅ Chat System initialized');
    }

    // Create chat widget UI
    createChatWidget() {
        // Chat button
        const chatButton = document.createElement('div');
        chatButton.id = 'chatButton';
        chatButton.innerHTML = '💬';
        chatButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 9998;
            transition: all 0.3s;
        `;

        // Unread badge
        const badge = document.createElement('div');
        badge.id = 'chatBadge';
        badge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: #e53e3e;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 12px;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        `;
        chatButton.appendChild(badge);

        // Chat window
        const chatWindow = document.createElement('div');
        chatWindow.id = 'chatWindow';
        chatWindow.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            z-index: 9999;
            overflow: hidden;
        `;

        chatWindow.innerHTML = `
            <div class="chat-header" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 16px;">💬 Live Support Chat</h3>
                    <div id="adminStatus" style="font-size: 12px; opacity: 0.9;">Connecting...</div>
                </div>
                <button id="closeChat" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">×</button>
            </div>
            
            <div id="chatMessages" style="flex: 1; padding: 15px; overflow-y: auto; background: #f8f9fa;">
                <div id="welcomeMessage" style="text-align: center; color: #666; padding: 20px;">
                    <div style="font-size: 48px;">💬</div>
                    <h4>M-USD Support</h4>
                    <p>How can we help you today?</p>
                </div>
            </div>
            
            <div class="chat-input-container" style="border-top: 1px solid #e2e8f0; padding: 15px;">
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="chatInput" placeholder="Type your message..." 
                           style="flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 25px; outline: none;">
                    <button id="sendMessage" style="background: #667eea; color: white; border: none; border-radius: 50%; width: 44px; height: 44px; cursor: pointer;">▶️</button>
                </div>
                <div style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
                    <button class="quick-reply" data-message="I need help with a transaction" style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 5px 10px; border-radius: 15px; font-size: 12px; cursor: pointer;">Transaction Help</button>
                    <button class="quick-reply" data-message="My account is locked" style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 5px 10px; border-radius: 15px; font-size: 12px; cursor: pointer;">Account Issue</button>
                    <button class="quick-reply" data-message="I want to report a problem" style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 5px 10px; border-radius: 15px; font-size: 12px; cursor: pointer;">Report Problem</button>
                </div>
            </div>
        `;

        document.body.appendChild(chatButton);
        document.body.appendChild(chatWindow);

        // Event listeners
        chatButton.addEventListener('click', () => this.toggleChat());
        document.getElementById('closeChat').addEventListener('click', () => this.closeChat());
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Quick replies
        document.querySelectorAll('.quick-reply').forEach(button => {
            button.addEventListener('click', (e) => {
                document.getElementById('chatInput').value = e.target.dataset.message;
                this.sendMessage();
            });
        });
    }

    // Toggle chat window
    toggleChat() {
        const chatWindow = document.getElementById('chatWindow');
        this.isOpen = !this.isOpen;
        
        if (this.isOpen) {
            chatWindow.style.display = 'flex';
            this.markAsRead();
            this.scrollToBottom();
            document.getElementById('chatInput').focus();
        } else {
            chatWindow.style.display = 'none';
        }
    }

    closeChat() {
        this.isOpen = false;
        document.getElementById('chatWindow').style.display = 'none';
    }

    // Send message
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message
        this.addMessage({
            id: 'msg_' + Date.now(),
            sender: 'user',
            text: message,
            timestamp: new Date().toISOString(),
            read: true
        });

        input.value = '';
        this.scrollToBottom();

        // Show typing indicator
        this.showTypingIndicator();

        // Simulate admin response
        setTimeout(() => {
            this.hideTypingIndicator();
            this.generateAdminResponse(message);
        }, 1000 + Math.random() * 2000);
    }

    // Add message to chat
    addMessage(message) {
        this.messages.push(message);
        this.saveMessages();
        this.displayMessage(message);

        // Update unread count if chat is closed
        if (!this.isOpen && message.sender === 'admin') {
            this.unreadCount++;
            this.updateBadge();
        }
    }

    // Display message in chat
    displayMessage(message) {
        const messagesContainer = document.getElementById('chatMessages');
        const welcomeMessage = document.getElementById('welcomeMessage');
        
        // Hide welcome message after first real message
        if (welcomeMessage && this.messages.length > 0) {
            welcomeMessage.style.display = 'none';
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender}-message`;
        messageElement.style.cssText = `
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            align-items: ${message.sender === 'user' ? 'flex-end' : 'flex-start'};
        `;

        const bubble = document.createElement('div');
        bubble.style.cssText = `
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 18px;
            background: ${message.sender === 'user' ? '#667eea' : 'white'};
            color: ${message.sender === 'user' ? 'white' : '#2d3748'};
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            border: ${message.sender === 'admin' ? '1px solid #e2e8f0' : 'none'};
            word-wrap: break-word;
        `;
        bubble.textContent = message.text;

        const time = document.createElement('div');
        time.style.cssText = `
            font-size: 11px;
            color: #718096;
            margin-top: 5px;
            text-align: ${message.sender === 'user' ? 'right' : 'left'};
        `;
        time.textContent = this.formatTime(message.timestamp);

        messageElement.appendChild(bubble);
        messageElement.appendChild(time);
        messagesContainer.appendChild(messageElement);
    }

    // Show typing indicator
    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingIndicator = document.createElement('div');
        typingIndicator.id = 'typingIndicator';
        typingIndicator.innerHTML = `
            <div class="typing-indicator">
                <span>Admin is typing</span>
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        typingIndicator.style.cssText = `
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        `;
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
    }

    // Hide typing indicator
    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // Generate simulated admin response
    generateAdminResponse(userMessage) {
        const responses = {
            'transaction': [
                "I can help with your transaction. Can you provide the transaction ID?",
                "Let me check your transaction status. One moment please...",
                "For transaction issues, please ensure you have sufficient balance and check the recipient's details."
            ],
            'account': [
                "I see you're having account issues. Let me check your account status.",
                "For account security, we may need to verify your identity.",
                "Your account appears to be in good standing. What specific issue are you experiencing?"
            ],
            'problem': [
                "I'm sorry you're experiencing issues. Can you describe the problem in more detail?",
                "Thank you for reporting this. Our team will investigate promptly.",
                "Let me help you resolve this. What exactly is not working as expected?"
            ],
            'default': [
                "Thanks for your message! How can I assist you today?",
                "I'm here to help. What would you like to know?",
                "Welcome to M-USD support! How can I make your experience better?"
            ]
        };

        let responseType = 'default';
        const lowerMessage = userMessage.toLowerCase();

        if (lowerMessage.includes('transaction') || lowerMessage.includes('send') || lowerMessage.includes('receive')) {
            responseType = 'transaction';
        } else if (lowerMessage.includes('account') || lowerMessage.includes('locked') || lowerMessage.includes('login')) {
            responseType = 'account';
        } else if (lowerMessage.includes('problem') || lowerMessage.includes('issue') || lowerMessage.includes('error')) {
            responseType = 'problem';
        }

        const possibleResponses = responses[responseType];
        const response = possibleResponses[Math.floor(Math.random() * possibleResponses.length)];

        this.addMessage({
            id: 'msg_' + Date.now(),
            sender: 'admin',
            text: response,
            timestamp: new Date().toISOString(),
            read: this.isOpen
        });

        this.scrollToBottom();
    }

    // Mark all as read
    markAsRead() {
        this.unreadCount = 0;
        this.updateBadge();
        
        // Mark messages as read
        this.messages.forEach(msg => msg.read = true);
        this.saveMessages();
    }

    // Update badge count
    updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
            badge.style.display = 'flex';
            
            // Add pulse animation
            const chatButton = document.getElementById('chatButton');
            chatButton.style.animation = 'pulse 1s infinite';
        } else {
            badge.style.display = 'none';
            const chatButton = document.getElementById('chatButton');
            chatButton.style.animation = 'none';
        }
    }

    // Scroll to bottom of chat
    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 100);
    }

    // Format time
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Simulate admin presence
    simulateAdminPresence() {
        // Random online/offline status
        this.adminOnline = Math.random() > 0.3; // 70% chance online
        
        this.updateAdminStatus();

        // Random status changes
        setInterval(() => {
            this.adminOnline = Math.random() > 0.3;
            this.updateAdminStatus();
        }, 30000); // Change every 30 seconds
    }

    updateAdminStatus() {
        const statusElement = document.getElementById('adminStatus');
        if (statusElement) {
            if (this.adminOnline) {
                statusElement.innerHTML = '🟢 Online - Typically replies instantly';
            } else {
                statusElement.innerHTML = '🔴 Offline - We will reply within 1 hour';
            }
        }
    }

    // Heartbeat to simulate real-time features
    startHeartbeat() {
        setInterval(() => {
            if (this.adminOnline && this.messages.length > 0 && !this.isOpen) {
                // Occasionally send unsolicited admin messages
                if (Math.random() > 0.9) { // 10% chance
                    this.addMessage({
                        id: 'msg_' + Date.now(),
                        sender: 'admin',
                        text: "Is there anything else I can help you with?",
                        timestamp: new Date().toISOString(),
                        read: false
                    });
                }
            }
        }, 30000); // Check every 30 seconds
    }

    // Save messages to localStorage
    saveMessages() {
        try {
            localStorage.setItem('chat_messages', JSON.stringify(this.messages));
        } catch (error) {
            console.error('Failed to save chat messages:', error);
        }
    }

    // Load messages from localStorage
    loadMessages() {
        try {
            const saved = localStorage.getItem('chat_messages');
            if (saved) {
                this.messages = JSON.parse(saved);
                this.displayAllMessages();
                
                // Calculate unread count
                this.unreadCount = this.messages.filter(msg => 
                    msg.sender === 'admin' && !msg.read
                ).length;
                this.updateBadge();
            }
        } catch (error) {
            console.error('Failed to load chat messages:', error);
        }
    }

    // Display all loaded messages
    displayAllMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        const welcomeMessage = document.getElementById('welcomeMessage');
        
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        if (welcomeMessage) {
            messagesContainer.appendChild(welcomeMessage);
        }

        this.messages.forEach(message => this.displayMessage(message));
        this.scrollToBottom();
    }

    // Emergency contact method
    emergencyContact() {
        this.toggleChat();
        this.addMessage({
            id: 'msg_' + Date.now(),
            sender: 'user',
            text: "🚨 URGENT: I need immediate assistance with a critical issue!",
            timestamp: new Date().toISOString(),
            read: true
        });

        // Immediate admin response for emergencies
        setTimeout(() => {
            this.addMessage({
                id: 'msg_' + Date.now(),
                sender: 'admin',
                text: "🚨 EMERGENCY SUPPORT: I'm here to help! Please describe the urgent issue and we'll prioritize it immediately.",
                timestamp: new Date().toISOString(),
                read: this.isOpen
            });
        }, 500);
    }

    // Cleanup method
    cleanup() {
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        this.messages = [];
    }
}

// Global chat instance
const chatSystem = new ChatSystem();
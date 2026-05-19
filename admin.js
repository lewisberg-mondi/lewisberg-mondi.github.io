// Admin Panel Management System - PRODUCTION READY
class AdminPanel {
    constructor() {
        this.adminPassword = "admin2024"; // Default admin password
        this.isAuthenticated = false;
        this.currentSection = 'dashboard';
        this.init();
    }

    init() {
        this.checkAdminSession();
        this.setupEventListeners();
        console.log('✅ Admin Panel initialized');
    }

    setupEventListeners() {
        document.getElementById('adminPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    checkAdminSession() {
        try {
            const session = localStorage.getItem('admin_session');
            if (session && JSON.parse(session).authenticated) {
                this.isAuthenticated = true;
                this.showDashboard();
            }
        } catch (error) {
            console.error('Admin session check error:', error);
        }
    }

    login() {
        const password = document.getElementById('adminPassword').value;
        
        if (password === this.adminPassword) {
            this.isAuthenticated = true;
            localStorage.setItem('admin_session', JSON.stringify({
                authenticated: true,
                loginTime: new Date().toISOString()
            }));
            this.showDashboard();
            this.showNotification('Admin login successful', 'success');
        } else {
            this.showNotification('Invalid admin password', 'error');
        }
    }

    logout() {
        this.isAuthenticated = false;
        localStorage.removeItem('admin_session');
        this.showLogin();
        this.showNotification('Admin logged out', 'success');
    }

    showLogin() {
        this.hideAllScreens();
        document.getElementById('adminLoginScreen').classList.add('active');
        document.getElementById('adminPassword').value = '';
    }

    showDashboard() {
        this.hideAllScreens();
        document.getElementById('adminDashboard').classList.add('active');
        this.updateDashboard();
    }

    hideAllScreens() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
    }

    // Section Management
    showSection(sectionName) {
        this.currentSection = sectionName;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('.section-content').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show selected section
        const sectionElement = document.getElementById(sectionName + 'Section');
        if (sectionElement) {
            sectionElement.classList.add('active');
        }
        
        // Load section data
        this.loadSectionData(sectionName);
    }

    loadSectionData(sectionName) {
        switch(sectionName) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'users':
                this.loadUsersList();
                break;
            case 'transactions':
                this.loadAllTransactions();
                break;
            case 'system':
                this.updateSystemInfo();
                break;
        }
    }

    // Dashboard Management
    updateDashboard() {
        this.updateSystemStats();
        this.updateSystemStatus();
    }

    updateSystemStats() {
        try {
            const stats = blockchain.getSystemStats();
            
            document.getElementById('totalUsers').textContent = stats.totalUsers;
            document.getElementById('totalTransactions').textContent = stats.totalTransactions;
            document.getElementById('totalBalance').textContent = stats.totalValue.toFixed(2);
            document.getElementById('totalFees').textContent = stats.totalFees.toFixed(2);
        } catch (error) {
            console.error('Error updating system stats:', error);
        }
    }

    updateSystemStatus() {
        const statusContainer = document.getElementById('systemStatus');
        if (!statusContainer) return;

        try {
            const securityReport = enhancedSecurity.getSecurityReport();
            const aiReport = aiMonitor.getSystemReport();
            const backupStatus = backupSystem.getBackupStatus();
            
            statusContainer.innerHTML = `
                <div class="security-item">
                    <span class="status good">●</span>
                    Blockchain Height: ${blockchain.blockHeight}
                </div>
                <div class="security-item">
                    <span class="status good">●</span>
                    Users: ${blockchain.users.size} active
                </div>
                <div class="security-item">
                    <span class="status good">●</span>
                    Transactions: ${blockchain.transactions.length}
                </div>
                <div class="security-item">
                    <span class="status ${securityReport.lockedAccounts.length > 0 ? 'warning' : 'good'}">●</span>
                    Locked Accounts: ${securityReport.lockedAccounts.length}
                </div>
                <div class="security-item">
                    <span class="status good">●</span>
                    Backups: ${backupStatus.totalBackups}
                </div>
            `;
        } catch (error) {
            console.error('Error updating system status:', error);
            statusContainer.innerHTML = '<div class="security-item">Error loading status</div>';
        }
    }

    updateSystemInfo() {
        const infoContainer = document.getElementById('systemInfo');
        if (!infoContainer) return;

        try {
            const stats = blockchain.getSystemStats();
            const securityReport = enhancedSecurity.getSecurityReport();
            const aiReport = aiMonitor.getSystemReport();
            const backupStatus = backupSystem.getBackupStatus();
            
            infoContainer.innerHTML = `
                <div class="security-items">
                    <div class="security-item">
                        <span class="status good">●</span>
                        System Version: 3.0.0
                    </div>
                    <div class="security-item">
                        <span class="status good">●</span>
                        Total Users: ${stats.totalUsers}
                    </div>
                    <div class="security-item">
                        <span class="status good">●</span>
                        Total Transactions: ${stats.totalTransactions}
                    </div>
                    <div class="security-item">
                        <span class="status good">●</span>
                        Total Balance: ${stats.totalValue.toFixed(2)} USD
                    </div>
                    <div class="security-item">
                        <span class="status good">●</span>
                        Collected Fees: ${stats.totalFees.toFixed(2)} USD
                    </div>
                    <div class="security-item">
                        <span class="status good">●</span>
                        System Backups: ${backupStatus.totalBackups}
                    </div>
                    <div class="security-item">
                        <span class="status ${aiReport.errorsLast24h > 0 ? 'warning' : 'good'}">●</span>
                        AI Errors (24h): ${aiReport.errorsLast24h}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error updating system info:', error);
            infoContainer.innerHTML = '<div class="security-item">Error loading system information</div>';
        }
    }

    // User Management
    loadUsersList() {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;

        try {
            const users = Array.from(blockchain.users.values());
            
            if (users.length === 0) {
                usersList.innerHTML = '<div class="no-data">No users found</div>';
                return;
            }

            usersList.innerHTML = users.map(user => {
                const isSuspended = !user.isActive;
                const isFrozen = user.frozen || false;
                const balance = parseFloat(user.balance) || 0;
                
                return `
                    <div class="user-item ${isSuspended ? 'suspended' : ''} ${isFrozen ? 'frozen' : ''}">
                        <div class="user-info">
                            <div class="user-phone"><strong>${user.phoneNumber}</strong></div>
                            <div class="user-details">
                                Balance: ${balance.toFixed(2)} USD | 
                                Created: ${new Date(user.createdAt).toLocaleDateString()} |
                                ${isSuspended ? '🔴 SUSPENDED' : '🟢 ACTIVE'}
                                ${isFrozen ? ' | ❄️ FROZEN' : ''}
                            </div>
                            ${isSuspended ? `<div class="user-reason"><small>Reason: ${user.suspendReason || 'Not specified'}</small></div>` : ''}
                            ${isFrozen ? `<div class="user-reason"><small>Freeze Reason: ${user.freezeReason || 'Not specified'}</small></div>` : ''}
                        </div>
                        <div class="user-actions">
                            <button onclick="admin.showUserActions('${user.phoneNumber}')" class="btn small">Actions</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading users list:', error);
            usersList.innerHTML = '<div class="no-data">Error loading users</div>';
        }
    }

    searchUsers() {
        const searchTerm = document.getElementById('userSearch').value.toLowerCase();
        const usersList = document.getElementById('usersList');
        if (!usersList) return;

        try {
            const users = Array.from(blockchain.users.values());
            const filteredUsers = users.filter(user => 
                user.phoneNumber.toLowerCase().includes(searchTerm)
            );
            
            if (filteredUsers.length === 0) {
                usersList.innerHTML = '<div class="no-data">No users found</div>';
                return;
            }

            usersList.innerHTML = filteredUsers.map(user => {
                const isSuspended = !user.isActive;
                const isFrozen = user.frozen || false;
                const balance = parseFloat(user.balance) || 0;
                
                return `
                    <div class="user-item ${isSuspended ? 'suspended' : ''} ${isFrozen ? 'frozen' : ''}">
                        <div class="user-info">
                            <div class="user-phone"><strong>${user.phoneNumber}</strong></div>
                            <div class="user-details">
                                Balance: ${balance.toFixed(2)} USD | 
                                Created: ${new Date(user.createdAt).toLocaleDateString()} |
                                ${isSuspended ? '🔴 SUSPENDED' : '🟢 ACTIVE'}
                                ${isFrozen ? ' | ❄️ FROZEN' : ''}
                            </div>
                            ${isSuspended ? `<div class="user-reason"><small>Reason: ${user.suspendReason || 'Not specified'}</small></div>` : ''}
                            ${isFrozen ? `<div class="user-reason"><small>Freeze Reason: ${user.freezeReason || 'Not specified'}</small></div>` : ''}
                        </div>
                        <div class="user-actions">
                            <button onclick="admin.showUserActions('${user.phoneNumber}')" class="btn small">Actions</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error searching users:', error);
            usersList.innerHTML = '<div class="no-data">Error searching users</div>';
        }
    }

    showUserActions(phoneNumber) {
        const user = blockchain.users.get(phoneNumber);
        if (!user) return;

        const modal = document.getElementById('userActionModal');
        const modalContent = document.getElementById('modalContent');
        const modalTitle = document.getElementById('modalTitle');
        
        if (!modal || !modalContent || !modalTitle) return;

        modalTitle.textContent = `User: ${phoneNumber}`;
        
        modalContent.innerHTML = `
            <div class="user-details">
                <p><strong>Wallet Address:</strong> ${user.walletAddress}</p>
                <p><strong>Balance:</strong> ${(parseFloat(user.balance) || 0).toFixed(2)} USD</p>
                <p><strong>Status:</strong> ${user.isActive ? '🟢 Active' : '🔴 Suspended'}</p>
                <p><strong>Frozen:</strong> ${user.frozen ? '❄️ Yes' : '🟢 No'}</p>
                <p><strong>Created:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
                ${!user.isActive ? `<p><strong>Suspension Reason:</strong> ${user.suspendReason || 'Not specified'}</p>` : ''}
                ${user.frozen ? `<p><strong>Freeze Reason:</strong> ${user.freezeReason || 'Not specified'}</p>` : ''}
            </div>
            
            <div class="form-group">
                <label>Account Actions:</label>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="admin.toggleAccountStatus('${phoneNumber}')" class="btn ${user.isActive ? 'danger' : 'primary'}">
                        ${user.isActive ? 'Suspend Account' : 'Activate Account'}
                    </button>
                    <button onclick="admin.toggleFreezeAccount('${phoneNumber}')" class="btn ${user.frozen ? 'primary' : 'warning'}">
                        ${user.frozen ? 'Unfreeze Account' : 'Freeze Account'}
                    </button>
                </div>
            </div>
            
            <div class="form-group">
                <label>Transaction History:</label>
                <button onclick="admin.showUserTransactions('${phoneNumber}')" class="btn secondary small">
                    View Transactions
                </button>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    toggleAccountStatus(phoneNumber) {
        const user = blockchain.users.get(phoneNumber);
        if (!user) return;

        if (user.isActive) {
            // Suspending account
            user.isActive = false;
            user.suspendReason = 'Administrative action';
            
            this.showNotification(
                `Account suspended for ${phoneNumber}`,
                'success'
            );
        } else {
            // Activating account
            user.isActive = true;
            user.suspendReason = '';
            
            this.showNotification(
                'Account activated successfully',
                'success'
            );
        }
        
        blockchain.saveToStorage();
        this.closeModal();
        this.loadUsersList();
    }

    toggleFreezeAccount(phoneNumber) {
        const user = blockchain.users.get(phoneNumber);
        if (!user) return;

        if (!user.frozen) {
            // Freezing account
            user.frozen = true;
            user.freezeReason = 'Administrative action';
            
            this.showNotification(
                `Account frozen for ${phoneNumber}`,
                'success'
            );
        } else {
            // Unfreezing account
            user.frozen = false;
            user.freezeReason = '';
            
            this.showNotification(
                'Account unfrozen successfully',
                'success'
            );
        }
        
        blockchain.saveToStorage();
        this.closeModal();
        this.loadUsersList();
    }

    showUserTransactions(phoneNumber) {
        const transactions = blockchain.getUserTransactions(phoneNumber);
        const modalContent = document.getElementById('modalContent');
        if (!modalContent) return;
        
        if (transactions.length === 0) {
            modalContent.innerHTML = '<div class="no-data">No transactions found</div>';
            return;
        }

        modalContent.innerHTML = `
            <h3>Transaction History for ${phoneNumber}</h3>
            <div style="max-height: 300px; overflow-y: auto;">
                ${transactions.map(tx => `
                    <div class="transaction-item ${tx.from === phoneNumber ? 'send' : 'receive'}">
                        <div class="transaction-info">
                            <div><strong>${tx.type.toUpperCase()}</strong></div>
                            <div>${tx.from === phoneNumber ? 'To: ' + tx.to : 'From: ' + tx.from}</div>
                            <div>${new Date(tx.timestamp).toLocaleString()}</div>
                            ${tx.reason ? `<div><small><strong>Reason:</strong> ${tx.reason}</small></div>` : ''}
                        </div>
                        <div class="transaction-amount ${tx.from === phoneNumber ? 'negative' : 'positive'}">
                            ${tx.from === phoneNumber ? '-' : '+'}${tx.amount.toFixed(2)} USD
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="form-group">
                <button onclick="admin.closeModal()" class="btn secondary">Close</button>
            </div>
        `;
    }

    // Transactions Management
    loadAllTransactions() {
        const transactionsList = document.getElementById('allTransactionsList');
        if (!transactionsList) return;

        try {
            const transactions = blockchain.transactions.sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            
            if (transactions.length === 0) {
                transactionsList.innerHTML = '<div class="no-data">No transactions found</div>';
                return;
            }

            transactionsList.innerHTML = transactions.map(tx => {
                const isFee = tx.type === 'fee';
                const isAdmin = tx.type === 'admin_deduction';
                const borderColor = isFee ? '#ed8936' : (isAdmin ? '#e53e3e' : '#4299e1');
                
                return `
                    <div class="transaction-item" style="border-left-color: ${borderColor}">
                        <div class="transaction-info">
                            <div><strong>${tx.id}</strong></div>
                            <div>From: ${tx.from} → To: ${tx.to}</div>
                            <div>Type: ${tx.type} | ${new Date(tx.timestamp).toLocaleString()}</div>
                            ${tx.reason ? `<div><small><strong>Reason:</strong> ${tx.reason}</small></div>` : ''}
                        </div>
                        <div class="transaction-amount">
                            ${tx.amount.toFixed(2)} USD
                            ${tx.fee ? `<br><small>Fee: ${tx.fee.toFixed(2)} USD</small>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading transactions:', error);
            transactionsList.innerHTML = '<div class="no-data">Error loading transactions</div>';
        }
    }

    // System Controls
    runSecurityScan() {
        try {
            const results = enhancedSecurity.securityScan();
            this.showNotification(
                `Security scan completed. Found ${results.issues.length} issues.`,
                'success'
            );
            this.updateSystemStatus();
        } catch (error) {
            console.error('Error running security scan:', error);
            this.showNotification('Error running security scan', 'error');
        }
    }

    emergencyUnlockAll() {
        try {
            const count = enhancedSecurity.emergencyUnlockAll();
            this.showNotification(
                `Emergency unlock: ${count} accounts unlocked`,
                'success'
            );
            this.updateSystemStatus();
        } catch (error) {
            console.error('Error unlocking accounts:', error);
            this.showNotification('Error unlocking accounts', 'error');
        }
    }

    createBackup() {
        try {
            const backup = backupSystem.createBackup();
            if (backup) {
                this.showNotification('Backup created successfully', 'success');
            } else {
                this.showNotification('Backup creation failed', 'error');
            }
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showNotification('Error creating backup', 'error');
        }
    }

    clearAllData() {
        if (confirm('⚠️ ARE YOU SURE? This will delete ALL data including users and transactions!')) {
            try {
                database.clearAllData();
                localStorage.clear();
                this.showNotification('All data cleared successfully', 'success');
                setTimeout(() => {
                    location.reload();
                }, 2000);
            } catch (error) {
                console.error('Error clearing data:', error);
                this.showNotification('Error clearing data', 'error');
            }
        }
    }

    closeModal() {
        const modal = document.getElementById('userActionModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.classList.remove('success', 'error', 'warning');
            notification.style.display = 'none';
        }, 3000);
    }
}

// Global admin instance
const admin = new AdminPanel();

// Global functions for HTML
function adminLogin() { admin.login(); }
function adminLogout() { admin.logout(); }
function showSection(section) { admin.showSection(section); }
function searchUsers() { admin.searchUsers(); }
function closeModal() { admin.closeModal(); }
function runSecurityScan() { admin.runSecurityScan(); }
function emergencyUnlockAll() { admin.emergencyUnlockAll(); }
function clearAllData() { admin.clearAllData(); }
function createBackup() { admin.createBackup(); }
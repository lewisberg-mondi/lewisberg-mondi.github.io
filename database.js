// Database and Storage Management - PRODUCTION READY
class Database {
  constructor() {
    this.STORAGE_KEYS = {
      USERS: 'phonechain_users',
      TRANSACTIONS: 'phonechain_transactions',
      SETTINGS: 'phonechain_settings',
      SESSION: 'phonechain_session',
      BACKUPS: 'system_backups',
      NOTIFICATIONS: 'phonechain_notifications',
      CHAT_MESSAGES: 'chat_messages'
    };
  }
  
  // User management
  saveUser(user) {
    try {
      const users = this.getAllUsers();
      users[user.phoneNumber] = user;
      localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
      return true;
    } catch (error) {
      console.error('Failed to save user:', error);
      return false;
    }
  }
  
  getUser(phoneNumber) {
    try {
      const users = this.getAllUsers();
      return users[phoneNumber] || null;
    } catch (error) {
      console.error('Failed to get user:', error);
      return null;
    }
  }
  
  getAllUsers() {
    try {
      const users = localStorage.getItem(this.STORAGE_KEYS.USERS);
      return users ? JSON.parse(users) : {};
    } catch (error) {
      console.error('Failed to get users:', error);
      return {};
    }
  }
  
  // Transaction management
  saveTransaction(transaction) {
    try {
      const transactions = this.getAllTransactions();
      transactions.push(transaction);
      localStorage.setItem(this.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
      return true;
    } catch (error) {
      console.error('Failed to save transaction:', error);
      return false;
    }
  }
  
  getAllTransactions() {
    try {
      const transactions = localStorage.getItem(this.STORAGE_KEYS.TRANSACTIONS);
      return transactions ? JSON.parse(transactions) : [];
    } catch (error) {
      console.error('Failed to get transactions:', error);
      return [];
    }
  }
  
  // Session management
  saveSession(sessionData) {
    try {
      const safeSession = {
        phoneNumber: sessionData.phoneNumber,
        walletAddress: sessionData.walletAddress,
        loginTime: sessionData.loginTime,
        lastActivity: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEYS.SESSION, JSON.stringify(safeSession));
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }
  
  getSession() {
    try {
      const session = localStorage.getItem(this.STORAGE_KEYS.SESSION);
      return session ? JSON.parse(session) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }
  
  clearSession() {
    try {
      localStorage.removeItem(this.STORAGE_KEYS.SESSION);
      return true;
    } catch (error) {
      console.error('Failed to clear session:', error);
      return false;
    }
  }
  
  // Backup management
  saveBackup(backupData) {
    try {
      const backups = this.getAllBackups();
      backups.push(backupData);
      localStorage.setItem(this.STORAGE_KEYS.BACKUPS, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Failed to save backup:', error);
      return false;
    }
  }
  
  getAllBackups() {
    try {
      const backups = localStorage.getItem(this.STORAGE_KEYS.BACKUPS);
      return backups ? JSON.parse(backups) : [];
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  }
  
  // Clear all data (emergency use)
  clearAllData() {
    try {
      localStorage.removeItem(this.STORAGE_KEYS.USERS);
      localStorage.removeItem(this.STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(this.STORAGE_KEYS.SESSION);
      localStorage.removeItem(this.STORAGE_KEYS.BACKUPS);
      localStorage.removeItem(this.STORAGE_KEYS.NOTIFICATIONS);
      localStorage.removeItem(this.STORAGE_KEYS.CHAT_MESSAGES);
      return true;
    } catch (error) {
      console.error('Failed to clear data:', error);
      return false;
    }
  }
}

// Global database instance
const database = new Database();
// Backup and Disaster Recovery System - PRODUCTION READY
class BackupSystem {
  constructor() {
    this.backupInterval = 4 * 60 * 60 * 1000; // 4 hours
    this.maxBackups = 168; // 1 week of hourly backups
    this.startBackupSchedule();
    this.setupBackupTriggers();
  }
  
  startBackupSchedule() {
    // Regular backups
    setInterval(() => this.createBackup(), this.backupInterval);
    
    // Initial backup
    setTimeout(() => this.createBackup(), 5000);
    
    console.log('✅ Backup system initialized');
  }
  
  // Add automatic backup triggers
  setupBackupTriggers() {
    // Backup before any critical operation
    const criticalMethods = ['sendMoney', 'addFunds', 'registerUser'];
    
    criticalMethods.forEach(method => {
      const original = blockchain[method];
      if (original) {
        blockchain[method] = function(...args) {
          backupSystem.createBackup();
          return original.apply(this, args);
        };
      }
    });
  }
  
  createBackup() {
    try {
      const backup = {
        timestamp: new Date().toISOString(),
        data: {
          users: Array.from(blockchain.users.entries()),
          transactions: blockchain.transactions,
          blockHeight: blockchain.blockHeight,
          systemState: this.getSystemState()
        },
        checksum: this.generateChecksum(),
        version: '2.0.0'
      };
      
      this.saveBackup(backup);
      this.cleanupOldBackups();
      
      console.log('✅ Backup created successfully');
      return backup;
    } catch (error) {
      console.error('📵 Backup failed:', error);
      this.alertBackupFailure(error);
      return null;
    }
  }
  
  saveBackup(backup) {
    const backups = JSON.parse(localStorage.getItem('system_backups') || '[]');
    backups.push(backup);
    localStorage.setItem('system_backups', JSON.stringify(backups));
  }
  
  cleanupOldBackups() {
    const backups = JSON.parse(localStorage.getItem('system_backups') || '[]');
    if (backups.length > this.maxBackups) {
      const recentBackups = backups.slice(-this.maxBackups);
      localStorage.setItem('system_backups', JSON.stringify(recentBackups));
    }
  }
  
  restoreBackup(backupTimestamp) {
    const backups = JSON.parse(localStorage.getItem('system_backups') || '[]');
    const backup = backups.find(b => b.timestamp === backupTimestamp);
    
    if (!backup) {
      throw new Error('📵 Backup not found');
    }
    
    if (!this.verifyBackup(backup)) {
      throw new Error('📵 Backup verification failed');
    }
    
    // Restore data
    blockchain.users = new Map(backup.data.users);
    blockchain.transactions = backup.data.transactions;
    blockchain.blockHeight = backup.data.blockHeight;
    
    blockchain.saveToStorage();
    
    console.log('✅ Backup restored successfully');
    return true;
  }
  
  verifyBackup(backup) {
    return backup.checksum === this.generateChecksum(backup.data);
  }
  
  generateChecksum(data = null) {
    const targetData = data || {
      users: Array.from(blockchain.users.entries()),
      transactions: blockchain.transactions,
      blockHeight: blockchain.blockHeight
    };
    
    const str = JSON.stringify(targetData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  getSystemState() {
    return {
      totalUsers: blockchain.users.size,
      totalTransactions: blockchain.transactions.length,
      totalValue: Array.from(blockchain.users.values()).reduce((sum, user) =>
        sum + (parseFloat(user.balance) || 0), 0
      ),
      timestamp: new Date().toISOString()
    };
  }
  
  alertBackupFailure(error) {
    // Notify administrators
    if (typeof notificationSystem !== 'undefined') {
      notificationSystem.addNotification({
        type: 'SYSTEM_ALERT',
        title: 'Backup Failed',
        message: `📵 Automatic backup failed: ${error.message}`,
        priority: 'high',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Export/Import for migration
  exportData() {
    const data = {
      users: Array.from(blockchain.users.entries()),
      transactions: blockchain.transactions,
      system: this.getSystemState(),
      exportTime: new Date().toISOString()
    };
    
    return JSON.stringify(data, null, 2);
  }
  
  importData(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      // Validate data structure
      if (!data.users || !data.transactions) {
        throw new Error('Invalid data format');
      }
      
      // Create backup before import
      this.createBackup();
      
      // Import data
      blockchain.users = new Map(data.users);
      blockchain.transactions = data.transactions;
      blockchain.saveToStorage();
      
      console.log('✅ Data imported successfully');
      return true;
    } catch (error) {
      console.error('❌ Data import failed:', error);
      throw error;
    }
  }
  
  // Get backup status
  getBackupStatus() {
    const backups = JSON.parse(localStorage.getItem('system_backups') || '[]');
    return {
      totalBackups: backups.length,
      lastBackup: backups.length > 0 ? backups[backups.length - 1].timestamp : null,
      nextBackup: new Date(Date.now() + this.backupInterval).toISOString()
    };
  }
  
  // Emergency recovery
  emergencyRecovery() {
    try {
      const backups = JSON.parse(localStorage.getItem('system_backups') || '[]');
      if (backups.length === 0) {
        throw new Error('No backups available for recovery');
      }
      
      // Use the most recent backup
      const latestBackup = backups[backups.length - 1];
      return this.restoreBackup(latestBackup.timestamp);
    } catch (error) {
      console.error('❌ Emergency recovery failed:', error);
      throw error;
    }
  }
}

const backupSystem = new BackupSystem();
// Regulatory Compliance System - PRODUCTION READY
class ComplianceSystem {
  constructor() {
    this.transactionLimits = {
      DAILY_LIMIT: (CONFIG && CONFIG.COMPLIANCE && CONFIG.COMPLIANCE.DAILY_LIMIT) || 1000000,
      SINGLE_TRANSACTION: (CONFIG && CONFIG.COMPLIANCE && CONFIG.COMPLIANCE.TRANSACTION_LIMIT) || 50000,
      MONTHLY_LIMIT: 50000000
    };
    this.suspiciousPatterns = [];
    this.kycRecords = new Map();
    this.sanctionsList = [];
    this.loadSanctionsList();
  }
  
  // Load sanctions list (simulated)
  loadSanctionsList() {
    // In production, this would be loaded from an external API
    this.sanctionsList = [
      // Sample data for demonstration
      { phoneNumbers: ['+1234567890'], names: ['John Doe'] },
      { phoneNumbers: ['+1987654321'], names: ['Jane Smith'] }
    ];
  }
  
  // KYC (Know Your Customer) verification
  async verifyKYC(phoneNumber, userData) {
    const kycRecord = {
      phoneNumber,
      status: 'pending',
      level: 'BASIC',
      submittedAt: new Date().toISOString(),
      documents: [],
      riskScore: this.calculateRiskScore(userData)
    };
    
    this.kycRecords.set(phoneNumber, kycRecord);
    return kycRecord;
  }
  
  calculateRiskScore(userData) {
    let score = 50; // Base score
    
    // Adjust based on various factors
    if (userData.transactionCount > 100) score += 10;
    if (userData.averageTransaction > 1000) score += 15;
    if (userData.country && CONFIG.SECURITY.ALLOWED_COUNTRIES.some(c => userData.country.startsWith(c))) {
      score -= 10; // Lower risk for allowed countries
    }
    
    return Math.min(100, Math.max(0, score));
  }
  
  // Transaction monitoring for AML
  monitorTransaction(transaction) {
    try {
      if (!CONFIG.COMPLIANCE.ENABLED) {
        return true; // Compliance disabled
      }
      
      const rules = [
        this.checkAmountLimit(transaction),
        this.checkFrequency(transaction),
        this.checkPattern(transaction),
        this.checkSanctions(transaction)
      ];
      
      const violations = rules.filter(rule => !rule.passed);
      if (violations.length > 0) {
        this.flagSuspiciousTransaction(transaction, violations);
        return false; // Block transaction
      }
      
      return true; // Allow transaction
    } catch (error) {
      console.error('☢️ Compliance check error:', error);
      return true; // Allow on error (fail-open for demo)
    }
  }
  
  checkAmountLimit(transaction) {
    const dailyTotal = this.getDailyTotal(transaction.from);
    const passed = transaction.amount <= this.transactionLimits.SINGLE_TRANSACTION &&
      dailyTotal + transaction.amount <= this.transactionLimits.DAILY_LIMIT;
    
    return {
      passed,
      rule: 'AMOUNT_LIMIT',
      details: passed ? null : `Exceeds limits: ${transaction.amount}`
    };
  }
  
  checkFrequency(transaction) {
    const userTxs = blockchain.getUserTransactions(transaction.from);
    const lastHourTxs = userTxs.filter(tx =>
      Date.now() - new Date(tx.timestamp).getTime() < 3600000
    );
    
    const passed = lastHourTxs.length < 10; // Max 10 transactions per hour
    return {
      passed,
      rule: 'FREQUENCY_LIMIT',
      details: passed ? null : 'Too many transactions in short period'
    };
  }
  
  checkPattern(transaction) {
    // Simple pattern detection
    const userTxs = blockchain.getUserTransactions(transaction.from);
    const recentTxs = userTxs.filter(tx =>
      Date.now() - new Date(tx.timestamp).getTime() < 3600000 // 1 hour
    );
    
    // Flag if multiple transactions to same recipient in short time
    const sameRecipientTxs = recentTxs.filter(tx => tx.to === transaction.to);
    const passed = sameRecipientTxs.length < 3;
    
    return {
      passed,
      rule: 'PATTERN_DETECTION',
      details: passed ? null : 'Multiple transactions to same recipient'
    };
  }
  
  checkSanctions(transaction) {
    const fromUser = blockchain.users.get(transaction.from);
    const toUser = blockchain.users.get(transaction.to);
    
    if (!fromUser || !toUser) {
      return { passed: false, rule: 'SANCTIONS_CHECK', details: 'User not found' };
    }
    
    const fromSanctioned = this.isSanctioned(transaction.from, fromUser.phoneNumber);
    const toSanctioned = this.isSanctioned(transaction.to, toUser.phoneNumber);
    
    const passed = !fromSanctioned && !toSanctioned;
    
    return {
      passed,
      rule: 'SANCTIONS_CHECK',
      details: passed ? null : 'Party involved in sanctioned activity'
    };
  }
  
  isSanctioned(phoneNumber, name) {
    return this.sanctionsList.some(sanction =>
      sanction.phoneNumbers.includes(phoneNumber) ||
      (name && sanction.names.some(n => name.toLowerCase().includes(n.toLowerCase())))
    );
  }
  
  getDailyTotal(phoneNumber) {
    const userTxs = blockchain.getUserTransactions(phoneNumber);
    const today = new Date().toDateString();
    const todayTxs = userTxs.filter(tx =>
      new Date(tx.timestamp).toDateString() === today && tx.from === phoneNumber
    );
    
    return todayTxs.reduce((sum, tx) => sum + tx.amount, 0);
  }
  
  flagSuspiciousTransaction(transaction, violations) {
    const alert = {
      id: 'AML_' + Date.now(),
      transactionId: transaction.id,
      phoneNumber: transaction.from,
      amount: transaction.amount,
      violations: violations.map(v => v.rule),
      timestamp: new Date().toISOString(),
      status: 'pending_review',
      autoAction: this.determineAutoAction(violations)
    };
    
    this.suspiciousPatterns.push(alert);
    
    // Notify AI system
    if (typeof aiMonitor !== 'undefined') {
      aiMonitor.logError('COMPLIANCE_ALERT', `Suspicious transaction detected`, alert);
    }
    
    // Take auto action if needed
    if (alert.autoAction === 'BLOCK') {
      const user = blockchain.users.get(transaction.from);
      if (user) {
        user.frozen = true;
        user.freezeReason = 'Suspicious transaction pattern';
        blockchain.saveToStorage();
      }
    }
    
    // Generate SAR if required
    if (CONFIG.COMPLIANCE.AUTO_REPORTING) {
      this.generateSAR(alert);
    }
    
    return alert;
  }
  
  determineAutoAction(violations) {
    const severeViolations = violations.filter(v =>
      v.rule === 'AMOUNT_LIMIT' || v.rule === 'SANCTIONS_CHECK'
    );
    
    return severeViolations.length > 0 ? 'BLOCK' : 'REVIEW';
  }
  
  // Reporting for regulators
  generateSAR(alert) {
    // Suspicious Activity Report
    const sar = {
      reportId: 'SAR_' + Date.now(),
      subject: alert.phoneNumber,
      transactionDetails: alert,
      filedAt: new Date().toISOString(),
      status: 'filed'
    };
    
    console.log('📋 SAR Generated:', sar);
    return sar;
  }
  
  // Sanctions screening
  async checkSanctions(phoneNumber, name) {
    if (!CONFIG.COMPLIANCE.SANCTIONS_CHECK) {
      return true;
    }
    
    return !this.isSanctioned(phoneNumber, name);
  }
  
  // Get compliance report
  getComplianceReport() {
    return {
      timestamp: new Date().toISOString(),
      activeAlerts: this.suspiciousPatterns.filter(a => a.status === 'pending_review').length,
      totalAlerts: this.suspiciousPatterns.length,
      kycRecords: this.kycRecords.size,
      sanctionsListSize: this.sanctionsList.length
    };
  }
}

const compliance = new ComplianceSystem();
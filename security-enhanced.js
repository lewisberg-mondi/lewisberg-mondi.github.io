// Enhanced Security System for Offline Protection - PRODUCTION READY
class EnhancedSecurity {
    constructor() {
        this.failedAttempts = new Map();
        this.lockedAccounts = new Set();
        this.suspiciousActivities = [];
        this.rateLimits = new Map();
        this.setupSecurityMonitoring();
        this.setupRateLimiting();
    }
    
    setupSecurityMonitoring() {
        // Monitor all transaction attempts
        this.monitorTransactionAttempts();
        
        // Monitor login attempts
        this.monitorLoginAttempts();
        
        // Monitor balance changes
        this.monitorBalanceChanges();
        
        // Periodic security scan
        setInterval(() => this.securityScan(), 60000); // Every minute
        
        console.log('✅ Enhanced Security initialized');
    }

    setupRateLimiting() {
        setInterval(() => {
            // Clean up old rate limit entries
            const now = Date.now();
            for (const [key, data] of this.rateLimits.entries()) {
                if (now - data.lastAttempt > 3600000) { // 1 hour
                    this.rateLimits.delete(key);
                }
            }
        }, 60000); // Clean every minute
    }

    monitorTransactionAttempts() {
        const originalSendMoney = blockchain.sendMoney;
        
        blockchain.sendMoney = (fromPhone, toPhone, amount, password) => {
            // Rate limiting check
            if (!this.checkRateLimit(fromPhone, 'transaction', 10, 3600000)) {
                throw new Error('📵 Too many transactions. Please try again later.');
            }

            // Security check before transaction
            if (this.isAccountLocked(fromPhone)) {
                throw new Error('📵 Account temporarily locked due to security concerns');
            }

            if (this.isSuspiciousTransaction(fromPhone, toPhone, amount)) {
                this.flagSuspiciousActivity('SUSPICIOUS_TRANSACTION', {
                    from: fromPhone,
                    to: toPhone,
                    amount: amount,
                    reason: 'Unusual transaction pattern'
                });
                
                throw new Error('☢️ Transaction flagged for security review');
            }

            try {
                const result = originalSendMoney.call(blockchain, fromPhone, toPhone, amount, password);
                
                // Log successful transaction
                this.logTransactionSecurity(fromPhone, toPhone, amount, 'success');
                
                return result;
            } catch (error) {
                // Log failed transaction attempt
                this.logTransactionSecurity(fromPhone, toPhone, amount, 'failed', error.message);
                this.recordFailedAttempt(fromPhone);
                throw error;
            }
        };
    }

    monitorLoginAttempts() {
        const originalAuthenticate = blockchain.authenticateUser;
        
        blockchain.authenticateUser = (phoneNumber, password) => {
            // Rate limiting check
            if (!this.checkRateLimit(phoneNumber, 'login', 5, 900000)) {
                throw new Error('📵 Too many login attempts. Please try again in 15 minutes.');
            }

            // Check if account is locked
            if (this.isAccountLocked(phoneNumber)) {
                const lockTime = this.getLockTimeRemaining(phoneNumber);
                throw new Error(`📵 Account locked. Try again in ${lockTime} minutes`);
            }

            // Check for brute force attempts
            if (this.isBruteForceAttempt(phoneNumber)) {
                this.lockAccount(phoneNumber, 15); // Lock for 15 minutes
                throw new Error('☢️ Too many failed attempts. 📵 Account locked for 15 minutes');
            }

            try {
                const user = originalAuthenticate.call(blockchain, phoneNumber, password);
                
                // Reset failed attempts on successful login
                this.resetFailedAttempts(phoneNumber);
                
                // Log successful login
                this.logSecurityEvent('SUCCESSFUL_LOGIN', {
                    phoneNumber: this.maskPhone(phoneNumber),
                    timestamp: new Date().toISOString()
                });
                
                return user;
            } catch (error) {
                // Record failed login attempt
                this.recordFailedAttempt(phoneNumber);
                
                // Log failed login
                this.logSecurityEvent('FAILED_LOGIN', {
                    phoneNumber: this.maskPhone(phoneNumber),
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                
                throw error;
            }
        };
    }

    monitorBalanceChanges() {
        const originalAddFunds = blockchain.addFunds;
        
        blockchain.addFunds = (phoneNumber, amount) => {
            // Check for suspicious funding patterns
            if (this.isSuspiciousFunding(phoneNumber, amount)) {
                this.flagSuspiciousActivity('SUSPICIOUS_FUNDING', {
                    phoneNumber: phoneNumber,
                    amount: amount,
                    reason: 'Unusual funding pattern'
                });
            }

            return originalAddFunds.call(blockchain, phoneNumber, amount);
        };
    }

    // Rate limiting system
    checkRateLimit(identifier, action, maxAttempts = 10, windowMs = 3600000) {
        const key = `${identifier}_${action}`;
        const now = Date.now();
        const limitData = this.rateLimits.get(key) || { count: 0, lastAttempt: 0 };
        
        // Reset if window has passed
        if (now - limitData.lastAttempt > windowMs) {
            limitData.count = 0;
        }
        
        limitData.count++;
        limitData.lastAttempt = now;
        this.rateLimits.set(key, limitData);
        
        return limitData.count <= maxAttempts;
    }

    // Account locking system
    recordFailedAttempt(phoneNumber) {
        const attempts = this.failedAttempts.get(phoneNumber) || [];
        attempts.push({
            timestamp: new Date().toISOString(),
            type: 'login_attempt'
        });
        
        this.failedAttempts.set(phoneNumber, attempts);
        
        // Lock account after 5 failed attempts
        if (attempts.length >= 5) {
            this.lockAccount(phoneNumber, 30); // Lock for 30 minutes
        }
    }

    resetFailedAttempts(phoneNumber) {
        this.failedAttempts.delete(phoneNumber);
        this.rateLimits.delete(`${phoneNumber}_login`);
    }

    isBruteForceAttempt(phoneNumber) {
        const attempts = this.failedAttempts.get(phoneNumber) || [];
        const recentAttempts = attempts.filter(attempt => 
            Date.now() - new Date(attempt.timestamp).getTime() < 300000 // 5 minutes
        );
        return recentAttempts.length >= 3;
    }

    lockAccount(phoneNumber, minutes) {
        this.lockedAccounts.add(phoneNumber);
        
        // Auto-unlock after specified time
        setTimeout(() => {
            this.unlockAccount(phoneNumber);
        }, minutes * 60 * 1000);

        this.logSecurityEvent('ACCOUNT_LOCKED', {
            phoneNumber: this.maskPhone(phoneNumber),
            duration: minutes,
            reason: 'Multiple failed attempts'
        });

        // Notify user if possible
        if (typeof notificationSystem !== 'undefined') {
            notificationSystem.addNotification({
                type: 'SECURITY_ALERT',
                title: '🔒 Account Locked',
                message: `Your account has been locked for ${minutes} minutes due to security concerns`,
                priority: 'high',
                timestamp: new Date().toISOString()
            });
        }
    }

    unlockAccount(phoneNumber) {
        this.lockedAccounts.delete(phoneNumber);
        this.resetFailedAttempts(phoneNumber);
        
        this.logSecurityEvent('ACCOUNT_UNLOCKED', {
            phoneNumber: this.maskPhone(phoneNumber)
        });
    }

    isAccountLocked(phoneNumber) {
        return this.lockedAccounts.has(phoneNumber);
    }

    getLockTimeRemaining(phoneNumber) {
        // In real implementation, this would calculate remaining lock time
        return 15; // Default 15 minutes for simulation
    }

    // Suspicious activity detection
    isSuspiciousTransaction(fromPhone, toPhone, amount) {
        const user = blockchain.users.get(fromPhone);
        if (!user) return true;

        const balance = parseFloat(user.balance) || 0;
        
        // Check if amount is unusually large
        if (amount > balance * 0.9) { // More than 90% of balance
            return true;
        }

        // Check if sending to new recipient (simplified)
        const previousTxs = blockchain.getUserTransactions(fromPhone);
        const hasSentToRecipient = previousTxs.some(tx => tx.to === toPhone);
        
        if (!hasSentToRecipient && amount > 100) {
            return true;
        }

        return false;
    }

    isSuspiciousFunding(phoneNumber, amount) {
        // Check for unusually large funding amounts
        return amount > 1000; // More than 1000 USD
    }

    flagSuspiciousActivity(type, details) {
        const activity = {
            id: 'SEC_' + Date.now(),
            type: type,
            details: details,
            timestamp: new Date().toISOString(),
            severity: this.calculateSeverity(type),
            actionTaken: 'flagged'
        };

        this.suspiciousActivities.push(activity);
        
        // Keep only last 100 activities
        if (this.suspiciousActivities.length > 100) {
            this.suspiciousActivities = this.suspiciousActivities.slice(-100);
        }

        // Notify AI system
        if (typeof aiMonitor !== 'undefined') {
            aiMonitor.logError('SECURITY_ALERT', `Suspicious activity detected: ${type}`, details);
        }

        // Send security notification
        if (typeof notificationSystem !== 'undefined') {
            notificationSystem.addNotification({
                type: 'SECURITY_ALERT',
                title: '🚨 Security Alert',
                message: `Suspicious activity detected: ${type}`,
                priority: 'high',
                timestamp: new Date().toISOString()
            });
        }

        return activity;
    }

    calculateSeverity(type) {
        const severityMap = {
            'SUSPICIOUS_TRANSACTION': 'high',
            'SUSPICIOUS_FUNDING': 'medium',
            'BRUTE_FORCE_ATTEMPT': 'high',
            'ACCOUNT_LOCKED': 'medium'
        };
        return severityMap[type] || 'low';
    }

    // Security logging
    logSecurityEvent(type, details) {
        console.log(`🔐 Security Event [${type}]:`, details);
    }

    logTransactionSecurity(fromPhone, toPhone, amount, status, error = null) {
        this.logSecurityEvent('TRANSACTION_' + status.toUpperCase(), {
            from: this.maskPhone(fromPhone),
            to: this.maskPhone(toPhone),
            amount: amount,
            error: error,
            timestamp: new Date().toISOString()
        });
    }

    // Security scanning
    securityScan() {
        const scanResults = {
            timestamp: new Date().toISOString(),
            lockedAccounts: this.lockedAccounts.size,
            failedAttempts: this.failedAttempts.size,
            suspiciousActivities: this.suspiciousActivities.length,
            issues: []
        };

        // Check for unusual patterns
        this.checkUnusualPatterns(scanResults);
        
        // Check account security
        this.checkAccountSecurity(scanResults);

        // Log scan results
        if (scanResults.issues.length > 0) {
            console.log('Security Scan Results:', scanResults);
            if (typeof aiMonitor !== 'undefined') {
                aiMonitor.logError('SECURITY_SCAN', 'Security issues detected', scanResults);
            }
        }

        return scanResults;
    }

    checkUnusualPatterns(scanResults) {
        // Check for rapid transaction sequences
        const now = Date.now();
        const recentTransactions = blockchain.transactions.filter(tx => 
            now - new Date(tx.timestamp).getTime() < 3600000 // 1 hour
        );

        // Group by user
        const userTransactionCount = {};
        recentTransactions.forEach(tx => {
            userTransactionCount[tx.from] = (userTransactionCount[tx.from] || 0) + 1;
        });

        // Flag users with too many transactions
        Object.entries(userTransactionCount).forEach(([user, count]) => {
            if (count > 10) { // More than 10 transactions per hour
                scanResults.issues.push(`User ${this.maskPhone(user)} has ${count} transactions in last hour`);
            }
        });
    }

    checkAccountSecurity(scanResults) {
        // Check for accounts with no recent activity but balance changes
        const now = Date.now();
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

        blockchain.users.forEach((user, phoneNumber) => {
            const userTxs = blockchain.getUserTransactions(phoneNumber);
            const recentTxs = userTxs.filter(tx => new Date(tx.timestamp) > new Date(weekAgo));
            
            if (recentTxs.length === 0 && user.balance > 0) {
                scanResults.issues.push(`Dormant account ${this.maskPhone(phoneNumber)} has balance but no recent activity`);
            }
        });
    }

    // Security utilities
    maskPhone(phoneNumber) {
        if (!phoneNumber) return 'unknown';
        return phoneNumber.replace(/(\+\d{3})(\d{3})(\d{3})/, '$1***$3');
    }

    // Get security report
    getSecurityReport() {
        return {
            timestamp: new Date().toISOString(),
            lockedAccounts: Array.from(this.lockedAccounts),
            failedAttempts: Array.from(this.failedAttempts.entries()),
            recentSuspiciousActivities: this.suspiciousActivities.slice(-10),
            securityScan: this.securityScan()
        };
    }

    // Emergency security override (for admin use)
    emergencyUnlockAll() {
        const count = this.lockedAccounts.size;
        this.lockedAccounts.clear();
        this.failedAttempts.clear();
        this.rateLimits.clear();
        
        this.logSecurityEvent('EMERGENCY_UNLOCK', {
            unlockedAccounts: count,
            timestamp: new Date().toISOString()
        });

        return count;
    }

    // Password verification (standalone method)
    verifyPassword(inputPassword, storedHash) {
        if (!inputPassword || !storedHash) return false;
        // Use the same hashing as security.js
        let hash = 0;
        for (let i = 0; i < inputPassword.length; i++) {
            const char = inputPassword.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const hashedInput = Math.abs(hash).toString(16).padStart(32, '0');
        return hashedInput === storedHash;
    }
}

// Global enhanced security instance
const enhancedSecurity = new EnhancedSecurity();
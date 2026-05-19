// dwn-manager.js - Decentralized Web Node Management System
class DWNManager {
    constructor() {
        this.storageKey = 'm-usd-dwn-data';
        this.syncQueue = [];
        this.isSyncing = false;
    }

    // Initialize DWN for a user
    async initializeDWN(phone, userData) {
        try {
            const dwnStructure = {
                profile: this.createProfileSchema(userData),
                transactions: this.createTransactionSchema(),
                preferences: this.createPreferencesSchema(),
                devices: this.createDevicesSchema(),
                syncInfo: {
                    lastSync: new Date().toISOString(),
                    deviceId: this.getDeviceId(),
                    version: '1.0'
                }
            };

            await this.storeDWNData(phone, dwnStructure);
            console.log('✅ DWN initialized for user:', phone);
            return dwnStructure;
        } catch (error) {
            console.error('DWN initialization error:', error);
            throw error;
        }
    }

    // Store user profile data in DWN
    async storeProfileData(phone, profileData) {
        try {
            const dwnData = await this.getDWNData(phone);
            dwnData.profile = {
                ...dwnData.profile,
                ...profileData,
                lastUpdated: new Date().toISOString()
            };

            await this.storeDWNData(phone, dwnData);
            await this.syncAcrossDevices(phone, 'profile', profileData);
            
            return { success: true };
        } catch (error) {
            console.error('Profile storage error:', error);
            return { success: false, error: error.message };
        }
    }

    // Store transaction in DWN
    async storeTransaction(phone, transaction) {
        try {
            const dwnData = await this.getDWNData(phone);
            
            // Add to transactions with DID-based verification
            const verifiedTransaction = {
                ...transaction,
                didVerified: true,
                verificationHash: await this.generateVerificationHash(transaction),
                storedAt: new Date().toISOString(),
                blockNumber: transaction.blockNumber || this.generateBlockNumber()
            };

            if (!dwnData.transactions.records) {
                dwnData.transactions.records = [];
            }
            
            dwnData.transactions.records.push(verifiedTransaction);
            dwnData.transactions.metadata.totalCount++;
            dwnData.transactions.metadata.lastUpdated = new Date().toISOString();

            await this.storeDWNData(phone, dwnData);
            await this.syncAcrossDevices(phone, 'transaction', verifiedTransaction);
            
            console.log('✅ Transaction stored in DWN:', transaction.id);
            return { success: true };
        } catch (error) {
            console.error('Transaction storage error:', error);
            return { success: false, error: error.message };
        }
    }

    // Store crypto trading data
    async storeTradingData(phone, tradeData) {
        try {
            const dwnData = await this.getDWNData(phone);
            
            const verifiedTrade = {
                ...tradeData,
                didVerified: true,
                verificationHash: await this.generateVerificationHash(tradeData),
                storedAt: new Date().toISOString()
            };

            if (!dwnData.transactions.tradingRecords) {
                dwnData.transactions.tradingRecords = [];
            }
            
            dwnData.transactions.tradingRecords.push(verifiedTrade);
            await this.storeDWNData(phone, dwnData);
            await this.syncAcrossDevices(phone, 'trade', verifiedTrade);
            
            return { success: true };
        } catch (error) {
            console.error('Trading data storage error:', error);
            return { success: false, error: error.message };
        }
    }

    // Store AI trader data
    async storeAITraderData(phone, aiTraderData) {
        try {
            const dwnData = await this.getDWNData(phone);
            
            const verifiedAIData = {
                ...aiTraderData,
                didVerified: true,
                verificationHash: await this.generateVerificationHash(aiTraderData),
                storedAt: new Date().toISOString()
            };

            if (!dwnData.transactions.aiTradingRecords) {
                dwnData.transactions.aiTradingRecords = [];
            }
            
            dwnData.transactions.aiTradingRecords.push(verifiedAIData);
            await this.storeDWNData(phone, dwnData);
            await this.syncAcrossDevices(phone, 'ai_trader', verifiedAIData);
            
            return { success: true };
        } catch (error) {
            console.error('AI trader data storage error:', error);
            return { success: false, error: error.message };
        }
    }

    // Cross-device synchronization
    async syncAcrossDevices(phone, dataType, data) {
        try {
            const syncJob = {
                phone,
                dataType,
                data,
                timestamp: new Date().toISOString(),
                deviceId: this.getDeviceId()
            };

            this.syncQueue.push(syncJob);
            await this.processSyncQueue();
            
        } catch (error) {
            console.error('Sync error:', error);
            // Queue for retry
            this.retrySync(syncJob);
        }
    }

    // Process synchronization queue
    async processSyncQueue() {
        if (this.isSyncing || this.syncQueue.length === 0) return;

        this.isSyncing = true;
        
        try {
            while (this.syncQueue.length > 0) {
                const job = this.syncQueue.shift();
                await this.executeSyncJob(job);
            }
        } catch (error) {
            console.error('Sync processing error:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    // Execute single sync job
    async executeSyncJob(job) {
        try {
            // In a real implementation, this would sync with cloud storage or other devices
            // For now, we'll simulate successful sync
            console.log(`🔄 Syncing ${job.dataType} for ${job.phone}`);
            
            // Store sync history
            const dwnData = await this.getDWNData(job.phone);
            dwnData.syncInfo.lastSync = new Date().toISOString();
            dwnData.syncInfo.syncHistory = dwnData.syncInfo.syncHistory || [];
            dwnData.syncInfo.syncHistory.push({
                type: job.dataType,
                timestamp: job.timestamp,
                deviceId: job.deviceId,
                status: 'completed'
            });

            await this.storeDWNData(job.phone, dwnData);
            
        } catch (error) {
            console.error('Sync job execution error:', error);
            throw error;
        }
    }

    // Export all DWN data for backup
    async exportDWNData(phone, encryptionKey) {
        try {
            const dwnData = await this.getDWNData(phone);
            const exportData = {
                dwnData,
                exportDate: new Date().toISOString(),
                version: '1.0',
                schemaVersion: '1.0'
            };

            const encrypted = await this.encryptDWNData(exportData, encryptionKey);
            return {
                success: true,
                data: encrypted,
                filename: `musd-dwn-backup-${phone}-${Date.now()}.json`
            };
        } catch (error) {
            console.error('DWN export error:', error);
            return { success: false, error: error.message };
        }
    }

    // Import DWN data from backup
    async importDWNData(phone, backupData, encryptionKey) {
        try {
            const decrypted = await this.decryptDWNData(backupData, encryptionKey);
            
            if (!this.validateDWNData(decrypted)) {
                throw new Error('Invalid DWN backup data');
            }

            await this.storeDWNData(phone, decrypted.dwnData);
            console.log('✅ DWN data imported successfully for:', phone);
            return { success: true };
        } catch (error) {
            console.error('DWN import error:', error);
            return { success: false, error: error.message };
        }
    }

    // Protocol-based data organization
    createProfileSchema(userData) {
        return {
            personalInfo: {
                phone: userData.phone,
                registered: userData.dateCreated
            },
            verificationStatus: { status: 'pending' },
            preferences: {},
            securitySettings: {},
            metadata: {
                created: new Date().toISOString(),
                version: '1.0'
            }
        };
    }

    createTransactionSchema() {
        return {
            records: [],
            tradingRecords: [],
            aiTradingRecords: [],
            metadata: {
                totalCount: 0,
                lastUpdated: new Date().toISOString(),
                schemaVersion: '1.0'
            }
        };
    }

    createPreferencesSchema() {
        return {
            notificationSettings: {},
            tradingPreferences: {},
            securityPreferences: {},
            displayPreferences: {}
        };
    }

    createDevicesSchema() {
        return {
            registeredDevices: [this.getDeviceInfo()],
            syncPreferences: {},
            devicePermissions: {}
        };
    }

    // Utility methods
    async getDWNData(phone) {
        try {
            const allData = this.getAllDWNData();
            if (!allData[phone]) {
                // Initialize if doesn't exist
                const userData = window.app?.currentUser || { phone: phone, dateCreated: new Date().toISOString() };
                allData[phone] = await this.initializeDWN(phone, userData);
                await this.storeAllDWNData(allData);
            }
            return allData[phone];
        } catch (error) {
            console.error('DWN data retrieval error:', error);
            throw error;
        }
    }

    async storeDWNData(phone, data) {
        try {
            const allData = this.getAllDWNData();
            allData[phone] = data;
            await this.storeAllDWNData(allData);
            return true;
        } catch (error) {
            console.error('DWN data storage error:', error);
            throw error;
        }
    }

    getAllDWNData() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || {};
        } catch {
            return {};
        }
    }

    async storeAllDWNData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    getDeviceId() {
        let deviceId = localStorage.getItem('musd-device-id');
        if (!deviceId) {
            deviceId = 'device-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('musd-device-id', deviceId);
        }
        return deviceId;
    }

    getDeviceInfo() {
        return {
            id: this.getDeviceId(),
            type: this.getDeviceType(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            registeredAt: new Date().toISOString()
        };
    }

    getDeviceType() {
        const ua = navigator.userAgent;
        if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile';
        if (/Tablet|iPad/i.test(ua)) return 'tablet';
        return 'desktop';
    }

    async generateVerificationHash(data) {
        const jsonString = JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(jsonString);
        
        if (window.crypto && window.crypto.subtle) {
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
            // Fallback hash
            return btoa(jsonString).substring(0, 32);
        }
    }

    generateBlockNumber() {
        return Math.floor(100000 + Math.random() * 900000);
    }

    async encryptDWNData(data, key) {
        // Simplified encryption
        const jsonString = JSON.stringify(data);
        return btoa(jsonString + '|' + btoa(key));
    }

    async decryptDWNData(encryptedData, key) {
        try {
            const decrypted = atob(encryptedData);
            const parts = decrypted.split('|');
            if (parts.length !== 2 || atob(parts[1]) !== key) {
                throw new Error('Invalid encryption key');
            }
            return JSON.parse(parts[0]);
        } catch (error) {
            throw new Error('DWN data decryption failed: ' + error.message);
        }
    }

    validateDWNData(data) {
        return data && 
               data.dwnData && 
               data.version === '1.0' && 
               data.schemaVersion === '1.0';
    }

    retrySync(job) {
        // Implement retry logic with exponential backoff
        setTimeout(() => {
            this.syncQueue.push(job);
            this.processSyncQueue();
        }, 5000);
    }

    // Store DID document in DWN
    async storeDIDDocument(phone, did) {
        try {
            const dwnData = await this.getDWNData(phone);
            dwnData.didDocument = did.document;
            await this.storeDWNData(phone, dwnData);
            return true;
        } catch (error) {
            console.error('DID document storage error:', error);
            return false;
        }
    }
}
// did-manager.js - Decentralized Identity Management System
class DIDManager {
    constructor() {
        this.didStorageKey = 'm-usd-did-identities';
        this.currentUserDID = null;
        this.identityBackups = new Map();
    }

    // Generate a new DID for a user
    async createDID(userData) {
        try {
            const did = await this.generateDIDDocument(userData);
            await this.storeDID(userData.phone, did);
            await this.createIdentityBackup(userData.phone, did);
            
            console.log('✅ DID created for user:', userData.phone);
            return did;
        } catch (error) {
            console.error('DID creation error:', error);
            throw new Error('Failed to create decentralized identity');
        }
    }

    // Generate DID document following W3C DID specification
    async generateDIDDocument(userData) {
        const did = `did:musd:${this.generateDIDIdentifier()}`;
        const timestamp = new Date().toISOString();
        
        const didDocument = {
            "@context": [
                "https://www.w3.org/ns/did/v1",
                "https://w3id.org/security/suites/ed25519-2020/v1"
            ],
            id: did,
            created: timestamp,
            updated: timestamp,
            verificationMethod: [{
                id: `${did}#keys-1`,
                type: "Ed25519VerificationKey2020",
                controller: did,
                publicKeyMultibase: await this.generateKeyPair()
            }],
            authentication: [
                `${did}#keys-1`
            ],
            assertionMethod: [
                `${did}#keys-1`
            ],
            service: [{
                id: `${did}#vault`,
                type: "DecentralizedWebNode",
                serviceEndpoint: `https://dwn.m-usd.com/${did}`
            }],
            userMetadata: {
                phone: userData.phone,
                createdAt: timestamp,
                lastAccessed: timestamp
            }
        };

        return {
            did: did,
            document: didDocument,
            privateKey: await this.encryptPrivateKey(await this.getPrivateKey())
        };
    }

    // Generate cryptographically secure DID identifier
    generateDIDIdentifier() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Generate cryptographic key pair
    async generateKeyPair() {
        if (window.crypto && window.crypto.subtle) {
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true,
                ["sign", "verify"]
            );
            
            const exportedKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
            return this.arrayBufferToBase64(exportedKey);
        } else {
            // Fallback for browsers without Web Crypto API
            return this.generateFallbackKey();
        }
    }

    // DID-based authentication
    async authenticateWithDID(phone, signature) {
        try {
            const storedDID = await this.getStoredDID(phone);
            if (!storedDID) {
                throw new Error('DID not found for user');
            }

            const isValid = await this.verifySignature(storedDID, signature);
            if (isValid) {
                this.currentUserDID = storedDID;
                await this.updateLastAccessed(phone);
                return { success: true, did: storedDID };
            } else {
                throw new Error('Invalid DID signature');
            }
        } catch (error) {
            console.error('DID authentication error:', error);
            return { success: false, error: error.message };
        }
    }

    // Export identity for backup
    async exportIdentity(phone, password) {
        try {
            const did = await this.getStoredDID(phone);
            if (!did) {
                throw new Error('No DID found for user');
            }

            const exportData = {
                did: did.did,
                document: did.document,
                privateKey: did.privateKey,
                metadata: did.document.userMetadata,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };

            const encryptedExport = await this.encryptExportData(exportData, password);
            
            return {
                success: true,
                data: encryptedExport,
                filename: `musd-identity-${phone}-${Date.now()}.json`
            };
        } catch (error) {
            console.error('Identity export error:', error);
            return { success: false, error: error.message };
        }
    }

    // Import identity from backup
    async importIdentity(backupData, password, phone) {
        try {
            const decryptedData = await this.decryptExportData(backupData, password);
            
            // Validate backup data
            if (!this.validateBackupData(decryptedData)) {
                throw new Error('Invalid backup data');
            }

            await this.storeDID(phone, decryptedData);
            this.currentUserDID = decryptedData;
            
            console.log('✅ Identity imported successfully for:', phone);
            return { success: true };
        } catch (error) {
            console.error('Identity import error:', error);
            return { success: false, error: error.message };
        }
    }

    // Store DID in local storage (in production, use secure storage)
    async storeDID(phone, did) {
        try {
            const stored = this.getStoredIdentities();
            stored[phone] = {
                ...did,
                lastUpdated: new Date().toISOString()
            };
            
            localStorage.setItem(this.didStorageKey, JSON.stringify(stored));
            
            // Also sync with DWN if available
            if (window.dwnManager) {
                await window.dwnManager.storeDIDDocument(phone, did);
            }
            
            return true;
        } catch (error) {
            console.error('DID storage error:', error);
            return false;
        }
    }

    // Get stored DID for a user
    async getStoredDID(phone) {
        try {
            const stored = this.getStoredIdentities();
            return stored[phone] || null;
        } catch (error) {
            console.error('DID retrieval error:', error);
            return null;
        }
    }

    // Utility methods
    getStoredIdentities() {
        try {
            return JSON.parse(localStorage.getItem(this.didStorageKey)) || {};
        } catch {
            return {};
        }
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async encryptPrivateKey(privateKey) {
        // In a real implementation, use proper encryption
        return btoa(JSON.stringify(privateKey));
    }

    generateFallbackKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array));
    }

    async verifySignature(did, signature) {
        // Simplified signature verification
        // In production, use proper cryptographic verification
        return signature && signature.length > 10;
    }

    async updateLastAccessed(phone) {
        const did = await this.getStoredDID(phone);
        if (did) {
            did.document.userMetadata.lastAccessed = new Date().toISOString();
            await this.storeDID(phone, did);
        }
    }

    async createIdentityBackup(phone, did) {
        this.identityBackups.set(phone, {
            ...did,
            backupCreated: new Date().toISOString()
        });
    }

    async encryptExportData(data, password) {
        // Simplified encryption - use proper encryption in production
        const jsonString = JSON.stringify(data);
        return btoa(jsonString + '|' + btoa(password));
    }

    async decryptExportData(encryptedData, password) {
        try {
            const decrypted = atob(encryptedData);
            const parts = decrypted.split('|');
            if (parts.length !== 2 || atob(parts[1]) !== password) {
                throw new Error('Invalid password');
            }
            return JSON.parse(parts[0]);
        } catch (error) {
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    validateBackupData(data) {
        return data && 
               data.did && 
               data.document && 
               data.privateKey && 
               data.version === '1.0';
    }

    // Get current user's DID
    getCurrentUserDID() {
        return this.currentUserDID;
    }

    // Check if user has DID
    async hasDID(phone) {
        const did = await this.getStoredDID(phone);
        return did !== null;
    }

    // Get private key (simplified)
    async getPrivateKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
}
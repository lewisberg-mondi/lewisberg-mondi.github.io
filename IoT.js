// IoT.js - Web5 IoT Device Management System
class IoTManager {
    constructor() {
        this.storageKey = 'm-usd-iot-devices';
        this.mqttBroker = 'wss://mqtt.m-usd.com:8884'; // WebSocket MQTT
        this.connectedDevices = new Map();
        this.deviceCallbacks = new Map();
        this.realtimeData = new Map();
        this.isConnected = false;
        this.mqttClient = null;
        
        // IoT Protocol Definitions
        this.protocols = {
            SMART_HOME: 'musd-smart-home-v1',
            WEARABLES: 'musd-wearables-v1',
            AUTOMATION: 'musd-automation-v1'
        };
    }

    // Initialize IoT System
    async initializeIoT(userPhone) {
        try {
            console.log('🔧 Initializing IoT System for:', userPhone);
            
            // Load user's IoT devices
            const devices = await this.loadUserDevices(userPhone);
            
            // Connect to MQTT broker for real-time communication
            await this.connectMQTTBroker();
            
            // Initialize device connections
            await this.initializeDeviceConnections(devices, userPhone);
            
            // Start device monitoring
            this.startDeviceMonitoring();
            
            console.log('✅ IoT System initialized successfully');
            return {
                success: true,
                deviceCount: devices.length,
                protocols: Object.keys(this.protocols)
            };
        } catch (error) {
            console.error('IoT initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Connect to MQTT Broker for real-time communication
    async connectMQTTBroker() {
        return new Promise((resolve, reject) => {
            try {
                // In a real implementation, use a proper MQTT library
                // For demo purposes, we'll simulate MQTT connection
                console.log('📡 Connecting to MQTT Broker...');
                
                setTimeout(() => {
                    this.isConnected = true;
                    this.mqttClient = {
                        connected: true,
                        subscribe: (topic, callback) => {
                            console.log(`🔔 Subscribed to topic: ${topic}`);
                            // Simulate message reception
                            setInterval(() => {
                                if (this.isConnected) {
                                    this.simulateIoTData(topic, callback);
                                }
                            }, 5000);
                        },
                        publish: (topic, message) => {
                            console.log(`📤 Published to ${topic}:`, message);
                            return Promise.resolve();
                        }
                    };
                    
                    console.log('✅ MQTT Broker connected successfully');
                    resolve(this.mqttClient);
                }, 1000);
                
            } catch (error) {
                reject(new Error(`MQTT connection failed: ${error.message}`));
            }
        });
    }

    // Register new IoT device
    async registerDevice(userPhone, deviceData) {
        try {
            const deviceId = this.generateDeviceId();
            const device = {
                id: deviceId,
                userPhone: userPhone,
                name: deviceData.name,
                type: deviceData.type,
                protocol: deviceData.protocol || this.protocols.SMART_HOME,
                capabilities: deviceData.capabilities || [],
                status: 'offline',
                connection: {
                    lastSeen: new Date().toISOString(),
                    signalStrength: 0,
                    batteryLevel: 100
                },
                configuration: deviceData.configuration || {},
                metadata: {
                    registered: new Date().toISOString(),
                    firmware: deviceData.firmware || '1.0.0',
                    manufacturer: deviceData.manufacturer || 'M-USD IoT'
                },
                security: {
                    encryptionKey: this.generateEncryptionKey(),
                    accessToken: this.generateAccessToken(),
                    permissions: deviceData.permissions || ['read', 'control']
                }
            };

            // Store device
            await this.storeDevice(userPhone, device);
            
            // Connect device
            await this.connectDevice(device);
            
            // Subscribe to device topics
            await this.subscribeToDevice(device);
            
            console.log(`✅ Device registered: ${device.name} (${deviceId})`);
            return { success: true, device: device };
        } catch (error) {
            console.error('Device registration error:', error);
            return { success: false, error: error.message };
        }
    }

    // Connect to a specific device
    async connectDevice(device) {
        try {
            const topic = this.getDeviceTopic(device);
            
            // Subscribe to device status updates
            this.mqttClient.subscribe(`${topic}/status`, (message) => {
                this.handleDeviceStatusUpdate(device.id, message);
            });
            
            // Subscribe to device data
            this.mqttClient.subscribe(`${topic}/data`, (message) => {
                this.handleDeviceData(device.id, message);
            });
            
            // Subscribe to device events
            this.mqttClient.subscribe(`${topic}/events`, (message) => {
                this.handleDeviceEvent(device.id, message);
            });
            
            // Update device status
            device.status = 'online';
            device.connection.lastSeen = new Date().toISOString();
            device.connection.signalStrength = this.getRandomSignalStrength();
            
            await this.updateDevice(device.userPhone, device);
            this.connectedDevices.set(device.id, device);
            
            console.log(`🔗 Device connected: ${device.name}`);
            return true;
        } catch (error) {
            console.error('Device connection error:', error);
            device.status = 'error';
            await this.updateDevice(device.userPhone, device);
            return false;
        }
    }

    // Send command to device
    async sendDeviceCommand(deviceId, command, parameters = {}) {
        try {
            const device = this.connectedDevices.get(deviceId);
            if (!device) {
                throw new Error('Device not found or not connected');
            }
            
            const commandMessage = {
                command: command,
                parameters: parameters,
                timestamp: new Date().toISOString(),
                commandId: this.generateCommandId(),
                security: {
                    token: device.security.accessToken,
                    signature: await this.generateCommandSignature(command, parameters, device)
                }
            };
            
            const topic = `${this.getDeviceTopic(device)}/commands`;
            await this.mqttClient.publish(topic, JSON.stringify(commandMessage));
            
            // Log command in DWN
            await this.logDeviceCommand(device, commandMessage);
            
            console.log(`📤 Command sent to ${device.name}: ${command}`);
            return { success: true, commandId: commandMessage.commandId };
        } catch (error) {
            console.error('Device command error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get real-time device data
    async getDeviceData(deviceId, dataType = 'all') {
        try {
            const device = this.connectedDevices.get(deviceId);
            if (!device) {
                throw new Error('Device not found');
            }
            
            const cachedData = this.realtimeData.get(deviceId);
            if (cachedData && dataType === 'all') {
                return cachedData;
            }
            
            // Request fresh data from device
            const commandResult = await this.sendDeviceCommand(deviceId, 'get_data', { dataType });
            
            return {
                success: true,
                deviceId: deviceId,
                data: cachedData || {},
                lastUpdated: new Date().toISOString(),
                commandId: commandResult.commandId
            };
        } catch (error) {
            console.error('Device data retrieval error:', error);
            return { success: false, error: error.message };
        }
    }

    // Smart Home Automation
    async createAutomation(userPhone, automationConfig) {
        try {
            const automationId = this.generateAutomationId();
            const automation = {
                id: automationId,
                userPhone: userPhone,
                name: automationConfig.name,
                description: automationConfig.description,
                triggers: automationConfig.triggers,
                actions: automationConfig.actions,
                conditions: automationConfig.conditions || [],
                schedule: automationConfig.schedule,
                enabled: true,
                metadata: {
                    created: new Date().toISOString(),
                    lastTriggered: null,
                    triggerCount: 0
                }
            };
            
            await this.storeAutomation(userPhone, automation);
            await this.activateAutomation(automation);
            
            console.log(`✅ Automation created: ${automation.name}`);
            return { success: true, automation: automation };
        } catch (error) {
            console.error('Automation creation error:', error);
            return { success: false, error: error.message };
        }
    }

    // Device Groups Management
    async createDeviceGroup(userPhone, groupConfig) {
        try {
            const groupId = this.generateGroupId();
            const group = {
                id: groupId,
                userPhone: userPhone,
                name: groupConfig.name,
                description: groupConfig.description,
                devices: groupConfig.devices,
                collectiveActions: groupConfig.collectiveActions || [],
                synchronization: groupConfig.synchronization || false,
                metadata: {
                    created: new Date().toISOString(),
                    deviceCount: groupConfig.devices.length
                }
            };
            
            await this.storeDeviceGroup(userPhone, group);
            
            console.log(`✅ Device group created: ${group.name}`);
            return { success: true, group: group };
        } catch (error) {
            console.error('Device group creation error:', error);
            return { success: false, error: error.message };
        }
    }

    // Energy Monitoring
    async getEnergyUsage(userPhone, period = 'daily') {
        try {
            const devices = await this.loadUserDevices(userPhone);
            const energyDevices = devices.filter(device => 
                device.capabilities.includes('energy_monitoring')
            );
            
            let totalEnergy = 0;
            const deviceEnergy = {};
            
            for (const device of energyDevices) {
                const energyData = await this.getDeviceEnergyData(device.id, period);
                deviceEnergy[device.id] = energyData;
                totalEnergy += energyData.consumption || 0;
            }
            
            return {
                success: true,
                period: period,
                totalConsumption: totalEnergy,
                devices: deviceEnergy,
                costEstimate: this.calculateEnergyCost(totalEnergy),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Energy usage retrieval error:', error);
            return { success: false, error: error.message };
        }
    }

    // Security and Access Control
    async manageDeviceAccess(deviceId, accessConfig) {
        try {
            const device = this.connectedDevices.get(deviceId);
            if (!device) {
                throw new Error('Device not found');
            }
            
            // Update device permissions
            device.security.permissions = accessConfig.permissions;
            device.security.sharedWith = accessConfig.sharedWith || [];
            
            if (accessConfig.temporaryAccess) {
                device.security.temporaryAccess = {
                    expires: accessConfig.temporaryAccess.expires,
                    permissions: accessConfig.temporaryAccess.permissions
                };
            }
            
            await this.updateDevice(device.userPhone, device);
            
            // Notify device of permission changes
            await this.sendDeviceCommand(deviceId, 'update_permissions', {
                permissions: device.security.permissions
            });
            
            console.log(`🔐 Device access updated: ${device.name}`);
            return { success: true };
        } catch (error) {
            console.error('Device access management error:', error);
            return { success: false, error: error.message };
        }
    }

    // Firmware Update Management
    async checkFirmwareUpdates(userPhone) {
        try {
            const devices = await this.loadUserDevices(userPhone);
            const updates = [];
            
            for (const device of devices) {
                const updateInfo = await this.checkDeviceFirmware(device);
                if (updateInfo.updateAvailable) {
                    updates.push({
                        device: device,
                        update: updateInfo
                    });
                }
            }
            
            return {
                success: true,
                updatesAvailable: updates.length,
                devices: updates
            };
        } catch (error) {
            console.error('Firmware check error:', error);
            return { success: false, error: error.message };
        }
    }

    // Predictive Maintenance
    async getMaintenancePredictions(userPhone) {
        try {
            const devices = await this.loadUserDevices(userPhone);
            const predictions = [];
            
            for (const device of devices) {
                const health = await this.analyzeDeviceHealth(device);
                if (health.maintenanceNeeded) {
                    predictions.push({
                        device: device,
                        health: health,
                        recommendation: this.generateMaintenanceRecommendation(device, health)
                    });
                }
            }
            
            return {
                success: true,
                predictions: predictions,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Maintenance prediction error:', error);
            return { success: false, error: error.message };
        }
    }

    // Event Handlers
    handleDeviceStatusUpdate(deviceId, message) {
        try {
            const statusUpdate = JSON.parse(message);
            const device = this.connectedDevices.get(deviceId);
            
            if (device) {
                device.status = statusUpdate.status;
                device.connection = {
                    ...device.connection,
                    ...statusUpdate.connection
                };
                
                this.connectedDevices.set(deviceId, device);
                this.triggerDeviceCallbacks(deviceId, 'status', statusUpdate);
                
                console.log(`📊 Device status update: ${device.name} - ${statusUpdate.status}`);
            }
        } catch (error) {
            console.error('Status update handling error:', error);
        }
    }

    handleDeviceData(deviceId, message) {
        try {
            const deviceData = JSON.parse(message);
            this.realtimeData.set(deviceId, {
                ...this.realtimeData.get(deviceId),
                ...deviceData,
                lastUpdate: new Date().toISOString()
            });
            
            this.triggerDeviceCallbacks(deviceId, 'data', deviceData);
            
            // Store in DWN for historical analysis
            this.storeDeviceDataInDWN(deviceId, deviceData);
        } catch (error) {
            console.error('Device data handling error:', error);
        }
    }

    handleDeviceEvent(deviceId, message) {
        try {
            const event = JSON.parse(message);
            
            // Trigger automations based on event
            this.checkAutomationTriggers(deviceId, event);
            
            // Notify subscribers
            this.triggerDeviceCallbacks(deviceId, 'event', event);
            
            console.log(`🎯 Device event: ${deviceId} - ${event.type}`);
        } catch (error) {
            console.error('Device event handling error:', error);
        }
    }

    // Utility Methods
    generateDeviceId() {
        return 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    generateEncryptionKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    generateAccessToken() {
        return 'tok_' + Math.random().toString(36).substr(2, 16);
    }

    getDeviceTopic(device) {
        return `musd/iot/${device.userPhone}/${device.id}`;
    }

    getRandomSignalStrength() {
        return Math.floor(30 + Math.random() * 70); // 30-100%
    }

    simulateIoTData(topic, callback) {
        const topics = topic.split('/');
        const deviceId = topics[3];
        
        if (topics[4] === 'data') {
            const simulatedData = {
                temperature: 20 + Math.random() * 10,
                humidity: 40 + Math.random() * 30,
                power: Math.random() * 100,
                timestamp: new Date().toISOString()
            };
            
            callback(JSON.stringify(simulatedData));
        }
    }

    // Storage Methods
    async loadUserDevices(userPhone) {
        try {
            const allDevices = this.getAllDevices();
            return allDevices[userPhone] || [];
        } catch (error) {
            console.error('Device loading error:', error);
            return [];
        }
    }

    async storeDevice(userPhone, device) {
        try {
            const allDevices = this.getAllDevices();
            if (!allDevices[userPhone]) {
                allDevices[userPhone] = [];
            }
            allDevices[userPhone].push(device);
            localStorage.setItem(this.storageKey, JSON.stringify(allDevices));
            return true;
        } catch (error) {
            console.error('Device storage error:', error);
            throw error;
        }
    }

    async updateDevice(userPhone, updatedDevice) {
        try {
            const allDevices = this.getAllDevices();
            if (allDevices[userPhone]) {
                const index = allDevices[userPhone].findIndex(d => d.id === updatedDevice.id);
                if (index !== -1) {
                    allDevices[userPhone][index] = updatedDevice;
                    localStorage.setItem(this.storageKey, JSON.stringify(allDevices));
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Device update error:', error);
            throw error;
        }
    }

    getAllDevices() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || {};
        } catch {
            return {};
        }
    }

    // Callback Management
    onDeviceUpdate(deviceId, eventType, callback) {
        const key = `${deviceId}_${eventType}`;
        this.deviceCallbacks.set(key, callback);
    }

    triggerDeviceCallbacks(deviceId, eventType, data) {
        const key = `${deviceId}_${eventType}`;
        const callback = this.deviceCallbacks.get(key);
        if (callback) {
            callback(data);
        }
    }

    // Start device monitoring
    startDeviceMonitoring() {
        setInterval(() => {
            this.monitorDeviceHealth();
        }, 30000); // Check every 30 seconds
    }

    async monitorDeviceHealth() {
        for (const [deviceId, device] of this.connectedDevices) {
            const health = await this.checkDeviceHealth(device);
            if (health.status === 'degraded') {
                console.warn(`⚠️ Device health degraded: ${device.name}`);
                // Trigger notification
                this.triggerDeviceCallbacks(deviceId, 'health_alert', health);
            }
        }
    }

    // Integration with existing DWN system
    async storeDeviceDataInDWN(deviceId, data) {
        if (window.dwnManager) {
            const device = this.connectedDevices.get(deviceId);
            if (device) {
                await window.dwnManager.storeIoTData(device.userPhone, {
                    deviceId: deviceId,
                    deviceName: device.name,
                    data: data,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // Additional helper methods would be implemented here...
    // [Previous methods continue...]

    async checkDeviceFirmware(device) {
        // Simulate firmware check
        return {
            currentVersion: device.metadata.firmware,
            latestVersion: '1.1.0',
            updateAvailable: device.metadata.firmware !== '1.1.0',
            releaseNotes: 'Security patches and performance improvements',
            size: '2.4 MB',
            urgency: 'medium'
        };
    }

    async analyzeDeviceHealth(device) {
        // Simulate health analysis
        return {
            status: Math.random() > 0.2 ? 'healthy' : 'degraded',
            batteryHealth: Math.floor(80 + Math.random() * 20),
            connectionStability: Math.floor(70 + Math.random() * 30),
            usagePatterns: 'normal',
            maintenanceNeeded: Math.random() > 0.7,
            predictedFailure: Math.random() > 0.9 ? '30 days' : null
        };
    }

    generateMaintenanceRecommendation(device, health) {
        const recommendations = [
            'Schedule routine maintenance',
            'Update device firmware',
            'Check sensor calibration',
            'Replace battery soon',
            'Clean device components'
        ];
        return recommendations[Math.floor(Math.random() * recommendations.length)];
    }

    calculateEnergyCost(consumption) {
        const rate = 0.15; // $0.15 per kWh
        return (consumption * rate).toFixed(2);
    }

    async getDeviceEnergyData(deviceId, period) {
        // Simulate energy data
        return {
            consumption: 2.5 + Math.random() * 5,
            peakUsage: '14:00-16:00',
            cost: this.calculateEnergyCost(2.5 + Math.random() * 5),
            period: period
        };
    }

    async checkAutomationTriggers(deviceId, event) {
        // Check if event triggers any automations
        const device = this.connectedDevices.get(deviceId);
        if (device) {
            const automations = await this.loadAutomations(device.userPhone);
            for (const automation of automations) {
                if (automation.enabled && this.matchesTrigger(automation.triggers, event)) {
                    await this.executeAutomation(automation, event);
                }
            }
        }
    }

    async loadAutomations(userPhone) {
        // Load automations from storage
        const key = `musd-automations-${userPhone}`;
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    async storeAutomation(userPhone, automation) {
        const key = `musd-automations-${userPhone}`;
        const automations = await this.loadAutomations(userPhone);
        automations.push(automation);
        localStorage.setItem(key, JSON.stringify(automations));
    }

    async storeDeviceGroup(userPhone, group) {
        const key = `musd-device-groups-${userPhone}`;
        const groups = await this.loadDeviceGroups(userPhone);
        groups.push(group);
        localStorage.setItem(key, JSON.stringify(groups));
    }

    async loadDeviceGroups(userPhone) {
        const key = `musd-device-groups-${userPhone}`;
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    matchesTrigger(triggers, event) {
        // Simple trigger matching logic
        return triggers.some(trigger => 
            trigger.deviceId === event.deviceId && 
            trigger.eventType === event.type
        );
    }

    async executeAutomation(automation, triggerEvent) {
        console.log(`🤖 Executing automation: ${automation.name}`);
        
        for (const action of automation.actions) {
            await this.executeAutomationAction(action, triggerEvent);
        }
        
        // Update automation metadata
        automation.metadata.lastTriggered = new Date().toISOString();
        automation.metadata.triggerCount++;
        
        await this.updateAutomation(automation.userPhone, automation);
    }

    async executeAutomationAction(action, triggerEvent) {
        switch (action.type) {
            case 'device_command':
                await this.sendDeviceCommand(action.deviceId, action.command, action.parameters);
                break;
            case 'notification':
                this.sendAutomationNotification(action, triggerEvent);
                break;
            case 'webhook':
                await this.triggerWebhook(action, triggerEvent);
                break;
        }
    }

    sendAutomationNotification(action, triggerEvent) {
        if (window.app && window.app.showNotification) {
            window.app.showNotification(action.message, 'info');
        }
    }

    async triggerWebhook(action, triggerEvent) {
        // Simulate webhook call
        console.log(`🌐 Webhook triggered: ${action.url}`);
    }

    async updateAutomation(userPhone, automation) {
        const automations = await this.loadAutomations(userPhone);
        const index = automations.findIndex(a => a.id === automation.id);
        if (index !== -1) {
            automations[index] = automation;
            const key = `musd-automations-${userPhone}`;
            localStorage.setItem(key, JSON.stringify(automations));
        }
    }

    async activateAutomation(automation) {
        // Activate automation by subscribing to relevant topics
        for (const trigger of automation.triggers) {
            const topic = `musd/iot/${automation.userPhone}/${trigger.deviceId}/events`;
            this.mqttClient.subscribe(topic, (message) => {
                const event = JSON.parse(message);
                if (this.matchesTrigger([trigger], event)) {
                    this.executeAutomation(automation, event);
                }
            });
        }
    }

    async generateCommandSignature(command, parameters, device) {
        // Generate command signature for security
        const data = JSON.stringify({ command, parameters, timestamp: new Date().toISOString() });
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data + device.security.encryptionKey);
        
        if (window.crypto && window.crypto.subtle) {
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        
        return btoa(data).substring(0, 32);
    }

    generateCommandId() {
        return 'cmd_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    generateAutomationId() {
        return 'auto_' + Math.random().toString(36).substr(2, 9);
    }

    generateGroupId() {
        return 'grp_' + Math.random().toString(36).substr(2, 9);
    }

    async logDeviceCommand(device, commandMessage) {
        if (window.dwnManager) {
            await window.dwnManager.storeIoTData(device.userPhone, {
                type: 'device_command',
                deviceId: device.id,
                deviceName: device.name,
                command: commandMessage,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkDeviceHealth(device) {
        // Simulate device health check
        return {
            status: Math.random() > 0.1 ? 'healthy' : 'degraded',
            metrics: {
                responseTime: 100 + Math.random() * 200,
                errorRate: Math.random() * 5,
                uptime: 95 + Math.random() * 5
            }
        };
    }
}

// Extend DWNManager to support IoT data
if (typeof window.dwnManager !== 'undefined') {
    window.dwnManager.storeIoTData = async function(userPhone, iotData) {
        try {
            const dwnData = await this.getDWNData(userPhone);
            
            if (!dwnData.iot) {
                dwnData.iot = {
                    deviceData: [],
                    commands: [],
                    automations: [],
                    metadata: {
                        created: new Date().toISOString(),
                        totalRecords: 0
                    }
                };
            }
            
            dwnData.iot.deviceData.push(iotData);
            dwnData.iot.metadata.totalRecords++;
            dwnData.iot.metadata.lastUpdated = new Date().toISOString();
            
            await this.storeDWNData(userPhone, dwnData);
            return { success: true };
        } catch (error) {
            console.error('IoT data storage error:', error);
            return { success: false, error: error.message };
        }
    };
}

// Make IoTManager globally available
window.IoTManager = IoTManager;
console.log('✅ IoT Manager loaded successfully');
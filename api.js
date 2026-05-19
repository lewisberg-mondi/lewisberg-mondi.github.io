// REST API for Mobile Apps and Third-party Integration
class PhoneChainAPI {
  constructor() {
    this.endpoints = new Map();
    this.rateLimits = new Map();
    this.setupEndpoints();
  }
  
  setupEndpoints() {
    this.endpoints.set('/api/v1/balance', this.getBalance.bind(this));
    this.endpoints.set('/api/v1/transactions', this.getTransactions.bind(this));
    this.endpoints.set('/api/v1/send', this.sendMoney.bind(this));
    this.endpoints.set('/api/v1/user', this.getUserInfo.bind(this));
  }
  
  async handleRequest(path, method, data, headers) {
    // Rate limiting
    if (this.isRateLimited(headers.clientId)) {
      return this.errorResponse(429, 'Rate limit exceeded');
    }
    
    // Authentication
    const auth = this.authenticate(headers);
    if (!auth.valid) {
      return this.errorResponse(401, 'Unauthorized');
    }
    
    // Find endpoint
    const handler = this.endpoints.get(path);
    if (!handler) {
      return this.errorResponse(404, 'Endpoint not found');
    }
    
    try {
      const result = await handler(data, auth);
      return this.successResponse(result);
    } catch (error) {
      return this.errorResponse(400, error.message);
    }
  }
  
  authenticate(headers) {
    const apiKey = headers['x-api-key'];
    const signature = headers['x-signature'];
    
    // Verify API key (in production, check against database)
    const validKeys = new Map(); // Would be populated from secure storage
    
    if (!validKeys.has(apiKey)) {
      return { valid: false };
    }
    
    // Verify signature
    const clientSecret = validKeys.get(apiKey);
    const expectedSignature = this.generateSignature(headers, clientSecret);
    
    return {
      valid: signature === expectedSignature,
      clientId: apiKey,
      permissions: validKeys.get(apiKey).permissions || ['read']
    };
  }
  
  generateSignature(headers, secret) {
    // HMAC-based signature
    const str = headers['x-timestamp'] + headers['x-nonce'] + headers['x-api-key'];
    return CryptoJS.HmacSHA256(str, secret).toString();
  }
  
  isRateLimited(clientId) {
    const now = Date.now();
    const window = 60000; // 1 minute
    const maxRequests = 100; // 100 requests per minute
    
    const requests = this.rateLimits.get(clientId) || [];
    const recentRequests = requests.filter(time => now - time < window);
    
    if (recentRequests.length >= maxRequests) {
      return true;
    }
    
    requests.push(now);
    this.rateLimits.set(clientId, requests);
    return false;
  }
  
  // API Endpoints
  async getBalance(data, auth) {
    if (!this.hasPermission(auth, 'read')) {
      throw new Error('Insufficient permissions');
    }
    
    const user = blockchain.users.get(data.phoneNumber);
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      phoneNumber: user.phoneNumber,
      balance: user.balance,
      currency: 'USD',
      lastUpdated: new Date().toISOString()
    };
  }
  
  async getTransactions(data, auth) {
    if (!this.hasPermission(auth, 'read')) {
      throw new Error('Insufficient permissions');
    }
    
    const transactions = blockchain.getUserTransactions(data.phoneNumber);
    return {
      phoneNumber: data.phoneNumber,
      transactions: transactions.slice(0, data.limit || 50),
      total: transactions.length
    };
  }
  
  async sendMoney(data, auth) {
    if (!this.hasPermission(auth, 'write')) {
      throw new Error('Insufficient permissions');
    }
    
    // Compliance check
    if (!compliance.monitorTransaction({
        from: data.fromPhone,
        to: data.toPhone,
        amount: data.amount,
        timestamp: new Date().toISOString()
      })) {
      throw new Error('Transaction blocked by compliance rules');
    }
    
    return blockchain.sendMoney(
      data.fromPhone,
      data.toPhone,
      data.amount,
      data.password
    );
  }
  
  hasPermission(auth, requiredPermission) {
    return auth.permissions.includes('ALL') ||
      auth.permissions.includes(requiredPermission);
  }
  
  successResponse(data) {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };
  }
  
  errorResponse(code, message) {
    return {
      success: false,
      error: {
        code,
        message
      },
      timestamp: new Date().toISOString()
    };
  }
}

const phoneChainAPI = new PhoneChainAPI();

// Web Worker for background processing
if (window.Worker) {
  const apiWorker = new Worker('api-worker.js');
}
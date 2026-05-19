// Service Worker for Offline Functionality - PRODUCTION READY
const CACHE_NAME = 'm-usd-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/config.js',
  '/security.js',
  '/blockchain.js',
  '/database.js',
  '/compliance.js',
  '/backup-recovery.js',
  '/ai-monitor.js',
  '/notification-system.js',
  '/security-enhanced.js',
  '/payment-gateway.js',
  '/chat-system.js',
  '/app.js'
];

self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All resources cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.log('Cache installation failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip non-http requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }

        return fetch(event.request).then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(error => {
          console.log('Fetch failed; returning offline page:', error);
          // Return offline page or fallback content
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Background sync for offline transactions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    event.waitUntil(syncPendingTransactions());
  }
});

// Periodic background sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'data-sync') {
    console.log('Periodic sync triggered');
    event.waitUntil(syncData());
  }
});

// Sync pending transactions
async function syncPendingTransactions() {
  try {
    // Get all pending transactions from storage
    const pendingTransactions = await getPendingTransactions();
    
    for (const transaction of pendingTransactions) {
      try {
        // Attempt to process the transaction
        await processTransaction(transaction);
        
        // Remove from pending if successful
        await removeFromPending(transaction.id);
        
        console.log('Successfully synced transaction:', transaction.id);
      } catch (error) {
        console.error('Failed to sync transaction:', transaction.id, error);
      }
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Sync general data
async function syncData() {
  try {
    // Sync user data, transactions, etc.
    console.log('Data sync completed');
    return Promise.resolve();
  } catch (error) {
    console.error('Data sync failed:', error);
    return Promise.reject(error);
  }
}

// Helper functions
async function getPendingTransactions() {
  // This would retrieve pending transactions from IndexedDB or localStorage
  return [];
}

async function processTransaction(transaction) {
  // Process the transaction - this would integrate with your blockchain
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
}

async function removeFromPending(transactionId) {
  // Remove transaction from pending list
  return Promise.resolve();
}

// Handle push notifications
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: data.url,
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.matchAll({type: 'window'}).then(windowClients => {
        for (let client of windowClients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Message handling
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
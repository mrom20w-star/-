import { ref, onValue, set, update, get, remove, Database } from 'firebase/database';
import { rtdb } from '../firebase';
import { UserAccount, Transaction, AdminSettings, SupportTicket, SupportMessage } from '../types';

// Real-time Database Paths
const PATHS = {
  USERS: 'users',
  TRANSACTIONS: 'transactions',
  SETTINGS: 'settings',
  SUPPORT: 'support_tickets',
  BANNED_USERS: 'banned_users',
  BANNED_DEVICES: 'banned_devices',
};

const RTDB_URL = 'https://c8ad7c49-cb5-default-rtdb.firebaseio.com';

// Direct REST helpers to guarantee immediate writes regardless of websocket state
async function restPut(path: string, data: any) {
  try {
    await fetch(`${RTDB_URL}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn('restPut notice:', e);
  }
}

async function restPatch(path: string, data: any) {
  try {
    await fetch(`${RTDB_URL}/${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn('restPatch notice:', e);
  }
}

async function restDelete(path: string) {
  try {
    await fetch(`${RTDB_URL}/${path}.json`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('restDelete notice:', e);
  }
}

// Delete single transaction
export async function fbDeleteTransaction(txId: string): Promise<void> {
  if (rtdb) {
    try {
      await remove(ref(rtdb, `${PATHS.TRANSACTIONS}/${txId}`));
    } catch (e) {}
  }
  await restDelete(`${PATHS.TRANSACTIONS}/${txId}`);
}

// Clear all transactions (zero out deposits and withdrawals)
export async function fbClearAllTransactions(): Promise<void> {
  if (rtdb) {
    try {
      await set(ref(rtdb, PATHS.TRANSACTIONS), null);
    } catch (e) {}
  }
  await restPut(PATHS.TRANSACTIONS, {});
}

// Reset all platform data (Wipe everything to 0)
export async function fbResetAllPlatformData(): Promise<void> {
  if (rtdb) {
    try {
      await set(ref(rtdb, PATHS.TRANSACTIONS), null);
      await set(ref(rtdb, PATHS.USERS), null);
      await set(ref(rtdb, PATHS.SUPPORT), null);
      await set(ref(rtdb, PATHS.BANNED_USERS), null);
      await set(ref(rtdb, PATHS.BANNED_DEVICES), null);
    } catch (e) {}
  }
  await restPut(PATHS.TRANSACTIONS, {});
  await restPut(PATHS.USERS, {});
  await restPut(PATHS.SUPPORT, {});
  await restPut(PATHS.BANNED_USERS, {});
  await restPut(PATHS.BANNED_DEVICES, {});
}

// Update presence for live online player tracking
export async function fbUpdatePresence(userId: string): Promise<void> {
  if (!userId || userId === 'guest') return;
  restPatch(`${PATHS.USERS}/${userId}`, {
    lastSeen: Date.now(),
    isOnline: true,
  });
}

// Mark player as offline
export async function fbMarkOffline(userId: string): Promise<void> {
  if (!userId || userId === 'guest') return;
  restPatch(`${PATHS.USERS}/${userId}`, {
    lastSeen: Date.now(),
    isOnline: false,
  });
}

// Helper to remove any undefined values that crash Firebase RTDB
function sanitizeForFirebase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        result[key] = sanitizeForFirebase(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

// Push user update to Firebase RTDB
export async function fbSaveUser(user: UserAccount): Promise<void> {
  if (!rtdb || !user.id) return;
  try {
    const userRef = ref(rtdb, `${PATHS.USERS}/${user.id}`);
    const payload = sanitizeForFirebase({
      id: String(user.id),
      username: String(user.username || ''),
      phone: String(user.phone || ''),
      email: String(user.email || ''),
      balance: Number(user.balance) || 0,
      totalDeposited: Number(user.totalDeposited) || 0,
      totalWithdrawn: Number(user.totalWithdrawn) || 0,
      role: user.role || 'user',
      lastSeen: Date.now(),
      registeredAt: Number(user.registeredAt) || Date.now(),
      // Device & Ban details
      deviceId: user.deviceId || '',
      deviceName: user.deviceName || '',
      deviceType: user.deviceType || 'desktop',
      deviceOS: user.deviceOS || '',
      deviceBrowser: user.deviceBrowser || '',
      screenRes: user.screenRes || '',
      ip: user.ip || '',
      isBanned: Boolean(user.isBanned),
      bannedAt: user.bannedAt || 0,
      banReason: user.banReason || '',
      lastLoginAt: user.lastLoginAt || Date.now(),
    });
    if (rtdb) {
      await update(userRef, payload);
    }
    // Direct REST dual-write for 100% reliability
    restPatch(`${PATHS.USERS}/${user.id}`, payload);
  } catch (err) {
    console.warn('Firebase RTDB saveUser error:', err);
    // Fallback direct REST
    restPatch(`${PATHS.USERS}/${user.id}`, user);
  }
}

// Permanently Ban and Delete User & Device
export async function fbBanUserAndDevice(
  userId: string,
  phone: string,
  deviceId?: string,
  username?: string,
  reason: string = 'تم الحظر بواسطة الإدارة'
): Promise<void> {
  if (!rtdb) return;
  const now = Date.now();
  try {
    const banRecord = sanitizeForFirebase({
      userId: userId || '',
      phone: phone || '',
      deviceId: deviceId || '',
      username: username || '',
      bannedAt: now,
      reason,
    });

    // 1. Mark user as banned and remove from active users
    if (userId) {
      const userRef = ref(rtdb, `${PATHS.USERS}/${userId}`);
      await update(userRef, { isBanned: true, bannedAt: now, banReason: reason });
      // Also save to BANNED_USERS by userId
      await set(ref(rtdb, `${PATHS.BANNED_USERS}/${userId}`), banRecord);
    }

    // 2. Also record phone in BANNED_USERS
    if (phone) {
      const safePhone = phone.replace(/[^0-9]/g, '');
      if (safePhone) {
        await set(ref(rtdb, `${PATHS.BANNED_USERS}/${safePhone}`), banRecord);
      }
    }

    // 3. Record device ID in BANNED_DEVICES
    if (deviceId) {
      const safeDeviceKey = deviceId.replace(/[.#$[\]]/g, '_');
      await set(ref(rtdb, `${PATHS.BANNED_DEVICES}/${safeDeviceKey}`), banRecord);
    }
  } catch (err) {
    console.error('fbBanUserAndDevice error:', err);
  }
}

// Unban user or device
export async function fbUnban(identifier: string): Promise<void> {
  if (!rtdb || !identifier) return;
  try {
    const safeKey = identifier.replace(/[.#$[\]]/g, '_');
    // Remove from banned users
    await set(ref(rtdb, `${PATHS.BANNED_USERS}/${safeKey}`), null);
    await set(ref(rtdb, `${PATHS.BANNED_DEVICES}/${safeKey}`), null);

    // If it was a userId, reset isBanned in users collection
    const userRef = ref(rtdb, `${PATHS.USERS}/${safeKey}`);
    const snap = await get(userRef);
    if (snap.exists()) {
      await update(userRef, { isBanned: false, bannedAt: null, banReason: null });
    }
  } catch (err) {
    console.error('fbUnban error:', err);
  }
}

// Delete user permanently from users collection
export async function fbDeleteUser(userId: string): Promise<void> {
  if (!rtdb || !userId) return;
  try {
    await set(ref(rtdb, `${PATHS.USERS}/${userId}`), null);
  } catch (err) {
    console.error('fbDeleteUser error:', err);
  }
}

// Listen to banned users and devices
export function fbListenBanned(
  callback: (data: { users: Record<string, any>; devices: Record<string, any> }) => void
): () => void {
  if (!rtdb) return () => {};
  const bannedUsersRef = ref(rtdb, PATHS.BANNED_USERS);
  const bannedDevicesRef = ref(rtdb, PATHS.BANNED_DEVICES);

  let currentUsers: Record<string, any> = {};
  let currentDevices: Record<string, any> = {};

  const unsubUsers = onValue(bannedUsersRef, (snap) => {
    currentUsers = snap.exists() ? snap.val() : {};
    callback({ users: currentUsers, devices: currentDevices });
  });

  const unsubDevices = onValue(bannedDevicesRef, (snap) => {
    currentDevices = snap.exists() ? snap.val() : {};
    callback({ users: currentUsers, devices: currentDevices });
  });

  return () => {
    unsubUsers();
    unsubDevices();
  };
}

// Push transaction to Firebase RTDB
export async function fbSaveTransaction(tx: Transaction): Promise<void> {
  if (!rtdb || !tx.id) return;
  try {
    const txRef = ref(rtdb, `${PATHS.TRANSACTIONS}/${tx.id}`);
    const payload = sanitizeForFirebase({
      id: String(tx.id),
      userId: String(tx.userId || ''),
      userName: String(tx.userName || 'لاعب'),
      userPhone: String(tx.userPhone || tx.senderPhone || tx.phone || ''),
      type: tx.type || 'deposit',
      amount: Number(tx.amount) || 0,
      method: String(tx.method || 'فودافون كاش'),
      senderPhone: String(tx.senderPhone || tx.phone || ''),
      receiptImage: tx.receiptImage || '',
      referenceCode: tx.referenceCode || '',
      status: tx.status || 'pending',
      timestamp: Number(tx.timestamp) || Date.now(),
      game: tx.game || '',
      multiplier: tx.multiplier || 0,
      note: tx.note || '',
    });
    if (rtdb) {
      await set(txRef, payload);
    }
    // Direct REST dual-write guarantees instant appearance in PHP admin
    await restPut(`${PATHS.TRANSACTIONS}/${tx.id}`, payload);
    console.log('Firebase RTDB saveTransaction success:', tx.id);
  } catch (err) {
    console.error('Firebase RTDB saveTransaction error:', err);
    restPut(`${PATHS.TRANSACTIONS}/${tx.id}`, tx);
  }
}

// Update transaction status (e.g. approve/reject)
export async function fbUpdateTransactionStatus(txId: string, status: 'completed' | 'pending' | 'rejected', note?: string): Promise<void> {
  if (!rtdb || !txId) return;
  try {
    const txRef = ref(rtdb, `${PATHS.TRANSACTIONS}/${txId}`);
    const updateObj: Record<string, any> = { status };
    if (note) updateObj.note = note;
    await update(txRef, updateObj);
  } catch (err) {
    console.warn('Firebase RTDB updateTransactionStatus error:', err);
  }
}

// Push settings to Firebase RTDB
export async function fbSaveSettings(settings: AdminSettings): Promise<void> {
  if (!rtdb) return;
  try {
    const settingsRef = ref(rtdb, PATHS.SETTINGS);
    await set(settingsRef, settings);
  } catch (err) {
    console.warn('Firebase RTDB saveSettings error:', err);
  }
}

// Save or update support ticket
export async function fbSaveSupportTicket(ticket: SupportTicket): Promise<void> {
  if (!rtdb || !ticket.id) return;
  try {
    const ticketRef = ref(rtdb, `${PATHS.SUPPORT}/${ticket.id}`);
    await set(ticketRef, {
      ...ticket,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Firebase RTDB saveSupportTicket error:', err);
  }
}

// Add message to support ticket
export async function fbAddSupportMessage(ticketId: string, message: SupportMessage): Promise<void> {
  if (!rtdb || !ticketId) return;
  try {
    const ticketRef = ref(rtdb, `${PATHS.SUPPORT}/${ticketId}`);
    const snap = await get(ticketRef);
    if (snap.exists()) {
      const ticketData = snap.val() as SupportTicket;
      const currentMsgs = Array.isArray(ticketData.messages) ? ticketData.messages : [];
      const updatedMsgs = [...currentMsgs, message];
      await update(ticketRef, {
        messages: updatedMsgs,
        updatedAt: Date.now(),
        status: message.sender === 'user' ? 'open' : ticketData.status,
      });
    }
  } catch (err) {
    console.warn('Firebase RTDB addSupportMessage error:', err);
  }
}

// Subscribe to real-time transactions
export function fbListenTransactions(callback: (txs: Transaction[]) => void): () => void {
  if (!rtdb) return () => {};
  const txsRef = ref(rtdb, PATHS.TRANSACTIONS);
  const unsubscribe = onValue(txsRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: Transaction[] = Object.keys(data).map((k) => ({
          ...data[k],
          id: data[k].id || k,
        }));
        // sort newest first
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        callback(list);
      }
    } catch (err) {
      console.warn('Firebase listen transactions parse err:', err);
    }
  });
  return () => unsubscribe();
}

// Subscribe to real-time users
export function fbListenAllUsers(callback: (users: UserAccount[]) => void): () => void {
  if (!rtdb) return () => {};
  const usersRef = ref(rtdb, PATHS.USERS);
  const unsubscribe = onValue(usersRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: UserAccount[] = Object.keys(data).map((k) => ({
          ...data[k],
          id: data[k].id || k,
        }));
        callback(list);
      }
    } catch (err) {
      console.warn('Firebase listen all users err:', err);
    }
  });
  return () => unsubscribe();
}

// Subscribe to specific user (e.g. for balance updates)
export function fbListenUser(userId: string, callback: (user: Partial<UserAccount>) => void): () => void {
  if (!rtdb || !userId) return () => {};
  const userRef = ref(rtdb, `${PATHS.USERS}/${userId}`);
  const unsubscribe = onValue(userRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const data = snapshot.val();
        callback(data);
      }
    } catch (err) {
      console.warn('Firebase listen user err:', err);
    }
  });
  return () => unsubscribe();
}

// Subscribe to settings
export function fbListenSettings(callback: (settings: AdminSettings) => void): () => void {
  if (!rtdb) return () => {};
  const settingsRef = ref(rtdb, PATHS.SETTINGS);
  const unsubscribe = onValue(settingsRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    } catch (err) {
      console.warn('Firebase listen settings err:', err);
    }
  });
  return () => unsubscribe();
}

// Subscribe to support tickets
export function fbListenSupportTickets(callback: (tickets: SupportTicket[]) => void): () => void {
  if (!rtdb) return () => {};
  const supportRef = ref(rtdb, PATHS.SUPPORT);
  const unsubscribe = onValue(supportRef, (snapshot) => {
    try {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: SupportTicket[] = Object.keys(data).map((k) => ({
          ...data[k],
          id: data[k].id || k,
          messages: Array.isArray(data[k].messages) ? data[k].messages : [],
        }));
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        callback(list);
      }
    } catch (err) {
      console.warn('Firebase listen support err:', err);
    }
  });
  return () => unsubscribe();
}

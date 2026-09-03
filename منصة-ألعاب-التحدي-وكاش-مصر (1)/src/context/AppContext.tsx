import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Screen, UserAccount, Transaction, PaymentMethodType, AdminSettings, SupportTicket, SupportMessage } from '../types';
import { sound } from '../utils/sound';
import { detectDeviceInfo } from '../utils/device';
import {
  fbSaveUser,
  fbSaveTransaction,
  fbUpdateTransactionStatus,
  fbSaveSettings,
  fbSaveSupportTicket,
  fbAddSupportMessage,
  fbListenTransactions,
  fbListenAllUsers,
  fbListenUser,
  fbListenSettings,
  fbListenSupportTickets,
  fbBanUserAndDevice,
  fbUnban,
  fbDeleteUser,
  fbListenBanned,
  fbUpdatePresence,
  fbMarkOffline,
  fbDeleteTransaction,
  fbClearAllTransactions,
  fbResetAllPlatformData,
} from '../services/firebaseSync';
import { broadcastSync, subscribeSync } from '../services/broadcastSync';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  user: UserAccount;
  setUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  allUsers: UserAccount[];
  adminSettings: AdminSettings;
  updateAdminSettings: (settings: Partial<AdminSettings>) => void;
  login: (identifier: string, pass: string) => boolean;
  register: (phone: string, pass: string) => boolean;
  logout: () => void;
  selectedDepositMethod: PaymentMethodType;
  setSelectedDepositMethod: (method: PaymentMethodType) => void;
  deposit: (amount: number, method: string, senderPhone: string, receiptImage?: string, referenceCode?: string) => boolean;
  withdraw: (amount: number, walletNumber: string) => { success: boolean; error?: string };
  placeBet: (amount: number, game: string) => boolean;
  winBet: (amount: number, multiplier: number, game: string) => void;
  transactions: Transaction[];
  approveDeposit: (txId: string) => void;
  rejectDeposit: (txId: string, reason?: string) => void;
  approveWithdraw: (txId: string) => void;
  rejectWithdraw: (txId: string, reason?: string) => void;
  addBalanceByUserId: (userId: string, amount: number, note?: string) => { success: boolean; message: string };
  deleteAndBanUser: (userId: string, reason?: string) => Promise<boolean>;
  deleteUserOnly: (userId: string) => Promise<boolean>;
  deleteTransaction: (txId: string) => Promise<boolean>;
  clearAllTransactions: () => Promise<boolean>;
  resetAllPlatformData: () => Promise<boolean>;
  unbanUser: (identifier: string) => Promise<boolean>;
  isDeviceBanned: boolean;
  supportTickets: SupportTicket[];
  createSupportTicket: (subject: string, message: string) => Promise<string>;
  sendSupportMessage: (ticketId: string, text: string) => Promise<void>;
  resolveSupportTicket: (ticketId: string) => Promise<void>;
  isSupportOpen: boolean;
  setIsSupportOpen: (open: boolean) => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  vodafoneNumber: '01098688815',
  etisalatNumber: '01123456789',
  orangeNumber: '01234567890',
  instapayNumber: '01098688815',
  minDeposit: 10,
  minWithdraw: 50,
  platformName: '1X WINNER',
  autoApproveDeposits: false,
};

const GUEST_USER: UserAccount = {
  id: '',
  username: '',
  phone: '',
  balance: 0.0,
  isLoggedIn: false,
  registeredAt: 0,
  totalDeposited: 0,
  totalWithdrawn: 0,
  role: 'user',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Admin settings
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() => {
    try {
      const saved = localStorage.getItem('app_admin_settings');
      if (saved) return { ...DEFAULT_ADMIN_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_ADMIN_SETTINGS;
  });

  // All registered users
  const [allUsers, setAllUsers] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem('app_all_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Active current user session
  const [user, setUser] = useState<UserAccount>(() => {
    try {
      const saved = localStorage.getItem('app_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isLoggedIn && parsed.id) return parsed;
      }
    } catch {}
    return GUEST_USER;
  });

  // Screen
  const [screen, setScreenState] = useState<Screen>(() => {
    try {
      const saved = localStorage.getItem('app_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isLoggedIn && parsed.id) return 'lobby';
      }
    } catch {}
    return 'register';
  });

  const [selectedDepositMethod, setSelectedDepositMethod] = useState<PaymentMethodType>('vodafone');
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [isDeviceBanned, setIsDeviceBanned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_device_banned') === 'true';
    } catch {
      return false;
    }
  });
  const [bannedUsersMap, setBannedUsersMap] = useState<Record<string, any>>({});
  const [bannedDevicesMap, setBannedDevicesMap] = useState<Record<string, any>>({});

  // Transactions list
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('app_txs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Support Tickets
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    try {
      const saved = localStorage.getItem('app_support_tickets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Ref to track latest user balance for avoiding race conditions in listeners
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Persist states to local storage
  useEffect(() => {
    try {
      localStorage.setItem('app_admin_settings', JSON.stringify(adminSettings));
    } catch {}
  }, [adminSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('app_all_users', JSON.stringify(allUsers));
    } catch {}
  }, [allUsers]);

  useEffect(() => {
    try {
      if (user.isLoggedIn) {
        localStorage.setItem('app_user', JSON.stringify(user));
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    try {
      localStorage.setItem('app_txs', JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem('app_support_tickets', JSON.stringify(supportTickets));
    } catch {}
  }, [supportTickets]);

  // Realtime Firebase RTDB Listeners (Transactions, Settings, Support Tickets, Users)
  useEffect(() => {
    // 1. Transactions Listener
    const unsubTxs = fbListenTransactions((fbTxs) => {
      if (fbTxs && fbTxs.length > 0) {
        setTransactions(fbTxs);
        try {
          localStorage.setItem('app_txs', JSON.stringify(fbTxs));
        } catch {}
      }
    });

    // 2. Settings Listener
    const unsubSettings = fbListenSettings((fbSettings) => {
      if (fbSettings) {
        setAdminSettings((prev) => ({ ...prev, ...fbSettings }));
      }
    });

    // 3. All Users Listener
    const unsubAllUsers = fbListenAllUsers((fbUsers) => {
      if (fbUsers && fbUsers.length > 0) {
        setAllUsers(fbUsers);
        try {
          localStorage.setItem('app_all_users', JSON.stringify(fbUsers));
        } catch {}
      }
    });

    // 4. Support Tickets Listener
    const unsubSupport = fbListenSupportTickets((fbTickets) => {
      if (fbTickets) {
        setSupportTickets(fbTickets);
        try {
          localStorage.setItem('app_support_tickets', JSON.stringify(fbTickets));
        } catch {}
      }
    });

    // 5. Banned Users & Devices Listener
    const unsubBanned = fbListenBanned(({ users: bannedUsers, devices: bannedDevices }) => {
      setBannedUsersMap(bannedUsers || {});
      setBannedDevicesMap(bannedDevices || {});

      // Check current device
      const currentDev = detectDeviceInfo();
      const safeDevKey = currentDev.deviceId.replace(/[.#$[\]]/g, '_');
      const isThisDeviceBanned = Boolean(bannedDevices && (bannedDevices[safeDevKey] || bannedDevices[currentDev.deviceId]));

      // Check active user
      const currentUserPhone = userRef.current?.phone?.replace(/[^0-9]/g, '') || '';
      const isThisUserBanned = Boolean(
        userRef.current?.isBanned ||
        (userRef.current?.id && bannedUsers && bannedUsers[userRef.current.id]) ||
        (currentUserPhone && bannedUsers && bannedUsers[currentUserPhone])
      );

      if (isThisDeviceBanned || isThisUserBanned) {
        setIsDeviceBanned(true);
        try {
          localStorage.setItem('app_device_banned', 'true');
          localStorage.removeItem('app_user');
        } catch {}
        setUser(GUEST_USER);
        setScreenState('register');
      } else {
        // If explicitly unbanned
        if (!isThisDeviceBanned && !isThisUserBanned) {
          try {
            if (localStorage.getItem('app_device_banned') === 'true') {
              localStorage.removeItem('app_device_banned');
            }
          } catch {}
          setIsDeviceBanned(false);
        }
      }
    });

    return () => {
      unsubTxs();
      unsubSettings();
      unsubAllUsers();
      unsubSupport();
      unsubBanned();
    };
  }, []);

  // Listen to current active user's document in Firebase for instant live balance update
  useEffect(() => {
    if (!user.id) return;
    const unsubUser = fbListenUser(user.id, (userData) => {
      if (userData && typeof userData.balance === 'number') {
        setUser((prev) => {
          if (prev.balance !== userData.balance) {
            // Balance was updated externally (e.g. from Admin approval or top-up)
            if (userData.balance > prev.balance) {
              sound.playWin();
            }
            return {
              ...prev,
              balance: Number(userData.balance.toFixed(2)),
              totalDeposited: userData.totalDeposited ?? prev.totalDeposited,
              totalWithdrawn: userData.totalWithdrawn ?? prev.totalWithdrawn,
            };
          }
          return prev;
        });
      }
    });

    return () => unsubUser();
  }, [user.id]);

  // Real-time Presence Heartbeat: Keeps "المتصلين الآن" status 100% accurate in Admin Dashboard
  useEffect(() => {
    if (!user.id || user.id === 'guest') return;

    // Send immediate heartbeat on mount or login
    fbUpdatePresence(user.id);

    // Heartbeat every 10 seconds while tab is active
    const interval = setInterval(() => {
      fbUpdatePresence(user.id);
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fbUpdatePresence(user.id);
      } else {
        fbMarkOffline(user.id);
      }
    };

    const handleBeforeUnload = () => {
      fbMarkOffline(user.id);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user.id]);

  // Synchronize state with standalone HTML admin panel in real-time across tabs & broadcast channels
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      try {
        if (e.key === 'app_admin_settings' && e.newValue) {
          setAdminSettings(JSON.parse(e.newValue));
        }
        if (e.key === 'app_all_users' && e.newValue) {
          const parsedUsers: UserAccount[] = JSON.parse(e.newValue);
          setAllUsers(parsedUsers);
          const currentInParsed = parsedUsers.find((u) => u.id === user.id);
          if (currentInParsed) {
            setUser((prev) => ({ ...prev, balance: currentInParsed.balance }));
          }
        }
        if (e.key === 'app_user' && e.newValue) {
          setUser(JSON.parse(e.newValue));
        }
        if (e.key === 'app_txs' && e.newValue) {
          setTransactions(JSON.parse(e.newValue));
        }
        if (e.key === 'app_support_tickets' && e.newValue) {
          setSupportTickets(JSON.parse(e.newValue));
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorage);

    // Also listen to zero-latency BroadcastChannel
    const unsubBroadcast = subscribeSync((msg) => {
      try {
        if (msg.type === 'SETTINGS_UPDATED' && msg.data) {
          setAdminSettings((prev) => ({ ...prev, ...msg.data }));
        }
        if (msg.type === 'DEPOSIT_APPROVED' || msg.type === 'DIRECT_TOPUP' || msg.type === 'USER_UPDATED') {
          if (msg.data?.userId === user.id && typeof msg.data.newBalance === 'number') {
            sound.playWin();
            setUser((prev) => ({ ...prev, balance: msg.data.newBalance }));
          }
        }
        if (msg.type === 'WITHDRAW_REJECTED' && msg.data?.userId === user.id) {
          if (typeof msg.data.newBalance === 'number') {
            setUser((prev) => ({ ...prev, balance: msg.data.newBalance }));
          }
        }
        if (msg.type === 'SUPPORT_UPDATED' && msg.data) {
          setSupportTickets((prev) => {
            const index = prev.findIndex((t) => t.id === msg.data.id);
            if (index >= 0) {
              const clone = [...prev];
              clone[index] = msg.data;
              return clone;
            }
            return [msg.data, ...prev];
          });
        }
      } catch (err) {
        console.warn('Broadcast sync message handling error:', err);
      }
    });

    return () => {
      window.removeEventListener('storage', handleStorage);
      unsubBroadcast();
    };
  }, [user.id]);

  const setSoundEnabled = (val: boolean) => {
    setSoundEnabledState(val);
    sound.enabled = val;
  };

  const setScreen = (newScreen: Screen) => {
    sound.playClick();
    setScreenState(newScreen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const updateAdminSettings = (newSettings: Partial<AdminSettings>) => {
    const updated = { ...adminSettings, ...newSettings };
    setAdminSettings(updated);
    try {
      localStorage.setItem('app_admin_settings', JSON.stringify(updated));
    } catch {}
    fbSaveSettings(updated);
    broadcastSync('SETTINGS_UPDATED', updated);
    showToast('تم حفظ إعدادات وأرقام المنصة بنجاح ومزامنتها على السيرفر ✅', 'success');
  };

  const login = (identifier: string, _pass: string) => {
    sound.playClick();
    const dev = detectDeviceInfo();
    const safeDevKey = dev.deviceId.replace(/[.#$[\]]/g, '_');

    // 1. Check if device is banned
    if (isDeviceBanned || bannedDevicesMap[safeDevKey] || bannedDevicesMap[dev.deviceId]) {
      setIsDeviceBanned(true);
      try {
        localStorage.setItem('app_device_banned', 'true');
      } catch {}
      showToast('🚫 هذا الجهاز محظور نهائياً من دخول المنصة بواسطة إدارة النظام!', 'error');
      return false;
    }

    const trimmed = identifier.trim();
    const safePhone = trimmed.replace(/[^0-9]/g, '');

    // 2. Check if user identifier is banned
    if (
      bannedUsersMap[trimmed] ||
      (safePhone && bannedUsersMap[safePhone])
    ) {
      showToast('🚫 هذا الحساب محظور نهائياً من دخول المنصة بواسطة إدارة النظام!', 'error');
      return false;
    }

    const existing = allUsers.find(
      (u) => u.phone === trimmed || u.id === trimmed || u.username === trimmed
    );

    if (existing) {
      if (existing.isBanned || bannedUsersMap[existing.id] || (existing.phone && bannedUsersMap[existing.phone.replace(/[^0-9]/g, '')])) {
        showToast('🚫 هذا الحساب محظور نهائياً من دخول المنصة بواسطة إدارة النظام!', 'error');
        return false;
      }

      const loggedUser: UserAccount = {
        ...existing,
        isLoggedIn: true,
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
        deviceType: dev.deviceType,
        deviceOS: dev.deviceOS,
        deviceBrowser: dev.deviceBrowser,
        screenRes: dev.screenRes,
        lastLoginAt: Date.now(),
        lastActive: Date.now(),
      };
      setUser(loggedUser);
      fbSaveUser(loggedUser);
      try {
        localStorage.setItem('app_user', JSON.stringify(loggedUser));
      } catch {}
      showToast(`أهلاً بعودتك يا ${existing.username} (ID: ${existing.id}) 👋`, 'success');
      setScreenState('lobby');
      return true;
    } else {
      const newId = Math.floor(10000 + Math.random() * 90000).toString();
      const newUserObj: UserAccount = {
        id: newId,
        username: trimmed.startsWith('01') ? 'لاعب_' + trimmed.slice(-4) : trimmed,
        phone: trimmed.startsWith('01') ? trimmed : '010' + Math.floor(10000000 + Math.random() * 90000000),
        email: trimmed.includes('@') ? trimmed : undefined,
        balance: 0.0,
        isLoggedIn: true,
        registeredAt: Date.now(),
        totalDeposited: 0,
        totalWithdrawn: 0,
        role: 'user',
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
        deviceType: dev.deviceType,
        deviceOS: dev.deviceOS,
        deviceBrowser: dev.deviceBrowser,
        screenRes: dev.screenRes,
        lastLoginAt: Date.now(),
        lastActive: Date.now(),
      };
      const updatedList = [newUserObj, ...allUsers];
      setAllUsers(updatedList);
      setUser(newUserObj);
      fbSaveUser(newUserObj);
      try {
        localStorage.setItem('app_all_users', JSON.stringify(updatedList));
        localStorage.setItem('app_user', JSON.stringify(newUserObj));
        window.dispatchEvent(new Event('storage'));
      } catch {}
      showToast(`تم تسجيل الدخول بنجاح! كود الآي دي (ID) الخاص بك هو: ${newId}`, 'success');
      setScreenState('lobby');
      return true;
    }
  };

  const register = (phone: string, _pass: string) => {
    sound.playClick();
    const dev = detectDeviceInfo();
    const safeDevKey = dev.deviceId.replace(/[.#$[\]]/g, '_');

    // 1. Check if device is banned
    if (isDeviceBanned || bannedDevicesMap[safeDevKey] || bannedDevicesMap[dev.deviceId]) {
      setIsDeviceBanned(true);
      try {
        localStorage.setItem('app_device_banned', 'true');
      } catch {}
      showToast('🚫 هذا الجهاز محظور نهائياً من دخول المنصة بواسطة إدارة النظام!', 'error');
      return false;
    }

    const trimmedPhone = phone.trim();
    const safePhone = trimmedPhone.replace(/[^0-9]/g, '');

    // 2. Check if phone is banned
    if (bannedUsersMap[trimmedPhone] || (safePhone && bannedUsersMap[safePhone])) {
      showToast('🚫 هذا الرقم محظور نهائياً من التسجيل في المنصة بواسطة إدارة النظام!', 'error');
      return false;
    }

    const existing = allUsers.find((u) => u.phone === trimmedPhone);
    if (existing) {
      if (existing.isBanned || bannedUsersMap[existing.id] || (existing.phone && bannedUsersMap[existing.phone.replace(/[^0-9]/g, '')])) {
        showToast('🚫 هذا الحساب محظور نهائياً من دخول المنصة بواسطة إدارة النظام!', 'error');
        return false;
      }
      const loggedUser: UserAccount = {
        ...existing,
        isLoggedIn: true,
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
        deviceType: dev.deviceType,
        deviceOS: dev.deviceOS,
        deviceBrowser: dev.deviceBrowser,
        screenRes: dev.screenRes,
        lastLoginAt: Date.now(),
        lastActive: Date.now(),
      };
      setUser(loggedUser);
      fbSaveUser(loggedUser);
      try {
        localStorage.setItem('app_user', JSON.stringify(loggedUser));
      } catch {}
      showToast(`هذا الرقم مسجل بالفعل! تم تسجيل دخولك لحسابك (ID: ${existing.id}) 👋`, 'success');
      setScreenState('lobby');
      return true;
    }

    const newId = Math.floor(10000 + Math.random() * 90000).toString();
    const newUserObj: UserAccount = {
      id: newId,
      username: 'لاعب_' + trimmedPhone.slice(-4),
      phone: trimmedPhone,
      balance: 0.0,
      isLoggedIn: true,
      registeredAt: Date.now(),
      totalDeposited: 0,
      totalWithdrawn: 0,
      role: 'user',
      deviceId: dev.deviceId,
      deviceName: dev.deviceName,
      deviceType: dev.deviceType,
      deviceOS: dev.deviceOS,
      deviceBrowser: dev.deviceBrowser,
      screenRes: dev.screenRes,
      lastLoginAt: Date.now(),
      lastActive: Date.now(),
    };

    const updatedList = [newUserObj, ...allUsers];
    setAllUsers(updatedList);
    setUser(newUserObj);
    fbSaveUser(newUserObj);
    try {
      localStorage.setItem('app_all_users', JSON.stringify(updatedList));
      localStorage.setItem('app_user', JSON.stringify(newUserObj));
      window.dispatchEvent(new Event('storage'));
    } catch {}

    showToast(`تم إنشاء الحساب بنجاح! كود الآي دي (ID) الخاص بك هو: ${newId}`, 'success');
    setScreenState('lobby');
    return true;
  };

  const logout = () => {
    sound.playClick();
    try {
      localStorage.removeItem('app_user');
    } catch {}
    setUser(GUEST_USER);
    setScreenState('register');
    showToast('تم تسجيل الخروج بنجاح. يمكنك الآن تسجيل الدخول أو إنشاء حساب جديد', 'info');
  };

  // Permanently delete user and ban their phone and device
  const deleteAndBanUser = async (userId: string, reason: string = 'تم الحظر بواسطة الإدارة'): Promise<boolean> => {
    try {
      const target = allUsers.find((u) => u.id === userId);
      const phone = target?.phone || '';
      const deviceId = target?.deviceId || '';
      const username = target?.username || '';

      // 1. Push ban records to Firebase RTDB
      await fbBanUserAndDevice(userId, phone, deviceId, username, reason);

      // 2. Delete user from Firebase RTDB users collection
      await fbDeleteUser(userId);

      // 3. Update local state
      const updatedUsers = allUsers.filter((u) => u.id !== userId);
      setAllUsers(updatedUsers);
      try {
        localStorage.setItem('app_all_users', JSON.stringify(updatedUsers));
      } catch {}

      // 4. If target is current active user, log them out and ban screen
      if (user.id === userId) {
        setIsDeviceBanned(true);
        try {
          localStorage.setItem('app_device_banned', 'true');
          localStorage.removeItem('app_user');
        } catch {}
        setUser(GUEST_USER);
        setScreenState('register');
      }

      // 5. Broadcast to all open tabs
      broadcastSync('USER_BANNED', { userId, phone, deviceId });

      showToast(`تم حذف المستخدم (ID: ${userId}) وحظر جهازه ورقم هاتفه نهائياً 🚫`, 'success');
      return true;
    } catch (err) {
      console.error('deleteAndBanUser error:', err);
      showToast('حدث خطأ أثناء محاولة حذف وحظر المستخدم', 'error');
      return false;
    }
  };

  // Unban user or device
  const unbanUser = async (identifier: string): Promise<boolean> => {
    try {
      await fbUnban(identifier);
      broadcastSync('USER_UNBANNED', { identifier });
      showToast(`تم رفع الحظر عن (${identifier}) بنجاح ✅`, 'success');
      return true;
    } catch (err) {
      console.error('unbanUser error:', err);
      showToast('حدث خطأ أثناء محاولة فك الحظر', 'error');
      return false;
    }
  };

  // Delete user account only (without banning phone or device)
  const deleteUserOnly = async (userId: string): Promise<boolean> => {
    try {
      await fbDeleteUser(userId);
      const updated = allUsers.filter((u) => u.id !== userId);
      setAllUsers(updated);
      try {
        localStorage.setItem('app_all_users', JSON.stringify(updated));
      } catch {}
      if (user.id === userId) {
        logout();
      }
      showToast(`تم مسح المستخدم (ID: ${userId}) بنجاح 🗑️`, 'success');
      return true;
    } catch (err) {
      console.error('deleteUserOnly error:', err);
      showToast('حدث خطأ أثناء مسح المستخدم', 'error');
      return false;
    }
  };

  // Delete single transaction (deposit or withdraw)
  const deleteTransaction = async (txId: string): Promise<boolean> => {
    try {
      await fbDeleteTransaction(txId);
      const updated = transactions.filter((t) => t.id !== txId);
      setTransactions(updated);
      try {
        localStorage.setItem('app_txs', JSON.stringify(updated));
      } catch {}
      showToast(`تم مسح المعاملة (${txId}) بنجاح 🗑️`, 'success');
      return true;
    } catch (err) {
      console.error('deleteTransaction error:', err);
      showToast('حدث خطأ أثناء مسح المعاملة', 'error');
      return false;
    }
  };

  // Clear all transactions (zero out deposits and withdrawals)
  const clearAllTransactions = async (): Promise<boolean> => {
    try {
      await fbClearAllTransactions();
      setTransactions([]);
      try {
        localStorage.removeItem('app_txs');
      } catch {}
      showToast('تم تصفير ومسح جميع طلبات الإيداع والسحب بنجاح 🧹', 'success');
      return true;
    } catch (err) {
      console.error('clearAllTransactions error:', err);
      showToast('حدث خطأ أثناء تصفير المعاملات', 'error');
      return false;
    }
  };

  // Master Zero Reset: Wipe all platform data to 0 (start completely fresh)
  const resetAllPlatformData = async (): Promise<boolean> => {
    try {
      await fbResetAllPlatformData();
      setTransactions([]);
      setAllUsers([]);
      setSupportTickets([]);
      setBannedUsersMap({});
      setBannedDevicesMap({});
      try {
        localStorage.removeItem('app_txs');
        localStorage.removeItem('app_all_users');
        localStorage.removeItem('app_support_tickets');
        localStorage.removeItem('app_user');
        localStorage.removeItem('app_device_banned');
      } catch {}
      setUser(GUEST_USER);
      setScreenState('register');
      showToast('تم تصفير جميع بيانات المنصة بالكامل (0 مستخدمين - 0 طلبات). تم البدء من جديد!', 'success');
      return true;
    } catch (err) {
      console.error('resetAllPlatformData error:', err);
      showToast('حدث خطأ أثناء تصفير البيانات', 'error');
      return false;
    }
  };

  // User submits a deposit request -> saved to Firebase and local storage
  const deposit = (
    amount: number,
    method: string,
    senderPhone: string,
    receiptImage?: string,
    referenceCode?: string
  ) => {
    if (amount <= 0) return false;

    // Ensure we have a valid user ID attached
    let currentUserId = user.id;
    let currentUserName = user.username;
    let currentUserPhone = user.phone || senderPhone;

    if (!currentUserId || currentUserId.trim() === '' || currentUserId === 'N/A') {
      currentUserId = Math.floor(10000 + Math.random() * 90000).toString();
      currentUserName = 'لاعب_' + (senderPhone.slice(-4) || currentUserId);
      currentUserPhone = senderPhone;
      const newUserObj: UserAccount = {
        id: currentUserId,
        username: currentUserName,
        phone: currentUserPhone,
        balance: 0.0,
        isLoggedIn: true,
        registeredAt: Date.now(),
        totalDeposited: 0,
        totalWithdrawn: 0,
        role: 'user',
      };
      setUser(newUserObj);
      fbSaveUser(newUserObj);
      setAllUsers((prev) => [newUserObj, ...prev]);
      try {
        localStorage.setItem('app_user', JSON.stringify(newUserObj));
      } catch {}
    }

    const newTxId = 'DEP-' + Math.floor(100000 + Math.random() * 900000);
    const isAuto = adminSettings.autoApproveDeposits;

    const newTx: Transaction = {
      id: newTxId,
      userId: currentUserId,
      userName: currentUserName || 'لاعب',
      userPhone: currentUserPhone || senderPhone,
      type: 'deposit',
      amount: Number(amount),
      method: method || 'فودافون كاش',
      senderPhone: senderPhone || '',
      receiptImage: receiptImage || '',
      referenceCode: referenceCode || '',
      status: isAuto ? 'completed' : 'pending',
      timestamp: Date.now(),
    };

    setTransactions((prev) => {
      const updated = [newTx, ...prev];
      try {
        localStorage.setItem('app_txs', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
      } catch {}
      return updated;
    });

    // Save to Firebase RTDB for instant admin notification
    fbSaveTransaction(newTx);
    broadcastSync('NEW_DEPOSIT', newTx);

    if (isAuto) {
      sound.playWin();
      const updatedUser = {
        ...user,
        balance: Number((user.balance + amount).toFixed(2)),
        totalDeposited: (user.totalDeposited || 0) + amount,
      };
      setUser(updatedUser);
      fbSaveUser(updatedUser);
      showToast(`تم إيداع ${amount.toFixed(2)} ج.م بنجاح في حسابك!`, 'success');
    } else {
      sound.playClick();
      showToast(
        `تم إرسال طلب الإيداع بقيمة ${amount.toFixed(2)} ج.م بنجاح ومزامنته مع الإدارة للمراجعة وإضافة الرصيد فوراً.`,
        'info'
      );
    }
    return true;
  };

  // Admin approves a deposit
  const approveDeposit = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'pending') return;

    sound.playWin();

    // 1. Update Transaction status in React state and Firebase
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'completed' } : t))
    );
    fbUpdateTransactionStatus(txId, 'completed');

    // 2. Add money to that specific user
    const targetUser = allUsers.find((u) => u.id === tx.userId);
    let finalBal = 0;
    if (targetUser) {
      const newBal = Number((targetUser.balance + tx.amount).toFixed(2));
      finalBal = newBal;
      const newTotalDep = (targetUser.totalDeposited || 0) + tx.amount;
      const updatedTargetUser = { ...targetUser, balance: newBal, totalDeposited: newTotalDep };

      setAllUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === tx.userId ? updatedTargetUser : u))
      );
      fbSaveUser(updatedTargetUser);
    }

    // 3. If currently logged-in user matches, update their active balance immediately
    if (user.id === tx.userId) {
      const updatedActiveUser = {
        ...user,
        balance: Number((user.balance + tx.amount).toFixed(2)),
        totalDeposited: (user.totalDeposited || 0) + tx.amount,
      };
      finalBal = updatedActiveUser.balance;
      setUser(updatedActiveUser);
      fbSaveUser(updatedActiveUser);
    }

    broadcastSync('DEPOSIT_APPROVED', { txId, userId: tx.userId, newBalance: finalBal, amount: tx.amount });
    showToast(`✅ تم قبول الإيداع بنجاح وتمت إضافة ${tx.amount} ج.م تلقائياً لحساب اللاعب (ID: ${tx.userId})`, 'success');
  };

  // Admin rejects a deposit
  const rejectDeposit = (txId: string, reason?: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'pending') return;

    sound.playCrash();

    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'rejected', note: reason || 'تم رفض الإيداع من قبل الإدارة' } : t))
    );
    fbUpdateTransactionStatus(txId, 'rejected', reason || 'تم رفض الإيداع من قبل الإدارة');
    broadcastSync('DEPOSIT_REJECTED', { txId, userId: tx.userId, reason });

    showToast(`❌ تم رفض طلب الإيداع (ID: ${tx.userId})`, 'info');
  };

  // Admin approves withdrawal
  const approveWithdraw = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'pending') return;

    sound.playClick();
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'completed' } : t))
    );
    fbUpdateTransactionStatus(txId, 'completed');

    // Update user totalWithdrawn
    const targetUser = allUsers.find((u) => u.id === tx.userId);
    if (targetUser) {
      const updated = {
        ...targetUser,
        totalWithdrawn: (targetUser.totalWithdrawn || 0) + tx.amount,
      };
      fbSaveUser(updated);
    }

    broadcastSync('WITHDRAW_APPROVED', { txId, userId: tx.userId });
    showToast(`✅ تم تأكيد إرسال مبلغ السحب ${tx.amount} ج.م للاعب (ID: ${tx.userId})`, 'success');
  };

  // Admin rejects withdrawal & refunds user balance
  const rejectWithdraw = (txId: string, reason?: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'pending') return;

    sound.playCrash();

    let refundedBal = 0;
    // Refund balance
    const targetUser = allUsers.find((u) => u.id === tx.userId);
    if (targetUser) {
      const refunded = { ...targetUser, balance: Number((targetUser.balance + tx.amount).toFixed(2)) };
      refundedBal = refunded.balance;
      setAllUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === tx.userId ? refunded : u))
      );
      fbSaveUser(refunded);
    }

    if (user.id === tx.userId) {
      const refundedActive = {
        ...user,
        balance: Number((user.balance + tx.amount).toFixed(2)),
      };
      refundedBal = refundedActive.balance;
      setUser(refundedActive);
      fbSaveUser(refundedActive);
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'rejected', note: reason || 'تم رفض السحب وإرجاع المبلغ للرصيد' } : t))
    );
    fbUpdateTransactionStatus(txId, 'rejected', reason || 'تم رفض السحب وإرجاع المبلغ للرصيد');
    broadcastSync('WITHDRAW_REJECTED', { txId, userId: tx.userId, newBalance: refundedBal });

    showToast(`تم رفض طلب السحب وإرجاع مبلغ ${tx.amount} ج.م لرصيد اللاعب.`, 'info');
  };

  // Admin directly credits balance by User ID
  const addBalanceByUserId = (userId: string, amount: number, note?: string) => {
    const trimmedId = userId.trim();
    const targetUser = allUsers.find((u) => u.id === trimmedId || u.phone === trimmedId);

    if (!targetUser) {
      showToast(`عفواً، لم يتم العثور على لاعب بالـ ID أو رقم الهاتف: ${trimmedId}`, 'error');
      return { success: false, message: 'مستخدم غير موجود' };
    }

    sound.playWin();

    const updatedBal = Number(Math.max(0, targetUser.balance + amount).toFixed(2));
    const updatedUserObj = {
      ...targetUser,
      balance: updatedBal,
      totalDeposited: amount > 0 ? (targetUser.totalDeposited || 0) + amount : targetUser.totalDeposited,
    };

    setAllUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === targetUser.id ? updatedUserObj : u))
    );
    fbSaveUser(updatedUserObj);

    if (user.id === targetUser.id) {
      setUser(updatedUserObj);
    }

    const newTx: Transaction = {
      id: 'ADM-' + Math.floor(100000 + Math.random() * 900000),
      userId: targetUser.id,
      userName: targetUser.username,
      userPhone: targetUser.phone,
      type: 'admin_adjustment',
      amount: Math.abs(amount),
      method: amount >= 0 ? 'إضافة رصيد من الإدارة' : 'خصم رصيد من الإدارة',
      status: 'completed',
      timestamp: Date.now(),
      note: note || 'شحن رصيد مباشر من لوحة التحكم',
    };
    setTransactions((prev) => [newTx, ...prev]);
    fbSaveTransaction(newTx);
    broadcastSync('DIRECT_TOPUP', { userId: targetUser.id, newBalance: updatedBal, amount });

    showToast(
      `تمت إضافة ${amount} ج.م بنجاح للاعب: ${targetUser.username} (ID: ${targetUser.id})!`,
      'success'
    );
    return { success: true, message: 'تم الشحن بنجاح' };
  };

  const withdraw = (amount: number, walletNumber: string) => {
    if (amount < adminSettings.minWithdraw) {
      sound.playCrash();
      showToast(`الحد الأدنى للسحب هو ${adminSettings.minWithdraw} جنيه`, 'error');
      return { success: false, error: `الحد الأدنى للسحب هو ${adminSettings.minWithdraw} جنيه` };
    }
    if (amount > user.balance) {
      sound.playCrash();
      showToast('رصيدك الحالي غير كافٍ لإتمام السحب', 'error');
      return { success: false, error: 'رصيد غير كافٍ' };
    }
    sound.playClick();
    const updatedUser = {
      ...user,
      balance: Number((user.balance - amount).toFixed(2)),
    };
    setUser(updatedUser);
    fbSaveUser(updatedUser);

    const newTx: Transaction = {
      id: 'WTH-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      userName: user.username,
      userPhone: user.phone,
      type: 'withdraw',
      amount,
      phone: walletNumber,
      status: 'pending',
      timestamp: Date.now(),
    };
    setTransactions((prev) => [newTx, ...prev]);
    fbSaveTransaction(newTx);
    broadcastSync('NEW_WITHDRAW', newTx);

    showToast(`تم إرسال طلب سحب بقيمة ${amount.toFixed(2)} ج.م بنجاح ومزامنته مع الإدارة.`, 'success');
    return { success: true };
  };

  const placeBet = (amount: number, _game: string): boolean => {
    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ رهان صالح', 'error');
      return false;
    }
    if (amount > user.balance) {
      sound.playCrash();
      showToast('رصيدك غير كافٍ! يرجى شحن الحساب', 'error');
      return false;
    }
    sound.playClick();
    const updatedUser = {
      ...user,
      balance: Number(Math.max(0, user.balance - amount).toFixed(2)),
    };
    setUser(updatedUser);
    fbSaveUser(updatedUser);
    return true;
  };

  const winBet = (amount: number, multiplier: number, game: string) => {
    sound.playWin();
    const winAmount = Number((amount * multiplier).toFixed(2));
    const updatedUser = {
      ...user,
      balance: Number((user.balance + winAmount).toFixed(2)),
    };
    setUser(updatedUser);
    fbSaveUser(updatedUser);

    const newTx: Transaction = {
      id: 'WIN-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      userName: user.username,
      userPhone: user.phone,
      type: 'win',
      amount: winAmount,
      game,
      multiplier,
      status: 'completed',
      timestamp: Date.now(),
    };
    setTransactions((prev) => [newTx, ...prev]);
    fbSaveTransaction(newTx);

    showToast(`مبروك! ربحت ${winAmount.toFixed(2)} ج.م بنسبة (${multiplier.toFixed(2)}x)! 🎉`, 'success');
  };

  // Support Ticket Actions
  const createSupportTicket = async (subject: string, messageText: string): Promise<string> => {
    const ticketId = 'TICK-' + Math.floor(100000 + Math.random() * 900000);
    const initialMsg: SupportMessage = {
      id: 'MSG-' + Math.floor(100000 + Math.random() * 900000),
      sender: 'user',
      senderName: user.username || 'اللاعب',
      text: messageText.trim(),
      timestamp: Date.now(),
    };

    const newTicket: SupportTicket = {
      id: ticketId,
      userId: user.id || 'N/A',
      userName: user.username || 'لاعب',
      userPhone: user.phone || 'N/A',
      subject: subject.trim(),
      messages: [initialMsg],
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSupportTickets((prev) => [newTicket, ...prev]);
    await fbSaveSupportTicket(newTicket);

    showToast('تم إرسال رسالة الدعم الفني بنجاح! سيتم الرد عليك في أقرب وقت ✅', 'success');
    return ticketId;
  };

  const sendSupportMessage = async (ticketId: string, text: string): Promise<void> => {
    const msg: SupportMessage = {
      id: 'MSG-' + Math.floor(100000 + Math.random() * 900000),
      sender: 'user',
      senderName: user.username || 'اللاعب',
      text: text.trim(),
      timestamp: Date.now(),
    };

    setSupportTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              messages: [...(t.messages || []), msg],
              status: 'open',
              updatedAt: Date.now(),
            }
          : t
      )
    );

    await fbAddSupportMessage(ticketId, msg);
  };

  const resolveSupportTicket = async (ticketId: string): Promise<void> => {
    setSupportTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: 'resolved', updatedAt: Date.now() } : t))
    );
    const target = supportTickets.find((t) => t.id === ticketId);
    if (target) {
      await fbSaveSupportTicket({ ...target, status: 'resolved', updatedAt: Date.now() });
    }
  };

  return (
    <AppContext.Provider
      value={{
        screen,
        setScreen,
        user,
        setUser,
        allUsers,
        adminSettings,
        updateAdminSettings,
        login,
        register,
        logout,
        selectedDepositMethod,
        setSelectedDepositMethod,
        deposit,
        withdraw,
        placeBet,
        winBet,
        transactions,
        approveDeposit,
        rejectDeposit,
        approveWithdraw,
        rejectWithdraw,
        addBalanceByUserId,
        deleteAndBanUser,
        deleteUserOnly,
        deleteTransaction,
        clearAllTransactions,
        resetAllPlatformData,
        unbanUser,
        isDeviceBanned,
        supportTickets,
        createSupportTicket,
        sendSupportMessage,
        resolveSupportTicket,
        isSupportOpen,
        setIsSupportOpen,
        toasts,
        showToast,
        soundEnabled,
        setSoundEnabled,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

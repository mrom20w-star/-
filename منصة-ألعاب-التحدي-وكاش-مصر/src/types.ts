export type Screen =
  | 'login'
  | 'register'
  | 'lobby'
  | 'crash'
  | 'apple_of_fortune'
  | 'gems_odyssey'
  | 'royal_hilo'
  | 'mundial'
  | 'four_aces'
  | 'deposit'
  | 'deposit_method'
  | 'withdraw'
  | 'history'
  | 'admin';

export type PaymentMethodType = 'vodafone' | 'etisalat' | 'orange';

export interface UserAccount {
  id: string; // Unique 5-6 digit user ID e.g. "84920"
  username: string;
  phone: string;
  email?: string;
  balance: number;
  isLoggedIn: boolean;
  registeredAt: number;
  totalDeposited?: number;
  totalWithdrawn?: number;
  role?: 'user' | 'admin';
  // Device tracking information
  deviceId?: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  deviceOS?: string;
  deviceBrowser?: string;
  screenRes?: string;
  ip?: string;
  lastActive?: number;
  lastLoginAt?: number;
  // Ban & Deletion status
  isBanned?: boolean;
  bannedAt?: number;
  banReason?: string;
}

export interface BannedRecord {
  id: string;
  userId?: string;
  phone?: string;
  deviceId?: string;
  deviceName?: string;
  username?: string;
  bannedAt: number;
  reason?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  type: 'deposit' | 'withdraw' | 'win' | 'bet' | 'admin_adjustment';
  amount: number;
  method?: string;
  senderPhone?: string;
  phone?: string;
  referenceCode?: string;
  receiptImage?: string;
  status: 'completed' | 'pending' | 'rejected';
  timestamp: number;
  game?: string;
  multiplier?: number;
  note?: string;
}

export interface LiveBet {
  user: string;
  bet: number;
  odds?: number;
  win?: number;
  cashedOut: boolean;
  avatar?: string;
}

export interface AppleRowState {
  multiplier: number;
  selectedColumn: number | null;
  rottenIndex: number[];
  revealed: boolean[];
  status: 'locked' | 'active' | 'passed' | 'failed';
}

export interface AdminSettings {
  vodafoneNumber: string;
  etisalatNumber: string;
  orangeNumber: string;
  instapayNumber: string;
  minDeposit: number;
  minWithdraw: number;
  platformName: string;
  autoApproveDeposits: boolean;
}

export interface SupportMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  subject: string;
  messages: SupportMessage[];
  status: 'open' | 'resolved';
  createdAt: number;
  updatedAt: number;
}

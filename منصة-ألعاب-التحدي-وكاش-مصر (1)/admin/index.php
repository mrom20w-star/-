<?php
/**
 * 1X WINNER - لوحة تحكم الإدارة الرسمية المتقدمة (PHP Admin Dashboard)
 * نظام إدارة العمليات، تتبع أجهزة اللاعبين والمستخدمين، حذف وحظر الأجهزة نهائياً
 */

error_reporting(E_ALL & ~E_NOTICE);
ini_set('display_errors', '0');

// Firebase Realtime Database Configuration
define('FB_DB_URL', 'https://c8ad7c49-cb5-default-rtdb.firebaseio.com/');
define('LOCAL_DATA_DIR', __DIR__ . '/data/');

if (!is_dir(LOCAL_DATA_DIR)) {
    @mkdir(LOCAL_DATA_DIR, 0777, true);
}

// -------------------------------------------------------------
// Helper Functions for Firebase REST API
// -------------------------------------------------------------
function fb_request($path, $method = 'GET', $data = null) {
    $url = rtrim(FB_DB_URL, '/') . '/' . ltrim($path, '/') . '.json';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    if ($data !== null) {
        $json = is_string($data) ? $data : json_encode($data);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [
        'code' => $httpCode,
        'data' => json_decode($response, true),
        'raw' => $response
    ];
}

function fb_get($path) {
    $res = fb_request($path, 'GET');
    return $res['data'] ?: [];
}

function fb_put($path, $data) {
    return fb_request($path, 'PUT', $data);
}

function fb_patch($path, $data) {
    return fb_request($path, 'PATCH', $data);
}

function fb_delete($path) {
    return fb_request($path, 'DELETE');
}

function safe_date($ts) {
    if (empty($ts)) return 'حديثاً';
    $intSec = intval(round(floatval($ts) / 1000));
    return $intSec > 0 ? date('Y-m-d H:i', $intSec) : 'حديثاً';
}

function safe_first_char($str) {
    if (function_exists('mb_substr')) {
        return mb_substr($str, 0, 1, 'UTF-8');
    }
    return substr($str, 0, 1);
}

// -------------------------------------------------------------
// AJAX API Request Handling (JSON responses for live operations)
// -------------------------------------------------------------
if (isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');
    $action = $_GET['action'];
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    // 1. Permanently Ban and Delete User and Device
    if ($action === 'delete_ban_user') {
        $userId = trim($input['userId'] ?? '');
        $phone = trim($input['phone'] ?? '');
        $deviceId = trim($input['deviceId'] ?? '');
        $username = trim($input['username'] ?? 'لاعب');
        $reason = trim($input['reason'] ?? 'تم الحظر والحذف نهائياً بواسطة الإدارة');
        $now = time() * 1000;

        if (!$userId && !$phone && !$deviceId) {
            echo json_encode(['success' => false, 'error' => 'بيانات المستخدم غير مكتملة']);
            exit;
        }

        $banRecord = [
            'userId' => $userId,
            'phone' => $phone,
            'deviceId' => $deviceId,
            'username' => $username,
            'bannedAt' => $now,
            'reason' => $reason
        ];

        // A. Ban by User ID
        if ($userId) {
            fb_put("banned_users/{$userId}", $banRecord);
            // Delete user from active users
            fb_delete("users/{$userId}");
        }

        // B. Ban by Phone Number
        if ($phone) {
            $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
            if ($cleanPhone) {
                fb_put("banned_users/{$cleanPhone}", $banRecord);
            }
        }

        // C. Ban by Device ID / Fingerprint
        if ($deviceId) {
            $safeDeviceKey = preg_replace('/[.#$[\]]/', '_', $deviceId);
            fb_put("banned_devices/{$safeDeviceKey}", $banRecord);
        }

        // D. Save to local banned file as well
        $localBannedFile = LOCAL_DATA_DIR . 'banned.json';
        $localBanned = file_exists($localBannedFile) ? json_decode(file_get_contents($localBannedFile), true) : [];
        $localBanned[$userId ?: ($phone ?: $deviceId)] = $banRecord;
        @file_put_contents($localBannedFile, json_encode($localBanned, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        echo json_encode([
            'success' => true,
            'message' => "تم حذف المستخدم (ID: {$userId}) وحظر الجهاز ({$deviceId}) ورقم الهاتف نهائياً من المنصة."
        ]);
        exit;
    }

    // 2. Unban User or Device
    if ($action === 'unban') {
        $key = trim($input['identifier'] ?? '');
        if (!$key) {
            echo json_encode(['success' => false, 'error' => 'المعرف مطلوب']);
            exit;
        }

        $safeKey = preg_replace('/[.#$[\]]/', '_', $key);
        fb_delete("banned_users/{$safeKey}");
        fb_delete("banned_devices/{$safeKey}");

        // Also clean local banned file
        $localBannedFile = LOCAL_DATA_DIR . 'banned.json';
        if (file_exists($localBannedFile)) {
            $localBanned = json_decode(file_get_contents($localBannedFile), true) ?: [];
            unset($localBanned[$key], $localBanned[$safeKey]);
            @file_put_contents($localBannedFile, json_encode($localBanned, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }

        echo json_encode(['success' => true, 'message' => "تم رفع الحظر بنجاح عن {$key}."]);
        exit;
    }

    // 3. Approve Deposit
    if ($action === 'approve_deposit') {
        $txId = trim($input['txId'] ?? '');
        if (!$txId) {
            echo json_encode(['success' => false, 'error' => 'كود المعاملة مطلوب']);
            exit;
        }

        $tx = fb_get("transactions/{$txId}");
        if (!$tx || empty($tx['userId'])) {
            echo json_encode(['success' => false, 'error' => 'لم يتم العثور على المعاملة']);
            exit;
        }

        $userId = $tx['userId'];
        $amount = floatval($tx['amount'] ?? 0);

        // Update transaction status
        fb_patch("transactions/{$txId}", ['status' => 'completed']);

        // Update user balance
        $user = fb_get("users/{$userId}");
        if ($user) {
            $currentBal = floatval($user['balance'] ?? 0);
            $currentDep = floatval($user['totalDeposited'] ?? 0);
            $newBal = round($currentBal + $amount, 2);
            $newDep = round($currentDep + $amount, 2);

            fb_patch("users/{$userId}", [
                'balance' => $newBal,
                'totalDeposited' => $newDep,
                'lastSeen' => time() * 1000
            ]);
        }

        echo json_encode(['success' => true, 'message' => "تمت الموافقة على إيداع {$amount} ج.م وإضافتها لرصيد اللاعب بنجاح."]);
        exit;
    }

    // 4. Reject Deposit
    if ($action === 'reject_deposit') {
        $txId = trim($input['txId'] ?? '');
        $reason = trim($input['reason'] ?? 'لم يتم استلام التحويل');
        fb_patch("transactions/{$txId}", ['status' => 'rejected', 'note' => $reason]);
        echo json_encode(['success' => true, 'message' => 'تم رفض الإيداع']);
        exit;
    }

    // 5. Approve Withdrawal
    if ($action === 'approve_withdraw') {
        $txId = trim($input['txId'] ?? '');
        fb_patch("transactions/{$txId}", ['status' => 'completed']);
        echo json_encode(['success' => true, 'message' => 'تم تأكيد تحويل السحب للاعب بنجاح.']);
        exit;
    }

    // 6. Reject Withdrawal
    if ($action === 'reject_withdraw') {
        $txId = trim($input['txId'] ?? '');
        $reason = trim($input['reason'] ?? 'رقم المحفظة غير صحيح');
        $tx = fb_get("transactions/{$txId}");
        if ($tx && !empty($tx['userId'])) {
            $userId = $tx['userId'];
            $amount = floatval($tx['amount'] ?? 0);
            $user = fb_get("users/{$userId}");
            if ($user) {
                $curBal = floatval($user['balance'] ?? 0);
                fb_patch("users/{$userId}", ['balance' => round($curBal + $amount, 2)]);
            }
        }
        fb_patch("transactions/{$txId}", ['status' => 'rejected', 'note' => $reason]);
        echo json_encode(['success' => true, 'message' => 'تم رفض طلب السحب وإرجاع المبلغ لمحفظة اللاعب.']);
        exit;
    }

    // 7. Direct Top-up
    if ($action === 'direct_recharge') {
        $userId = trim($input['userId'] ?? '');
        $amount = floatval($input['amount'] ?? 0);
        if (!$userId || $amount <= 0) {
            echo json_encode(['success' => false, 'error' => 'معرف اللاعب والمبلغ مطلوبان']);
            exit;
        }

        $user = fb_get("users/{$userId}");
        if (!$user) {
            echo json_encode(['success' => false, 'error' => 'لم يتم العثور على اللاعب']);
            exit;
        }

        $curBal = floatval($user['balance'] ?? 0);
        $newBal = round($curBal + $amount, 2);
        fb_patch("users/{$userId}", ['balance' => $newBal]);

        // Create transaction record
        $txId = 'TX-ADMIN-' . rand(100000, 999999);
        fb_put("transactions/{$txId}", [
            'id' => $txId,
            'userId' => $userId,
            'userName' => $user['username'] ?? 'لاعب',
            'userPhone' => $user['phone'] ?? '',
            'type' => 'deposit',
            'amount' => $amount,
            'method' => 'شحن يدوي مباشر من الإدارة',
            'status' => 'completed',
            'timestamp' => time() * 1000,
            'note' => 'شحن رصيد بواسطة مسؤول النظام'
        ]);

        echo json_encode(['success' => true, 'message' => "تم شحن {$amount} ج.م للاعب بنجاح. الرصيد الجديد: {$newBal} ج.م"]);
        exit;
    }

    // 8. Save Settings
    if ($action === 'save_settings') {
        $settings = [
            'vodafoneNumber' => trim($input['vodafoneNumber'] ?? '01098688815'),
            'etisalatNumber' => trim($input['etisalatNumber'] ?? '01123456789'),
            'orangeNumber' => trim($input['orangeNumber'] ?? '01234567890'),
            'instapayNumber' => trim($input['instapayNumber'] ?? '01098688815'),
            'minDeposit' => floatval($input['minDeposit'] ?? 10),
            'minWithdraw' => floatval($input['minWithdraw'] ?? 50),
            'platformName' => '1X WINNER',
            'autoApproveDeposits' => false
        ];
        fb_put("settings", $settings);
        echo json_encode(['success' => true, 'message' => 'تم حفظ وتحديث إعدادات المحافظ بنجاح']);
        exit;
    }

    // 9. Crash multiplier
    if ($action === 'set_crash_multiplier') {
        $multiplier = floatval($input['multiplier'] ?? 0);
        fb_put("forced_crash_multiplier", $multiplier > 1 ? $multiplier : null);
        echo json_encode(['success' => true, 'message' => 'تم تثبيت نتيجة لعبة الطيارة']);
        exit;
    }

    // 10. Reply Support
    if ($action === 'reply_support') {
        $ticketId = trim($input['ticketId'] ?? '');
        $text = trim($input['text'] ?? '');
        if ($ticketId && $text) {
            $ticket = fb_get("support_tickets/{$ticketId}");
            if ($ticket) {
                $messages = $ticket['messages'] ?? [];
                $messages[] = [
                    'id' => 'MSG-' . rand(100000, 999999),
                    'sender' => 'admin',
                    'senderName' => 'خدمة العملاء',
                    'text' => $text,
                    'timestamp' => time() * 1000
                ];
                fb_patch("support_tickets/{$ticketId}", [
                    'messages' => $messages,
                    'status' => 'open',
                    'updatedAt' => time() * 1000
                ]);
            }
        }
        echo json_encode(['success' => true]);
        exit;
    }

    // 11. Delete Specific Transaction (Deposit or Withdrawal)
    if ($action === 'delete_transaction') {
        $txId = trim($input['txId'] ?? '');
        if ($txId) {
            fb_delete("transactions/{$txId}");
            echo json_encode(['success' => true, 'message' => "تم مسح المعاملة ({$txId}) بنجاح"]);
        } else {
            echo json_encode(['success' => false, 'error' => 'رقم المعاملة غير محدد']);
        }
        exit;
    }

    // 12. Delete User Without Ban
    if ($action === 'delete_user_only') {
        $userId = trim($input['userId'] ?? '');
        if ($userId) {
            fb_delete("users/{$userId}");
            echo json_encode(['success' => true, 'message' => "تم مسح حساب المستخدم ({$userId}) بنجاح"]);
        } else {
            echo json_encode(['success' => false, 'error' => 'معرف المستخدم غير محدد']);
        }
        exit;
    }

    // 13. Delete Support Ticket
    if ($action === 'delete_ticket') {
        $ticketId = trim($input['ticketId'] ?? '');
        if ($ticketId) {
            fb_delete("support_tickets/{$ticketId}");
            echo json_encode(['success' => true, 'message' => "تم مسح التذكرة بنجاح"]);
        } else {
            echo json_encode(['success' => false, 'error' => 'رقم التذكرة غير محدد']);
        }
        exit;
    }

    // 14. Master Zero Reset: Wipe all data to zero (start completely fresh)
    if ($action === 'reset_all_data') {
        fb_put("transactions", new stdClass());
        fb_put("users", new stdClass());
        fb_put("support_tickets", new stdClass());
        fb_put("banned_users", new stdClass());
        fb_put("banned_devices", new stdClass());
        if (is_dir(LOCAL_DATA_DIR)) {
            @array_map('unlink', glob(LOCAL_DATA_DIR . '*'));
        }
        echo json_encode([
            'success' => true,
            'message' => 'تم تصفير كافة بيانات المنصة بالكامل (0 مستخدمين - 0 طلبات - 0 تذاكر). يمكنك الآن البدء من جديد تماماً!'
        ]);
        exit;
    }

    // 15. Clear all transactions only (zero out deposits and withdrawals)
    if ($action === 'clear_transactions_only') {
        fb_put("transactions", new stdClass());
        echo json_encode(['success' => true, 'message' => 'تم تصفير ومسح جميع طلبات الإيداع والسحب بنجاح']);
        exit;
    }

    // 16. Live Background Polling Endpoint (Online players, pending alerts, live stats)
    if ($action === 'get_live_data') {
        $rawUsers = fb_get('users') ?: [];
        $rawTxs = fb_get('transactions') ?: [];
        $nowMs = time() * 1000;

        $onlineCount = 0;
        $usersData = [];
        foreach ($rawUsers as $k => $u) {
            $u['id'] = $u['id'] ?? $k;
            $lastSeen = floatval($u['lastSeen'] ?? 0);
            $isOnline = (!empty($u['isOnline']) || ($nowMs - $lastSeen < 60000));
            if ($isOnline) $onlineCount++;
            $u['isCurrentlyOnline'] = $isOnline;
            $usersData[] = $u;
        }

        $pendingDeposits = 0;
        $pendingWithdraws = 0;
        $txsData = [];
        foreach ($rawTxs as $k => $t) {
            $t['id'] = $t['id'] ?? $k;
            if (($t['type'] ?? '') === 'deposit' && ($t['status'] ?? '') === 'pending') {
                $pendingDeposits++;
            }
            if (($t['type'] ?? '') === 'withdraw' && ($t['status'] ?? '') === 'pending') {
                $pendingWithdraws++;
            }
            $txsData[] = $t;
        }

        $bannedU = fb_get('banned_users') ?: [];
        $bannedD = fb_get('banned_devices') ?: [];

        echo json_encode([
            'success' => true,
            'onlineCount' => $onlineCount,
            'totalUsers' => count($usersData),
            'pendingDeposits' => $pendingDeposits,
            'pendingWithdraws' => $pendingWithdraws,
            'totalBanned' => count($bannedU) + count($bannedD),
            'users' => $usersData,
            'transactions' => $txsData,
            'serverTime' => $nowMs
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'error' => 'Action not recognized']);
    exit;
}

// -------------------------------------------------------------
// Fetch Live Data for Initial Page Render
// -------------------------------------------------------------
$rawUsers = fb_get('users') ?: [];
$usersList = [];
foreach ($rawUsers as $k => $u) {
    $u['id'] = $u['id'] ?? $k;
    $usersList[] = $u;
}

$rawTxs = fb_get('transactions') ?: [];
$txsList = [];
foreach ($rawTxs as $k => $t) {
    $t['id'] = $t['id'] ?? $k;
    $txsList[] = $t;
}
usort($txsList, function($a, $b) {
    return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0);
});

$depositsList = array_filter($txsList, function($t) { return ($t['type'] ?? '') === 'deposit'; });
$withdrawsList = array_filter($txsList, function($t) { return ($t['type'] ?? '') === 'withdraw'; });

$bannedUsers = fb_get('banned_users') ?: [];
$bannedDevices = fb_get('banned_devices') ?: [];

$settings = fb_get('settings') ?: [
    'vodafoneNumber' => '01098688815',
    'etisalatNumber' => '01123456789',
    'orangeNumber' => '01234567890',
    'instapayNumber' => '01098688815',
    'minDeposit' => 10,
    'minWithdraw' => 50
];

$supportTickets = fb_get('support_tickets') ?: [];

// Summary metrics & Online Users detection
$nowMs = round(microtime(true) * 1000);
$onlineUsersCount = 0;
foreach ($usersList as &$u) {
    $lastSeen = intval($u['lastSeen'] ?? 0);
    $isOnlineFlag = !empty($u['isOnline']);
    $isCurrentlyOnline = ($isOnlineFlag && ($nowMs - $lastSeen) < 120000) || (($nowMs - $lastSeen) < 60000);
    $u['isCurrentlyOnline'] = $isCurrentlyOnline;
    if ($isCurrentlyOnline) {
        $onlineUsersCount++;
    }
}
unset($u);

$totalUsersCount = count($usersList);
$totalBalance = array_sum(array_map(function($u) { return floatval($u['balance'] ?? 0); }, $usersList));
$pendingDepositsCount = count(array_filter($depositsList, function($t) { return ($t['status'] ?? '') === 'pending'; }));
$pendingWithdrawsCount = count(array_filter($withdrawsList, function($t) { return ($t['status'] ?? '') === 'pending'; }));
$totalBannedCount = count($bannedUsers) + count($bannedDevices);
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة تحكم الإدارة (PHP) - 1X WINNER</title>
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google Arabic Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Tajawal', 'Cairo', 'sans-serif'],
            mono: ['Courier New', 'monospace']
          },
          colors: {
            brand: {
              50: '#eff6ff',
              500: '#3b82f6',
              600: '#2563eb',
              700: '#1d4ed8',
              900: '#1e3a8a'
            }
          }
        }
      }
    };
  </script>

  <style>
    body {
      background-color: #080d1a;
      color: #f1f5f9;
      font-family: 'Tajawal', 'Cairo', sans-serif;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #0b1120;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #1e293b;
      border-radius: 9999px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #334155;
    }
    .badge-glow-red {
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
    }
    .badge-glow-green {
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.4);
    }
  </style>

  <!-- Firebase Client SDK for live multi-tab synchronization -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js"></script>
</head>
<body class="min-h-screen flex flex-col antialiased select-none custom-scrollbar">

  <!-- HEADER -->
  <header class="bg-[#0f172a] border-b border-slate-800 sticky top-0 z-40 shadow-xl backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 text-xl font-bold">
          ⚡
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <h1 class="font-black text-base sm:text-lg text-white tracking-wide">لوحة تحكم الإدارة</h1>
            <span class="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/30 font-mono">
              PHP 8.2 ENGINE
            </span>
          </div>
          <span class="text-xs text-slate-400">نظام المراقبة وتتبع أجهزة اللاعبين المباشر وحظر المستخدمين</span>
        </div>
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Live Status Indicator -->
        <div class="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs text-emerald-400 font-bold">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>متصل مباشر</span>
        </div>

        <!-- Reload Data Button -->
        <button 
          onclick="window.location.reload()" 
          class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer" 
          title="تحديث البيانات"
        >
          🔄
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN CONTAINER -->
  <main class="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 flex-1">

    <!-- TOP SUMMARY STATS -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      <!-- Stat 1: Total Users -->
      <div class="bg-[#111c33] border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-slate-700 transition">
        <span class="text-xs text-slate-400 font-medium">👥 إجمالي اللاعبين</span>
        <span class="text-xl sm:text-2xl font-black text-white font-mono" id="stat-total-users"><?= $totalUsersCount ?></span>
        <span class="text-[10px] text-slate-500">حساب مسجل بالمنصة</span>
      </div>

      <!-- Stat 2: Total Balances -->
      <div class="bg-[#111c33] border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-slate-700 transition">
        <span class="text-xs text-slate-400 font-medium">💰 إجمالي الأرصدة</span>
        <div class="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
          <span><?= number_format($totalBalance, 2) ?></span>
          <span class="text-xs text-slate-400 font-normal">ج.م</span>
        </div>
        <span class="text-[10px] text-slate-500">أرصدة اللاعبين الحالية</span>
      </div>

      <!-- Stat 3: Pending Deposits -->
      <div class="bg-[#111c33] border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-slate-700 transition">
        <span class="text-xs text-slate-400 font-medium">📥 طلبات إيداع معلقة</span>
        <span class="text-xl sm:text-2xl font-black <?= $pendingDepositsCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300' ?> font-mono" id="stat-pending-deposits"><?= $pendingDepositsCount ?></span>
        <span class="text-[10px] text-slate-500">في انتظار مراجعة التحويل</span>
      </div>

      <!-- Stat 4: Pending Withdrawals -->
      <div class="bg-[#111c33] border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-slate-700 transition">
        <span class="text-xs text-slate-400 font-medium">📤 طلبات سحب معلقة</span>
        <span class="text-xl sm:text-2xl font-black <?= $pendingWithdrawsCount > 0 ? 'text-purple-400 animate-pulse' : 'text-slate-300' ?> font-mono" id="stat-pending-withdraws"><?= $pendingWithdrawsCount ?></span>
        <span class="text-[10px] text-slate-500">في انتظار تأكيد التحويل</span>
      </div>

      <!-- Stat 5: Online Players Now -->
      <div onclick="filterOnlineStatus('online')" class="bg-[#111c33] border <?= $onlineUsersCount > 0 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800/90' ?> rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-emerald-500 transition cursor-pointer" title="انقر لتصفية اللاعبين المتصلين الآن فقط">
        <div class="flex items-center justify-between">
          <span class="text-xs text-emerald-300 font-bold flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 <?= $onlineUsersCount > 0 ? 'animate-ping' : '' ?>"></span>
            <span>🟢 المتصلين الآن</span>
          </span>
          <span class="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">ONLINE</span>
        </div>
        <span class="text-xl sm:text-2xl font-black text-emerald-400 font-mono" id="stat-online-users"><?= $onlineUsersCount ?></span>
        <span class="text-[10px] text-slate-400">لاعب نشط داخل المنصة حالياً</span>
      </div>

      <!-- Stat 6: Banned Users & Devices -->
      <div class="bg-[#111c33] border border-red-900/40 rounded-2xl p-4 flex flex-col gap-1 shadow-md hover:border-red-700 transition">
        <span class="text-xs text-red-300 font-medium">🚫 أجهزة وحسابات محظورة</span>
        <span class="text-xl sm:text-2xl font-black text-red-400 font-mono" id="stat-banned"><?= $totalBannedCount ?></span>
        <span class="text-[10px] text-slate-500">ممنوعون من الدخول نهائياً</span>
      </div>
    </div>

    <!-- NAVIGATION TABS -->
    <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 border-b border-slate-800">
      <button onclick="switchTab('devices')" id="tab-btn-devices" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-blue-600 text-white shadow-md shadow-blue-600/30">
        <span>📱</span>
        <span>أجهزة اللاعبين والمستخدمين (المراقبة الحية)</span>
        <span class="bg-blue-800 text-white text-[10px] px-2 py-0.5 rounded-full font-mono"><?= $totalUsersCount ?></span>
      </button>

      <button onclick="switchTab('banned')" id="tab-btn-banned" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>🚫</span>
        <span>قائمة المحظورين والممنوعين</span>
        <?php if ($totalBannedCount > 0): ?>
          <span class="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono"><?= $totalBannedCount ?></span>
        <?php endif; ?>
      </button>

      <button onclick="switchTab('deposits')" id="tab-btn-deposits" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>📥</span>
        <span>طلبات الإيداع</span>
        <?php if ($pendingDepositsCount > 0): ?>
          <span class="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full animate-bounce"><?= $pendingDepositsCount ?></span>
        <?php endif; ?>
      </button>

      <button onclick="switchTab('withdraws')" id="tab-btn-withdraws" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>📤</span>
        <span>طلبات السحب</span>
        <?php if ($pendingWithdrawsCount > 0): ?>
          <span class="bg-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce"><?= $pendingWithdrawsCount ?></span>
        <?php endif; ?>
      </button>

      <button onclick="switchTab('recharge')" id="tab-btn-recharge" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>💳</span>
        <span>شحن مباشر للاعب</span>
      </button>

      <button onclick="switchTab('crash')" id="tab-btn-crash" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>✈️</span>
        <span>التحكم بنتيجة الطيارة</span>
      </button>

      <button onclick="switchTab('support')" id="tab-btn-support" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>💬</span>
        <span>الدعم الفني</span>
      </button>

      <button onclick="switchTab('settings')" id="tab-btn-settings" class="tab-btn px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 whitespace-nowrap bg-slate-800/80 text-slate-300 hover:text-white">
        <span>⚙️</span>
        <span>أرقام المحافظ والإعدادات</span>
      </button>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 1: USER DEVICES & LIVE MONITORING (الطلب الأساسي للمستخدم) -->
    <!-- ======================================================== -->
    <section id="tab-content-devices" class="tab-content flex flex-col gap-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex flex-col">
          <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <span>📱</span>
            <span>تتبع أجهزة جميع المستخدمين واللاعبين على المنصة</span>
          </h2>
          <p class="text-xs text-slate-400">
            كل من يدخل على المنصة يظهر هنا اسم جهازه، نوعه، متصفحه، ومعرفه بدقة. يمكنك حذف أي مستخدم وحظر جهازه نهائياً بضغطة زر.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Filter chips for online/offline -->
          <div class="flex items-center bg-[#0b1222] border border-slate-800 rounded-xl p-1 gap-1 text-xs">
            <button onclick="filterOnlineStatus('all')" id="btn-filter-all" class="px-3 py-1.5 rounded-lg font-bold transition bg-blue-600 text-white cursor-pointer">
              الكل (<?= count($usersList) ?>)
            </button>
            <button onclick="filterOnlineStatus('online')" id="btn-filter-online" class="px-3 py-1.5 rounded-lg font-bold transition text-emerald-400 hover:bg-slate-800 flex items-center gap-1 cursor-pointer">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>أونلاين الآن (<?= $onlineUsersCount ?>)</span>
            </button>
            <button onclick="filterOnlineStatus('offline')" id="btn-filter-offline" class="px-3 py-1.5 rounded-lg font-bold transition text-slate-400 hover:bg-slate-800 cursor-pointer">
              غير متصل (<?= count($usersList) - $onlineUsersCount ?>)
            </button>
          </div>

          <input 
            type="text" 
            id="devices-search-input" 
            oninput="filterDevicesTable()" 
            placeholder="🔍 بحث بالاسم، الهاتف، الجهاز، أو الـ ID..." 
            class="bg-[#111c33] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 w-52 sm:w-72 shadow-inner"
          >
        </div>
      </div>

      <!-- Devices & Users Table -->
      <div class="bg-[#10192e] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right text-xs" id="devices-table">
            <thead class="bg-[#0b1222] text-slate-400 font-bold border-b border-slate-800 select-none">
              <tr>
                <th class="p-3.5">اللاعب والـ ID</th>
                <th class="p-3.5 text-center">حالة الاتصال</th>
                <th class="p-3.5">رقم الهاتف</th>
                <th class="p-3.5">📱 اسم ونوع الجهاز</th>
                <th class="p-3.5">🌐 المتصفح ونظام التشغيل</th>
                <th class="p-3.5">🆔 بصمة الجهاز (Device ID)</th>
                <th class="p-3.5">الرصيد الحالي</th>
                <th class="p-3.5">آخر نشاط / دخول</th>
                <th class="p-3.5 text-center">الإجراء والتحكم</th>
              </tr>
            </thead>
            <tbody id="devices-table-body" class="divide-y divide-slate-800/60 font-medium">
              <?php if (empty($usersList)): ?>
                <tr>
                  <td colspan="9" class="p-8 text-center text-slate-500">لا يوجد مستخدمون مسجلون حالياً في قاعدة البيانات</td>
                </tr>
              <?php else: ?>
                <?php foreach ($usersList as $u): 
                  $uid = htmlspecialchars($u['id'] ?? '');
                  $uname = htmlspecialchars($u['username'] ?? 'لاعب');
                  $uphone = htmlspecialchars($u['phone'] ?? '');
                  $ubal = number_format(floatval($u['balance'] ?? 0), 2);
                  $devName = htmlspecialchars($u['deviceName'] ?? 'هاتف محمول / كمبيوتر');
                  $devType = htmlspecialchars($u['deviceType'] ?? 'mobile');
                  $devOS = htmlspecialchars($u['deviceOS'] ?? 'غير محدد');
                  $devBrowser = htmlspecialchars($u['deviceBrowser'] ?? 'متصفح ويب');
                  $devId = htmlspecialchars($u['deviceId'] ?? 'DEV-N/A');
                  $lastSeen = safe_date($u['lastSeen'] ?? null);
                  $isUserBanned = !empty($u['isBanned']) || isset($bannedUsers[$uid]) || isset($bannedDevices[$devId]);
                  $isCurrentlyOnline = !empty($u['isCurrentlyOnline']);
                ?>
                <tr class="hover:bg-slate-800/40 transition device-row <?= $isUserBanned ? 'opacity-40 bg-red-950/10' : '' ?>" 
                    data-online="<?= $isCurrentlyOnline ? 'true' : 'false' ?>" 
                    data-search="<?= strtolower("{$uname} {$uid} {$uphone} {$devName} {$devId}") ?>">
                  <!-- User Info -->
                  <td class="p-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/20">
                        <?= safe_first_char($uname) ?>
                      </div>
                      <div class="flex flex-col">
                        <span class="font-bold text-white"><?= $uname ?></span>
                        <span class="text-[10px] font-mono text-amber-400 font-bold">ID: <?= $uid ?></span>
                      </div>
                    </div>
                  </td>

                  <!-- Online Status Badge -->
                  <td class="p-3.5 text-center user-status-cell">
                    <?php if ($isCurrentlyOnline): ?>
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>متصل الآن</span>
                      </span>
                    <?php else: ?>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-800 border border-slate-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                        <span>غير متصل</span>
                      </span>
                    <?php endif; ?>
                  </td>

                  <!-- Phone -->
                  <td class="p-3.5 font-mono text-slate-300">
                    <span class="bg-slate-800/60 px-2 py-1 rounded-lg border border-slate-700/60 font-semibold"><?= $uphone ?: 'غير مسجل' ?></span>
                  </td>

                  <!-- Device Name -->
                  <td class="p-3.5">
                    <div class="flex items-center gap-2">
                      <span class="text-base">
                        <?= $devType === 'desktop' ? '💻' : ($devType === 'tablet' ? '📟' : '📱') ?>
                      </span>
                      <div class="flex flex-col">
                        <span class="font-bold text-cyan-300"><?= $devName ?></span>
                        <span class="text-[10px] text-slate-400"><?= $devType === 'desktop' ? 'كمبيوتر مكتبي' : ($devType === 'tablet' ? 'جهاز لوحي' : 'هاتف ذكي') ?></span>
                      </div>
                    </div>
                  </td>

                  <!-- OS & Browser -->
                  <td class="p-3.5">
                    <div class="flex flex-col">
                      <span class="text-slate-200"><?= $devOS ?></span>
                      <span class="text-[10px] text-slate-400 font-mono"><?= $devBrowser ?></span>
                    </div>
                  </td>

                  <!-- Device ID -->
                  <td class="p-3.5 font-mono">
                    <span class="bg-[#0b101d] text-amber-300/90 text-[10px] px-2 py-1 rounded border border-slate-800 font-mono" title="<?= $devId ?>">
                      <?= strlen($devId) > 16 ? substr($devId, 0, 16) . '...' : $devId ?>
                    </span>
                  </td>

                  <!-- Balance -->
                  <td class="p-3.5">
                    <span class="font-black text-emerald-400 font-mono"><?= $ubal ?> ج.م</span>
                  </td>

                  <!-- Last Seen -->
                  <td class="p-3.5 text-slate-400 text-[11px] font-mono">
                    <?= $lastSeen ?>
                  </td>

                  <!-- Actions: Delete & Ban -->
                  <td class="p-3.5 text-center">
                    <?php if ($isUserBanned): ?>
                      <div class="flex items-center justify-center gap-1">
                        <span class="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-1 rounded-lg border border-red-500/30">
                          محظور حالياً
                        </span>
                        <button 
                          type="button" 
                          onclick="deleteUserOnly('<?= $uid ?>', '<?= addslashes($uname) ?>')"
                          class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-red-700 text-slate-400 hover:text-white text-xs font-bold border border-slate-700 transition cursor-pointer"
                          title="مسح الحساب نهائياً"
                        >
                          🗑️
                        </button>
                      </div>
                    <?php else: ?>
                      <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        <button 
                          type="button" 
                          onclick="openDeleteModal('<?= $uid ?>', '<?= addslashes($uname) ?>', '<?= addslashes($uphone) ?>', '<?= addslashes($devId) ?>', '<?= addslashes($devName) ?>')"
                          class="px-2.5 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-950 transition cursor-pointer flex items-center gap-1"
                          title="حذف المستخدم وحظر رقم الهاتف والجهاز نهائياً من دخول المنصة"
                        >
                          <span>🚫</span>
                          <span>حظر وحذف</span>
                        </button>
                        <button 
                          type="button" 
                          onclick="deleteUserOnly('<?= $uid ?>', '<?= addslashes($uname) ?>')"
                          class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-red-700 text-slate-300 hover:text-white font-bold text-xs transition border border-slate-700 cursor-pointer flex items-center gap-1"
                          title="مسح حساب المستخدم فقط بدون حظر جهازه"
                        >
                          <span>🗑️</span>
                          <span>مسح</span>
                        </button>
                      </div>
                    <?php endif; ?>
                  </td>
                </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 2: BANNED USERS & BLOCKED DEVICES (المحظورين) -->
    <!-- ======================================================== -->
    <section id="tab-content-banned" class="tab-content hidden flex flex-col gap-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex flex-col">
          <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <span>🚫</span>
            <span>قائمة المستخدمين والأجهزة المحظورة نهائياً من دخول المنصة</span>
          </h2>
          <p class="text-xs text-slate-400">كل مستخدم تم حذفه يتم حظر رقم هاتفه ومعرف جهازه هنا لمنعه من التسجيل أو الدخول مرة أخرى.</p>
        </div>
      </div>

      <div class="bg-[#10192e] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right text-xs">
            <thead class="bg-[#0b1222] text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th class="p-3.5">معرف اللاعب / الحظر</th>
                <th class="p-3.5">اسم اللاعب</th>
                <th class="p-3.5">رقم الهاتف المحظور</th>
                <th class="p-3.5">معرف الجهاز المحظور</th>
                <th class="p-3.5">وقت الحظر</th>
                <th class="p-3.5">سبب الحظر</th>
                <th class="p-3.5 text-center">إلغاء الحظر</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-medium">
              <?php 
              $allBans = array_merge($bannedUsers, $bannedDevices);
              if (empty($allBans)): 
              ?>
                <tr>
                  <td colspan="7" class="p-8 text-center text-slate-500">لا يوجد أي مستخدمين أو أجهزة محظورة حالياً ✅</td>
                </tr>
              <?php else: ?>
                <?php foreach ($allBans as $bKey => $b): 
                  $bUserId = htmlspecialchars($b['userId'] ?? $bKey);
                  $bUser = htmlspecialchars($b['username'] ?? 'مستخدم محظور');
                  $bPhone = htmlspecialchars($b['phone'] ?? 'N/A');
                  $bDev = htmlspecialchars($b['deviceId'] ?? $bKey);
                  $bDate = safe_date($b['bannedAt'] ?? null);
                  $bReason = htmlspecialchars($b['reason'] ?? 'تم الحظر بواسطة الإدارة');
                ?>
                <tr class="hover:bg-slate-800/40 transition">
                  <td class="p-3.5 font-mono text-amber-400 font-bold"><?= $bUserId ?></td>
                  <td class="p-3.5 font-bold text-white"><?= $bUser ?></td>
                  <td class="p-3.5 font-mono text-slate-300"><?= $bPhone ?></td>
                  <td class="p-3.5 font-mono text-xs text-red-400"><?= $bDev ?></td>
                  <td class="p-3.5 font-mono text-slate-400"><?= $bDate ?></td>
                  <td class="p-3.5 text-slate-300"><?= $bReason ?></td>
                  <td class="p-3.5 text-center">
                    <button 
                      type="button" 
                      onclick="unbanIdentifier('<?= $bKey ?>')" 
                      class="px-3 py-1 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
                    >
                      فك الحظر ✅
                    </button>
                  </td>
                </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 3: DEPOSITS (طلبات الإيداع) -->
    <!-- ======================================================== -->
    <section id="tab-content-deposits" class="tab-content hidden flex flex-col gap-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <span>📥</span>
            <span>طلبات إيداع الأموال الواردة من اللاعبين</span>
          </h2>
          <span class="text-xs text-slate-400">تأكد من استلام المبلغ في محفظتك ثم اضغط موافقة وشحن الرصيد</span>
        </div>
        <button 
          onclick="clearAllTransactionsPrompt('deposit')" 
          class="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          title="تصفير ومسح جميع طلبات الإيداع الحالية"
        >
          <span>🗑️</span>
          <span>مسح وتصفير طلبات الإيداع (0 طلبات)</span>
        </button>
      </div>

      <div class="bg-[#10192e] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right text-xs">
            <thead class="bg-[#0b1222] text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th class="p-3.5">كود المعاملة</th>
                <th class="p-3.5">اللاعب والـ ID</th>
                <th class="p-3.5">المبلغ المطلوب</th>
                <th class="p-3.5">طريقة الإيداع</th>
                <th class="p-3.5">رقم المحفظة المحول منها</th>
                <th class="p-3.5">صورة الإيصال</th>
                <th class="p-3.5">الحالة</th>
                <th class="p-3.5 text-center">الإجراء والتحكم</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-medium">
              <?php if (empty($depositsList)): ?>
                <tr>
                  <td colspan="8" class="p-8 text-center text-slate-500">لا توجد أي طلبات إيداع حالياً</td>
                </tr>
              <?php else: ?>
                <?php foreach ($depositsList as $d): 
                  $txId = htmlspecialchars($d['id'] ?? '');
                  $txUser = htmlspecialchars($d['userName'] ?? 'لاعب');
                  $txUid = htmlspecialchars($d['userId'] ?? '');
                  $txAmt = number_format(floatval($d['amount'] ?? 0), 2);
                  $txMethod = htmlspecialchars($d['method'] ?? 'فودافون كاش');
                  $txSender = htmlspecialchars($d['senderPhone'] ?? $d['userPhone'] ?? '');
                  $txReceipt = htmlspecialchars($d['receiptImage'] ?? '');
                  $txStatus = htmlspecialchars($d['status'] ?? 'pending');
                ?>
                <tr class="hover:bg-slate-800/40 transition">
                  <td class="p-3.5 font-mono text-slate-300 font-bold"><?= $txId ?></td>
                  <td class="p-3.5">
                    <span class="font-bold text-white"><?= $txUser ?></span>
                    <span class="text-[10px] text-amber-400 font-mono block">ID: <?= $txUid ?></span>
                  </td>
                  <td class="p-3.5 font-mono font-black text-emerald-400 text-sm"><?= $txAmt ?> ج.م</td>
                  <td class="p-3.5 text-slate-300"><?= $txMethod ?></td>
                  <td class="p-3.5 font-mono text-cyan-300 font-bold"><?= $txSender ?: 'غير محدد' ?></td>
                  <td class="p-3.5">
                    <?php if ($txReceipt): ?>
                      <button onclick="viewReceipt('<?= $txReceipt ?>')" class="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold hover:bg-blue-500 hover:text-white transition cursor-pointer">
                        🔍 عرض الإيصال
                      </button>
                    <?php else: ?>
                      <span class="text-slate-500 text-[11px]">بدون صورة</span>
                    <?php endif; ?>
                  </td>
                  <td class="p-3.5">
                    <?php if ($txStatus === 'completed'): ?>
                      <span class="bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-500/30">مقبول ومكتمل</span>
                    <?php elseif ($txStatus === 'rejected'): ?>
                      <span class="bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded text-[10px] border border-red-500/30">مرفوض</span>
                    <?php else: ?>
                      <span class="bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-500/30 animate-pulse">معلق</span>
                    <?php endif; ?>
                  </td>
                  <td class="p-3.5 text-center">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                      <?php if ($txStatus === 'pending'): ?>
                        <button onclick="approveDeposit('<?= $txId ?>')" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer">
                          موافقة ✅
                        </button>
                        <button onclick="rejectDeposit('<?= $txId ?>')" class="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition cursor-pointer">
                          رفض ❌
                        </button>
                      <?php else: ?>
                        <span class="text-slate-500 text-[11px]">معالج</span>
                      <?php endif; ?>
                      <button 
                        onclick="deleteTx('<?= $txId ?>')" 
                        class="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-red-700 text-slate-400 hover:text-white font-bold text-xs transition border border-slate-700 cursor-pointer" 
                        title="مسح هذا الطلب نهائياً"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 4: WITHDRAWALS (طلبات السحب) -->
    <!-- ======================================================== -->
    <section id="tab-content-withdraws" class="tab-content hidden flex flex-col gap-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <span>📤</span>
            <span>طلبات سحب الأرباح من اللاعبين</span>
          </h2>
          <span class="text-xs text-slate-400">قم بتحويل المبلغ لرقم محفظة اللاعب ثم اضغط تم التحويل</span>
        </div>
        <button 
          onclick="clearAllTransactionsPrompt('withdraw')" 
          class="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          title="تصفير ومسح جميع طلبات السحب الحالية"
        >
          <span>🗑️</span>
          <span>مسح وتصفير طلبات السحب (0 طلبات)</span>
        </button>
      </div>

      <div class="bg-[#10192e] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right text-xs">
            <thead class="bg-[#0b1222] text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th class="p-3.5">كود المعاملة</th>
                <th class="p-3.5">اللاعب والـ ID</th>
                <th class="p-3.5">المبلغ المطلوب سحبه</th>
                <th class="p-3.5">رقم المحفظة المستلمة</th>
                <th class="p-3.5">الحالة</th>
                <th class="p-3.5 text-center">الإجراء والتحكم</th>
              </tr>
            </thead>
            <tbody id="withdraws-table-body" class="divide-y divide-slate-800/60 font-medium">
              <?php if (empty($withdrawsList)): ?>
                <tr>
                  <td colspan="6" class="p-8 text-center text-slate-500">لا توجد طلبات سحب حالياً (0 طلبات)</td>
                </tr>
              <?php else: ?>
                <?php foreach ($withdrawsList as $w): 
                  $wId = htmlspecialchars($w['id'] ?? '');
                  $wUser = htmlspecialchars($w['userName'] ?? 'لاعب');
                  $wUid = htmlspecialchars($w['userId'] ?? '');
                  $wAmt = number_format(floatval($w['amount'] ?? 0), 2);
                  $wPhone = htmlspecialchars($w['senderPhone'] ?? $w['phone'] ?? $w['userPhone'] ?? '');
                  $wStatus = htmlspecialchars($w['status'] ?? 'pending');
                ?>
                <tr class="hover:bg-slate-800/40 transition tx-row" data-txid="<?= $wId ?>">
                  <td class="p-3.5 font-mono text-slate-300 font-bold"><?= $wId ?></td>
                  <td class="p-3.5">
                    <span class="font-bold text-white"><?= $wUser ?></span>
                    <span class="text-[10px] text-amber-400 font-mono block">ID: <?= $wUid ?></span>
                  </td>
                  <td class="p-3.5 font-mono font-black text-purple-400 text-sm"><?= $wAmt ?> ج.م</td>
                  <td class="p-3.5 font-mono text-amber-300 font-bold text-sm bg-[#0a0f1d] px-2 py-1 rounded inline-block my-2"><?= $wPhone ?></td>
                  <td class="p-3.5">
                    <?php if ($wStatus === 'completed'): ?>
                      <span class="bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-500/30">تم التحويل بنجاح</span>
                    <?php elseif ($wStatus === 'rejected'): ?>
                      <span class="bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded text-[10px] border border-red-500/30">مرفوض ومسترجع</span>
                    <?php else: ?>
                      <span class="bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded text-[10px] border border-purple-500/30 animate-pulse">معلق</span>
                    <?php endif; ?>
                  </td>
                  <td class="p-3.5 text-center">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                      <?php if ($wStatus === 'pending'): ?>
                        <button onclick="approveWithdraw('<?= $wId ?>')" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer">
                          تم التحويل ✅
                        </button>
                        <button onclick="rejectWithdraw('<?= $wId ?>')" class="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition cursor-pointer">
                          رفض واسترجاع ❌
                        </button>
                      <?php else: ?>
                        <span class="text-slate-500 text-[11px]">معالج</span>
                      <?php endif; ?>
                      <button 
                        onclick="deleteTx('<?= $wId ?>')" 
                        class="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-red-700 text-slate-400 hover:text-white font-bold text-xs transition border border-slate-700 cursor-pointer" 
                        title="مسح هذا الطلب نهائياً"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 5: DIRECT RECHARGE (شحن مباشر) -->
    <!-- ======================================================== -->
    <section id="tab-content-recharge" class="tab-content hidden flex flex-col gap-4 max-w-xl mx-auto w-full">
      <div class="bg-[#10192e] border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
          <span>💳</span>
          <span>شحن رصيد مباشر لأي لاعب بواسطة المعرف (User ID)</span>
        </h2>
        <p class="text-xs text-slate-400">يمكنك هنا إضافة رصيد فوري لحساب أي لاعب مسجل في المنصة دون الحاجة لإجراء إيداع.</p>

        <form onsubmit="handleDirectRecharge(event)" class="flex flex-col gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">معرف اللاعب (User ID):</label>
            <input type="text" id="recharge-user-id" required placeholder="مثال: 70309" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">المبلغ المطلوب إضافته (ج.م):</label>
            <input type="number" id="recharge-amount" required min="1" step="0.5" placeholder="مثال: 100" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <button type="submit" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition cursor-pointer mt-2">
            ⚡ إضافة وشحن الرصيد فوراً
          </button>
        </form>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 6: CRASH GAME CONTROL (التحكم بالطيارة) -->
    <!-- ======================================================== -->
    <section id="tab-content-crash" class="tab-content hidden flex flex-col gap-4 max-w-xl mx-auto w-full">
      <div class="bg-[#10192e] border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
          <span>✈️</span>
          <span>التحكم بنتيجة لعبة الطيارة (Crash Game Multiplier)</span>
        </h2>
        <p class="text-xs text-slate-400">تحديد مضاعف الانفجار بدقة للجولة القادمة مباشرة في كل أجهزة اللاعبين.</p>

        <div class="flex flex-col gap-3">
          <label class="block text-xs font-bold text-slate-300">مضاعف الانفجار المطلوب:</label>
          <div class="flex items-center gap-2">
            <input type="number" id="crash-multiplier-val" placeholder="مثال: 2.50 أو اتركه فارغاً للعشوائي" step="0.01" min="1.01" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500">
            <button onclick="setCrashMultiplier()" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap">
              تثبيت النتيجة
            </button>
          </div>
          <span class="text-[10px] text-slate-500">اترك الحقل فارغاً أو اضغط إلغاء لتكون نتائج الجولات عشوائية وطبيعية تلقائياً.</span>
        </div>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 7: SUPPORT TICKETS (الدعم الفني) -->
    <!-- ======================================================== -->
    <section id="tab-content-support" class="tab-content hidden flex flex-col gap-4">
      <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
        <span>💬</span>
        <span>رسائل وتذاكر الدعم الفني الواردة من اللاعبين</span>
      </h2>

      <div class="bg-[#10192e] rounded-2xl border border-slate-800 p-4">
        <?php if (empty($supportTickets)): ?>
          <p class="text-center text-slate-500 py-8 text-xs">لا توجد رسائل دعم فني واردة حالياً</p>
        <?php else: ?>
          <div class="flex flex-col gap-3">
            <?php foreach ($supportTickets as $tId => $ticket): 
              $msgs = $ticket['messages'] ?? [];
              $lastMsg = end($msgs);
            ?>
              <div class="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-white text-xs"><?= htmlspecialchars($ticket['userName'] ?? 'لاعب') ?> (ID: <?= htmlspecialchars($ticket['userId'] ?? '') ?>)</span>
                  <span class="text-[10px] text-amber-400 font-mono"><?= htmlspecialchars($ticket['subject'] ?? 'استفسار') ?></span>
                </div>
                <p class="text-xs text-slate-300 bg-[#121a2d] p-3 rounded-lg">
                  <?= htmlspecialchars($lastMsg['text'] ?? '...') ?>
                </p>
                <div class="flex items-center gap-2 mt-2">
                  <input type="text" id="reply-input-<?= $tId ?>" placeholder="اكتب ردك للاعب هنا..." class="flex-1 bg-[#152037] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none">
                  <button onclick="replySupportTicket('<?= $tId ?>')" class="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer">
                    إرسال الرد
                  </button>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>
    </section>

    <!-- ======================================================== -->
    <!-- TAB 8: WALLET SETTINGS (إعدادات وأرقام المحافظ) -->
    <!-- ======================================================== -->
    <section id="tab-content-settings" class="tab-content hidden flex flex-col gap-4 max-w-xl mx-auto w-full">
      <div class="bg-[#10192e] border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <h2 class="text-base sm:text-lg font-black text-white flex items-center gap-2">
          <span>⚙️</span>
          <span>أرقام محافظ استلام التحويلات والإعدادات</span>
        </h2>
        <p class="text-xs text-slate-400">تظهر هذه الأرقام مباشرة للاعبين في صفحة الإيداع عند اختيارهم لطريقة الدفع.</p>

        <form onsubmit="handleSaveSettings(event)" class="flex flex-col gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">رقم فودافون كاش:</label>
            <input type="text" id="setting-vodafone" value="<?= htmlspecialchars($settings['vodafoneNumber'] ?? '') ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">رقم اتصالات كاش:</label>
            <input type="text" id="setting-etisalat" value="<?= htmlspecialchars($settings['etisalatNumber'] ?? '') ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">رقم أورنج كاش:</label>
            <input type="text" id="setting-orange" value="<?= htmlspecialchars($settings['orangeNumber'] ?? '') ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">عنوان / معرف إنستاباي (InstaPay):</label>
            <input type="text" id="setting-instapay" value="<?= htmlspecialchars($settings['instapayNumber'] ?? '') ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500">
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">الحد الأدنى للإيداع (ج.م):</label>
              <input type="number" id="setting-min-dep" value="<?= htmlspecialchars($settings['minDeposit'] ?? 10) ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">الحد الأدنى للسحب (ج.م):</label>
              <input type="number" id="setting-min-with" value="<?= htmlspecialchars($settings['minWithdraw'] ?? 50) ?>" class="w-full bg-[#0b101d] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono">
            </div>
          </div>

          <button type="submit" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition cursor-pointer mt-2">
            💾 حفظ وتحديث الأرقام على المنصة والسيرفر
          </button>
        </form>
      </div>

      <!-- DANGER ZONE: RESET & CLEAN SLATE -->
      <div class="bg-[#1a0f18] border border-red-900/60 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl font-bold border border-red-500/30">
            ⚠️
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-black text-white">منطقة المسح الشامل والبدء من الصفر (Zero Reset)</h3>
            <p class="text-xs text-red-300">أدوات إدارية لمسح البيانات وتصفير الداشبورد بالكامل للبدء من جديد</p>
          </div>
        </div>

        <div class="bg-red-950/30 border border-red-900/40 rounded-xl p-4 text-xs text-slate-300 leading-relaxed">
          اختر الإجراء الذي تريده أدناه لتصفير الأدمن والتحكم بالبيانات:
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <!-- Clear Transactions Button -->
          <button 
            type="button" 
            onclick="clearAllTransactionsPrompt('all')" 
            class="flex-1 py-3 px-4 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>📜</span>
            <span>تصفير ومسح جميع طلبات الإيداع والسحب (0 طلبات)</span>
          </button>

          <!-- Master Wipe Reset Button -->
          <button 
            type="button" 
            onclick="masterResetPrompt()" 
            class="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-950 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>💥</span>
            <span>تصفير المنصة بالكامل والبدء من الصفر (0 مستخدمين - 0 طلبات)</span>
          </button>
        </div>
      </div>
    </section>

  </main>

  <!-- CONFIRMATION MODAL FOR DELETING AND BANNING USER -->
  <div id="delete-ban-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="bg-[#10192e] border border-red-500/50 rounded-3xl p-6 max-w-md w-full shadow-2xl shadow-red-950/80 flex flex-col gap-4 animate-in zoom-in-95">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center text-2xl font-bold border border-red-500/30">
          ⚠️
        </div>
        <div class="flex flex-col">
          <h3 class="text-base sm:text-lg font-black text-white">تأكيد حذف وحظر المستخدم والجهاز نهائياً</h3>
          <span class="text-xs text-red-400 font-bold">إجراء أمني دائم لا يمكن الرجوع عنه بسهولة</span>
        </div>
      </div>

      <p class="text-xs text-slate-300 leading-relaxed">
        هل أنت متأكد من رغبتك في حذف هذا المستخدم وحظر جهازه نهائياً؟
        <br>
        <span class="text-amber-400 font-bold">النتيجة:</span> سيتم إغلاق جلسته فوراً وطرده، وحظر رقم هاتفه ومعرف جهازه بحيث لن يتمكن من فتح المنصة أو تسجيل حساب جديد من هذا الجهاز أبداً.
      </p>

      <div class="bg-[#0b101d] border border-slate-800 rounded-2xl p-3.5 text-xs flex flex-col gap-1.5 font-mono">
        <div class="flex justify-between"><span class="text-slate-500">اسم اللاعب:</span> <span id="modal-user-name" class="font-bold text-white"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">معرف اللاعب (ID):</span> <span id="modal-user-id" class="font-bold text-amber-400"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">رقم الهاتف:</span> <span id="modal-user-phone" class="text-cyan-400 font-bold"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">اسم الجهاز:</span> <span id="modal-device-name" class="text-purple-300"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">بصمة الجهاز:</span> <span id="modal-device-id" class="text-red-400 font-bold"></span></div>
      </div>

      <div class="flex items-center gap-2 mt-2">
        <button onclick="executeDeleteAndBan()" id="confirm-ban-btn" class="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition cursor-pointer">
          نعم، احذف المستخدم واحظر الجهاز الآن 🚫
        </button>
        <button onclick="closeDeleteModal()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer">
          إلغاء
        </button>
      </div>
    </div>
  </div>

  <!-- VIEW RECEIPT IMAGE MODAL -->
  <div id="receipt-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4" onclick="this.classList.add('hidden')">
    <div class="bg-[#10192e] border border-slate-700 rounded-2xl p-4 max-w-lg w-full flex flex-col gap-3" onclick="event.stopPropagation()">
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="font-bold text-white text-xs">صورة إيصال التحويل البنكي / المحفظة</span>
        <button onclick="document.getElementById('receipt-modal').classList.add('hidden')" class="text-slate-400 hover:text-white font-bold text-sm cursor-pointer">✕</button>
      </div>
      <img id="receipt-modal-img" src="" alt="إيصال التحويل" class="w-full max-h-[70vh] object-contain rounded-xl bg-black">
    </div>
  </div>

  <!-- TOAST CONTAINER -->
  <div id="toast-container" class="fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm"></div>

  <!-- JAVASCRIPT CLIENT LOGIC -->
  <script>
    // Tab Switching
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-600/30');
        el.classList.add('bg-slate-800/80', 'text-slate-300');
      });

      const content = document.getElementById(`tab-content-${tabId}`);
      const btn = document.getElementById(`tab-btn-${tabId}`);
      if (content) content.classList.remove('hidden');
      if (btn) {
        btn.classList.remove('bg-slate-800/80', 'text-slate-300');
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-600/30');
      }
    }

    // Filter Devices Table Live
    function filterDevicesTable() {
      const q = (document.getElementById('devices-search-input').value || '').toLowerCase().trim();
      const rows = document.querySelectorAll('.device-row');
      rows.forEach(r => {
        const text = r.getAttribute('data-search') || '';
        if (!q || text.includes(q)) {
          r.style.display = '';
        } else {
          r.style.display = 'none';
        }
      });
    }

    // Toast Notifications
    function showToast(msg, type = 'info') {
      const container = document.getElementById('toast-container');
      const el = document.createElement('div');
      const bg = type === 'success' ? 'bg-emerald-600 border-emerald-400' : (type === 'error' ? 'bg-red-600 border-red-400' : 'bg-blue-600 border-blue-400');
      el.className = `py-3 px-4 rounded-2xl shadow-2xl text-xs font-bold text-white transition-all transform animate-in slide-in-from-bottom border ${bg} pointer-events-auto`;
      el.innerText = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }

    // Modal delete data
    let currentTargetUser = null;

    function openDeleteModal(userId, username, phone, deviceId, deviceName) {
      currentTargetUser = { userId, username, phone, deviceId, deviceName };
      document.getElementById('modal-user-id').innerText = userId;
      document.getElementById('modal-user-name').innerText = username;
      document.getElementById('modal-user-phone').innerText = phone || 'غير متوفر';
      document.getElementById('modal-device-id').innerText = deviceId || 'DEV-N/A';
      document.getElementById('modal-device-name').innerText = deviceName || 'هاتف / كمبيوتر';
      document.getElementById('delete-ban-modal').classList.remove('hidden');
    }

    function closeDeleteModal() {
      document.getElementById('delete-ban-modal').classList.add('hidden');
      currentTargetUser = null;
    }

    // Execute Delete & Ban
    async function executeDeleteAndBan() {
      if (!currentTargetUser) return;
      const btn = document.getElementById('confirm-ban-btn');
      btn.innerText = 'جاري الحظر والحذف...';
      btn.disabled = true;

      try {
        const res = await fetch('index.php?action=delete_ban_user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentTargetUser.userId,
            username: currentTargetUser.username,
            phone: currentTargetUser.phone,
            deviceId: currentTargetUser.deviceId,
            reason: 'تم الحظر بواسطة لوحة تحكم الإدارة'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          // Broadcast to client tabs if BroadcastChannel available
          try {
            const ch = new BroadcastChannel('1xwinner_sync');
            ch.postMessage({ type: 'USER_BANNED', data: currentTargetUser });
          } catch(e) {}
          setTimeout(() => window.location.reload(), 1200);
        } else {
          showToast(data.error || 'فشلت العملية', 'error');
          btn.innerText = 'نعم، احذف المستخدم واحظر الجهاز الآن 🚫';
          btn.disabled = false;
        }
      } catch (err) {
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
        btn.innerText = 'نعم، احذف المستخدم واحظر الجهاز الآن 🚫';
        btn.disabled = false;
      }
    }

    // Unban
    async function unbanIdentifier(key) {
      if (!confirm(`هل أنت متأكد من رغبتك في فك الحظر عن (${key})؟`)) return;
      try {
        const res = await fetch('index.php?action=unban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: key })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(data.error || 'فشل فك الحظر', 'error');
        }
      } catch (e) {
        showToast('خطأ في الاتصال', 'error');
      }
    }

    // Approve Deposit
    async function approveDeposit(txId) {
      if (!confirm('هل تأكدت من وصول المبلغ في محفظتك وتريد شحن رصيد اللاعب الآن؟')) return;
      try {
        const res = await fetch('index.php?action=approve_deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(data.error || 'حدث خطأ', 'error');
        }
      } catch(e) {
        showToast('خطأ في الاتصال', 'error');
      }
    }

    // Reject Deposit
    async function rejectDeposit(txId) {
      const reason = prompt('سبب رفض الإيداع:', 'لم يتم استلام التحويل');
      if (reason === null) return;
      try {
        const res = await fetch('index.php?action=reject_deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId, reason })
        });
        const data = await res.json();
        if (data.success) {
          showToast('تم رفض الإيداع', 'info');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch(e) {}
    }

    // Approve Withdraw
    async function approveWithdraw(txId) {
      if (!confirm('هل قمت بتحويل المبلغ إلى رقم المحفظة وتريد تأكيد السحب؟')) return;
      try {
        const res = await fetch('index.php?action=approve_withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('تم تأكيد التحويل للاعب', 'success');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch(e) {}
    }

    // Reject Withdraw
    async function rejectWithdraw(txId) {
      const reason = prompt('سبب رفض السحب وإرجاع المبلغ لمحفظة اللاعب:', 'رقم المحفظة غير صحيح');
      if (reason === null) return;
      try {
        const res = await fetch('index.php?action=reject_withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId, reason })
        });
        const data = await res.json();
        if (data.success) {
          showToast('تم رفض السحب وإرجاع الرصيد للاعب', 'info');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch(e) {}
    }

    // Direct Recharge
    async function handleDirectRecharge(e) {
      e.preventDefault();
      const userId = document.getElementById('recharge-user-id').value.trim();
      const amount = parseFloat(document.getElementById('recharge-amount').value);
      if (!userId || isNaN(amount) || amount <= 0) return;

      try {
        const res = await fetch('index.php?action=direct_recharge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          document.getElementById('recharge-user-id').value = '';
          document.getElementById('recharge-amount').value = '';
          setTimeout(() => window.location.reload(), 1200);
        } else {
          showToast(data.error || 'فشلت العملية', 'error');
        }
      } catch(e) {
        showToast('خطأ في الاتصال', 'error');
      }
    }

    // Crash Multiplier
    async function setCrashMultiplier() {
      const val = parseFloat(document.getElementById('crash-multiplier-val').value);
      try {
        const res = await fetch('index.php?action=set_crash_multiplier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ multiplier: isNaN(val) ? 0 : val })
        });
        const data = await res.json();
        showToast(data.message || 'تم تحديث مضاعف الطيارة', 'success');
      } catch(e) {}
    }

    // Save Settings
    async function handleSaveSettings(e) {
      e.preventDefault();
      const settings = {
        vodafoneNumber: document.getElementById('setting-vodafone').value.trim(),
        etisalatNumber: document.getElementById('setting-etisalat').value.trim(),
        orangeNumber: document.getElementById('setting-orange').value.trim(),
        instapayNumber: document.getElementById('setting-instapay').value.trim(),
        minDeposit: parseFloat(document.getElementById('setting-min-dep').value) || 10,
        minWithdraw: parseFloat(document.getElementById('setting-min-with').value) || 50,
      };

      try {
        const res = await fetch('index.php?action=save_settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        const data = await res.json();
        showToast(data.message || 'تم حفظ الإعدادات بنجاح', 'success');
      } catch(e) {}
    }

    // Reply Support Ticket
    async function replySupportTicket(ticketId) {
      const input = document.getElementById(`reply-input-${ticketId}`);
      const text = input ? input.value.trim() : '';
      if (!text) return;

      try {
        await fetch('index.php?action=reply_support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, text })
        });
        showToast('تم إرسال الرد للاعب بنجاح', 'success');
        input.value = '';
        setTimeout(() => window.location.reload(), 1000);
      } catch(e) {}
    }

    // Filter Users by Online Status
    function filterOnlineStatus(mode) {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
        b.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
      });
      const activeBtn = document.getElementById(`filter-btn-${mode}`);
      if (activeBtn) {
        activeBtn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
        activeBtn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
      }

      const rows = document.querySelectorAll('.user-row');
      rows.forEach(r => {
        const isOnline = r.getAttribute('data-online') === 'true';
        if (mode === 'all') {
          r.style.display = '';
        } else if (mode === 'online') {
          r.style.display = isOnline ? '' : 'none';
        } else if (mode === 'offline') {
          r.style.display = !isOnline ? '' : 'none';
        }
      });
    }

    // Delete User Only (Without Ban)
    async function deleteUserOnly(userId, username) {
      if (!confirm(`هل أنت متأكد من مسح حساب اللاعب (${username} - ID: ${userId}) نهائياً من قاعدة البيانات؟`)) return;
      try {
        const res = await fetch('index.php?action=delete_user_only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'تم مسح اللاعب بنجاح', 'success');
          const row = document.querySelector(`.user-row[data-uid="${userId}"]`);
          if (row) row.remove();
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(data.error || 'فشلت عملية مسح اللاعب', 'error');
        }
      } catch (err) {
        showToast('خطأ في الاتصال بالخادم', 'error');
      }
    }

    // Delete a single transaction (Deposit / Withdraw)
    async function deleteTx(txId) {
      if (!confirm(`هل أنت متأكد من رغبتك في مسح هذا الطلب (${txId}) نهائياً؟`)) return;
      try {
        const res = await fetch('index.php?action=delete_transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'تم مسح المعاملة بنجاح', 'success');
          const rows = document.querySelectorAll(`.tx-row[data-txid="${txId}"]`);
          rows.forEach(r => r.remove());
        } else {
          showToast(data.error || 'فشل مسح المعاملة', 'error');
        }
      } catch(e) {
        showToast('خطأ في الاتصال', 'error');
      }
    }

    // Clear All Transactions (Deposits and/or Withdrawals)
    async function clearAllTransactionsPrompt(type = 'all') {
      const label = type === 'deposit' ? 'طلبات الإيداع' : (type === 'withdraw' ? 'طلبات السحب' : 'جميع طلبات الإيداع والسحب');
      if (!confirm(`تحذير: هل أنت متأكد من مسح وتصفير (${label}) بالكامل؟ سيتم تصفير القائمة إلى 0 طلبات.`)) return;

      try {
        const res = await fetch('index.php?action=clear_all_transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'تم تصفير ومسح المعاملات بنجاح', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(data.error || 'فشلت عملية التصفير', 'error');
        }
      } catch(e) {
        showToast('خطأ في الاتصال بالخادم', 'error');
      }
    }

    // Master Reset: Wipe platform to Zero
    async function masterResetPrompt() {
      const confirm1 = confirm('⚠️ تحذير شديد الأهمية: هل أنت متأكد من تصفير المنصة بالكامل والبدء من الصفر؟\n\nسيتم مسح: كافة اللاعبين، كافة طلبات الإيداع والسحب، وكافة تذاكر الدعم لتصبح المنصة 0 تماماً!');
      if (!confirm1) return;

      const confirm2 = prompt('لتأكيد تصفير المنصة بالكامل، اكتب كلمة "تصفير" أو "0" أدناه:');
      if (confirm2 !== 'تصفير' && confirm2 !== '0' && confirm2 !== 'reset') {
        showToast('تم إلغاء التصفير، لم يتم كتابة الكلمة الصحيحة', 'info');
        return;
      }

      try {
        const res = await fetch('index.php?action=reset_all_data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ تم تصفير المنصة بالكامل بنجاح! تم البدء من الصفر', 'success');
          try {
            const ch = new BroadcastChannel('1xwinner_sync');
            ch.postMessage({ type: 'PLATFORM_RESET' });
          } catch(e) {}
          setTimeout(() => window.location.reload(), 1200);
        } else {
          showToast(data.error || 'فشلت عملية التصفير', 'error');
        }
      } catch(e) {
        showToast('خطأ في الاتصال بالخادم', 'error');
      }
    }

    // View Receipt
    function viewReceipt(imgUrl) {
      document.getElementById('receipt-modal-img').src = imgUrl;
      document.getElementById('receipt-modal').classList.remove('hidden');
    }

    // ========================================================
    // LIVE BACKGROUND POLLING (تحديث فوري تلقائي كل 4 ثوانٍ)
    // ========================================================
    let lastPendingDeposits = <?= count(array_filter($depositsList, fn($x) => ($x['status'] ?? 'pending') === 'pending')) ?>;
    let lastPendingWithdraws = <?= count(array_filter($withdrawsList, fn($x) => ($x['status'] ?? 'pending') === 'pending')) ?>;
    let lastOnlineCount = <?= $onlineUsersCount ?>;

    // Audio beep for instant alert
    function playAlertSound() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch(e) {}
    }

    async function pollDashboardLiveData() {
      try {
        const res = await fetch('index.php?action=get_live_data');
        if (!res.ok) return;
        const live = await res.json();
        if (!live || !live.success) return;

        // 1. Update stats elements
        const onlineEl = document.getElementById('stat-online-users');
        if (onlineEl && live.onlineUsers !== undefined) {
          onlineEl.innerText = live.onlineUsers;
        }

        const totalUsersEl = document.getElementById('stat-total-users');
        if (totalUsersEl && live.totalUsers !== undefined) {
          totalUsersEl.innerText = live.totalUsers;
        }

        const pendingDepEl = document.getElementById('stat-pending-deposits');
        if (pendingDepEl && live.pendingDeposits !== undefined) {
          pendingDepEl.innerText = live.pendingDeposits;
        }

        const pendingWithEl = document.getElementById('stat-pending-withdraws');
        if (pendingWithEl && live.pendingWithdraws !== undefined) {
          pendingWithEl.innerText = live.pendingWithdraws;
        }

        // 2. Alert on new deposit
        if (live.pendingDeposits !== undefined && live.pendingDeposits > lastPendingDeposits) {
          playAlertSound();
          showToast(`🚨 تنبيه فوري: تم استلام طلب إيداع جديد من لاعب! (${live.pendingDeposits} طلبات معلقة)`, 'success');
        }

        // 3. Alert on new withdrawal
        if (live.pendingWithdraws !== undefined && live.pendingWithdraws > lastPendingWithdraws) {
          playAlertSound();
          showToast(`📤 تنبيه: وصل طلب سحب جديد من لاعب!`, 'info');
        }

        // 4. Update online count tracker
        if (live.onlineUsers !== undefined && live.onlineUsers > lastOnlineCount) {
          showToast(`🟢 لاعب متصل الآن بالمنصة! (إجمالي الأونلاين: ${live.onlineUsers})`, 'info');
        }

        lastPendingDeposits = live.pendingDeposits || 0;
        lastPendingWithdraws = live.pendingWithdraws || 0;
        lastOnlineCount = live.onlineUsers || 0;

        // 5. Update user table online badges dynamically
        if (live.users && Array.isArray(live.users)) {
          live.users.forEach(u => {
            const row = document.querySelector(`.user-row[data-uid="${u.id}"]`);
            if (row) {
              row.setAttribute('data-online', u.isOnline ? 'true' : 'false');
              const badge = row.querySelector('.online-status-badge');
              if (badge) {
                if (u.isOnline) {
                  badge.className = 'online-status-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
                  badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> متصل الآن';
                } else {
                  badge.className = 'online-status-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
                  badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> غير متصل';
                }
              }
            }
          });
        }
      } catch(e) {
        // Silent catch for background polling
      }
    }

    // Start background live polling every 4 seconds
    setInterval(pollDashboardLiveData, 4000);

    // Cross-tab broadcast listener for instant sync
    try {
      const syncChannel = new BroadcastChannel('1xwinner_sync');
      syncChannel.onmessage = (event) => {
        if (event.data && (event.data.type === 'DEPOSIT_CREATED' || event.data.type === 'USER_REGISTERED' || event.data.type === 'USER_ONLINE')) {
          pollDashboardLiveData();
        }
      };
    } catch(e) {}
  </script>
</body>
</html>

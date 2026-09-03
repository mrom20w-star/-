import React from 'react';
import { useApp } from '../../context/AppContext';
import { MoreVertical } from 'lucide-react';

export const LobbyView: React.FC = () => {
  const { user, setScreen } = useApp();

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-100 text-slate-800 pb-8 select-none">
      {/* Top Header matching screenshot with User ID and Balance */}
      <div className="w-full bg-white px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shadow-xs">
        {/* Action Buttons on left: سحب and إيداع */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScreen('deposit')}
            id="lobby-deposit-btn"
            className="py-2 px-4 rounded-xl bg-[#2196f3] hover:bg-[#1e88e5] active:scale-95 text-white font-bold text-xs sm:text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
          >
            إيداع
          </button>
          <button
            onClick={() => setScreen('withdraw')}
            id="lobby-withdraw-btn"
            className="py-2 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs sm:text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
          >
            سحب
          </button>
        </div>

        {/* Current Balance Card on right matching screenshot */}
        <div className="bg-[#1e293b] text-white rounded-2xl py-2 px-5 flex flex-col items-center justify-center shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-300 font-medium leading-tight">
              الرصيد الحالي
            </span>
            <span className="text-[10px] font-mono text-amber-400 font-bold">
              (ID: {user.id})
            </span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-baseline gap-1" dir="rtl">
            <span>{user.balance.toFixed(2)}</span>
            <span className="text-xs font-normal text-slate-300">جنيه</span>
          </div>
        </div>
      </div>

      {/* Main Game Catalog */}
      <div className="w-full px-3 sm:px-6 py-5 flex flex-col gap-4">
        {/* GAME 1: CRASH (Hero Banner Card) matching screenshot */}
        <div
          onClick={() => setScreen('crash')}
          id="game-card-crash"
          className="w-full rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer relative bg-gradient-to-br from-[#120826] via-[#1a0f3c] to-[#0c061a] border border-indigo-950/40 group"
        >
          {/* Animated Background Atmosphere */}
          <div className="w-full h-48 sm:h-52 relative flex items-center justify-center overflow-hidden">
            {/* Ambient Glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)]"></div>
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-600/30 rounded-full blur-3xl"></div>

            {/* Flying Golden Airplane with Streak */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
              {/* Airplane & Trail */}
              <div className="absolute top-4 right-10 sm:right-20 group-hover:scale-110 group-hover:translate-x-2 transition-transform duration-500 z-20">
                <img
                  src="/plane.png"
                  alt="Aviator Airplane"
                  className="w-28 sm:w-36 h-auto drop-shadow-[0_10px_20px_rgba(245,158,11,0.7)] transform hover:rotate-3 transition-transform"
                />
              </div>

              {/* Glowing Jet Trail Curve */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-80" viewBox="0 0 400 180">
                <path
                  d="M 50 150 Q 180 140 320 60"
                  fill="none"
                  stroke="url(#trailGlow)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="trailGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#fef08a" stopOpacity="1" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Big Yellow Bold "CRASH" Typography */}
              <div className="relative z-20 flex flex-col items-center justify-center mt-6">
                <span className="text-4xl sm:text-6xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-[#ffea79] via-[#ffb300] to-[#f57c00] drop-shadow-[0_4px_16px_rgba(255,160,0,0.7)] font-sans">
                  CRASH
                </span>
                <span className="text-xs text-amber-200/90 font-bold mt-1 bg-black/40 px-3 py-0.5 rounded-full backdrop-blur">
                  الرهان المباشر مع سحب الأرباح الفوري 🚀
                </span>
              </div>
            </div>

            {/* Bottom Title Label */}
            <div className="absolute bottom-3 left-4 z-20">
              <span className="text-white font-bold text-lg drop-shadow tracking-wide">
                Crash
              </span>
            </div>
          </div>
        </div>

        {/* GAME 2: Apple Of Fortune (Disabled / Coming Soon) */}
        <div
          onClick={() => {
            // Disabled as requested
          }}
          id="game-card-apple-of-fortune"
          className="w-full rounded-2xl overflow-hidden shadow-sm transition-all relative bg-gradient-to-br from-[#062419] via-[#0d3b2a] to-[#041a12] border border-emerald-950/40 opacity-60 cursor-not-allowed group"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs z-30 flex items-center justify-center">
            <span className="bg-black/80 text-amber-300 border border-amber-500/40 text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
              غير متاحة حالياً (قريباً) 🔒
            </span>
          </div>

          <div className="w-full h-48 sm:h-52 relative flex items-center justify-center overflow-hidden">
            {/* Enchanted Forest Lighting & Particles */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.25),transparent_70%)]"></div>
            <div className="absolute top-2 left-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl"></div>

            {/* 3D Apple & Potion Bottles Art */}
            <div className="relative z-10 w-full h-full flex items-center justify-center gap-3">
              {/* Left Purple Potion Bottle */}
              <div className="w-12 h-18 sm:w-14 sm:h-20 transform -rotate-12 opacity-85">
                <svg viewBox="0 0 50 80" fill="none" className="drop-shadow-[0_4px_8px_rgba(168,85,247,0.4)]">
                  <rect x="18" y="2" width="14" height="8" rx="2" fill="#d97706" />
                  <rect x="20" y="10" width="10" height="8" fill="#c084fc" opacity="0.6" />
                  <path d="M12 25 C12 18, 38 18, 38 25 L44 65 C44 75, 6 75, 6 65 Z" fill="url(#purplePotion)" />
                  <defs>
                    <linearGradient id="purplePotion" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="50%" stopColor="#9333ea" />
                      <stop offset="100%" stopColor="#581c87" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Glowing 3D Red Apple in Center */}
              <div className="w-28 h-28 relative flex items-center justify-center">
                <div className="absolute inset-0 bg-red-500/30 rounded-full blur-2xl animate-pulse"></div>
                <svg viewBox="0 0 100 100" fill="none" className="w-28 h-28 drop-shadow-[0_10px_20px_rgba(220,38,38,0.7)]">
                  <path d="M50 20 Q54 10 60 8" stroke="#78350f" strokeWidth="4" strokeLinecap="round" fill="none" />
                  <path d="M52 18 Q65 14 62 25 Q54 22 52 18 Z" fill="#22c55e" />
                  <path
                    d="M50 30 C35 15, 12 25, 15 55 C18 80, 42 90, 50 90 C58 90, 82 80, 85 55 C88 25, 65 15, 50 30 Z"
                    fill="url(#appleRed)"
                  />
                  <ellipse cx="34" cy="42" rx="7" ry="12" transform="rotate(-25 34 42)" fill="white" opacity="0.55" />
                  <defs>
                    <radialGradient id="appleRed" cx="40%" cy="40%" r="60%">
                      <stop offset="0%" stopColor="#ff7b7b" />
                      <stop offset="40%" stopColor="#dc2626" />
                      <stop offset="85%" stopColor="#991b1b" />
                      <stop offset="100%" stopColor="#450a0a" />
                    </radialGradient>
                  </defs>
                </svg>
              </div>

              {/* Right Blue Potion Bottle */}
              <div className="w-12 h-18 sm:w-14 sm:h-20 transform rotate-12 opacity-85">
                <svg viewBox="0 0 50 80" fill="none" className="drop-shadow-[0_4px_8px_rgba(59,130,246,0.4)]">
                  <rect x="18" y="2" width="14" height="8" rx="2" fill="#d97706" />
                  <rect x="20" y="10" width="10" height="8" fill="#93c5fd" opacity="0.6" />
                  <path d="M12 25 C12 18, 38 18, 38 25 L44 65 C44 75, 6 75, 6 65 Z" fill="url(#bluePotion)" />
                  <defs>
                    <linearGradient id="bluePotion" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#1e3a8a" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Bottom Title Label */}
            <div className="absolute bottom-3 left-4 z-20">
              <span className="text-white font-bold text-lg drop-shadow tracking-wide">
                Apple Of Fortune
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Grid of other games (All Disabled / Coming Soon) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
          {/* Card 1: Gems Odyssey */}
          <div
            id="game-card-gems-odyssey"
            className="bg-white rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 flex flex-col opacity-60 cursor-not-allowed relative"
          >
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
              <span className="bg-black/80 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                غير متاحة 🔒
              </span>
            </div>
            <div className="w-full h-32 relative bg-gradient-to-br from-[#2e1065] via-[#4c1d95] to-[#1e1b4b] flex items-center justify-center overflow-hidden">
              <div className="flex items-center justify-center gap-1">
                <div className="w-8 h-8 rounded-md rotate-45 bg-emerald-400 border border-white/60"></div>
                <div className="w-10 h-10 rounded-md rotate-12 bg-pink-500 border border-white/60 -mx-2 z-10"></div>
                <div className="w-7 h-7 rounded-md rotate-45 bg-amber-400 border border-white/60"></div>
              </div>
            </div>
            <div className="p-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Gems Odyssey</span>
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Card 2: Royal Hi-Lo */}
          <div
            id="game-card-royal-hilo"
            className="bg-white rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 flex flex-col opacity-60 cursor-not-allowed relative"
          >
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
              <span className="bg-black/80 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                غير متاحة 🔒
              </span>
            </div>
            <div className="w-full h-32 relative bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#0f172a] flex items-center justify-center overflow-hidden">
              <div className="flex items-center justify-center -space-x-4">
                <div className="w-8 h-12 bg-white rounded border border-slate-300 shadow transform -rotate-15 flex flex-col items-center justify-center text-[10px] font-bold text-red-600">
                  ♥ K
                </div>
                <div className="w-9 h-14 bg-white rounded border border-slate-300 shadow transform -rotate-3 z-10 flex flex-col items-center justify-center text-xs font-bold text-slate-900">
                  ♠ A
                </div>
                <div className="w-8 h-12 bg-white rounded border border-slate-300 shadow transform rotate-15 flex flex-col items-center justify-center text-[10px] font-bold text-red-600">
                  ♦ Q
                </div>
              </div>
            </div>
            <div className="p-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Royal Hi-Lo</span>
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Card 3: Mundial */}
          <div
            id="game-card-mundial"
            className="bg-white rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 flex flex-col opacity-60 cursor-not-allowed relative"
          >
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
              <span className="bg-black/80 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                غير متاحة 🔒
              </span>
            </div>
            <div className="w-full h-32 relative bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#022c22] flex items-center justify-center overflow-hidden">
              <div className="flex flex-col items-center justify-center">
                <span className="text-sm font-black text-amber-300 drop-shadow">MUNDIAL</span>
                <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-800 shadow-md flex items-center justify-center text-xs">
                  ⚽
                </div>
              </div>
            </div>
            <div className="p-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Mundial</span>
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Card 4: Four Aces */}
          <div
            id="game-card-four-aces"
            className="bg-white rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 flex flex-col opacity-60 cursor-not-allowed relative"
          >
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
              <span className="bg-black/80 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                غير متاحة 🔒
              </span>
            </div>
            <div className="w-full h-32 relative bg-gradient-to-br from-[#450a0a] via-[#881337] to-[#1c1917] flex items-center justify-center overflow-hidden">
              <div className="flex flex-col items-center justify-center">
                <span className="text-xs font-black text-amber-300 italic tracking-wider">Four Aces</span>
                <div className="flex gap-1 mt-1">
                  <span className="text-xs">♠</span>
                  <span className="text-xs text-red-400">♥</span>
                  <span className="text-xs text-red-400">♦</span>
                  <span className="text-xs">♣</span>
                </div>
              </div>
            </div>
            <div className="p-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Four Aces</span>
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

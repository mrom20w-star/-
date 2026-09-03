import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Sparkles, Trophy, Shuffle, Play } from 'lucide-react';
import { sound } from '../../utils/sound';
import confetti from 'canvas-confetti';

// 1. GEMS ODYSSEY GAME
export const GemsOdyssey: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();
  const [bet, setBet] = useState(20);
  const [grid, setGrid] = useState<Array<{ gem: string; mult: number; revealed: boolean }>>([]);
  const [playing, setPlaying] = useState(false);

  const GEM_TYPES = [
    { gem: '💎', mult: 2.0, color: 'from-blue-500 to-indigo-600' },
    { gem: '💚', mult: 3.5, color: 'from-emerald-400 to-green-600' },
    { gem: '💖', mult: 5.0, color: 'from-pink-500 to-rose-600' },
    { gem: '👑', mult: 10.0, color: 'from-amber-400 to-yellow-600' },
    { gem: '💣', mult: 0, color: 'from-slate-700 to-slate-900' },
  ];

  const startGame = () => {
    const ok = placeBet(bet, 'Gems Odyssey');
    if (!ok) return;

    const newGrid = Array.from({ length: 9 }, () => {
      const pick = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
      return { gem: pick.gem, mult: pick.mult, revealed: false };
    });
    setGrid(newGrid);
    setPlaying(true);
  };

  const revealTile = (index: number) => {
    if (!playing || grid[index].revealed) return;
    const tile = grid[index];
    const newGrid = [...grid];
    newGrid[index].revealed = true;
    setGrid(newGrid);

    if (tile.mult === 0) {
      sound.playCrash();
      setPlaying(false);
      showToast('قنبلة! انفجرت الجوهرة', 'error');
    } else {
      sound.playWin();
      setPlaying(false);
      winBet(bet, tile.mult, 'Gems Odyssey');
      confetti({ particleCount: 70, spread: 60 });
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#1a0b2e] text-white p-4 font-['Tajawal',sans-serif]">
      <div className="flex items-center justify-between pb-3 border-b border-purple-900">
        <button onClick={() => setScreen('lobby')} className="p-1.5 rounded-full hover:bg-purple-900">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-base text-purple-200">Gems Odyssey (أوديسي الجواهر)</h2>
        <span className="text-xs bg-purple-950 px-3 py-1 rounded-full border border-purple-700">
          {user.balance.toFixed(2)} ج.م
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center my-4">
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
          {(grid.length > 0 ? grid : Array(9).fill({ revealed: false })).map((item, idx) => (
            <button
              key={idx}
              disabled={!playing || item.revealed}
              onClick={() => revealTile(idx)}
              className={`aspect-square rounded-2xl border flex items-center justify-center text-3xl font-bold transition-all transform ${
                item.revealed
                  ? item.mult === 0
                    ? 'bg-rose-950 border-rose-600 animate-bounce'
                    : 'bg-emerald-950 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                  : 'bg-purple-900/60 border-purple-700/80 hover:bg-purple-800 hover:scale-105 active:scale-95 shadow-md cursor-pointer'
              }`}
            >
              {item.revealed ? item.gem : '✨'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="number"
            value={bet}
            disabled={playing}
            onChange={(e) => setBet(Number(e.target.value))}
            className="w-28 bg-purple-950 border border-purple-700 rounded-xl px-3 text-center font-bold text-sm"
          />
          <button
            disabled={playing}
            onClick={startGame}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-bold text-sm shadow-md cursor-pointer"
          >
            {playing ? 'اختر جوهرة الحظ!' : 'ابدأ اللعب (Spin)'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. ROYAL HI-LO GAME
export const RoyalHiLo: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();
  const [bet, setBet] = useState(20);
  const [currentCard, setCurrentCard] = useState<number>(7);
  const [playing, setPlaying] = useState(false);
  const [streak, setStreak] = useState(0);

  const CARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const CARD_NAMES: Record<number, string> = {
    11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };

  const startGame = () => {
    const ok = placeBet(bet, 'Royal Hi-Lo');
    if (!ok) return;
    setCurrentCard(Math.floor(2 + Math.random() * 13));
    setStreak(0);
    setPlaying(true);
  };

  const guess = (direction: 'high' | 'low') => {
    if (!playing) return;
    const nextCard = Math.floor(2 + Math.random() * 13);
    const win = direction === 'high' ? nextCard >= currentCard : nextCard <= currentCard;
    setCurrentCard(nextCard);

    if (win) {
      sound.playWin();
      const newStreak = streak + 1;
      setStreak(newStreak);
      const mult = Number((1.2 + newStreak * 0.4).toFixed(2));
      winBet(bet, mult, 'Royal Hi-Lo');
      confetti({ particleCount: 50 });
    } else {
      sound.playCrash();
      setPlaying(false);
      showToast('تخمين خاطئ!', 'error');
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0b132b] text-white p-4 font-['Tajawal',sans-serif]">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <button onClick={() => setScreen('lobby')} className="p-1.5 rounded-full hover:bg-slate-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-base text-amber-300">Royal Hi-Lo (أعلى أو أدنى)</h2>
        <span className="text-xs bg-slate-800 px-3 py-1 rounded-full">{user.balance.toFixed(2)} ج.م</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 my-6">
        {/* Card Display */}
        <div className="w-28 h-40 rounded-2xl bg-white text-slate-900 border-4 border-amber-400 shadow-2xl flex flex-col items-center justify-between p-3 font-bold">
          <div className="text-left w-full text-lg">{CARD_NAMES[currentCard] || currentCard}♠</div>
          <div className="text-4xl text-red-600">♠</div>
          <div className="text-right w-full text-lg">{CARD_NAMES[currentCard] || currentCard}♠</div>
        </div>

        {playing && (
          <div className="flex items-center gap-2 text-xs text-amber-400 font-bold bg-amber-950/60 px-4 py-1.5 rounded-full border border-amber-600/40">
            <span>سلسلة الانتصارات: {streak}</span>
            <span>|</span>
            <span>المضاعف: x{(1.2 + streak * 0.4).toFixed(2)}</span>
          </div>
        )}
      </div>

      {playing ? (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button
            onClick={() => guess('high')}
            className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-sm shadow-md cursor-pointer"
          >
            أعلى أو مساوي (HIGHER ↑)
          </button>
          <button
            onClick={() => guess('low')}
            className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-sm shadow-md cursor-pointer"
          >
            أدنى أو مساوي (LOWER ↓)
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="number"
            value={bet}
            onChange={(e) => setBet(Number(e.target.value))}
            className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-3 text-center font-bold text-sm"
          />
          <button
            onClick={startGame}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-md cursor-pointer"
          >
            بدء اللعبة (BET)
          </button>
        </div>
      )}
    </div>
  );
};

// 3. MUNDIAL SOCCER GAME
export const MundialGame: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();
  const [bet, setBet] = useState(20);
  const [goaliePos, setGoaliePos] = useState<number | null>(null);
  const [shotPos, setShotPos] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const shoot = (spot: number) => {
    const ok = placeBet(bet, 'Mundial');
    if (!ok) return;

    setPlaying(true);
    setShotPos(spot);
    const keeper = Math.floor(1 + Math.random() * 3);
    setGoaliePos(keeper);

    setTimeout(() => {
      if (spot !== keeper) {
        sound.playWin();
        winBet(bet, 2.85, 'Mundial');
        confetti({ particleCount: 80 });
      } else {
        sound.playCrash();
        showToast('تصدى لها الحارس!', 'error');
      }
      setPlaying(false);
    }, 800);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#06331a] text-white p-4 font-['Tajawal',sans-serif]">
      <div className="flex items-center justify-between pb-3 border-b border-emerald-800">
        <button onClick={() => setScreen('lobby')} className="p-1.5 rounded-full hover:bg-emerald-900">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-black text-base text-amber-300">MUNDIAL (ضربات الجزاء)</h2>
        <span className="text-xs bg-emerald-950 px-3 py-1 rounded-full border border-emerald-700">
          {user.balance.toFixed(2)} ج.م
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center my-6">
        {/* Goal Post Frame */}
        <div className="w-full max-w-xs h-40 border-4 border-white rounded-t-xl bg-gradient-to-b from-emerald-800 to-emerald-900 relative flex items-center justify-around px-2 shadow-2xl">
          {/* 3 Target Spots */}
          {[1, 2, 3].map((spot) => (
            <button
              key={spot}
              disabled={playing}
              onClick={() => shoot(spot)}
              className="w-16 h-20 rounded-xl bg-white/10 hover:bg-white/20 border border-dashed border-amber-300 flex flex-col items-center justify-center text-xs font-bold transition hover:scale-105 cursor-pointer"
            >
              <span>{spot === 1 ? 'يسار ↖' : spot === 2 ? 'وسط ⬆' : 'يمين ↗'}</span>
              <span className="text-[10px] text-amber-300 font-mono">x2.85</span>
            </button>
          ))}
          {/* Goalie representation */}
          {goaliePos && (
            <div
              className={`absolute bottom-2 text-3xl transition-all duration-300 ${
                goaliePos === 1 ? 'left-8' : goaliePos === 2 ? 'left-1/2 -translate-x-1/2' : 'right-8'
              }`}
            >
              🧤
            </div>
          )}
        </div>

        <div className="mt-4 text-xs font-bold text-emerald-200">
          سدد الكرة في زاوية مختلفة عن قفزة الحارس للفوز بـ 2.85x!
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={bet}
          disabled={playing}
          onChange={(e) => setBet(Number(e.target.value))}
          className="w-28 bg-emerald-950 border border-emerald-700 rounded-xl px-3 text-center font-bold text-sm"
        />
        <div className="flex-1 text-center py-3 bg-emerald-900/60 rounded-xl text-xs font-bold border border-emerald-700">
          اختر زاوية التسديد بالأعلى مباشرة
        </div>
      </div>
    </div>
  );
};

// 4. FOUR ACES GAME
export const FourAces: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();
  const [bet, setBet] = useState(20);
  const [winningCard, setWinningCard] = useState<number | null>(null);
  const [pickedCard, setPickedCard] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const SUITS = [
    { symbol: '♠', name: 'Spade', color: 'text-slate-900' },
    { symbol: '♥', name: 'Heart', color: 'text-red-600' },
    { symbol: '♦', name: 'Diamond', color: 'text-red-600' },
    { symbol: '♣', name: 'Club', color: 'text-slate-900' },
  ];

  const pickSuit = (index: number) => {
    const ok = placeBet(bet, 'Four Aces');
    if (!ok) return;

    setPlaying(true);
    setPickedCard(index);
    const winIdx = Math.floor(Math.random() * 4);
    setWinningCard(winIdx);

    setTimeout(() => {
      if (index === winIdx) {
        sound.playWin();
        winBet(bet, 3.94, 'Four Aces');
        confetti({ particleCount: 100 });
      } else {
        sound.playCrash();
        showToast('حظ أوفر في الجولة القادمة!', 'error');
      }
      setPlaying(false);
    }, 700);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#24060b] text-white p-4 font-['Tajawal',sans-serif]">
      <div className="flex items-center justify-between pb-3 border-b border-rose-900">
        <button onClick={() => setScreen('lobby')} className="p-1.5 rounded-full hover:bg-rose-900">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-black text-base text-amber-300">Four Aces (الآسات الأربعة)</h2>
        <span className="text-xs bg-rose-950 px-3 py-1 rounded-full border border-rose-800">
          {user.balance.toFixed(2)} ج.م
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center my-6">
        <span className="text-xs font-bold text-amber-300 mb-4">اختر الآس الرابح لمضاعفة رهانك x3.94!</span>
        <div className="grid grid-cols-4 gap-2 w-full max-w-xs">
          {SUITS.map((suit, idx) => (
            <button
              key={idx}
              disabled={playing}
              onClick={() => pickSuit(idx)}
              className={`h-28 rounded-xl bg-white ${suit.color} border-2 flex flex-col items-center justify-between p-2 shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer ${
                pickedCard === idx ? 'ring-4 ring-amber-400' : 'border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">A</span>
              <span className="text-3xl">{suit.symbol}</span>
              <span className="text-xs font-bold">A</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={bet}
          disabled={playing}
          onChange={(e) => setBet(Number(e.target.value))}
          className="w-28 bg-rose-950 border border-rose-800 rounded-xl px-3 text-center font-bold text-sm"
        />
        <div className="flex-1 text-center py-3 bg-rose-900/60 rounded-xl text-xs font-bold border border-rose-800">
          اضغط على أي كارت للرهان المباشر
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowRight } from 'lucide-react';
import { sound } from '../../utils/sound';
import confetti from 'canvas-confetti';

const MULTIPLIERS = [1.23, 1.54, 1.93, 2.41, 4.33, 8.66, 17.3, 34.6, 69.3, 346.5];
// Number of rotten apples per row (increases difficulty as you climb)
const ROTTEN_COUNTS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4];

interface RowData {
  rowIndex: number;
  multiplier: number;
  selectedCol: number | null;
  rottenCols: number[];
  revealed: boolean;
}

export const AppleOfFortune: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();
  const [betAmount, setBetAmount] = useState<number>(20);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentRow, setCurrentRow] = useState<number>(0);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [rows, setRows] = useState<RowData[]>(() => generateInitialRows());

  function generateInitialRows(): RowData[] {
    return Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      multiplier: MULTIPLIERS[i],
      selectedCol: null,
      rottenCols: [],
      revealed: false,
    }));
  }

  // Start new game
  const handleStartGame = () => {
    if (betAmount <= 0) {
      showToast('يرجى تحديد مبلغ الرهان', 'error');
      return;
    }
    const ok = placeBet(betAmount, 'Apple of Fortune');
    if (!ok) return;

    // Generate rotten positions for each row
    const newRows: RowData[] = Array.from({ length: 10 }, (_, rIdx) => {
      const rottenCount = ROTTEN_COUNTS[rIdx];
      const cols = [0, 1, 2, 3, 4];
      const rottenCols: number[] = [];
      for (let k = 0; k < rottenCount; k++) {
        const pickIdx = Math.floor(Math.random() * cols.length);
        rottenCols.push(cols.splice(pickIdx, 1)[0]);
      }
      return {
        rowIndex: rIdx,
        multiplier: MULTIPLIERS[rIdx],
        selectedCol: null,
        rottenCols,
        revealed: false,
      };
    });

    setRows(newRows);
    setCurrentRow(0);
    setIsPlaying(true);
    setIsGameOver(false);
  };

  // User picks a cell in the active row
  const handleCellClick = (colIdx: number) => {
    if (!isPlaying || isGameOver) return;
    const activeRow = rows[currentRow];
    if (!activeRow || activeRow.revealed) return;

    const isRotten = activeRow.rottenCols.includes(colIdx);
    const updatedRows = [...rows];
    updatedRows[currentRow] = {
      ...activeRow,
      selectedCol: colIdx,
      revealed: true,
    };
    setRows(updatedRows);

    if (isRotten) {
      // Game Over!
      sound.playAppleReveal(false);
      setIsGameOver(true);
      setIsPlaying(false);
      showToast('للأسف تفاحة فاسدة! حظ أوفر في المرة القادمة', 'error');
    } else {
      // Success!
      sound.playAppleReveal(true);
      if (currentRow === 9) {
        // Won the whole tree!
        setIsPlaying(false);
        winBet(betAmount, MULTIPLIERS[9], 'Apple of Fortune');
        confetti({ particleCount: 150, spread: 90 });
      } else {
        setCurrentRow((prev) => prev + 1);
      }
    }
  };

  // Cash out current row winnings
  const handleTakeWinnings = () => {
    if (!isPlaying || currentRow === 0) return;
    const wonMultiplier = MULTIPLIERS[currentRow - 1];
    setIsPlaying(false);
    setIsGameOver(false);
    winBet(betAmount, wonMultiplier, 'Apple of Fortune');
    confetti({ particleCount: 80, spread: 70 });
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#051c14] text-slate-100 select-none pb-4 relative overflow-hidden font-['Tajawal',sans-serif]">
      {/* Background Forest Glow Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_60%)] pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-950/80 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Header matching screenshot */}
      <div className="w-full px-4 py-2 flex items-center justify-between z-20">
        {/* Back Button on right (RTL) */}
        <button
          onClick={() => setScreen('lobby')}
          id="apple-back-btn"
          className="p-1.5 rounded-full hover:bg-emerald-950 text-slate-200 transition cursor-pointer"
          title="رجوع للرئيسية"
        >
          <ArrowRight className="w-5 h-5" />
        </button>

        {/* Center Balance Pill: 0,00 ج.م */}
        <button
          onClick={() => setScreen('deposit')}
          id="apple-balance-pill"
          className="px-4 py-1 rounded-full bg-[#132c23] hover:bg-[#1a382d] border border-emerald-800/60 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
        >
          <span>{user.balance.toFixed(2)} ج.م</span>
        </button>

        <div className="w-6"></div>
      </div>

      {/* 10-Row Tree Matrix & Ladder Container */}
      <div className="w-full px-3 py-1 flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm flex items-center gap-2">
          {/* 10 Rows of 5 Wooden Barrel Discs (rendered from row 9 top to row 0 bottom) */}
          <div className="flex-1 flex flex-col gap-1.5">
            {Array.from({ length: 10 }, (_, idx) => 9 - idx).map((rIdx) => {
              const row = rows[rIdx];
              const isCurrent = isPlaying && currentRow === rIdx;
              const isPast = rIdx < currentRow;
              const isFuture = rIdx > currentRow;

              return (
                <div
                  key={rIdx}
                  className={`grid grid-cols-5 gap-1.5 p-1 rounded-xl transition-all duration-200 ${
                    isCurrent
                      ? 'bg-emerald-500/20 ring-2 ring-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse'
                      : 'bg-black/20'
                  }`}
                >
                  {[0, 1, 2, 3, 4].map((cIdx) => {
                    const isSelected = row.selectedCol === cIdx;
                    const isRotten = row.rottenCols.includes(cIdx);
                    const revealed = row.revealed;

                    return (
                      <button
                        key={cIdx}
                        disabled={!isCurrent || !isPlaying}
                        onClick={() => handleCellClick(cIdx)}
                        className={`aspect-square rounded-full transition-transform duration-200 flex items-center justify-center cursor-pointer shadow-md ${
                          isCurrent
                            ? 'hover:scale-105 active:scale-95'
                            : isFuture
                            ? 'opacity-70 cursor-not-allowed'
                            : ''
                        }`}
                      >
                        {revealed && isSelected ? (
                          isRotten ? (
                            // Rotten Apple / Skull
                            <div className="w-full h-full rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center text-sm shadow-inner animate-bounce">
                              💀
                            </div>
                          ) : (
                            // Fresh Juicy Apple
                            <div className="w-full h-full rounded-full bg-emerald-900 border border-emerald-400 flex items-center justify-center text-sm shadow-[0_0_10px_rgba(52,211,153,0.8)]">
                              🍎
                            </div>
                          )
                        ) : (
                          // Wooden Barrel / Apple Cover (matching screenshot wood texture)
                          <div className="w-full h-full rounded-full bg-gradient-to-b from-[#a4592a] via-[#823f19] to-[#59260d] border border-[#d97706]/40 shadow-inner relative overflow-hidden flex items-center justify-center">
                            {/* Wood grain horizontal lines */}
                            <div className="w-full h-[1px] bg-black/30 absolute top-1/4"></div>
                            <div className="w-full h-[1px] bg-black/30 absolute top-2/4"></div>
                            <div className="w-full h-[1px] bg-black/30 absolute top-3/4"></div>
                            {/* Center wood shine */}
                            <div className="w-2 h-2 rounded-full bg-amber-400/20 blur-xs"></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Right Multiplier Ladder matching screenshot */}
          <div className="w-14 flex flex-col gap-1.5">
            {Array.from({ length: 10 }, (_, idx) => 9 - idx).map((rIdx) => {
              const isCurrent = isPlaying && currentRow === rIdx;
              const isPastWon = rIdx < currentRow;
              const mult = MULTIPLIERS[rIdx];

              return (
                <div
                  key={rIdx}
                  className={`h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${
                    isCurrent
                      ? 'bg-[#22c55e] text-white shadow-[0_0_12px_rgba(34,197,94,0.8)] scale-105 font-mono'
                      : isPastWon
                      ? 'bg-emerald-900/90 text-emerald-300 border border-emerald-600/50 font-mono'
                      : 'bg-white/10 text-slate-300 font-mono'
                  }`}
                >
                  {rIdx === 0 && !isPlaying ? '1.00' : `x${mult.toFixed(mult >= 10 ? 1 : 2)}`}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bet Controls & Action Buttons matching screenshot */}
      <div className="w-full px-4 pt-2 z-20 flex flex-col gap-2">
        {/* Quick Amount Modifiers: MAX, X/2, X2, MIN */}
        <div className="w-full grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setBetAmount(Math.floor(user.balance) || 100)}
            disabled={isPlaying}
            className="py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs transition cursor-pointer"
          >
            MAX
          </button>
          <button
            onClick={() => setBetAmount(Math.max(1, Math.floor(betAmount / 2)))}
            disabled={isPlaying}
            className="py-1.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs transition cursor-pointer"
          >
            X/2
          </button>
          <button
            onClick={() => setBetAmount(betAmount * 2)}
            disabled={isPlaying}
            className="py-1.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs transition cursor-pointer"
          >
            X2
          </button>
          <button
            onClick={() => setBetAmount(10)}
            disabled={isPlaying}
            className="py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs transition cursor-pointer"
          >
            MIN
          </button>
        </div>

        {/* Input & STAKE / TAKE WINNINGS Button */}
        <div className="w-full flex items-center gap-2">
          {!isPlaying && (
            <div className="w-28 bg-[#102d22] border border-emerald-700/60 rounded-xl px-2 py-2 flex items-center justify-center">
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-transparent text-white font-bold text-center text-sm focus:outline-none"
              />
            </div>
          )}

          {isPlaying && currentRow > 0 ? (
            <button
              onClick={handleTakeWinnings}
              id="apple-take-winnings-btn"
              className="flex-1 py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] active:scale-95 text-white font-extrabold text-sm tracking-wide shadow-lg transition cursor-pointer flex flex-col items-center justify-center animate-pulse"
            >
              <span>سحب الأرباح (TAKE WINNINGS)</span>
              <span className="text-xs font-mono font-normal">
                {(betAmount * MULTIPLIERS[currentRow - 1]).toFixed(1)} ج.م (x{MULTIPLIERS[currentRow - 1]})
              </span>
            </button>
          ) : (
            <button
              onClick={handleStartGame}
              disabled={isPlaying}
              id="apple-stake-btn"
              className={`flex-1 py-3 rounded-xl text-white font-extrabold text-sm tracking-wider shadow-md transition-all cursor-pointer text-center ${
                isPlaying
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-[#3b82f6] hover:bg-[#2563eb] active:scale-95'
              }`}
            >
              STAKE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

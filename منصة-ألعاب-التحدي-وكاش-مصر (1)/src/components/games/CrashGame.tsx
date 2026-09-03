import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Plus } from 'lucide-react';
import { sound } from '../../utils/sound';
import confetti from 'canvas-confetti';

interface LivePlayerBet {
  id: string;
  name: string;
  bet: number;
  targetOdds: number;
  cashedOut: boolean;
  cashedOdds?: number;
  winAmount?: number;
}

const BOT_NAMES = [
  'LionPro', 'UserX', 'MidoVIP', 'DevVIP',
  'Ahmed77', 'AhmedPro', 'User77', 'User123',
  'Mido99', 'KingAlex', 'CaptainK', 'ZiadCash'
];

const generateBots = (): LivePlayerBet[] => {
  const bots: LivePlayerBet[] = [];
  const betAmounts = [10, 20, 50, 100, 200, 500, 1000];

  for (let i = 0; i < BOT_NAMES.length; i++) {
    const name = BOT_NAMES[i];
    const bet = betAmounts[i % betAmounts.length];
    let targetOdds = 1.2 + Math.random() * 3.5;
    if (i === 0) targetOdds = 7.96;
    if (i === 1) targetOdds = 1.79;
    if (i === 2) targetOdds = 3.39;
    if (i === 3) targetOdds = 2.59;
    if (i === 4) targetOdds = 5.84;
    if (i === 5) targetOdds = 2.03;
    if (i === 6) targetOdds = 4.03;
    if (i === 7) targetOdds = 1.51;

    bots.push({
      id: `bot_${i}`,
      name,
      bet,
      targetOdds: Number(targetOdds.toFixed(2)),
      cashedOut: false,
    });
  }

  return bots;
};

export const CrashGame: React.FC = () => {
  const { user, placeBet, winBet, setScreen, showToast } = useApp();

  // Core Game States
  const [gameState, setGameState] = useState<'countdown' | 'flying' | 'crashed'>('countdown');
  const [countdown, setCountdown] = useState<number>(5);
  const [multiplier, setMultiplier] = useState<number>(1.00);
  const [crashPoint, setCrashPoint] = useState<number>(14.28);

  // Bet States
  const [betAmount, setBetAmount] = useState<number>(20);
  const [userBetPlaced, setUserBetPlaced] = useState<boolean>(false);
  const [userCashedOut, setUserCashedOut] = useState<boolean>(false);
  const [autoBetNextRound, setAutoBetNextRound] = useState<boolean>(false);

  // Live Players
  const [liveBots, setLiveBots] = useState<LivePlayerBet[]>(() => generateBots());

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const frozenTrajectoryRef = useRef<{ endX: number; endY: number } | null>(null);
  const planeImgRef = useRef<HTMLImageElement | null>(null);

  // Preload new 3D golden airplane asset
  useEffect(() => {
    const img = new Image();
    img.src = '/plane.png';
    img.onload = () => {
      planeImgRef.current = img;
    };
  }, []);

  // Random realistic crash target or forced from Admin HTML panel
  const generateCrashTarget = () => {
    try {
      const forced = localStorage.getItem('app_forced_crash_multiplier');
      if (forced && !isNaN(Number(forced)) && Number(forced) > 1) {
        return Number(Number(forced).toFixed(2));
      }
    } catch {}

    const r = Math.random();
    if (r < 0.1) return Number((1.05 + Math.random() * 0.4).toFixed(2));
    if (r < 0.5) return Number((1.50 + Math.random() * 2.2).toFixed(2));
    if (r < 0.8) return Number((3.50 + Math.random() * 6.5).toFixed(2));
    return Number((10.00 + Math.random() * 15.0).toFixed(2));
  };

  // -------------------------------------------------------------
  // CONTINUOUS GAME LOOP
  // -------------------------------------------------------------
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;
    let crashTimer: NodeJS.Timeout;

    if (gameState === 'countdown') {
      sound.stopEngineSound();
      setUserCashedOut(false);
      frozenTrajectoryRef.current = null;

      const nextCrash = generateCrashTarget();
      setCrashPoint(nextCrash);
      setLiveBots(generateBots());

      if (autoBetNextRound && !userBetPlaced) {
        if (user.balance >= betAmount) {
          const ok = placeBet(betAmount, 'Crash');
          if (ok) setUserBetPlaced(true);
        } else {
          setAutoBetNextRound(false);
          showToast('الرصيد غير كافٍ للرهان التلقائي', 'error');
        }
      }

      setCountdown(5);
      countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setGameState('flying');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }

    if (gameState === 'flying') {
      startTimeRef.current = performance.now();
      setMultiplier(1.00);

      const updateFlight = () => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const currentM = Number((1.0 + 0.08 * elapsed + 0.045 * Math.pow(elapsed, 2)).toFixed(2));

        if (currentM >= crashPoint) {
          sound.stopEngineSound();
          sound.playCrash();
          setMultiplier(crashPoint);
          setGameState('crashed');
          setUserBetPlaced(false);
          return;
        }

        setMultiplier(currentM);
        sound.startEngineSound(currentM);

        // Update bots cashouts
        setLiveBots((prev) =>
          prev.map((bot) => {
            if (!bot.cashedOut && currentM >= bot.targetOdds && currentM < crashPoint) {
              return {
                ...bot,
                cashedOut: true,
                cashedOdds: currentM,
                winAmount: Number((bot.bet * currentM).toFixed(1)),
              };
            }
            return bot;
          })
        );

        animationFrameRef.current = requestAnimationFrame(updateFlight);
      };

      animationFrameRef.current = requestAnimationFrame(updateFlight);

      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        sound.stopEngineSound();
      };
    }

    if (gameState === 'crashed') {
      crashTimer = setTimeout(() => {
        setGameState('countdown');
      }, 3000);

      return () => clearTimeout(crashTimer);
    }

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(crashTimer);
      sound.stopEngineSound();
    };
  }, [gameState]);

  // -------------------------------------------------------------
  // CANVAS DRAWING (Exact Plane & Arc Matching Screenshots)
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const drawCartoonPlane = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      angle: number,
      time: number = Date.now()
    ) => {
      // If the plane image is loaded, render the exact airplane cleanly and naturally
      if (planeImgRef.current && planeImgRef.current.complete) {
        context.save();
        context.translate(x, y);

        // Align the plane with the flight curve tangent angle naturally
        const imageBaseAngle = -26 * (Math.PI / 180);
        context.rotate(angle - imageBaseAngle);

        // Clean golden glow for smooth visibility on dark canvas
        context.save();
        context.shadowColor = 'rgba(245, 158, 11, 0.5)';
        context.shadowBlur = 12;

        const planeWidth = 82;
        const planeHeight = 48;

        context.drawImage(
          planeImgRef.current,
          -planeWidth * 0.5,
          -planeHeight * 0.5,
          planeWidth,
          planeHeight
        );
        context.restore();
        context.restore();
        return;
      }

      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.scale(0.85, 0.85); // Scale for crisp proportion

      // 1. Landing Gear (Underneath)
      context.fillStyle = '#b45309';
      context.beginPath();
      context.roundRect(4, 12, 10, 8, 3);
      context.fill();

      context.fillStyle = '#f59e0b';
      context.beginPath();
      context.ellipse(9, 18, 5, 3.5, 0, 0, Math.PI * 2);
      context.fill();

      // 2. Tail Wing / Empennage (with orange stripes as in photo_2026-08-31_22-17-19.jpg)
      context.save();
      context.beginPath();
      context.moveTo(-24, 2);
      context.quadraticCurveTo(-38, -10, -42, -26);
      context.quadraticCurveTo(-36, -30, -28, -28);
      context.quadraticCurveTo(-22, -18, -14, -6);
      context.closePath();
      const tailGrad = context.createLinearGradient(-42, -30, -14, 0);
      tailGrad.addColorStop(0, '#fbbf24');
      tailGrad.addColorStop(0.5, '#f59e0b');
      tailGrad.addColorStop(1, '#d97706');
      context.fillStyle = tailGrad;
      context.fill();

      // Tail Rudder Stripes
      context.strokeStyle = '#b45309';
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(-38, -24);
      context.lineTo(-28, -20);
      context.moveTo(-35, -17);
      context.lineTo(-25, -13);
      context.moveTo(-32, -10);
      context.lineTo(-22, -6);
      context.stroke();
      context.restore();

      // 3. Lower / Far Wing
      context.save();
      context.beginPath();
      context.moveTo(-28, 4);
      context.quadraticCurveTo(-36, 16, -26, 20);
      context.quadraticCurveTo(-18, 14, -14, 4);
      context.closePath();
      context.fillStyle = '#d97706';
      context.fill();
      context.restore();

      // 4. Main Fuselage (Curved Golden Body)
      context.save();
      context.beginPath();
      context.moveTo(-30, 2);
      context.quadraticCurveTo(-20, -12, 10, -12); // Top spine
      context.quadraticCurveTo(24, -10, 28, 0);    // Front nose transition
      context.quadraticCurveTo(24, 14, 6, 14);     // Belly
      context.quadraticCurveTo(-18, 12, -30, 2);   // Tail taper
      context.closePath();

      const bodyGrad = context.createLinearGradient(0, -14, 0, 14);
      bodyGrad.addColorStop(0, '#fef08a');
      bodyGrad.addColorStop(0.3, '#fbbf24');
      bodyGrad.addColorStop(0.7, '#f59e0b');
      bodyGrad.addColorStop(1, '#c2410c');
      context.fillStyle = bodyGrad;
      context.fill();
      context.restore();

      // 5. Cockpit Canopy / Windshield
      context.save();
      context.beginPath();
      context.moveTo(-8, -10);
      context.quadraticCurveTo(2, -22, 12, -10);
      context.closePath();
      const cockpitGrad = context.createLinearGradient(0, -20, 0, -10);
      cockpitGrad.addColorStop(0, '#fef9c3');
      cockpitGrad.addColorStop(1, '#fde047');
      context.fillStyle = cockpitGrad;
      context.fill();
      context.strokeStyle = '#d97706';
      context.lineWidth = 1.5;
      context.stroke();
      context.restore();

      // 6. Main Center Wing
      context.save();
      context.beginPath();
      context.moveTo(-10, 3);
      context.quadraticCurveTo(4, 18, 18, 14);
      context.quadraticCurveTo(22, 5, 8, 1);
      context.closePath();
      const wingGrad = context.createLinearGradient(-10, 0, 18, 14);
      wingGrad.addColorStop(0, '#fde047');
      wingGrad.addColorStop(0.6, '#f59e0b');
      wingGrad.addColorStop(1, '#b45309');
      context.fillStyle = wingGrad;
      context.fill();
      context.restore();

      // 7. Engine Cowling Ring & Rivets
      context.save();
      context.beginPath();
      context.moveTo(22, -10);
      context.lineTo(29, -9);
      context.quadraticCurveTo(32, 0, 29, 9);
      context.lineTo(22, 10);
      context.closePath();
      const cowlGrad = context.createLinearGradient(22, 0, 32, 0);
      cowlGrad.addColorStop(0, '#ea580c');
      cowlGrad.addColorStop(0.5, '#f97316');
      cowlGrad.addColorStop(1, '#c2410c');
      context.fillStyle = cowlGrad;
      context.fill();

      // Cowl Rim Line & Rivets
      context.strokeStyle = '#fef08a';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(24, -9);
      context.lineTo(24, 9);
      context.stroke();

      context.fillStyle = '#fef08a';
      [-6, -2, 2, 6].forEach((offsetY) => {
        context.beginPath();
        context.arc(27, offsetY, 1, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();

      // 8. Nose Spinner Cone
      context.save();
      context.beginPath();
      context.moveTo(29, -6);
      context.quadraticCurveTo(39, 0, 29, 6);
      context.closePath();
      context.fillStyle = '#fbbf24';
      context.fill();
      context.restore();

      // 9. Spinning Propeller Blades
      context.save();
      context.translate(33, 0);
      const spinAngle = time * 0.045;
      context.rotate(spinAngle);

      const propGrad = context.createLinearGradient(-3, -24, 3, 24);
      propGrad.addColorStop(0, '#fef08a');
      propGrad.addColorStop(0.5, '#d97706');
      propGrad.addColorStop(1, '#78350f');

      // Top Blade
      context.fillStyle = propGrad;
      context.beginPath();
      context.ellipse(0, -15, 3.5, 12, 0, 0, Math.PI * 2);
      context.fill();

      // Bottom Blade
      context.beginPath();
      context.ellipse(0, 15, 3.5, 12, 0, 0, Math.PI * 2);
      context.fill();

      // Center Nut
      context.fillStyle = '#78350f';
      context.beginPath();
      context.arc(0, 0, 3, 0, Math.PI * 2);
      context.fill();

      context.restore();

      context.restore();
    };

    const render = (time: number) => {
      const parentWidth = canvas.parentElement?.clientWidth || 360;
      const width = (canvas.width = parentWidth);
      const height = (canvas.height = 230);

      ctx.clearRect(0, 0, width, height);

      // Dark navy container background matching screenshot
      ctx.fillStyle = '#1b233a';
      ctx.fillRect(0, 0, width, height);

      const startX = 35;
      const startY = height - 35;

      if (gameState === 'flying' || gameState === 'crashed') {
        const progress = Math.min(1, (multiplier - 1) / Math.max(2.5, crashPoint * 0.95));
        const endX = startX + progress * (width - 95);
        const endY = startY - Math.pow(progress, 0.78) * (height - 75);

        const cpX = startX + (endX - startX) * 0.45;
        const cpY = startY;

        // 1. Draw Golden Trajectory Line matching photo_2026-08-31_22-17-22.jpg
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.strokeStyle = '#e58e00';
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(229, 142, 0, 0.5)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();

        // 2. Draw Golden Circular Dot at head of line matching photo_2026-08-31_22-17-22.jpg
        ctx.save();
        ctx.beginPath();
        ctx.arc(endX, endY, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e58e00';
        ctx.shadowColor = 'rgba(229, 142, 0, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();

        // 3. Draw Golden Cartoon Airplane matching photo_2026-08-31_22-17-19.jpg
        if (gameState === 'flying') {
          const t = progress;
          const dx = 2 * (1 - t) * (cpX - startX) + 2 * t * (endX - cpX);
          const dy = 2 * (1 - t) * (cpY - startY) + 2 * t * (endY - cpY);
          const angle = Math.atan2(dy, dx);

          drawCartoonPlane(ctx, endX, endY, angle);
        }
      }

      if (gameState === 'flying' || gameState === 'crashed') {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animId);
  }, [gameState, multiplier, crashPoint]);

  // Bet Handler
  const handlePlaceBet = () => {
    if (userBetPlaced) {
      setUserBetPlaced(false);
      showToast('تم إلغاء الرهان', 'info');
      return;
    }

    if (gameState === 'flying') {
      setAutoBetNextRound(!autoBetNextRound);
      showToast(
        !autoBetNextRound
          ? 'سيتم تفعيل الرهان للجولة القادمة'
          : 'تم إلغاء الرهان للجولة القادمة',
        'info'
      );
      return;
    }

    const ok = placeBet(betAmount, 'Crash');
    if (ok) {
      setUserBetPlaced(true);
      showToast(`تم وضع رهان بقيمة ${betAmount} ج.م`, 'success');
    }
  };

  // Cashout Handler
  const handleCashOut = () => {
    if (!userBetPlaced || userCashedOut || gameState !== 'flying') return;
    setUserCashedOut(true);
    setUserBetPlaced(false);
    winBet(betAmount, multiplier, 'Crash');
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.55 },
    });
  };

  return (
    <div className="w-full min-h-screen bg-[#121829] text-white flex flex-col font-['Tajawal',sans-serif] select-none pb-8" dir="ltr">
      {/* Top Header Bar matching screenshot */}
      <div className="w-full px-4 pt-3 pb-2 flex items-center justify-between">
        {/* Back Arrow */}
        <button
          onClick={() => setScreen('lobby')}
          id="crash-back-btn"
          className="p-2 text-white hover:text-slate-300 transition cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        {/* Center Pill Balance Badge */}
        <button
          onClick={() => setScreen('deposit')}
          id="crash-balance-pill"
          className="px-4 py-1.5 rounded-full bg-[#1e263d] border border-slate-700/80 text-white font-bold text-sm flex items-center gap-1.5 transition cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4 text-emerald-400 font-black" />
          <span>{user.balance.toFixed(2)} ج.م</span>
        </button>

        {/* Placeholder for balance symmetry */}
        <div className="w-8"></div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto px-4 flex flex-col gap-3">
        {/* Top-Right Yellow Tag Badge matching screenshot */}
        <div className="w-full flex justify-end">
          <div className="px-3 py-1 rounded-lg border border-yellow-400/90 text-yellow-300 text-xs font-bold bg-[#1b233a]/60 shadow-xs">
            {gameState === 'countdown' ? 'انتظار الجولة...' : `ستنفجر عند: ${crashPoint.toFixed(2)}x`}
          </div>
        </div>

        {/* Main Canvas Card matching screenshot */}
        <div className="w-full h-60 rounded-2xl bg-[#1b233a] border border-slate-700/50 relative overflow-hidden flex items-center justify-center shadow-xl">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* Countdown State View matching screenshot photo_2026-08-31_22-14-28.jpg */}
          {gameState === 'countdown' && (
            <div className="relative z-20 flex items-center justify-center w-full h-full">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-wide font-['Tajawal']" dir="rtl">
                تبدأ خلال: {countdown}
              </span>
            </div>
          )}

          {/* Flying State View: 2.24x at bottom-right matching screenshot photo_2026-08-31_22-14-25.jpg */}
          {gameState === 'flying' && (
            <div className="absolute bottom-5 right-6 pointer-events-none z-20">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-md font-sans">
                {multiplier.toFixed(2)}x
              </span>
            </div>
          )}

          {/* Crashed State View: CRASHED! in red matching screenshot photo_2026-08-31_22-14-20.jpg */}
          {gameState === 'crashed' && (
            <div className="absolute bottom-5 right-6 pointer-events-none z-20">
              <span className="text-3xl sm:text-4xl font-black text-[#ef4444] tracking-wider drop-shadow-md">
                CRASHED!
              </span>
            </div>
          )}
        </div>

        {/* Bet Controls Area matching screenshot */}
        <div className="w-full grid grid-cols-2 gap-3 mt-1">
          {/* Bet Input Box */}
          <div className="h-14 bg-[#1b233a] rounded-xl border border-slate-700/60 flex items-center justify-center px-4">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
              disabled={userBetPlaced && gameState === 'flying'}
              className="w-full bg-transparent text-white font-bold text-center text-xl focus:outline-none"
            />
          </div>

          {/* Orange PLACE A BET Button (or Green CASH OUT when bet placed) */}
          {gameState === 'flying' && userBetPlaced && !userCashedOut ? (
            <button
              onClick={handleCashOut}
              id="crash-cashout-btn"
              className="h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm tracking-wider shadow-lg transition cursor-pointer flex flex-col items-center justify-center"
            >
              <span>CASH OUT</span>
              <span className="text-xs font-bold font-mono text-yellow-200">
                {(betAmount * multiplier).toFixed(1)} ج.م
              </span>
            </button>
          ) : (
            <button
              onClick={handlePlaceBet}
              id="crash-place-bet-btn"
              className={`h-14 rounded-xl font-bold text-sm sm:text-base tracking-wide transition cursor-pointer shadow-md flex items-center justify-center ${
                userBetPlaced
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-[#ff6a00] hover:bg-[#ff7a1a] active:scale-98 text-white'
              }`}
            >
              {userBetPlaced ? 'CANCEL BET' : 'PLACE A BET'}
            </button>
          )}
        </div>

        {/* Live Bets Table matching screenshot photo_2026-08-31_22-14-20.jpg */}
        <div className="w-full mt-3 flex flex-col">
          {/* Table Header Row */}
          <div className="w-full grid grid-cols-4 text-xs font-bold text-slate-400 py-2 border-b border-slate-800">
            <span className="text-left">USER</span>
            <span className="text-center">ODDS</span>
            <span className="text-center">BET</span>
            <span className="text-right">WIN</span>
          </div>

          {/* Table Rows */}
          <div className="w-full flex flex-col divide-y divide-slate-800/40 text-xs font-medium">
            {/* User row if bet placed */}
            {userBetPlaced && (
              <div className="grid grid-cols-4 py-2.5 items-center bg-blue-950/40 text-blue-200">
                <span className="text-left font-bold truncate">You ({user.id})</span>
                <span className="text-center font-mono">
                  {userCashedOut ? `${multiplier.toFixed(2)}x` : '-'}
                </span>
                <span className="text-center font-mono">{betAmount} ج.م</span>
                <span className="text-right font-mono font-bold text-emerald-400">
                  {userCashedOut ? (betAmount * multiplier).toFixed(1) : '-'}
                </span>
              </div>
            )}

            {/* Bots Rows */}
            {liveBots.map((bot) => {
              const isWin = (gameState === 'crashed' || bot.cashedOut) && bot.winAmount;
              return (
                <div key={bot.id} className="grid grid-cols-4 py-2.5 items-center text-slate-300">
                  {/* User */}
                  <span className="text-left text-slate-200 font-medium truncate">{bot.name}</span>

                  {/* Odds */}
                  <span
                    className={`text-center font-mono ${
                      bot.cashedOut ? 'text-emerald-400 font-bold' : 'text-slate-500'
                    }`}
                  >
                    {bot.cashedOut && bot.cashedOdds ? `${bot.cashedOdds.toFixed(2)}x` : '-'}
                  </span>

                  {/* Bet */}
                  <span className="text-center text-slate-200 font-mono" dir="rtl">
                    {bot.bet} ج.م
                  </span>

                  {/* Win */}
                  <span
                    className={`text-right font-mono ${
                      bot.cashedOut && bot.winAmount
                        ? 'text-amber-300 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {bot.cashedOut && bot.winAmount ? bot.winAmount.toFixed(1) : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import GameCanvas from './components/GameCanvas.tsx';
import SpinPicker from './components/SpinPicker.tsx';
import { Ball, BallType, GamePhase, GameState, Vector2D, GameMode } from './types.ts';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, MAX_POWER } from './constants.ts';
import { getTutorAdvice } from './services/aiTutor.ts';
import { audioService } from './services/audioService.ts';
import { PhysicsEngine } from './services/physicsEngine.ts';

const getInitialBalls = (mode: GameMode): Ball[] => {
  const common = [
    { id: 'white', type: BallType.CUE_WHITE, pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, mass: 1, isPocketed: false, sideSpin: 0, topSpin: 0, trace: [] },
    { id: 'yellow', type: BallType.CUE_YELLOW, pos: { x: 600, y: 200 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, mass: 1, isPocketed: false, sideSpin: 0, topSpin: 0, trace: [] },
    { id: 'red1', type: BallType.TARGET_RED1, pos: { x: 400, y: 150 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, mass: 1, isPocketed: false, sideSpin: 0, topSpin: 0, trace: [] },
  ];
  if (mode === GameMode.SAGU) {
    return [...common, { id: 'red2', type: BallType.TARGET_RED2, pos: { x: 400, y: 250 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, mass: 1, isPocketed: false, sideSpin: 0, topSpin: 0, trace: [] }];
  }
  return common;
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    scores: [0, 0], currentPlayer: 0, playerCount: 1, mode: GameMode.SAGU,
    phase: GamePhase.SETUP, message: 'Welcome', turnCount: 1, level: 1, xp: 0, nextLevelXp: 100
  });

  const [balls, setBalls] = useState<Ball[]>([]);
  const [spinOffset, setSpinOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const [shotPower, setShotPower] = useState<number>(15); 
  const [advice, setAdvice] = useState<string>("준비가 완료되었습니다.");
  const [lastDirection, setLastDirection] = useState<Vector2D>({ x: 1, y: 0 });
  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);

  const [shotCollisions, setShotCollisions] = useState<Set<string>>(new Set());
  const [cushionCount, setCushionCount] = useState(0);

  const startNewGame = (mode: GameMode, players: 1 | 2) => {
    setBalls(getInitialBalls(mode));
    setGameState(prev => ({ 
      ...prev, scores: [0, 0], currentPlayer: 0, playerCount: players, mode, 
      phase: GamePhase.AIMING, turnCount: 1 
    }));
    setCombo(0); setShotPower(15); setSpinOffset({ x: 0, y: 0 });
  };

  const executeShot = useCallback(() => {
    if (gameState.phase !== GamePhase.SELECT_POWER) return;
    
    const impact = PhysicsEngine.calculateCueImpact(lastDirection, shotPower, spinOffset);
    const cueType = gameState.currentPlayer === 0 ? BallType.CUE_WHITE : BallType.CUE_YELLOW;
    
    const intensity = shotPower / MAX_POWER;
    const spinMagnitude = Math.sqrt(spinOffset.x ** 2 + spinOffset.y ** 2);
    audioService.playCueStrike(intensity, spinMagnitude);
    
    setBalls(balls.map(b => b.type === cueType ? { 
      ...b, 
      vel: impact.velocity, 
      sideSpin: impact.sideSpin, 
      topSpin: impact.topSpin 
    } : b));
    
    setGameState(prev => ({ ...prev, phase: GamePhase.MOVING }));
  }, [gameState.phase, gameState.currentPlayer, balls, lastDirection, shotPower, spinOffset]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (gameState.phase !== GamePhase.SELECT_POWER && gameState.phase !== GamePhase.AIMING) return;
      
      setShotPower(prev => {
        const delta = e.deltaY > 0 ? -1 : 1;
        const next = prev + delta;
        return Math.min(MAX_POWER, Math.max(2, next));
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [gameState.phase]);

  useEffect(() => {
    if (gameState.phase === GamePhase.PROCESSING) {
      const opponentCue = gameState.currentPlayer === 0 ? 'yellow' : 'white';
      const scored = gameState.mode === GameMode.SAGU 
        ? Array.from(shotCollisions).filter(id => id.startsWith('red')).length >= 2 && !shotCollisions.has(opponentCue)
        : shotCollisions.has(opponentCue) && shotCollisions.has('red1') && cushionCount >= 3;

      if (scored) {
        audioService.playScore();
        setCombo(c => c + 1); setShowCombo(true); setTimeout(() => setShowCombo(false), 2000);
        const nextScores = [...gameState.scores]; nextScores[gameState.currentPlayer] += 10;
        setGameState(prev => ({ ...prev, scores: nextScores as [number, number], phase: GamePhase.AIMING }));
      } else {
        setCombo(0);
        const nextPlayer = gameState.playerCount === 2 ? (gameState.currentPlayer === 0 ? 1 : 0) : 0;
        setGameState(prev => ({ ...prev, currentPlayer: nextPlayer as 0 | 1, phase: GamePhase.AIMING }));
      }
      setShotCollisions(new Set()); setCushionCount(0); setSpinOffset({ x: 0, y: 0 });
      getTutorAdvice(balls, gameState).then(setAdvice);
    }
  }, [gameState.phase, balls, gameState.currentPlayer, gameState.mode, gameState.playerCount, gameState.scores, shotCollisions, cushionCount]);

  if (gameState.phase === GamePhase.SETUP) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6">
        <div className="bg-zinc-900/40 p-20 rounded-[5rem] border border-white/5 text-center space-y-16">
          <h1 className="text-8xl font-black italic uppercase tracking-tighter">Pool <span className="text-emerald-500">Master</span></h1>
          <div className="grid grid-cols-2 gap-8">
            <button onClick={() => setGameState(p => ({ ...p, mode: GameMode.SAGU }))} className={`py-10 rounded-[2rem] font-black text-2xl border-4 ${gameState.mode === GameMode.SAGU ? 'bg-emerald-500 text-black border-white' : 'bg-zinc-800 border-transparent text-zinc-500'}`}>4-Ball</button>
            <button onClick={() => setGameState(p => ({ ...p, mode: GameMode.THREE_CUSHION }))} className={`py-10 rounded-[2rem] font-black text-2xl border-4 ${gameState.mode === GameMode.THREE_CUSHION ? 'bg-emerald-500 text-black border-white' : 'bg-zinc-800 border-transparent text-zinc-500'}`}>3-Cushion</button>
          </div>
          <button onClick={() => startNewGame(gameState.mode, 1)} className="w-full bg-white text-black py-10 rounded-[3rem] font-black text-4xl uppercase hover:bg-emerald-400 transition-all">Start Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col items-center select-none overflow-hidden">
      <header className="w-full bg-black/80 border-b border-white/5 px-12 py-6 flex justify-between items-center z-50">
        <div>
          <h2 className="text-2xl font-black text-emerald-500 italic uppercase">Pool Master</h2>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Level {gameState.level} Professional</span>
        </div>
        <div className="bg-zinc-900/50 px-10 py-4 rounded-full border border-white/5 text-center">
          <span className="text-[9px] font-black text-zinc-600 block mb-1">SCORE</span>
          <span className="text-4xl font-black leading-none">{gameState.scores[gameState.currentPlayer]}</span>
        </div>
        <button onClick={() => setGameState(p => ({ ...p, phase: GamePhase.SETUP }))} className="bg-zinc-800 p-4 rounded-full hover:bg-red-600 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
      </header>

      <main className="flex-1 w-full flex flex-row items-center justify-center relative p-8">
        {gameState.phase === GamePhase.SELECT_SPIN && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center">
             <div className="bg-zinc-900 p-16 rounded-[4rem] border-2 border-white/10 shadow-2xl flex flex-col items-center gap-12">
                <h3 className="text-3xl font-black italic uppercase tracking-widest text-emerald-500">Set Strike Point</h3>
                <SpinPicker offset={spinOffset} onChange={setSpinOffset} />
                <button 
                  onClick={() => setGameState(p => ({ ...p, phase: GamePhase.SELECT_POWER }))}
                  className="bg-emerald-500 text-black px-16 py-6 rounded-full font-black text-xl uppercase shadow-2xl hover:bg-emerald-400 transition-all"
                >
                  Confirm Spin
                </button>
                <button onClick={() => setGameState(p => ({ ...p, phase: GamePhase.AIMING }))} className="text-zinc-500 font-bold uppercase text-xs tracking-widest hover:text-white transition-all">Back to Aiming</button>
             </div>
          </div>
        )}

        {showCombo && combo > 1 && (
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] pointer-events-none animate-bounce">
              <h2 className="text-[12rem] font-black italic text-emerald-500 drop-shadow-[0_0_80px_rgba(16,185,129,1)]">{combo}X</h2>
           </div>
        )}

        {(gameState.phase === GamePhase.SELECT_POWER || gameState.phase === GamePhase.AIMING) && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-40">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Power</span>
              <span className="text-2xl font-black italic">{Math.round((shotPower/MAX_POWER)*100)}%</span>
            </div>
            <div className="h-[400px] w-12 bg-zinc-900/90 rounded-full border-2 border-white/10 relative overflow-hidden flex flex-col-reverse shadow-2xl cursor-pointer"
                 onClick={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   const clickY = e.clientY - rect.top;
                   const power = 1 - (clickY / rect.height);
                   setShotPower(Math.max(2, power * MAX_POWER));
                 }}>
              <div 
                className="w-full bg-gradient-to-t from-emerald-500 via-yellow-400 to-red-500 shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all duration-75" 
                style={{ height: `${(shotPower/MAX_POWER)*100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 flex justify-center items-center">
          <GameCanvas 
            balls={balls} gameState={gameState} spinOffset={spinOffset} shotPower={shotPower} 
            onStateChange={(s) => setGameState(p => ({ ...p, ...s }))} onBallsUpdate={setBalls} 
            onCollisionOccurred={(ids, type, int) => {
              if (type === 'wall') setCushionCount(c => c + 1);
              else ids.forEach(id => setShotCollisions(prev => new Set(prev).add(id)));
            }} 
            onSpinChange={setSpinOffset} onExecuteShot={executeShot}
            onShotConfirmed={(dir) => { setLastDirection(dir); setGameState(p => ({ ...p, phase: GamePhase.SELECT_SPIN })); }} 
          />
        </div>

        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl text-center">
           <div className="bg-zinc-900/90 backdrop-blur-3xl px-10 py-6 rounded-full border border-white/10 shadow-2xl">
              <p className="text-xl font-black italic text-white/90">"{advice}"</p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
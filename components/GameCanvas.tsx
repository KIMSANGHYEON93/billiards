
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Ball, BallType, GamePhase, GameState, Vector2D } from '../types';
import { 
  TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, COLORS, 
  MAX_POWER 
} from '../constants';
import { PhysicsEngine } from '../services/physicsEngine';
import { vecSub, vecNormalize, vecMag, vecDist, vecMul, vecAdd } from '../services/vectorUtils';
import { audioService } from '../services/audioService';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Effect {
  x: number;
  y: number;
  life: number;
  type: 'ring' | 'spark' | 'text';
  color: string;
  text?: string;
}

interface GameCanvasProps {
  balls: Ball[];
  gameState: GameState;
  spinOffset: Vector2D;
  shotPower: number; 
  onStateChange: (newState: Partial<GameState>) => void;
  onBallsUpdate: (newBalls: Ball[]) => void;
  onCollisionOccurred: (collisionIds: Set<string>, type: 'ball' | 'wall', intensity: number) => void;
  onShotConfirmed: (direction: Vector2D) => void;
  onSpinChange: (offset: Vector2D) => void;
  onExecuteShot: () => void; 
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  balls, 
  gameState, 
  spinOffset,
  shotPower,
  onStateChange, 
  onBallsUpdate,
  onCollisionOccurred,
  onShotConfirmed,
  onSpinChange,
  onExecuteShot
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentMouse, setCurrentMouse] = useState<Vector2D | null>(null);
  const [lockDirection, setLockDirection] = useState<Vector2D | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [shake, setShake] = useState(0);
  const requestRef = useRef<number>(undefined);

  const cueType = gameState.currentPlayer === 0 ? BallType.CUE_WHITE : BallType.CUE_YELLOW;
  const cueBall = balls.find(b => b.type === cueType)!;

  const addParticles = (x: number, y: number, color: string, count: number, speed: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      newParticles.push({
        x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        life: 1.0, color, size: Math.random() * 4 + 1
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const update = useCallback((_time: number) => {
    if (gameState.phase === GamePhase.MOVING) {
      const { balls: nextBalls, isMoving, events } = PhysicsEngine.update(balls);
      onBallsUpdate(nextBalls);
      
      events.forEach(event => {
        if (event.type === 'ball') {
          // Check if it's a cue ball involved for sound variation
          const isCue = event.ballIds?.some(id => id === 'white' || id === 'yellow') ?? false;
          audioService.playCollision(event.intensity, isCue);
          
          onCollisionOccurred(new Set(event.ballIds), 'ball', event.intensity);
          setEffects(prev => [...prev, { x: event.pos.x, y: event.pos.y, life: 1, type: 'ring', color: '#fff' }]);
          addParticles(event.pos.x, event.pos.y, event.intensity > 2.0 ? '#f59e0b' : '#fff', 20, event.intensity * 3);
          if (event.intensity > 1.5) setShake(event.intensity * 5);
        } else {
          audioService.playCushion(event.intensity);
          onCollisionOccurred(new Set(), 'wall', event.intensity);
          addParticles(event.pos.x, event.pos.y, '#10b981', 10, event.intensity * 2);
          if (event.intensity > 2.0) setShake(event.intensity * 3);
        }
      });

      if (!isMoving) onStateChange({ phase: GamePhase.PROCESSING });
    }

    setParticles(prev => prev.map(p => ({
      ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.025,
      vx: p.vx * 0.94, vy: p.vy * 0.94
    })).filter(p => p.life > 0));
    setEffects(prev => prev.map(e => ({ ...e, life: e.life - 0.04 })).filter(e => e.life > 0));
    setShake(prev => Math.max(0, prev * 0.88));
    requestRef.current = requestAnimationFrame(update);
  }, [balls, gameState.phase, onBallsUpdate, onCollisionOccurred, onStateChange]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCurrentMouse({ x: e.clientX - rect.left - 40, y: e.clientY - rect.top - 40 });
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  const handleInteraction = (e: React.MouseEvent) => {
    if (!currentMouse) return;
    if (gameState.phase === GamePhase.AIMING) {
      const direction = vecNormalize(vecSub(cueBall.pos, currentMouse));
      setLockDirection(direction);
      onShotConfirmed(direction);
    } else if (gameState.phase === GamePhase.SELECT_POWER) {
      onExecuteShot();
    }
  };

  const drawCueStick = (ctx: CanvasRenderingContext2D, cueBallPos: Vector2D, direction: Vector2D, power: number, isShooting: boolean) => {
    ctx.save();
    const distance = isShooting ? 30 + (power * 2) : 25;
    ctx.translate(cueBallPos.x - direction.x * distance, cueBallPos.y - direction.y * distance);
    ctx.rotate(Math.atan2(direction.y, direction.x));

    const cueLen = 450;
    const grad = ctx.createLinearGradient(0, 0, -cueLen, 0);
    grad.addColorStop(0, '#fde68a'); // Tip wood
    grad.addColorStop(0.1, '#78350f'); // Dark wood
    grad.addColorStop(0.8, '#451a03'); // Grip
    grad.addColorStop(1, '#000');

    ctx.fillStyle = grad;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-cueLen, -7);
    ctx.lineTo(-cueLen, 7);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1d4ed8'; // Blue chalk tip
    ctx.fillRect(0, -3, 3, 6);

    ctx.restore();
  };

  const drawTableBase = (ctx: CanvasRenderingContext2D) => {
    const padding = 35; // Rail thickness
    
    // External frame
    ctx.save();
    const woodGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    woodGrad.addColorStop(0, '#2d1b0d');
    woodGrad.addColorStop(0.5, '#1a0f08');
    woodGrad.addColorStop(1, '#2d1b0d');
    
    ctx.fillStyle = woodGrad;
    ctx.shadowBlur = 30;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.fillRect(-padding, -padding, TABLE_WIDTH + padding * 2, TABLE_HEIGHT + padding * 2);
    ctx.restore();

    // Internal Cloth with inner shadow for depth
    ctx.save();
    const clothGrad = ctx.createRadialGradient(TABLE_WIDTH/2, TABLE_HEIGHT/2, 50, TABLE_WIDTH/2, TABLE_HEIGHT/2, TABLE_WIDTH * 0.8);
    clothGrad.addColorStop(0, '#1a4a2f'); // Brighter center
    clothGrad.addColorStop(1, '#0c2215'); // Darker edges
    
    ctx.fillStyle = clothGrad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Inner bevel shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'black';
    ctx.strokeRect(-5, -5, TABLE_WIDTH + 10, TABLE_HEIGHT + 10);
    ctx.restore();

    // Diamonds (Sight markers)
    ctx.fillStyle = '#fef3c7'; // Ivory/Pearl
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    
    const diamondSize = 3;
    const drawDiamond = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, diamondSize, 0, Math.PI * 2);
      ctx.fill();
    };

    // Horizontal markers
    for (let i = 1; i < 8; i++) {
      const x = (TABLE_WIDTH / 8) * i;
      drawDiamond(x, -padding / 2);
      drawDiamond(x, TABLE_HEIGHT + padding / 2);
    }
    // Vertical markers
    for (let i = 1; i < 4; i++) {
      const y = (TABLE_HEIGHT / 4) * i;
      drawDiamond(-padding / 2, y);
      drawDiamond(TABLE_WIDTH + padding / 2, y);
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const framePadding = 40;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.translate(framePadding, framePadding);

    drawTableBase(ctx);

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fill(); ctx.globalAlpha = 1.0;
    });

    // Prediction & Cue Stick
    const isPreparing = [GamePhase.AIMING, GamePhase.SELECT_SPIN, GamePhase.SELECT_POWER].includes(gameState.phase);
    if (isPreparing && (currentMouse || lockDirection)) {
      const direction = lockDirection || (currentMouse ? vecNormalize(vecSub(cueBall.pos, currentMouse)) : { x: 1, y: 0 });
      
      // Use refined prediction with nuance
      const prediction = PhysicsEngine.predict(cueBall, balls.filter(b => b.id !== cueBall.id), direction, Math.max(10, shotPower), spinOffset);
      
      // Secondary path (faint)
      ctx.beginPath(); ctx.setLineDash([4, 12]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1;
      ctx.moveTo(cueBall.pos.x, cueBall.pos.y); ctx.lineTo(prediction.path[0].x, prediction.path[0].y); ctx.stroke();
      
      // Main path
      ctx.beginPath(); ctx.setLineDash([]); ctx.strokeStyle = COLORS.PREDICTION_CUE; ctx.lineWidth = 2.5;
      ctx.moveTo(prediction.path[0].x, prediction.path[0].y); prediction.path.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); 
      
      if (prediction.targetPath) {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.moveTo(prediction.targetPath[0].x, prediction.targetPath[0].y); prediction.targetPath.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        ctx.setLineDash([]);
      }

      if (prediction.ghostBall) {
        ctx.beginPath(); ctx.arc(prediction.ghostBall.x, prediction.ghostBall.y, cueBall.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      }

      if (gameState.phase !== GamePhase.SELECT_SPIN) {
        drawCueStick(ctx, cueBall.pos, direction, shotPower, gameState.phase === GamePhase.SELECT_POWER);
      }
    }

    // Balls with improved shading
    balls.forEach(ball => {
      const { x, y } = ball.pos;
      const r = ball.radius;
      
      // Ball Trail
      if (ball.trace && ball.trace.length > 2) {
        ctx.beginPath(); ctx.moveTo(ball.trace[0].x, ball.trace[0].y);
        for (let i = 1; i < ball.trace.length; i++) ctx.lineTo(ball.trace[i].x, ball.trace[i].y);
        ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`; ctx.lineWidth = r * 0.7; ctx.lineCap = 'round'; ctx.stroke();
      }

      // Ball Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 2, r, r * 0.6, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();
      ctx.restore();

      // Ball Body
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      let baseColor = ball.type === BallType.CUE_YELLOW ? COLORS.OPPONENT : (ball.type.startsWith('red') ? COLORS.TARGET : '#fff');
      
      const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, '#fff'); 
      grad.addColorStop(0.2, baseColor); 
      grad.addColorStop(0.8, baseColor); 
      grad.addColorStop(1, '#000');
      
      ctx.fillStyle = grad; ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.ellipse(x - r * 0.4, y - r * 0.4, r * 0.3, r * 0.2, Math.PI / 4, 0, Math.PI * 2);
      const highlight = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x - r * 0.4, y - r * 0.4, r * 0.3);
      highlight.addColorStop(0, 'rgba(255,255,255,0.6)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = highlight;
      ctx.fill();
    });

    effects.forEach(e => {
      if (e.type === 'ring') {
        ctx.beginPath(); ctx.arc(e.x, e.y, (1-e.life) * 100, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,255,255,${e.life})`; ctx.lineWidth = 3 * e.life; ctx.stroke();
      }
    });

    ctx.restore();
  }, [balls, currentMouse, lockDirection, gameState.phase, cueBall, spinOffset, shotPower, effects, shake, particles]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="relative flex justify-center items-center bg-[#050505] p-12 rounded-[5rem] shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/5 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
      <canvas 
        ref={canvasRef} width={TABLE_WIDTH + 80} height={TABLE_HEIGHT + 80} 
        onClick={handleInteraction}
        onContextMenu={(e) => {
            e.preventDefault();
            if (gameState.phase === GamePhase.SELECT_POWER) onStateChange({ phase: GamePhase.SELECT_SPIN });
            else if (gameState.phase === GamePhase.SELECT_SPIN) { setLockDirection(null); onStateChange({ phase: GamePhase.AIMING }); }
        }}
        className="relative z-10 cursor-crosshair rounded-[2rem]" 
      />
      
      {gameState.phase === GamePhase.AIMING && (
        <div className="absolute top-14 right-14 z-20 bg-black/80 backdrop-blur-md p-5 rounded-[2rem] border border-white/10 flex flex-col items-center gap-3 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-white relative overflow-hidden border-2 border-zinc-800 shadow-inner">
               <div className="absolute w-4 h-4 bg-blue-600 rounded-full shadow-lg border-2 border-white" style={{ left: `${(spinOffset.x + 1) * 50}%`, top: `${(spinOffset.y + 1) * 50}%`, transform: 'translate(-50%, -50%)' }}></div>
            </div>
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Spin</span>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;

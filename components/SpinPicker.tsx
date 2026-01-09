import React from 'react';
import { Vector2D } from '../types.ts';

interface SpinPickerProps {
  offset: Vector2D;
  onChange: (offset: Vector2D) => void;
}

const SpinPicker: React.FC<SpinPickerProps> = ({ offset, onChange }) => {
  const handleInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    
    const dist = Math.sqrt(x*x + y*y);
    if (dist > 1) { x /= dist; y /= dist; }
    onChange({ x, y });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div 
        className="relative w-64 h-64 rounded-full border-8 border-zinc-800 cursor-crosshair overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] bg-white"
        onMouseDown={handleInteraction}
        onMouseMove={(e) => { if (e.buttons === 1) handleInteraction(e); }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white via-zinc-100 to-zinc-400"></div>
        <div className="absolute top-10 left-10 w-24 h-16 bg-white/40 rounded-full blur-2xl"></div>
        
        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-black/5"></div>
        <div className="absolute left-1/2 top-0 w-[2px] h-full bg-black/5"></div>
        <div className="absolute inset-8 rounded-full border-2 border-black/5"></div>
        <div className="absolute inset-20 rounded-full border-2 border-black/5"></div>

        <div 
          className="absolute w-12 h-12 bg-blue-600 rounded-full border-8 border-white shadow-[0_10px_30px_rgba(37,99,235,0.6)] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
          style={{ left: `${(offset.x + 1) * 50}%`, top: `${(offset.y + 1) * 50}%` }}
        >
          <div className="absolute inset-0 bg-blue-400 rounded-full opacity-30 animate-ping"></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-10">
        <div className="text-center">
          <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block mb-1">Side Spin</span>
          <span className="text-3xl font-black text-white">{Math.round(offset.x * 100)}%</span>
        </div>
        <div className="text-center">
          <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block mb-1">Follow / Draw</span>
          <span className="text-3xl font-black text-white">{Math.round(-offset.y * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export default SpinPicker;
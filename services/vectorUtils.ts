
import { Vector2D } from '../types';

export const vecAdd = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });
export const vecSub = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x - v2.x, y: v1.y - v2.y });
export const vecMul = (v: Vector2D, s: number): Vector2D => ({ x: v.x * s, y: v.y * s });
export const vecDiv = (v: Vector2D, s: number): Vector2D => ({ x: v.x / s, y: v.y / s });
export const vecMag = (v: Vector2D): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const vecNormalize = (v: Vector2D): Vector2D => {
  const m = vecMag(v);
  return m === 0 ? { x: 0, y: 0 } : vecDiv(v, m);
};
export const vecDot = (v1: Vector2D, v2: Vector2D): number => v1.x * v2.x + v1.y * v2.y;
export const vecDist = (v1: Vector2D, v2: Vector2D): number => vecMag(vecSub(v1, v2));


export type Vector2D = { x: number; y: number };

export enum BallType {
  CUE_WHITE = 'white',
  CUE_YELLOW = 'yellow',
  TARGET_RED1 = 'red1',
  TARGET_RED2 = 'red2'
}

export enum GameMode {
  SAGU = 'SAGU',         // 4-Ball
  THREE_CUSHION = '3C'   // 3-Cushion
}

export enum GamePhase {
  SETUP = 'SETUP',
  AIMING = 'AIMING',
  SELECT_SPIN = 'SELECT_SPIN',
  SELECT_POWER = 'SELECT_POWER',
  MOVING = 'MOVING',
  PROCESSING = 'PROCESSING'
}

export interface Ball {
  id: string;
  type: BallType;
  pos: Vector2D;
  vel: Vector2D;
  radius: number;
  mass: number;
  isPocketed: boolean;
  sideSpin: number;
  topSpin: number;
  trace: Vector2D[]; 
}

export interface Achievement {
  id: string;
  label: string;
  color: string;
}

export interface GameState {
  scores: [number, number];
  currentPlayer: 0 | 1;
  playerCount: 1 | 2;
  mode: GameMode;
  phase: GamePhase;
  message: string;
  turnCount: number;
  level: number;
  xp: number;
  nextLevelXp: number;
}

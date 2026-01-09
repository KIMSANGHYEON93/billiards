
import { Ball, Vector2D } from '../types';
import { 
  TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, FRICTION, SPIN_FRICTION,
  WALL_BOUNCE, BALL_BOUNCE, MIN_VELOCITY, SIDE_SPIN_CUSHION_FACTOR,
  TOP_SPIN_FOLLOW_FACTOR
} from '../constants';
import { 
  vecAdd, vecSub, vecMul, vecMag, vecNormalize, vecDot, vecDist 
} from './vectorUtils';

export interface CollisionEvent {
  type: 'ball' | 'wall';
  intensity: number;
  pos: Vector2D;
  ballIds?: string[];
  spinFactor?: number;
}

export class PhysicsEngine {
  /**
   * Calculates the complex interaction between the cue stick and cue ball.
   * Handles "Squirt" (deflection), energy conservation (speed loss to rotation),
   * and power-scaled spin transfer.
   */
  static calculateCueImpact(direction: Vector2D, power: number, spinOffset: Vector2D): {
    velocity: Vector2D,
    sideSpin: number,
    topSpin: number
  } {
    // 1. Squirt (Deflection): Side spin causes the cue ball to deviate slightly 
    // in the opposite direction of the spin impact.
    const squirtFactor = 0.15; // Max deviation in radians
    const angleOffset = -spinOffset.x * squirtFactor; 
    const currentAngle = Math.atan2(direction.y, direction.x);
    const adjustedAngle = currentAngle + angleOffset;
    
    const adjustedDirection = {
      x: Math.cos(adjustedAngle),
      y: Math.sin(adjustedAngle)
    };

    // 2. Velocity Efficiency: Hitting off-center transfers some energy to rotation, 
    // reducing the linear launch velocity.
    const offCenterDist = Math.sqrt(spinOffset.x ** 2 + spinOffset.y ** 2);
    const velocityEfficiency = 1.0 - (offCenterDist * 0.25); 
    const launchPower = power * velocityEfficiency;

    // 3. Spin Transfer: Spin magnitude is proportional to both the offset 
    // and the force of the strike.
    const spinTransferRatio = 0.45;
    const sideSpin = spinOffset.x * power * spinTransferRatio;
    const topSpin = -spinOffset.y * power * spinTransferRatio; // UI Y-offset is positive downwards

    return {
      velocity: vecMul(adjustedDirection, launchPower),
      sideSpin,
      topSpin
    };
  }

  static update(balls: Ball[]): { balls: Ball[], isMoving: boolean, collisions: Set<string>, events: CollisionEvent[] } {
    let isMoving = false;
    const collisions = new Set<string>();
    const events: CollisionEvent[] = [];

    balls.forEach(ball => {
      const speed = vecMag(ball.vel);
      if (speed > MIN_VELOCITY) {
        isMoving = true;
        
        ball.pos = vecAdd(ball.pos, ball.vel);
        ball.vel = vecMul(ball.vel, FRICTION);
        ball.topSpin *= SPIN_FRICTION;
        ball.sideSpin *= SPIN_FRICTION;

        if (!ball.trace) ball.trace = [];
        ball.trace.push({ ...ball.pos });
        if (ball.trace.length > 20) ball.trace.shift();

        let hitWall = false;
        let wallIntensity = 0;
        let collisionPos = { ...ball.pos };

        if (ball.pos.x - ball.radius < 0) {
          ball.pos.x = ball.radius;
          wallIntensity = Math.abs(ball.vel.x);
          ball.vel.x *= -WALL_BOUNCE;
          ball.vel.y += ball.sideSpin * Math.abs(ball.vel.x) * SIDE_SPIN_CUSHION_FACTOR;
          collisionPos.x = 0;
          hitWall = true;
        } else if (ball.pos.x + ball.radius > TABLE_WIDTH) {
          ball.pos.x = TABLE_WIDTH - ball.radius;
          wallIntensity = Math.abs(ball.vel.x);
          ball.vel.x *= -WALL_BOUNCE;
          ball.vel.y -= ball.sideSpin * Math.abs(ball.vel.x) * SIDE_SPIN_CUSHION_FACTOR;
          collisionPos.x = TABLE_WIDTH;
          hitWall = true;
        }

        if (ball.pos.y - ball.radius < 0) {
          ball.pos.y = ball.radius;
          wallIntensity = Math.max(wallIntensity, Math.abs(ball.vel.y));
          ball.vel.y *= -WALL_BOUNCE;
          ball.vel.x -= ball.sideSpin * Math.abs(ball.vel.y) * SIDE_SPIN_CUSHION_FACTOR;
          collisionPos.y = 0;
          hitWall = true;
        } else if (ball.pos.y + ball.radius > TABLE_HEIGHT) {
          ball.pos.y = TABLE_HEIGHT - ball.radius;
          wallIntensity = Math.max(wallIntensity, Math.abs(ball.vel.y));
          ball.vel.y *= -WALL_BOUNCE;
          ball.vel.x += ball.sideSpin * Math.abs(ball.vel.y) * SIDE_SPIN_CUSHION_FACTOR;
          collisionPos.y = TABLE_HEIGHT;
          hitWall = true;
        }

        if (hitWall) {
          events.push({ type: 'wall', intensity: wallIntensity / 8, pos: collisionPos });
        }
      } else {
        ball.vel = { x: 0, y: 0 };
        ball.topSpin = 0;
        ball.sideSpin = 0;
      }
    });

    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const b1 = balls[i];
        const b2 = balls[j];
        const dist = vecDist(b1.pos, b2.pos);

        if (dist < b1.radius + b2.radius) {
          const relativeVel = vecSub(b1.vel, b2.vel);
          const collisionNorm = vecNormalize(vecSub(b2.pos, b1.pos));
          const speed = vecDot(relativeVel, collisionNorm);

          if (speed > 0) {
            collisions.add(`${b1.id}-${b2.id}`);
            const midPos = vecAdd(b1.pos, vecMul(collisionNorm, b1.radius));
            events.push({ 
              type: 'ball', 
              intensity: speed / 8, 
              pos: midPos,
              ballIds: [b1.id, b2.id],
              spinFactor: 1.0 + (Math.abs(b1.sideSpin) + Math.abs(b1.topSpin)) * 0.2
            });
            this.resolveCollision(b1, b2);
          }
        }
      }
    }

    return { balls: [...balls], isMoving, collisions, events };
  }

  private static resolveCollision(b1: Ball, b2: Ball) {
    const collisionNorm = vecNormalize(vecSub(b2.pos, b1.pos));
    const relativeVel = vecSub(b1.vel, b2.vel);
    const speed = vecDot(relativeVel, collisionNorm);

    if (speed < 0) return;

    const impulse = (2 * speed) / (b1.mass + b2.mass) * BALL_BOUNCE;
    const v1_post = vecSub(b1.vel, vecMul(collisionNorm, impulse * b2.mass));
    const v2_post = vecAdd(b2.vel, vecMul(collisionNorm, impulse * b1.mass));

    if (Math.abs(b1.topSpin) > 0.05) {
      const originalDirection = vecNormalize(b1.vel);
      const spinForce = vecMul(originalDirection, b1.topSpin * speed * TOP_SPIN_FOLLOW_FACTOR);
      b1.vel = vecAdd(v1_post, spinForce);
    } else {
      b1.vel = v1_post;
    }
    
    b2.vel = v2_post;

    const overlap = (b1.radius + b2.radius) - vecDist(b1.pos, b2.pos);
    if (overlap > 0) {
      const correction = vecMul(collisionNorm, overlap / 2);
      b1.pos = vecSub(b1.pos, correction);
      b2.pos = vecAdd(b2.pos, correction);
    }
  }

  static predict(cueBall: Ball, otherBalls: Ball[], direction: Vector2D, power: number, spinOffset: Vector2D): {
    path: Vector2D[],
    targetPath?: Vector2D[],
    ghostBall?: Vector2D
  } {
    const impact = this.calculateCueImpact(direction, power, spinOffset);
    const path: Vector2D[] = [cueBall.pos];
    let simPos = { ...cueBall.pos };
    let simVel = impact.velocity;
    let simSide = impact.sideSpin;
    let simTop = impact.topSpin;
    
    for (let i = 0; i < 300; i++) {
      simPos = vecAdd(simPos, simVel);
      simVel = vecMul(simVel, FRICTION);
      simSide *= SPIN_FRICTION;
      simTop *= SPIN_FRICTION;

      let hitWall = false;
      if (simPos.x < BALL_RADIUS || simPos.x > TABLE_WIDTH - BALL_RADIUS) {
        simVel.x *= -WALL_BOUNCE;
        simVel.y += (simPos.x < BALL_RADIUS ? 1 : -1) * simSide * Math.abs(simVel.x) * SIDE_SPIN_CUSHION_FACTOR;
        path.push({ ...simPos });
        hitWall = true;
      }
      if (simPos.y < BALL_RADIUS || simPos.y > TABLE_HEIGHT - BALL_RADIUS) {
        simVel.y *= -WALL_BOUNCE;
        simVel.x += (simPos.y < BALL_RADIUS ? -1 : 1) * simSide * Math.abs(simVel.y) * SIDE_SPIN_CUSHION_FACTOR;
        path.push({ ...simPos });
        hitWall = true;
      }

      for (const other of otherBalls) {
        if (vecDist(simPos, other.pos) < BALL_RADIUS * 2) {
          const ghost = vecSub(simPos, vecMul(vecNormalize(simVel), BALL_RADIUS * 0.2));
          const collisionNorm = vecNormalize(vecSub(other.pos, simPos));
          const relativeVel = simVel;
          const speed = vecDot(relativeVel, collisionNorm);
          
          const targetPath: Vector2D[] = [other.pos];
          if (speed > 0) {
            const targetVel = vecMul(collisionNorm, (2 * speed) / (cueBall.mass + other.mass) * BALL_BOUNCE);
            let tPos = { ...other.pos };
            let tVel = { ...targetVel };
            
            for (let j = 0; j < 100; j++) {
              tPos = vecAdd(tPos, tVel);
              tVel = vecMul(tVel, FRICTION);
              if (tPos.x < BALL_RADIUS || tPos.x > TABLE_WIDTH - BALL_RADIUS || tPos.y < BALL_RADIUS || tPos.y > TABLE_HEIGHT - BALL_RADIUS) {
                tVel.x *= (tPos.x < BALL_RADIUS || tPos.x > TABLE_WIDTH - BALL_RADIUS) ? -WALL_BOUNCE : 1;
                tVel.y *= (tPos.y < BALL_RADIUS || tPos.y > TABLE_HEIGHT - BALL_RADIUS) ? -WALL_BOUNCE : 1;
                targetPath.push({ ...tPos });
              }
              if (j % 5 === 0) targetPath.push({ ...tPos });
              if (vecMag(tVel) < MIN_VELOCITY) break;
            }
          }

          const cueImpulse = (2 * speed) / (cueBall.mass + other.mass) * BALL_BOUNCE;
          let deflectedVel = vecSub(simVel, vecMul(collisionNorm, cueImpulse * other.mass));
          
          if (Math.abs(simTop) > 0.05) {
            const spinForce = vecMul(vecNormalize(simVel), simTop * speed * TOP_SPIN_FOLLOW_FACTOR);
            deflectedVel = vecAdd(deflectedVel, spinForce);
          }

          let deflectedPos = { ...simPos };
          for (let k = 0; k < 120; k++) {
            deflectedPos = vecAdd(deflectedPos, deflectedVel);
            deflectedVel = vecMul(deflectedVel, FRICTION);
            if (deflectedPos.x < BALL_RADIUS || deflectedPos.x > TABLE_WIDTH - BALL_RADIUS ||
                deflectedPos.y < BALL_RADIUS || deflectedPos.y > TABLE_HEIGHT - BALL_RADIUS) {
                deflectedVel.x *= (deflectedPos.x < BALL_RADIUS || deflectedPos.x > TABLE_WIDTH - BALL_RADIUS) ? -WALL_BOUNCE : 1;
                deflectedVel.y *= (deflectedPos.y < BALL_RADIUS || deflectedPos.y > TABLE_HEIGHT - BALL_RADIUS) ? -WALL_BOUNCE : 1;
                path.push({ ...deflectedPos });
            }
            if (k % 8 === 0) path.push({ ...deflectedPos });
            if (vecMag(deflectedVel) < MIN_VELOCITY) break;
          }

          return { 
            path: [...path, deflectedPos], 
            ghostBall: ghost,
            targetPath: targetPath
          };
        }
      }

      if (!hitWall && i % 8 === 0) path.push({ ...simPos });
      if (vecMag(simVel) < MIN_VELOCITY) break;
    }

    return { path };
  }
}

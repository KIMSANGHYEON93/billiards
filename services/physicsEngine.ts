
import { Ball, Vector2D } from '../types.ts';
import { 
  TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, FRICTION, SPIN_FRICTION,
  WALL_BOUNCE, BALL_BOUNCE, MIN_VELOCITY, SIDE_SPIN_CUSHION_FACTOR,
  TOP_SPIN_FOLLOW_FACTOR
} from '../constants.ts';
import { 
  vecAdd, vecSub, vecMul, vecMag, vecNormalize, vecDot, vecDist 
} from './vectorUtils.ts';

export interface CollisionEvent {
  type: 'ball' | 'wall';
  intensity: number;
  pos: Vector2D;
  ballIds?: string[];
  spinFactor?: number;
}

export class PhysicsEngine {
  static calculateCueImpact(direction: Vector2D, power: number, spinOffset: Vector2D): {
    velocity: Vector2D,
    sideSpin: number,
    topSpin: number
  } {
    // 스쿼트 현상 (회전에 의한 궤적 이탈) 반영
    const squirtFactor = 0.12;
    const angleOffset = -spinOffset.x * squirtFactor; 
    const currentAngle = Math.atan2(direction.y, direction.x);
    const adjustedAngle = currentAngle + angleOffset;
    
    const adjustedDirection = {
      x: Math.cos(adjustedAngle),
      y: Math.sin(adjustedAngle)
    };

    // 당점 위치에 따른 에너지 전달 효율
    const offCenterDist = Math.sqrt(spinOffset.x ** 2 + spinOffset.y ** 2);
    const velocityEfficiency = 1.0 - (offCenterDist * 0.15); 
    const launchPower = power * velocityEfficiency;

    // 회전 전달
    const spinTransferRatio = 0.55;
    const sideSpin = spinOffset.x * power * spinTransferRatio;
    const topSpin = -spinOffset.y * power * spinTransferRatio; // y가 마이너스면 상단(Follow)

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
        
        // 공의 진행 방향으로 회전력(Top/Bottom Spin)에 의한 가속/감속 적용
        const moveDir = vecNormalize(ball.vel);
        const spinPush = vecMul(moveDir, ball.topSpin * 0.015);
        ball.vel = vecAdd(ball.vel, spinPush);

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

        // 쿠션 충돌 로직 (회전 반영)
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
              ballIds: [b1.id, b2.id]
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

    // Follow/Draw 효과 적용: 충돌 후 잔류 회전에 의한 진로 변경
    if (Math.abs(b1.topSpin) > 0.05) {
      const tangent = { x: -collisionNorm.y, y: collisionNorm.x };
      const dotTangent = vecDot(v1_post, tangent);
      const tangentVel = vecMul(tangent, dotTangent);
      
      // 상단 당점(Follow)은 앞으로, 하단 당점(Draw)은 뒤로 휘게 함
      const followForce = vecMul(collisionNorm, -b1.topSpin * speed * TOP_SPIN_FOLLOW_FACTOR * 0.5);
      b1.vel = vecAdd(v1_post, followForce);
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
    ghostBall?: Vector2D,
    thickness?: number,
    angle?: number
  } {
    const impact = this.calculateCueImpact(direction, power, spinOffset);
    const path: Vector2D[] = [cueBall.pos];
    let simPos = { ...cueBall.pos };
    let simVel = impact.velocity;
    let simSide = impact.sideSpin;
    let simTop = impact.topSpin;
    
    for (let i = 0; i < 400; i++) {
      simPos = vecAdd(simPos, simVel);
      simVel = vecMul(simVel, FRICTION);
      simSide *= SPIN_FRICTION;
      simTop *= SPIN_FRICTION;

      // 벽 충돌 예측
      if (simPos.x < BALL_RADIUS || simPos.x > TABLE_WIDTH - BALL_RADIUS) {
        simVel.x *= -WALL_BOUNCE;
        simVel.y += (simPos.x < BALL_RADIUS ? 1 : -1) * simSide * Math.abs(simVel.x) * SIDE_SPIN_CUSHION_FACTOR;
        path.push({ ...simPos });
      }
      if (simPos.y < BALL_RADIUS || simPos.y > TABLE_HEIGHT - BALL_RADIUS) {
        simVel.y *= -WALL_BOUNCE;
        simVel.x += (simPos.y < BALL_RADIUS ? -1 : 1) * simSide * Math.abs(simVel.y) * SIDE_SPIN_CUSHION_FACTOR;
        path.push({ ...simPos });
      }

      // 공 충돌 예측
      for (const other of otherBalls) {
        const dist = vecDist(simPos, other.pos);
        if (dist < BALL_RADIUS * 2) {
          const collisionNorm = vecNormalize(vecSub(other.pos, simPos));
          const relativeVel = simVel;
          const speed = vecDot(relativeVel, collisionNorm);
          
          // 두께(Thickness) 계산: 0 (안맞음) ~ 1 (정면)
          // 충돌 법선과 진행 방향의 내적으로 계산
          const thickness = Math.abs(vecDot(vecNormalize(simVel), collisionNorm));
          
          const ghost = vecSub(other.pos, vecMul(collisionNorm, BALL_RADIUS * 2));
          const targetPath: Vector2D[] = [other.pos];

          if (speed > 0) {
            // 제1적구 경로
            const targetVel = vecMul(collisionNorm, (2 * speed) / (cueBall.mass + other.mass) * BALL_BOUNCE);
            let tPos = { ...other.pos };
            let tVel = { ...targetVel };
            for (let j = 0; j < 60; j++) {
              tPos = vecAdd(tPos, tVel);
              tVel = vecMul(tVel, FRICTION);
              if (j % 10 === 0) targetPath.push({ ...tPos });
            }
          }

          // 수구의 굴절 경로 (Follow/Draw 커브 반영)
          let deflectedVel = vecSub(simVel, vecMul(collisionNorm, (2 * speed) / (cueBall.mass + other.mass) * BALL_BOUNCE));
          let deflectedPos = { ...simPos };
          
          for (let k = 0; k < 150; k++) {
            // 커브 효과: 상단 당점이면 충돌 법선의 반대 방향(앞)으로 서서히 가속
            const curveStrength = simTop * 0.08 * (k / 150);
            deflectedVel = vecAdd(deflectedVel, vecMul(collisionNorm, -curveStrength));
            
            deflectedPos = vecAdd(deflectedPos, deflectedVel);
            deflectedVel = vecMul(deflectedVel, FRICTION);
            
            if (k % 10 === 0) path.push({ ...deflectedPos });
            if (vecMag(deflectedVel) < MIN_VELOCITY) break;
          }

          return { 
            path: [...path], 
            ghostBall: ghost,
            targetPath: targetPath,
            thickness,
            angle: Math.acos(thickness) * (180 / Math.PI)
          };
        }
      }

      if (i % 10 === 0) path.push({ ...simPos });
      if (vecMag(simVel) < MIN_VELOCITY) break;
    }

    return { path };
  }
}

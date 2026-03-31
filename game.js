(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    blueScore: document.getElementById("blueScore"),
    orangeScore: document.getElementById("orangeScore"),
    matchClock: document.getElementById("matchClock"),
    statusText: document.getElementById("statusText"),
    centerBanner: document.getElementById("centerBanner"),
    boostFill: document.getElementById("boostFill"),
    playerModeValue: document.getElementById("playerModeValue"),
    matchStateValue: document.getElementById("matchStateValue"),
    autoplayButton: document.getElementById("autoplayButton"),
    resetButton: document.getElementById("resetButton"),
  };

  const TAU = Math.PI * 2;
  const FIELD = {
    width: 3200,
    height: 1800,
    goalWidth: 680,
    goalDepth: 220,
  };
  const GOAL_TOP = (FIELD.height - FIELD.goalWidth) / 2;
  const GOAL_BOTTOM = GOAL_TOP + FIELD.goalWidth;
  const MATCH_DURATION = 180;

  const COLORS = {
    blue: "#25b6ff",
    blueDark: "#0f5fba",
    orange: "#ff9b2f",
    orangeDark: "#d95d16",
    lime: "#b7ff7c",
    fieldLine: "rgba(223, 245, 255, 0.38)",
    boost: "#ffb94a",
  };

  const VIEW = {
    minX: -FIELD.goalDepth - 120,
    maxX: FIELD.width + FIELD.goalDepth + 120,
    minY: -100,
    maxY: FIELD.height + 100,
  };
  const VIEW_SCALE = Math.min(
    canvas.width / (VIEW.maxX - VIEW.minX),
    canvas.height / (VIEW.maxY - VIEW.minY)
  );

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
    dodgeQueued: false,
  };

  const state = {
    blueScore: 0,
    orangeScore: 0,
    timeRemaining: MATCH_DURATION,
    overtime: false,
    phase: "countdown",
    phaseTimer: 3.2,
    matchLabel: "Kickoff countdown",
    statusLabel: "Kickoff",
    autopilot: false,
    bannerText: "3",
    bannerTimer: Infinity,
    bannerSticky: true,
  };

  let lastTimestamp = performance.now();
  let kickoffSeed = 0;

  const particles = [];
  const boostPads = createBoostPads();
  const ball = createBall();

  const cars = [
    createCar({
      id: "player",
      name: "You",
      team: "blue",
      roleBias: "striker",
      isPlayer: true,
      home: { x: 560, y: FIELD.height / 2 + 200 },
      spawnAngle: 0,
    }),
    createCar({
      id: "wingman",
      name: "Blue Bot",
      team: "blue",
      roleBias: "support",
      home: { x: 460, y: FIELD.height / 2 - 240 },
      spawnAngle: 0,
    }),
    createCar({
      id: "orange1",
      name: "Orange Bot",
      team: "orange",
      roleBias: "striker",
      home: { x: FIELD.width - 560, y: FIELD.height / 2 - 200 },
      spawnAngle: Math.PI,
    }),
    createCar({
      id: "orange2",
      name: "Orange Bot 2",
      team: "orange",
      roleBias: "keeper",
      home: { x: FIELD.width - 460, y: FIELD.height / 2 + 240 },
      spawnAngle: Math.PI,
    }),
  ];

  const playerCar = cars[0];

  setupEvents();
  resetMatch();
  requestAnimationFrame(loop);

  function createCar(config) {
    return {
      ...config,
      x: config.home.x,
      y: config.home.y,
      vx: 0,
      vy: 0,
      angle: config.spawnAngle,
      radius: 42,
      bodyLength: 84,
      bodyWidth: 54,
      boost: 78,
      maxBoost: 100,
      dodgeCooldown: 0,
      dodgeBurst: 0,
      touchCooldown: 0,
      lastTouchSide: 0,
      aiMode: "support",
    };
  }

  function createBall() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      radius: 52,
    };
  }

  function createBoostPads() {
    const bigPads = [
      { x: 350, y: 350, amount: 100, radius: 56, cooldownMax: 8 },
      { x: 350, y: FIELD.height - 350, amount: 100, radius: 56, cooldownMax: 8 },
      { x: FIELD.width - 350, y: 350, amount: 100, radius: 56, cooldownMax: 8 },
      { x: FIELD.width - 350, y: FIELD.height - 350, amount: 100, radius: 56, cooldownMax: 8 },
    ];

    const smallPadPositions = [
      [680, 340],
      [1020, 640],
      [1020, FIELD.height - 640],
      [680, FIELD.height - 340],
      [FIELD.width / 2, 260],
      [FIELD.width / 2, FIELD.height - 260],
      [FIELD.width - 680, 340],
      [FIELD.width - 1020, 640],
      [FIELD.width - 1020, FIELD.height - 640],
      [FIELD.width - 680, FIELD.height - 340],
    ];

    return [...bigPads, ...smallPadPositions.map(([x, y]) => ({
      x,
      y,
      amount: 28,
      radius: 34,
      cooldownMax: 4.5,
    }))].map((pad) => ({
      ...pad,
      cooldown: 0,
    }));
  }

  function setupEvents() {
    window.addEventListener("keydown", (event) => {
      const handled = handleKey(event.code, true, event.repeat);
      if (handled) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      const handled = handleKey(event.code, false, false);
      if (handled) {
        event.preventDefault();
      }
    });

    ui.autoplayButton.addEventListener("click", () => {
      setAutoplay(!state.autopilot);
    });

    ui.resetButton.addEventListener("click", () => {
      resetMatch();
    });
  }

  function handleKey(code, isDown, isRepeat) {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        input.up = isDown;
        return true;
      case "KeyS":
      case "ArrowDown":
        input.down = isDown;
        return true;
      case "KeyA":
      case "ArrowLeft":
        input.left = isDown;
        return true;
      case "KeyD":
      case "ArrowRight":
        input.right = isDown;
        return true;
      case "ShiftLeft":
      case "ShiftRight":
        input.boost = isDown;
        return true;
      case "Space":
        if (isDown && !isRepeat) {
          input.dodgeQueued = true;
        }
        return true;
      case "KeyT":
        if (isDown && !isRepeat) {
          setAutoplay(!state.autopilot);
        }
        return true;
      case "KeyR":
        if (isDown && !isRepeat) {
          resetMatch();
        }
        return true;
      default:
        return false;
    }
  }

  function resetMatch() {
    state.blueScore = 0;
    state.orangeScore = 0;
    state.timeRemaining = MATCH_DURATION;
    state.overtime = false;
    kickoffSeed = 0;
    prepareKickoff("Kickoff countdown", true);
    updateUi();
  }

  function prepareKickoff(label, initial = false) {
    kickoffSeed += 1;
    state.phase = "countdown";
    state.phaseTimer = initial ? 3.2 : 2.6;
    state.statusLabel = initial ? "Kickoff" : label;
    state.matchLabel = "Kickoff countdown";
    showBanner(Math.ceil(state.phaseTimer).toString(), Infinity, true);
    resetPositions();
  }

  function resetPositions() {
    const tilt = kickoffSeed % 2 === 0 ? 1 : -1;
    const placements = {
      player: { x: 560, y: FIELD.height / 2 + 220 * tilt, angle: 0 },
      wingman: { x: 460, y: FIELD.height / 2 - 250 * tilt, angle: 0 },
      orange1: { x: FIELD.width - 560, y: FIELD.height / 2 - 220 * tilt, angle: Math.PI },
      orange2: { x: FIELD.width - 460, y: FIELD.height / 2 + 250 * tilt, angle: Math.PI },
    };

    for (const car of cars) {
      const placement = placements[car.id];
      car.x = placement.x;
      car.y = placement.y;
      car.vx = 0;
      car.vy = 0;
      car.angle = placement.angle;
      car.boost = car.isPlayer ? 78 : 82;
      car.dodgeCooldown = 0;
      car.dodgeBurst = 0;
      car.touchCooldown = 0;
      car.lastTouchSide = 0;
      car.aiMode = car.roleBias;
    }

    ball.x = FIELD.width / 2;
    ball.y = FIELD.height / 2;
    ball.vx = 0;
    ball.vy = 0;

    for (const pad of boostPads) {
      pad.cooldown = 0;
    }
  }

  function setAutoplay(enabled) {
    state.autopilot = enabled;
    state.statusLabel = enabled ? "Auto Play enabled" : "Manual control";
    updateUi();
  }

  function showBanner(text, duration = 0.8, sticky = false) {
    state.bannerText = text;
    state.bannerTimer = duration;
    state.bannerSticky = sticky;
    ui.centerBanner.textContent = text;
    ui.centerBanner.classList.add("visible");
  }

  function hideBanner() {
    state.bannerText = "";
    state.bannerTimer = 0;
    state.bannerSticky = false;
    ui.centerBanner.classList.remove("visible");
  }

  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 1 / 30);
    lastTimestamp = timestamp;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    updatePhase(dt);
    updateBoostPads(dt);
    updateBanner(dt);

    if (state.phase === "playing" || state.phase === "overtime") {
      updateCars(dt);
      updateBall(dt);
      resolveCarVsCar();
      handleBallContacts();
      collectBoostPads();
      checkForGoal();
    }

    updateParticles(dt);
    updateUi();
    input.dodgeQueued = false;
  }

  function updatePhase(dt) {
    if (state.phase === "countdown") {
      state.phaseTimer -= dt;
      const countdownValue = Math.max(1, Math.ceil(state.phaseTimer));
      if (state.bannerText !== String(countdownValue)) {
        showBanner(String(countdownValue), Infinity, true);
      }

      if (state.phaseTimer <= 0) {
        if (state.overtime) {
          state.phase = "overtime";
          state.matchLabel = "Sudden death";
          state.statusLabel = "Overtime live";
          showBanner("OT", 0.95, false);
        } else {
          state.phase = "playing";
          state.matchLabel = "Ball is live";
          state.statusLabel = "Match live";
          showBanner("GO!", 0.75, false);
        }
      }
      return;
    }

    if (state.phase === "playing") {
      state.timeRemaining = Math.max(0, state.timeRemaining - dt);
      if (state.timeRemaining <= 0) {
        if (state.blueScore === state.orangeScore) {
          state.overtime = true;
          state.phase = "countdown";
          state.phaseTimer = 2.2;
          state.matchLabel = "Overtime incoming";
          state.statusLabel = "Match tied";
          showBanner("OVERTIME", 1.15, false);
          resetPositions();
        } else {
          finishMatch();
        }
      }
      return;
    }

    if (state.phase === "goal") {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        if (state.overtime) {
          finishMatch();
        } else if (state.timeRemaining <= 0 && state.blueScore !== state.orangeScore) {
          finishMatch();
        } else {
          prepareKickoff("Resetting for kickoff");
        }
      }
    }
  }

  function finishMatch() {
    state.phase = "finished";
    state.matchLabel = "Final whistle";
    if (state.blueScore === state.orangeScore) {
      state.statusLabel = "Draw";
      showBanner("DRAW", Infinity, true);
      return;
    }

    const winner = state.blueScore > state.orangeScore ? "BLUE" : "ORANGE";
    state.statusLabel = `${winner} win`;
    showBanner(`${winner} WIN`, Infinity, true);
  }

  function updateBanner(dt) {
    if (state.bannerSticky || !state.bannerText) {
      return;
    }

    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) {
      hideBanner();
    }
  }

  function updateCars(dt) {
    const teamAssignments = buildTeamAssignments();

    for (const car of cars) {
      car.dodgeCooldown = Math.max(0, car.dodgeCooldown - dt);
      car.touchCooldown = Math.max(0, car.touchCooldown - dt);
      car.dodgeBurst = Math.max(0, car.dodgeBurst - dt);

      const control = car.isPlayer && !state.autopilot
        ? getManualControls()
        : getBotControls(car, teamAssignments);

      applyCarControl(car, control, dt);
      keepBodyInsideArena(car, false);
      emitCarParticles(car, control);
    }
  }

  function buildTeamAssignments() {
    const assignments = {
      blue: {},
      orange: {},
    };

    for (const team of ["blue", "orange"]) {
      const teamCars = cars.filter((car) => car.team === team);
      const rankedByChallenge = [...teamCars].sort((a, b) => estimateIntercept(a) - estimateIntercept(b));
      const rankedByGoal = [...teamCars].sort((a, b) => distanceToOwnGoal(a) - distanceToOwnGoal(b));

      assignments[team].primary = rankedByChallenge[0];
      assignments[team].keeper = rankedByGoal[0];
    }

    return assignments;
  }

  function estimateIntercept(car) {
    const futureX = ball.x + ball.vx * 0.22;
    const futureY = ball.y + ball.vy * 0.22;
    const dist = Math.hypot(futureX - car.x, futureY - car.y);
    const speed = Math.hypot(car.vx, car.vy);
    const facing = Math.abs(angleDiff(car.angle, Math.atan2(futureY - car.y, futureX - car.x)));
    return dist / Math.max(speed, 300) + facing * 0.25;
  }

  function distanceToOwnGoal(car) {
    const ownGoal = getOwnGoal(car.team);
    return Math.hypot(car.x - ownGoal.x, car.y - ownGoal.y);
  }

  function getManualControls() {
    return {
      throttle: (input.up ? 1 : 0) + (input.down ? -1 : 0),
      steer: (input.right ? 1 : 0) + (input.left ? -1 : 0),
      boost: input.boost,
      dodge: input.dodgeQueued,
    };
  }

  function getBotControls(car, teamAssignments) {
    const ownGoal = getOwnGoal(car.team);
    const enemyGoal = getEnemyGoal(car.team);
    const sign = car.team === "blue" ? 1 : -1;
    const futureBall = {
      x: clamp(ball.x + ball.vx * 0.28, 60, FIELD.width - 60),
      y: clamp(ball.y + ball.vy * 0.28, 80, FIELD.height - 80),
    };
    const ballToGoal = normalize(enemyGoal.x - futureBall.x, enemyGoal.y - futureBall.y);
    const attackTarget = {
      x: futureBall.x - ballToGoal.x * 165,
      y: futureBall.y - ballToGoal.y * 165,
    };

    const ballOnOwnHalf = car.team === "blue" ? ball.x < FIELD.width * 0.56 : ball.x > FIELD.width * 0.44;
    const ballRushingOwnGoal = car.team === "blue" ? ball.vx < -110 : ball.vx > 110;
    const ownGoalPressure = Math.abs(ball.x - ownGoal.x) < 760 && Math.abs(ball.y - ownGoal.y) < 540;
    const teamInfo = teamAssignments[car.team];

    let mode = "support";
    let target = {
      x: clamp(lerp(ball.x, ownGoal.x, 0.34) + sign * 180, 160, FIELD.width - 160),
      y: clamp(ball.y + (car.roleBias === "support" ? 220 : -220), 140, FIELD.height - 140),
    };

    if (teamInfo.primary === car) {
      mode = "attack";
      target = attackTarget;
    }

    if ((teamInfo.keeper === car && (ballOnOwnHalf || ownGoalPressure)) || car.roleBias === "keeper") {
      mode = ownGoalPressure || ballRushingOwnGoal ? "defend" : mode;
      target = ownGoalPressure
        ? {
            x: clamp(ball.x - sign * 100, 80, FIELD.width - 80),
            y: clamp(ball.y, GOAL_TOP + 70, GOAL_BOTTOM - 70),
          }
        : {
            x: ownGoal.x + sign * 230,
            y: clamp(ball.y + ball.vy * 0.2, GOAL_TOP + 90, GOAL_BOTTOM - 90),
          };
    }

    if (mode === "support" && ballOnOwnHalf && ballRushingOwnGoal) {
      mode = "recover";
      target = {
        x: ownGoal.x + sign * 360,
        y: clamp(ball.y, 150, FIELD.height - 150),
      };
    }

    const toTargetX = target.x - car.x;
    const toTargetY = target.y - car.y;
    const targetAngle = Math.atan2(toTargetY, toTargetX);
    const angleToTarget = angleDiff(car.angle, targetAngle);
    const distanceToTarget = Math.hypot(toTargetX, toTargetY);
    const speed = Math.hypot(car.vx, car.vy);
    const aligned = Math.abs(angleToTarget) < 0.22;
    const nearBall = Math.hypot(ball.x - car.x, ball.y - car.y) < 185;

    let throttle = 1;
    let steer = clamp(angleToTarget * 1.9, -1, 1);
    let boost = false;
    let dodge = false;

    if (Math.abs(angleToTarget) > 2.45 && speed < 180) {
      throttle = -0.55;
      steer = clamp(-angleToTarget * 1.4, -1, 1);
    } else if (Math.abs(angleToTarget) > 1.65) {
      throttle = 0.36;
    } else if (Math.abs(angleToTarget) > 0.95) {
      throttle = 0.7;
    }

    if (distanceToTarget > 250 && aligned && speed < 980 && car.boost > 16) {
      boost = true;
    }

    if (mode === "attack" && nearBall) {
      const shotAngle = Math.atan2(enemyGoal.y - car.y, enemyGoal.x - car.x);
      const shotDiff = Math.abs(angleDiff(car.angle, shotAngle));
      boost = boost || (shotDiff < 0.28 && car.boost > 6);
      dodge = shotDiff < 0.34 && speed > 420 && car.dodgeCooldown <= 0;
    }

    if ((mode === "defend" || mode === "recover") && ownGoalPressure) {
      boost = boost || (aligned && speed < 880 && car.boost > 8);
      dodge = aligned && nearBall && car.dodgeCooldown <= 0;
    }

    car.aiMode = mode;
    return { throttle, steer, boost, dodge };
  }

  function applyCarControl(car, control, dt) {
    const throttle = clamp(control.throttle, -1, 1);
    const steer = clamp(control.steer, -1, 1);
    const forward = {
      x: Math.cos(car.angle),
      y: Math.sin(car.angle),
    };
    const speed = Math.hypot(car.vx, car.vy);
    const forwardSpeed = dot(car.vx, car.vy, forward.x, forward.y);
    const steerDirection = forwardSpeed >= -50 ? 1 : -1;
    const steerPower = lerp(3.8, 2.2, clamp(speed / 900, 0, 1)) * steerDirection;

    car.angle += steer * steerPower * dt;

    const accel = throttle >= 0 ? 980 * throttle : 680 * throttle;
    car.vx += forward.x * accel * dt;
    car.vy += forward.y * accel * dt;

    if (control.boost && throttle > 0 && car.boost > 0) {
      car.vx += forward.x * 1360 * dt;
      car.vy += forward.y * 1360 * dt;
      car.boost = Math.max(0, car.boost - 31 * dt);
    } else {
      car.boost = Math.min(car.maxBoost, car.boost + 6.5 * dt);
    }

    if (control.dodge && car.dodgeCooldown <= 0) {
      const dodgeVector = resolveDodgeVector(car, throttle, steer);
      car.vx += dodgeVector.x * 380;
      car.vy += dodgeVector.y * 380;
      car.dodgeCooldown = 1.05;
      car.dodgeBurst = 0.18;
      emitBurst(car.x, car.y, car.team === "blue" ? COLORS.blue : COLORS.orange, 18, 0.9);
    }

    const drag = Math.pow(0.985, dt * 60);
    car.vx *= drag;
    car.vy *= drag;
    clampVelocity(car, control.boost ? 1120 : 920);

    car.x += car.vx * dt;
    car.y += car.vy * dt;
  }

  function resolveDodgeVector(car, throttle, steer) {
    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const right = { x: -forward.y, y: forward.x };
    const rawX = forward.x * (throttle === 0 ? 1 : throttle) + right.x * steer * 0.75;
    const rawY = forward.y * (throttle === 0 ? 1 : throttle) + right.y * steer * 0.75;
    const unit = normalize(rawX, rawY);
    return unit.x === 0 && unit.y === 0 ? forward : unit;
  }

  function keepBodyInsideArena(body, isBall) {
    const radius = body.radius;
    const bounce = isBall ? 0.88 : 0.34;

    if (body.y < radius) {
      body.y = radius;
      body.vy = Math.abs(body.vy) * bounce;
    }
    if (body.y > FIELD.height - radius) {
      body.y = FIELD.height - radius;
      body.vy = -Math.abs(body.vy) * bounce;
    }

    const inGoalMouth = isWithinGoalMouth(body.y, radius * 0.35);
    if (!inGoalMouth) {
      if (body.x < radius) {
        body.x = radius;
        body.vx = Math.abs(body.vx) * bounce;
      }
      if (body.x > FIELD.width - radius) {
        body.x = FIELD.width - radius;
        body.vx = -Math.abs(body.vx) * bounce;
      }
      return;
    }

    if (body.x < radius || body.x > FIELD.width - radius) {
      if (body.y < GOAL_TOP + radius) {
        body.y = GOAL_TOP + radius;
        body.vy = Math.abs(body.vy) * bounce;
      }
      if (body.y > GOAL_BOTTOM - radius) {
        body.y = GOAL_BOTTOM - radius;
        body.vy = -Math.abs(body.vy) * bounce;
      }
    }

    const leftBackWall = -FIELD.goalDepth + radius;
    const rightBackWall = FIELD.width + FIELD.goalDepth - radius;

    if (body.x < leftBackWall) {
      body.x = leftBackWall;
      body.vx = Math.abs(body.vx) * bounce;
    }
    if (body.x > rightBackWall) {
      body.x = rightBackWall;
      body.vx = -Math.abs(body.vx) * bounce;
    }
  }

  function updateBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    keepBodyInsideArena(ball, true);

    const drag = Math.pow(0.993, dt * 60);
    ball.vx *= drag;
    ball.vy *= drag;
    clampVelocity(ball, 1440);
  }

  function handleBallContacts() {
    for (const car of cars) {
      const dx = ball.x - car.x;
      const dy = ball.y - car.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ball.radius + car.radius;

      if (dist >= minDist || dist === 0) {
        continue;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      ball.x += nx * overlap * 0.88;
      ball.y += ny * overlap * 0.88;
      car.x -= nx * overlap * 0.12;
      car.y -= ny * overlap * 0.12;

      const relativeSpeed = dot(ball.vx - car.vx, ball.vy - car.vy, nx, ny);
      const carSpeed = Math.hypot(car.vx, car.vy);
      const burst = car.dodgeBurst > 0 ? 320 : 0;
      const shove = Math.max(180, carSpeed * 0.75 + burst);
      const impulse = Math.max(shove - relativeSpeed * 1.1, 0);

      ball.vx += nx * impulse;
      ball.vy += ny * impulse;
      car.vx -= nx * impulse * 0.12;
      car.vy -= ny * impulse * 0.12;
      car.touchCooldown = 0.14;
      car.lastTouchSide = car.team === "blue" ? 1 : -1;
      emitBurst(ball.x, ball.y, car.team === "blue" ? COLORS.blue : COLORS.orange, 10, 0.5);
    }
  }

  function resolveCarVsCar() {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius - 8;

        if (dist >= minDist || dist === 0) {
          continue;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rel = dot(b.vx - a.vx, b.vy - a.vy, nx, ny);
        const impulse = rel < 0 ? -rel * 0.56 : 0;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
      }
    }
  }

  function updateBoostPads(dt) {
    for (const pad of boostPads) {
      if (pad.cooldown > 0) {
        pad.cooldown = Math.max(0, pad.cooldown - dt);
      }
    }
  }

  function collectBoostPads() {
    for (const pad of boostPads) {
      if (pad.cooldown > 0) {
        continue;
      }

      for (const car of cars) {
        const dist = Math.hypot(car.x - pad.x, car.y - pad.y);
        if (dist < car.radius + pad.radius + 6 && car.boost < car.maxBoost - 1) {
          car.boost = Math.min(car.maxBoost, car.boost + pad.amount);
          pad.cooldown = pad.cooldownMax;
          emitBurst(pad.x, pad.y, COLORS.boost, pad.amount === 100 ? 20 : 10, 0.75);
          break;
        }
      }
    }
  }

  function checkForGoal() {
    if (!isWithinGoalMouth(ball.y, ball.radius * 0.25)) {
      return;
    }

    if (ball.x < 0) {
      scoreGoal("orange");
    } else if (ball.x > FIELD.width) {
      scoreGoal("blue");
    }
  }

  function scoreGoal(team) {
    if (state.phase !== "playing" && state.phase !== "overtime") {
      return;
    }

    if (team === "blue") {
      state.blueScore += 1;
      state.statusLabel = "Blue scores";
      emitBurst(FIELD.width + 40, FIELD.height / 2, COLORS.blue, 36, 1.4);
      showBanner("BLUE SCORES", 1.2, false);
    } else {
      state.orangeScore += 1;
      state.statusLabel = "Orange scores";
      emitBurst(-40, FIELD.height / 2, COLORS.orange, 36, 1.4);
      showBanner("ORANGE SCORES", 1.2, false);
    }

    state.phase = "goal";
    state.phaseTimer = 1.45;
    state.matchLabel = "Goal reset";
    ball.vx = 0;
    ball.vy = 0;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.985, dt * 60);
      particle.vy *= Math.pow(0.985, dt * 60);
    }
  }

  function emitCarParticles(car, control) {
    if (!control.boost) {
      return;
    }

    const backward = {
      x: -Math.cos(car.angle),
      y: -Math.sin(car.angle),
    };
    const lateral = {
      x: -backward.y,
      y: backward.x,
    };
    const color = car.team === "blue" ? COLORS.blue : COLORS.orange;

    for (let i = 0; i < 2; i += 1) {
      const spread = i === 0 ? -14 : 14;
      particles.push({
        x: car.x + backward.x * 30 + lateral.x * spread,
        y: car.y + backward.y * 30 + lateral.y * spread,
        vx: backward.x * 240 + randomRange(-28, 28),
        vy: backward.y * 240 + randomRange(-28, 28),
        size: randomRange(8, 14),
        color,
        alpha: 0.7,
        life: 0.22,
      });
    }
  }

  function emitBurst(x, y, color, count, lifeScale) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(90, 420);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomRange(6, 18),
        color,
        alpha: randomRange(0.45, 0.92),
        life: randomRange(0.18, 0.55) * lifeScale,
      });
    }
  }

  function updateUi() {
    ui.blueScore.textContent = String(state.blueScore);
    ui.orangeScore.textContent = String(state.orangeScore);
    ui.matchClock.textContent = state.overtime && state.phase !== "finished"
      ? "OT"
      : formatClock(state.timeRemaining);
    ui.statusText.textContent = state.statusLabel;
    ui.boostFill.style.width = `${playerCar.boost}%`;
    ui.playerModeValue.textContent = state.autopilot ? "Auto Play" : "Manual";
    ui.matchStateValue.textContent = state.matchLabel;
    ui.autoplayButton.textContent = `Auto Play: ${state.autopilot ? "On" : "Off"}`;
    ui.autoplayButton.setAttribute("aria-pressed", state.autopilot ? "true" : "false");

    if (state.phase === "finished" && state.bannerText) {
      ui.matchStateValue.textContent = "Match finished - press R to restart";
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawArenaBase();
    drawBoostPads();
    drawFieldLines();
    drawGoals();
    drawParticles();
    drawCars();
    drawBall();
    drawOverlayText();
  }

  function drawArenaBase() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#17384f");
    gradient.addColorStop(1, "#0b1722");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pitchX = worldToScreenX(0);
    const pitchY = worldToScreenY(0);
    const pitchW = FIELD.width * VIEW_SCALE;
    const pitchH = FIELD.height * VIEW_SCALE;

    const fieldGradient = ctx.createLinearGradient(0, pitchY, 0, pitchY + pitchH);
    fieldGradient.addColorStop(0, "#1b654a");
    fieldGradient.addColorStop(1, "#124032");
    ctx.fillStyle = fieldGradient;
    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 28);
    ctx.fill();

    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
      ctx.fillRect(pitchX + (pitchW / 10) * i, pitchY, pitchW / 10, pitchH);
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(0, 0, canvas.width, 90);
  }

  function drawBoostPads() {
    for (const pad of boostPads) {
      const active = pad.cooldown === 0;
      const x = worldToScreenX(pad.x);
      const y = worldToScreenY(pad.y);
      const radius = pad.radius * VIEW_SCALE;

      ctx.save();
      ctx.globalAlpha = active ? 0.95 : 0.2;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.1);
      glow.addColorStop(0, active ? "rgba(255, 199, 94, 0.8)" : "rgba(255,255,255,0.08)");
      glow.addColorStop(1, "rgba(255, 199, 94, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.1, 0, TAU);
      ctx.fill();

      ctx.fillStyle = active ? "rgba(255, 193, 77, 0.9)" : "rgba(120, 141, 151, 0.2)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = active ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.64, 0, TAU);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawFieldLines() {
    const pitchX = worldToScreenX(0);
    const pitchY = worldToScreenY(0);
    const pitchW = FIELD.width * VIEW_SCALE;
    const pitchH = FIELD.height * VIEW_SCALE;
    const centerX = worldToScreenX(FIELD.width / 2);
    const centerY = worldToScreenY(FIELD.height / 2);

    ctx.save();
    ctx.strokeStyle = COLORS.fieldLine;
    ctx.lineWidth = 4;
    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 28);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, pitchY);
    ctx.lineTo(centerX, pitchY + pitchH);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 220 * VIEW_SCALE, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, TAU);
    ctx.fill();

    drawGoalBox(0, COLORS.blue);
    drawGoalBox(FIELD.width, COLORS.orange);
    ctx.restore();
  }

  function drawGoalBox(goalX, color) {
    const x = worldToScreenX(goalX === 0 ? -FIELD.goalDepth : FIELD.width);
    const y = worldToScreenY(GOAL_TOP);
    const width = FIELD.goalDepth * VIEW_SCALE;
    const height = FIELD.goalWidth * VIEW_SCALE;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    for (let i = 0; i <= 6; i += 1) {
      const lineX = x + (width / 6) * i;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(lineX, y);
      ctx.lineTo(lineX, y + height);
      ctx.stroke();
    }

    for (let i = 0; i <= 6; i += 1) {
      const lineY = y + (height / 6) * i;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + width, lineY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGoals() {
    const leftMouthX = worldToScreenX(-FIELD.goalDepth);
    const rightMouthX = worldToScreenX(FIELD.width);
    const mouthY = worldToScreenY(GOAL_TOP);
    const mouthH = FIELD.goalWidth * VIEW_SCALE;
    const goalW = FIELD.goalDepth * VIEW_SCALE;

    const leftGradient = ctx.createLinearGradient(leftMouthX, 0, leftMouthX + goalW, 0);
    leftGradient.addColorStop(0, "rgba(37, 182, 255, 0.28)");
    leftGradient.addColorStop(1, "rgba(37, 182, 255, 0.04)");
    ctx.fillStyle = leftGradient;
    ctx.fillRect(leftMouthX, mouthY, goalW, mouthH);

    const rightGradient = ctx.createLinearGradient(rightMouthX, 0, rightMouthX + goalW, 0);
    rightGradient.addColorStop(0, "rgba(255, 155, 47, 0.04)");
    rightGradient.addColorStop(1, "rgba(255, 155, 47, 0.28)");
    ctx.fillStyle = rightGradient;
    ctx.fillRect(rightMouthX, mouthY, goalW, mouthH);
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.save();
      ctx.globalAlpha = particle.alpha * clamp(particle.life * 3, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(worldToScreenX(particle.x), worldToScreenY(particle.y), particle.size * VIEW_SCALE * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCars() {
    const orderedCars = [...cars].sort((a, b) => a.y - b.y);
    for (const car of orderedCars) {
      drawCarShadow(car);
      drawCarBody(car);
      drawCarLabel(car);
    }
  }

  function drawCarShadow(car) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(
      worldToScreenX(car.x),
      worldToScreenY(car.y) + 8,
      car.bodyLength * VIEW_SCALE * 0.42,
      car.bodyWidth * VIEW_SCALE * 0.36,
      0,
      0,
      TAU
    );
    ctx.fill();
    ctx.restore();
  }

  function drawCarBody(car) {
    const x = worldToScreenX(car.x);
    const y = worldToScreenY(car.y);
    const length = car.bodyLength * VIEW_SCALE;
    const width = car.bodyWidth * VIEW_SCALE;
    const bodyColor = car.team === "blue" ? COLORS.blue : COLORS.orange;
    const accent = car.team === "blue" ? COLORS.blueDark : COLORS.orangeDark;
    const trim = car.isPlayer ? COLORS.lime : "rgba(255, 255, 255, 0.72)";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);

    ctx.fillStyle = accent;
    roundRect(ctx, -length / 2, -width / 2, length, width, 14);
    ctx.fill();

    ctx.fillStyle = bodyColor;
    roundRect(ctx, -length / 2 + 6, -width / 2 + 4, length - 12, width - 8, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(6, 22, 34, 0.82)";
    roundRect(ctx, -length * 0.1, -width * 0.32, length * 0.38, width * 0.64, 10);
    ctx.fill();

    ctx.fillStyle = trim;
    ctx.fillRect(length * 0.12, -width * 0.15, length * 0.16, width * 0.3);

    ctx.fillStyle = "rgba(5, 8, 12, 0.82)";
    ctx.fillRect(-length * 0.38, -width * 0.54, length * 0.16, width * 0.18);
    ctx.fillRect(-length * 0.38, width * 0.36, length * 0.16, width * 0.18);
    ctx.fillRect(length * 0.16, -width * 0.54, length * 0.16, width * 0.18);
    ctx.fillRect(length * 0.16, width * 0.36, length * 0.16, width * 0.18);

    if (car.touchCooldown > 0 || (car.isPlayer && state.autopilot)) {
      ctx.strokeStyle = car.isPlayer && state.autopilot ? COLORS.lime : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      roundRect(ctx, -length / 2 - 4, -width / 2 - 4, length + 8, width + 8, 16);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCarLabel(car) {
    const x = worldToScreenX(car.x);
    const y = worldToScreenY(car.y) - 34;
    const label = car.isPlayer ? (state.autopilot ? "YOU / AUTO" : "YOU") : car.name.toUpperCase();

    ctx.save();
    ctx.font = "700 14px Bahnschrift, 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(x - 44, y - 13, 88, 18);
    ctx.fillStyle = "#f6fbff";
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawBall() {
    const x = worldToScreenX(ball.x);
    const y = worldToScreenY(ball.y);
    const radius = ball.radius * VIEW_SCALE;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + 10, radius * 0.92, radius * 0.58, 0, 0, TAU);
    ctx.fill();

    const ballGradient = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, 0, x, y, radius);
    ballGradient.addColorStop(0, "#ffffff");
    ballGradient.addColorStop(1, "#b8c9d6");
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(40, 60, 80, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.55, 0, TAU);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - radius * 0.45, y);
    ctx.lineTo(x + radius * 0.45, y);
    ctx.moveTo(x, y - radius * 0.45);
    ctx.lineTo(x, y + radius * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlayText() {
    if (state.phase !== "finished") {
      return;
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = "700 22px Bahnschrift, 'Trebuchet MS', sans-serif";
    ctx.fillText("Press R or Restart Match to play again", canvas.width / 2, canvas.height - 24);
    ctx.restore();
  }

  function isWithinGoalMouth(y, inset = 0) {
    return y > GOAL_TOP + inset && y < GOAL_BOTTOM - inset;
  }

  function getOwnGoal(team) {
    return team === "blue"
      ? { x: 0, y: FIELD.height / 2 }
      : { x: FIELD.width, y: FIELD.height / 2 };
  }

  function getEnemyGoal(team) {
    return team === "blue"
      ? { x: FIELD.width, y: FIELD.height / 2 }
      : { x: 0, y: FIELD.height / 2 };
  }

  function worldToScreenX(x) {
    return (x - VIEW.minX) * VIEW_SCALE;
  }

  function worldToScreenY(y) {
    return (y - VIEW.minY) * VIEW_SCALE;
  }

  function clampVelocity(body, maxSpeed) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed <= maxSpeed || speed === 0) {
      return;
    }
    const ratio = maxSpeed / speed;
    body.vx *= ratio;
    body.vy *= ratio;
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function formatClock(time) {
    const totalSeconds = Math.ceil(time);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function angleDiff(a, b) {
    return Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (len === 0) {
      return { x: 0, y: 0 };
    }
    return { x: x / len, y: y / len };
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }
})();

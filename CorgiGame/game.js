// game.js
"use strict";

window.addEventListener("load", () => {
  // ============================
  // 캔버스 & DOM 요소
  // ============================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const hud = document.getElementById("hud");
  const scoreDisplay = document.getElementById("scoreDisplay");
  const lifeHearts = Array.from(document.querySelectorAll(".life-heart"));

  const startScreen = document.getElementById("startScreen");
  const gameOverScreen = document.getElementById("gameOverScreen");
  const finalScoreText = document.getElementById("finalScoreText");
  const scoreHistoryList = document.getElementById("scoreHistoryList");

  const howToPlaySection = document.querySelector(".how-to-play");
  const canvasWrapper = document.querySelector(".canvas-wrapper");

  // 새로 만든 슬라이더
  const bgmSlider = document.getElementById("bgmSlider");
  const sfxSlider = document.getElementById("sfxSlider");

  // HUD를 캔버스 wrapper 안으로 옮김
  canvasWrapper.appendChild(hud);
  hud.style.visibility = "hidden";

  // ============================
  // 이미지 스프라이트
  // ============================
  const imgCorgi = document.getElementById("spriteCorgi");
  const imgLogH = document.getElementById("spriteLogHorizontal");
  const imgLogV = document.getElementById("spriteLogVertical");
  const imgBird = document.getElementById("spriteBird");
  const imgHeart = document.getElementById("spriteHeart");

  // ============================
  // 사운드 - 효과음(SFX)
  // ============================
  const soundFiles = {
    jump: "jump.mp3",
    hit: "hit.mp3",
    heart: "heart.mp3"
  };

  const sounds = {};
  let sfxVolume = parseFloat(sfxSlider?.value || "0.6");
  let soundsWarmedUp = false;

  function initSounds() {
    for (const [name, src] of Object.entries(soundFiles)) {
      const a = new Audio(src);
      a.preload = "auto";
      a.load();
      a.volume = sfxVolume;
      sounds[name] = a;
    }
  }

  function warmUpSounds() {
    if (soundsWarmedUp) return;
    soundsWarmedUp = true;

    Object.values(sounds).forEach((s) => {
      const prev = s.volume;
      s.volume = 0;
      s.play()
        .then(() => {
          s.pause();
          s.currentTime = 0;
          s.volume = prev;
        })
        .catch(() => {});
    });
  }

  function setSfxVolume(v) {
    sfxVolume = v;
    Object.values(sounds).forEach((s) => (s.volume = v));
  }

  sfxSlider.addEventListener("input", (e) => {
    setSfxVolume(parseFloat(e.target.value));
  });

  function playSound(name) {
    const s = sounds[name];
    if (!s) return;
    try {
      s.currentTime = 0;
      s.volume = sfxVolume;
      s.play().catch(() => {});
    } catch (_) {}
  }

  initSounds();
  setSfxVolume(sfxVolume);

  // ============================
  // 배경음악 BGM
  // ============================
  const bgm = new Audio("Cooking-Banana.mp3");
  bgm.preload = "auto";
  bgm.loop = true; // 자동 반복 재생
  let bgmVolume = parseFloat(bgmSlider?.value || "0.4");
  let bgmStarted = false;

  function setBgmVolume(v) {
    bgmVolume = v;
    bgm.volume = v;
  }

  bgmSlider.addEventListener("input", (e) => {
    setBgmVolume(parseFloat(e.target.value));
  });

  setBgmVolume(bgmVolume);

  function ensureBgmPlaying() {
    if (bgmStarted) return;
    bgm
      .play()
      .then(() => {
        bgmStarted = true;
      })
      .catch(() => {
        // 자동재생 정책 때문에 실패할 수도 있음 (다음 키 입력 때 다시 시도)
        bgmStarted = false;
      });
  }

  // ============================
  // 게임 상수
  // ============================
  const GROUND_HEIGHT = 60;
  const GROUND_Y = canvas.height - GROUND_HEIGHT;

  const PLAYER_BASE_WIDTH = 110;
  const PLAYER_BASE_HEIGHT = 90;
  const PLAYER_X = 150;

  const GRAVITY = 1800;
  const JUMP_POWER = 750;
  const MAX_JUMPS = 2;

  const INITIAL_SPEED = 260;
  const SPEED_INCREASE_PER_SEC = 15;

  const SPAWN_INTERVAL_MIN = 1.2;
  const SPAWN_INTERVAL_MAX = 2.0;

  // ============================
  // 점수 저장 시스템 (최근 10개)
  // ============================
  function loadScoreHistory() {
    const data = localStorage.getItem("scoreHistory");
    return data ? JSON.parse(data) : [];
  }

  function saveScoreToHistory(score) {
    let history = loadScoreHistory();
    history.unshift(score);
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem("scoreHistory", JSON.stringify(history));
  }

  function getBestScore() {
    const hist = loadScoreHistory();
    return hist.length ? Math.max(...hist) : 0;
  }

  function updateScoreHistoryDisplay() {
    const hist = loadScoreHistory();

    if (!hist.length) {
      scoreHistoryList.innerHTML = "<p>저장된 기록이 없습니다.</p>";
      return;
    }

    scoreHistoryList.innerHTML = "<h3>최근 플레이 기록</h3>";
    scoreHistoryList.innerHTML += hist
      .map((s, i) => `<p>${i + 1}. ${s} 점</p>`)
      .join("");
  }

  function showBestScoreOnStart() {
    const best = getBestScore();
    const el = document.getElementById("bestScoreText");
    if (el) el.textContent = `최고 점수: ${best}`;
  }

  // ============================
  // 게임 상태
  // ============================
  let gameState = "start";

  let player;
  let obstacles;
  let particles = [];

  let score, lives, gameSpeed;
  let spawnTimer, nextSpawnTime;
  let lastTime = 0;
  let globalTime = 0;

  let particleSpawnTimer = 0;

  // ============================
  // 리셋
  // ============================
  function resetGame() {
    player = {
      x: PLAYER_X,
      y: GROUND_Y - PLAYER_BASE_HEIGHT,
      width: PLAYER_BASE_WIDTH,
      height: PLAYER_BASE_HEIGHT,
      vy: 0,
      jumpsLeft: MAX_JUMPS,
      onGround: true,
      isSliding: false
    };

    score = 0;
    lives = 3;
    gameSpeed = INITIAL_SPEED;

    spawnTimer = 0;
    nextSpawnTime = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);

    obstacles = [];
    particles = [];
    particleSpawnTimer = 0;

    updateScoreUI();
    updateLivesUI();
    showBestScoreOnStart();
  }

  // ============================
  // 유틸 함수
  // ============================
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function isColliding(a, b) {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }

  // ============================
  // UI 업데이트
  // ============================
  function updateScoreUI() {
    scoreDisplay.textContent = `점수: ${score}`;
  }

  function updateLivesUI() {
    lifeHearts.forEach((h, i) => {
      h.style.opacity = i < lives ? "1" : "0.2";
    });
  }

  // ============================
  // 장애물 생성
  // ============================
  function spawnObject() {
    const spawnHeart = Math.random() < 0.18;

    if (spawnHeart) {
      obstacles.push({
        type: "heart",
        x: canvas.width + 40,
        y: GROUND_Y - PLAYER_BASE_HEIGHT - rand(30, 110),
        width: 45,
        height: 45,
        passed: false
      });
      return;
    }

    const type = choose(["logH", "logV", "bird"]);

    if (type === "bird") {
      obstacles.push({
        type: "bird",
        x: canvas.width + 40,
        y: GROUND_Y - PLAYER_BASE_HEIGHT - 40,
        width: 75,
        height: 55,
        passed: false
      });
    } else if (type === "logH") {
      obstacles.push({
        type: "logH",
        x: canvas.width + 40,
        y: GROUND_Y - 45 + 10,
        width: 130,
        height: 45,
        passed: false
      });
    } else if (type === "logV") {
      obstacles.push({
        type: "logV",
        x: canvas.width + 40,
        y: GROUND_Y - 100 + 25,
        width: 80,
        height: 100,
        passed: false
      });
    }
  }

  // ============================
  // 게임 루프
  // ============================
  function gameLoop(ts) {
    const delta = (ts - lastTime) / 1000;
    lastTime = ts;
    globalTime += delta;

    update(delta);
    draw();

    requestAnimationFrame(gameLoop);
  }

  // ============================
  // 업데이트
  // ============================
  function update(delta) {
    if (gameState !== "playing") return;

    // 속도 증가
    gameSpeed += SPEED_INCREASE_PER_SEC * delta;

    // 플레이어 물리
    player.vy += GRAVITY * delta;
    player.y += player.vy * delta;

    const ground = GROUND_Y - player.height;
    if (player.y >= ground) {
      player.y = ground;
      player.vy = 0;
      if (!player.onGround) {
        player.onGround = true;
        player.jumpsLeft = MAX_JUMPS;
      }
    } else {
      player.onGround = false;
    }

    // 파티클 생성
    if (player.onGround && !player.isSliding) {
      particleSpawnTimer += delta;
      if (particleSpawnTimer >= 0.04) {
        particleSpawnTimer = 0;
        particles.push({
          x: player.x + 20,
          y: GROUND_Y - 5,
          vx: -gameSpeed * 0.6,
          vy: rand(-30, -10),
          alpha: 0.6,
          radius: rand(2, 4)
        });
      }
    }

    // 파티클 업데이트
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vy += 220 * delta;
      p.alpha -= 0.9 * delta;
      if (p.alpha <= 0) particles.splice(i, 1);
    }

    // 장애물
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= gameSpeed * delta;

      // 점수 (이제 효과음 없음)
      if (!o.passed && (o.type === "logH" || o.type === "logV" || o.type === "bird")) {
        if (o.x + o.width < player.x) {
          o.passed = true;
          score += 100;
          updateScoreUI();
        }
      }

      // 충돌
      const box = {
        x: player.x + 10,
        y: player.y + 10,
        width: player.width - 20,
        height: player.height - 20
      };

      if (isColliding(box, o)) {
        if (o.type === "heart") {
          if (lives < 3) lives++;
          updateLivesUI();
          playSound("heart");
          obstacles.splice(i, 1);
          continue;
        } else {
          obstacles.splice(i, 1);
          lives--;
          updateLivesUI();
          playSound("hit");

          if (lives <= 0) {
            handleGameOver();
            return;
          }
        }
      }

      if (o.x + o.width < -50) obstacles.splice(i, 1);
    }

    // 스폰
    spawnTimer += delta;
    if (spawnTimer >= nextSpawnTime) {
      spawnObject();
      spawnTimer = 0;
      nextSpawnTime = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
    }
  }

  // ============================
  // 드로잉
  // ============================
  function drawBackground() {
    // 하늘
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height - GROUND_HEIGHT);
    grad.addColorStop(0, "#bfe9ff");
    grad.addColorStop(1, "#e6f7ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height - GROUND_HEIGHT);

    // 잔디
    grad = ctx.createLinearGradient(0, canvas.height - GROUND_HEIGHT, 0, canvas.height);
    grad.addColorStop(0, "#b7e4a0");
    grad.addColorStop(1, "#8acb6f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(120,80,40,${p.alpha})`;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    let y = player.y;
    let tilt = 0;

    if (player.onGround && !player.isSliding) {
      y += Math.sin(globalTime * 15) * 4;
      tilt = Math.sin(globalTime * 10) * 0.06;
    }

    ctx.save();
    const cx = player.x + player.width / 2;
    const cy = y + player.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.drawImage(imgCorgi, -player.width / 2, -player.height / 2, player.width, player.height);
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.type === "logH") ctx.drawImage(imgLogH, o.x, o.y, o.width, o.height);
      else if (o.type === "logV") ctx.drawImage(imgLogV, o.x, o.y, o.width, o.height);
      else if (o.type === "bird") ctx.drawImage(imgBird, o.x, o.y, o.width, o.height);
      else if (o.type === "heart") ctx.drawImage(imgHeart, o.x, o.y, o.width, o.height);
    }
  }

  function draw() {
    drawBackground();
    drawParticles();
    drawPlayer();
    drawObstacles();
  }

  // ============================
  // 점프 & 슬라이드
  // ============================
  function doJump() {
    if (player.jumpsLeft <= 0) return;
    if (player.isSliding) return;

    player.vy = -JUMP_POWER;
    player.onGround = false;
    player.jumpsLeft--;
    playSound("jump");
  }

  function startSlide() {
    if (!player.onGround) return;
    if (player.isSliding) return;

    player.isSliding = true;
    player.height = PLAYER_BASE_HEIGHT * 0.5;
    player.y = GROUND_Y - player.height;
  }

  function endSlide() {
    if (!player.isSliding) return;

    player.isSliding = false;
    player.height = PLAYER_BASE_HEIGHT;
    player.y = GROUND_Y - player.height;
  }

  // ============================
  // 게임 상태 전환
  // ============================
  function startGame() {
    gameState = "playing";
    startScreen.classList.remove("active");
    gameOverScreen.classList.remove("active");
    hud.style.visibility = "visible";
    howToPlaySection.style.display = "none";
  }

  function handleGameOver() {
    gameState = "gameover";

    saveScoreToHistory(score);
    const best = getBestScore();
    finalScoreText.textContent = `최종 점수: ${score}\n최고 점수: ${best}`;
    updateScoreHistoryDisplay();

    gameOverScreen.classList.add("active");
  }

  // ============================
  // 키 입력
  // ============================
  window.addEventListener("keydown", (e) => {
    const key = e.code;

    if (key === "Space" || key === "ArrowUp") {
      e.preventDefault();

      if (!soundsWarmedUp) warmUpSounds();
      ensureBgmPlaying(); // 배경음도 첫 입력 시 재생 시도

      if (gameState === "start") {
        resetGame();
        startGame();
        doJump();
      } else if (gameState === "playing") {
        doJump();
      } else if (gameState === "gameover") {
        resetGame();
        startGame();
      }
    }

    if (key === "ArrowDown" && gameState === "playing") {
      e.preventDefault();
      startSlide();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown" && gameState === "playing") {
      endSlide();
    }
  });

  // ============================
  // 초기 실행
  // ============================
  resetGame();
  showBestScoreOnStart();
  updateScoreHistoryDisplay();

  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(gameLoop);
  });
});

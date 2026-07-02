(function () {
  // 서버에서 주입한 데이터
  const GAME_DATA = window.GAME_DATA;
  const stages = GAME_DATA.stages;

  // 상태
  const state = {
    current_stage: 0,        // 0-based index (0~5)
    remaining_targets: 0,
    current_target_index: 0, // 5·10단계 순서 카운터
    locked: false,           // 디바운스 잠금
  };

  // DOM 캐시
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const stageTitleEl  = $("#stage-title");
  const instructionEl = $("#instruction");
  const dotsEl        = $("#progress-dots");
  const gridEl        = $("#marble-grid");
  const marbleArea    = $(".marble-area");
  const toastEl       = $("#toast");
  const bannerEl      = $("#stage-banner");
  const bannerTitle   = $("#banner-title");
  const bannerText    = $("#banner-text");
  const finalEl       = $("#final-overlay");
  const restartBtn    = $("#restart-btn");
  const fwCanvas      = $("#fireworks");
  const trainOverlay  = $("#train-overlay");
  const trainEl       = $("#train");

  // 어린이 이름 (UI 메시지에 자연스럽게 섞어 사용)
  const KIDS = "정연이💖정우";

  // -------------------------------------------------------------------
  // 사운드 (Web Audio API 합성, 외부 파일 없이 귀여운 효과음)
  // -------------------------------------------------------------------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    return audioCtx;
  }
  function tone(freq, dur, type = "sine", vol = 0.18, when = 0) {
    const ctx = ac(); if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function sfxPop() {
    tone(880, 0.10, "triangle", 0.20, 0);
    tone(1320, 0.12, "triangle", 0.18, 0.05);
  }
  function sfxWrong() {
    tone(330, 0.16, "sine", 0.22, 0);
    tone(220, 0.20, "sine", 0.20, 0.10);
  }
  function sfxStageClear() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.22, i * 0.10));
  }
  // 여러 구슬이 '동시에' 터지는 풍선/폭죽 소리 ("파파팡!")
  function sfxBurst(count) {
    const n = Math.min(Math.max(count || 2, 2), 6);
    // 거의 동시(≤36ms)의 팝들을 겹쳐 풍성한 '팡' — 지각적으로 하나의 터짐
    for (let i = 0; i < n; i++) {
      const off = i * 0.006;
      tone(680 + Math.random() * 520, 0.10, "triangle", 0.15, off);
      tone(1200 + Math.random() * 650, 0.08, "triangle", 0.11, off + 0.02);
    }
    // 저역 '펑' 바디 + 반짝이는 꼬리
    tone(170, 0.16, "sine", 0.20, 0);
    tone(1760, 0.14, "sine", 0.09, 0.05);
  }
  function sfxFinal() {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.20, "triangle", 0.22, i * 0.12));
  }

  // 환호 합성: 3성부 사람 음역 톤이 약간씩 어긋나며 위로 글라이드 → "와~"
  // 노이즈 기반 박수와 달리 명확한 음색을 가져 기차 사운드(노이즈+저주파)와
  // 음색이 확실히 구분되며, 짧아서 다음 기차 사운드로 깔끔히 이어진다.
  // 마지막 10단계 성공 시 sfxStageClear 대신 재생된다.
  const CHEER_MS = 900;           // 환호 총 길이
  const CHEER_TO_TRAIN_GAP = 500; // 환호 종료 후 기차 출발 전 침묵 간격
  function sfxCheer() {
    const ctx = ac();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // 3성부 짧은 글리산도 (소프라노/알토/테너 화음)
    const voices = [
      { from: 440, to: 660, delay: 0.00, vol: 0.16 },  // A4 → E5
      { from: 523, to: 784, delay: 0.05, vol: 0.13 },  // C5 → G5
      { from: 392, to: 587, delay: 0.10, vol: 0.14 },  // G4 → D5
    ];
    voices.forEach((v) => {
      const start = t0 + v.delay;
      const dur = 0.60;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(v.from, start);
      osc.frequency.exponentialRampToValueAtTime(v.to, start + dur * 0.55);
      osc.frequency.linearRampToValueAtTime(v.to * 0.92, start + dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(v.vol, start + 0.05);
      gain.gain.linearRampToValueAtTime(v.vol * 0.7, start + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });

    // 끝에 반짝이는 고음 종소리 (환호의 느낌표)
    [1319, 1760, 2093].forEach((f, i) => {
      tone(f, 0.18, "sine", 0.10, 0.55 + i * 0.05);
    });
  }

  // -------------------------------------------------------------------
  // UI 헬퍼
  // -------------------------------------------------------------------
  function colsFor(count) {
    // 화면 비율과 개수에 어울리는 컬럼 수
    const w = window.innerWidth;
    if (count === 9)  return 3;
    if (count === 12) return w < 520 ? 3 : 4;
    if (count === 14) return w < 520 ? 4 : (w < 900 ? 5 : 7);
    if (count === 15) return w < 520 ? 3 : 5;
    if (count === 24) return w < 520 ? 4 : 6; // 1·2·3단계 확장 그리드
    return Math.min(5, Math.ceil(Math.sqrt(count)));
  }

  function updateProgress(stageIdx) {
    dotsEl.innerHTML = "";
    for (let i = 0; i < stages.length; i++) {
      const d = document.createElement("span");
      d.className = "d" + (i < stageIdx ? " done" : (i === stageIdx ? " now" : ""));
      dotsEl.appendChild(d);
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    // 어린이가 천천히 읽을 시간을 주기 위해 토스트 노출 시간을 길게(2.2초).
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function showBanner(title, text, ms = 1800) {
    bannerTitle.textContent = title;
    bannerText.textContent = text;
    bannerEl.classList.add("show");
    return new Promise((resolve) => {
      setTimeout(() => {
        bannerEl.classList.remove("show");
        setTimeout(resolve, 220);
      }, ms);
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // -------------------------------------------------------------------
  // 단계 렌더러
  // -------------------------------------------------------------------
  function clearGrid() {
    gridEl.innerHTML = "";
  }

  function setupGrid(count, fixedCols) {
    // stage.cols 가 명시된 단계(예: 공간 인지 6단계)는 화면 크기와 무관하게
    // 고정 컬럼 수를 사용해 위/아래/왼쪽/오른쪽 관계가 일관되게 유지된다.
    const cols = fixedCols || colsFor(count);
    const rows = Math.ceil(count / cols);
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridEl.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
    gridEl.style.setProperty("--cols", cols);
    gridEl.style.setProperty("--rows", rows);
    applyMarbleSize(count, cols, rows);
  }

  function refreshGrid() {
    const stage = stages[state.current_stage];
    if (stage) setupGrid(stage.count, stage.cols);
  }

  function applyMarbleSize(count, cols, rows) {
    // 그리드(#marble-grid) 자체의 가용 영역으로 마블 사이즈를 계산.
    // 7단계처럼 marble-area 가 좌·우 분할일 때 그리드는 좌측 부분만 차지하므로
    // 그리드 자신의 clientWidth/Height 를 기준으로 삼아야 정확하다.
    const padX = 20, padY = 20;
    const w = Math.max(120, gridEl.clientWidth  - padX);
    const h = Math.max(120, gridEl.clientHeight - padY);

    // CSS 의 grid gap 과 동일하게 계산 (clamp(10,1.6vw,22))
    const vw = window.innerWidth;
    const gap = Math.min(22, Math.max(10, vw * 0.016));

    const cellW = (w - (cols - 1) * gap) / cols;
    const cellH = (h - (rows - 1) * gap) / rows;
    let size = Math.min(cellW, cellH);

    // 1단계의 .big 구슬(1.2배)도 셀에 들어오도록 헤드룸 확보
    size = size / 1.22;
    // 여백·그림자 고려 약간 축소
    size = Math.floor(size * 0.92);
    // 너무 작거나 너무 크지 않게 클램프
    size = Math.max(40, Math.min(size, 140));

    gridEl.style.setProperty("--marble-size", size + "px");
  }

  function renderStage(stage) {
    state.remaining_targets = stage.targets_total;
    state.current_target_index = 0;
    state.locked = false;

    // 이전 스테이지(6단계 '따라 해봐!')에서 남았을 수 있는 '다시 보여줘' 버튼 정리
    const oldReplay = document.getElementById("replay-btn");
    if (oldReplay) oldReplay.remove();

    stageTitleEl.textContent = stage.title;
    clearGrid();
    setupGrid(stage.count, stage.cols);

    // 인스트럭션 (2·5단계는 색칩 등 강조 포함)
    if (stage.id === 3) {
      instructionEl.innerHTML =
        `<span class="color-chip" style="background:${stage.target_color}"></span>` +
        `<span class="accent">${stage.target_color_name}</span> 구슬을 모두 찾아보자!`;
    } else if (stage.id === 6) {
      instructionEl.innerHTML =
        `<span class="color-chip" style="background:${stage.ref_color}"></span>` +
        `<span class="accent">${stage.ref_color_name}</span> 구슬 ` +
        `<span class="accent">${stage.direction}</span>에 있는 구슬을 찾아봐~`;
    } else {
      instructionEl.textContent = stage.instruction;
    }

    if (stage.id === 2) renderStage2(stage);
    else if (stage.id === 3) renderStage3(stage);
    else if (stage.id === 11) renderStage11(stage);
    else if (stage.id === 4) renderStage4(stage);
    else if (stage.id === 6) renderStage6(stage);
    else if (stage.id === 8) renderStage8(stage);
    else if (stage.id === 9) renderStage9(stage);
    else if (stage.id === 10) renderStage10(stage);
    else if (stage.id === 12) renderStage12(stage);
    else if (stage.id === 13) renderStage13(stage);
  }

  function makeMarble(opts = {}) {
    const m = document.createElement("button");
    m.type = "button";
    m.className = "marble";
    if (opts.color) m.style.setProperty("--hue", opts.color);
    if (opts.text)  m.textContent = opts.text;
    if (opts.extraClass) m.classList.add(...opts.extraClass);
    if (opts.aria) m.setAttribute("aria-label", opts.aria);
    return m;
  }

  // [1단계] 반짝반짝 불이 켜진 구슬! (24개 · 3판 반복)
  // 마블은 한 번만 만들어두고, 판이 바뀔 때마다 bulb-on/bulb-off 클래스만
  // 갈아끼운다. 켜진 구슬을 누르면 사라지지 않고 꺼진(일반) 구슬로 바뀐다.
  function renderStage2(stage) {
    const roundState = { round: 0, remaining: 0, marbles: [] };
    for (let i = 0; i < stage.count; i++) {
      const m = makeMarble({ aria: "구슬" });
      m.dataset.idx = i;
      m.addEventListener("click", () => onLitClick(m, stage, roundState));
      gridEl.appendChild(m);
      roundState.marbles.push(m);
    }
    applyLitRound(stage, roundState);
  }

  // 현재 라운드의 불 배치를 마블들에 적용 + 남은 개수/안내문 갱신
  function applyLitRound(stage, roundState) {
    const lit = new Set(stage.lit_rounds[roundState.round]);
    roundState.remaining = lit.size;
    roundState.marbles.forEach((m, i) => {
      const on = lit.has(i);
      m.classList.toggle("bulb-on", on);
      m.classList.toggle("bulb-off", !on);
      m.setAttribute("aria-label", on ? "반짝이는 구슬" : "구슬");
    });
    instructionEl.textContent = stage.instruction;
  }

  function onLitClick(m, stage, roundState) {
    if (state.locked) return;
    // 이미 꺼진(일반) 구슬은 무반응 — 오답 처벌 없이 관대하게 넘어감
    if (!m.classList.contains("bulb-on")) return;

    // 불 끄기: 사라지지 않고 꺼진 구슬로 전환
    sfxPop();
    m.classList.remove("bulb-on");
    m.classList.add("bulb-off");
    m.classList.add("reveal-pulse");
    m.setAttribute("aria-label", "구슬");
    setTimeout(() => m.classList.remove("reveal-pulse"), 280);
    roundState.remaining -= 1;

    if (roundState.remaining > 0) return;

    // 한 판 완료
    roundState.round += 1;
    if (roundState.round >= stage.rounds) {
      state.locked = true;
      setTimeout(() => onStageClear(), 320);
    } else {
      // 다음 회차로: 잠깐 축하 후 새 불이 다시 켜짐 (자연스럽게 반복)
      state.locked = true;
      showToast("잘했어! 또 반짝이는 구슬이 나타났어~");
      sfxStageClear();
      setTimeout(() => {
        state.locked = false;
        applyLitRound(stage, roundState);
      }, 800);
    }
  }

  // [3] 색상 매칭
  function renderStage3(stage) {
    const targets = new Set(stage.target_indices);
    for (let i = 0; i < stage.count; i++) {
      const m = makeMarble({ color: stage.colors[i] });
      const isTarget = targets.has(i);
      m.addEventListener("click", () => onClick(m, isTarget, "multi"));
      gridEl.appendChild(m);
    }
  }

  // [4단계] 차례차례 숫자 세기 (1→24 오름차순 → 24→1 내림차순)
  function renderStage4(stage) {
    const numState = { phase: 0 }; // 0 = 오름차순, 1 = 내림차순
    renderNumberPhase(stage, numState);
  }

  function renderNumberPhase(stage, numState) {
    const asc = (numState.phase === 0);
    const arr = stage.arrangements[numState.phase];
    const phaseState = { progress: 0 };

    clearGrid();
    setupGrid(stage.count, stage.cols);
    instructionEl.textContent = asc
      ? "1부터 12까지 작은 수부터 차례대로 눌러보자!"
      : "이번엔 12부터 1까지 큰 수부터 거꾸로 눌러보자!";

    for (let i = 0; i < stage.count; i++) {
      const num = arr.numbers[i];
      const m = makeMarble({
        color: arr.colors[i],
        text: String(num),
        aria: `숫자 ${num}`,
      });
      m.dataset.num = num;
      m.addEventListener("click", () => onNumberClick(m, num, stage, numState, phaseState));
      gridEl.appendChild(m);
    }
  }

  function onNumberClick(m, num, stage, numState, phaseState) {
    if (state.locked) return;
    if (m.disabled) return;
    const asc = (numState.phase === 0);
    const expected = asc ? (phaseState.progress + 1) : (stage.count - phaseState.progress);
    if (num !== expected) {
      shake(m);
      showToast(`다음은 ${expected}번이야!`);
      sfxWrong();
      return;
    }

    sfxPop();
    pop(m);
    phaseState.progress += 1;
    if (phaseState.progress < stage.count) return;

    if (numState.phase === 0) {
      // 오름차순 완료 → 위치를 새로 섞어 내림차순 세부 단계로
      numState.phase = 1;
      state.locked = true;
      showToast("잘했어! 이번엔 거꾸로 세어보자~");
      sfxStageClear();
      setTimeout(() => {
        state.locked = false;
        renderNumberPhase(stage, numState);
      }, 1000);
    } else {
      state.locked = true;
      setTimeout(() => onStageClear(), 320);
    }
  }

  // [3단계·신규] 가장 많이 / 가장 적게 있는 색 찾기
  // 세부 1단계: 가장 많은(6개) 색 중 아무거나 클릭 → 6개가 한꺼번에 파파팍 터짐.
  // 세부 2단계: 가장 적은(2개) 색 중 아무거나 클릭 → 2개가 파팍 터짐. 둘 다 완료 시 성공.
  function renderStage11(stage) {
    const subState = { step: 0, targetColor: null };
    for (let i = 0; i < stage.count; i++) {
      const m = makeMarble({ color: stage.colors[i], aria: "구슬" });
      m.dataset.color = stage.colors[i];
      m.addEventListener("click", () => onMostClick(m, stage, subState));
      gridEl.appendChild(m);
    }
    startMostStep(stage, subState);
  }

  function startMostStep(stage, subState) {
    const isMost = (subState.step === 0);
    subState.targetColor = isMost ? stage.most_color : stage.least_color;
    instructionEl.innerHTML = isMost
      ? "가장 <span class=\"accent\">많이</span> 있는 색깔을 찾아서 없애봐!"
      : "이번엔 가장 <span class=\"accent\">조금</span> 있는 색깔을 찾아서 없애봐!";
  }

  function onMostClick(m, stage, subState) {
    if (state.locked) return;
    if (m.disabled) return; // 이미 터진 구슬
    if (m.dataset.color !== subState.targetColor) {
      shake(m);
      showToast(randomEncourage());
      sfxWrong();
      return;
    }

    // 정답 색 → 같은 색 구슬 전체를 '동시에' 터뜨림 + 풍선/폭죽 터지는 소리
    state.locked = true;
    const group = Array.from(gridEl.querySelectorAll(".marble"))
      .filter((x) => x.dataset.color === subState.targetColor && !x.disabled);
    group.forEach((g) => pop(g)); // 6개(또는 2개)가 동시에 팡!
    sfxBurst(group.length);

    if (subState.step === 0) {
      // 세부 2단계(가장 적은 색)로 전환
      subState.step = 1;
      showToast("잘했어! 이번엔 가장 조금 있는 색이야~");
      setTimeout(() => {
        state.locked = false;
        startMostStep(stage, subState);
      }, 900);
    } else {
      setTimeout(() => onStageClear(), 520);
    }
  }

  // [6] 색이름과 방향으로 위치 찾기 (공간 인지)
  function renderStage6(stage) {
    for (let i = 0; i < stage.count; i++) {
      const m = makeMarble({
        color: stage.colors[i],
        aria: stage.color_names[i] + " 구슬",
      });
      const isAnswer = (i === stage.answer_index);
      m.addEventListener("click", () => onClick(m, isAnswer, "single"));
      gridEl.appendChild(m);
    }
  }

  // [8] 똑같은 짝꿍 찾기 - 뒤집어서 같은 색 짝 맞히기
  // 진입 시 5초간 모든 마블의 색을 보여주고(미리보기), 카운트다운 종료 시점에
  // 모든 마블을 회색 face-down 상태로 전환한 뒤 본 게임을 시작한다.
  function renderStage8(stage) {
    const memState = {
      flipped: [],                  // 현재 뒤집힌 마블 0~2개
      pairsLeft: stage.pairs_count, // 남은 짝 개수
      busy: false,                  // 비교 대기 중 잠금
      previewing: true,             // 10초 미리보기 단계
      wrongStreak: 0,               // 연속 오답 횟수 (힌트 점등 트리거)
      hinted: null,                 // 현재 ✨로 힌트 중인 마블
    };

    for (let i = 0; i < stage.count; i++) {
      const color = stage.colors[i];
      const m = makeMarble({ aria: "비밀 구슬" });
      // 미리보기 동안에는 색을 인라인으로 부여해서 그대로 노출.
      // 5초 후 인라인 --hue 를 제거하면 .face-down 클래스의 흰색이 적용된다.
      m.style.setProperty("--hue", color);
      m.dataset.color = color;
      m.dataset.idx = i;
      m.addEventListener("click", () => onMemoryClick(m, memState));
      gridEl.appendChild(m);
    }

    // 카운트다운 + 회색 전환 (비동기 fire-and-forget)
    startMemoryPreview(memState, stage, 10);
  }

  async function startMemoryPreview(memState, stage, seconds) {
    // 미리보기 동안 모든 입력 잠금 (onMemoryClick 첫 줄에서 차단됨)
    state.locked = true;
    memState.previewing = true;

    for (let s = seconds; s >= 1; s--) {
      showMemoryCountdown(s);
      sfxTick();
      await sleep(1000);
    }

    // 모든 마블을 회색 face-down 으로 전환 + 가벼운 펄스로 시각적 신호
    sfxFlip();
    const allMarbles = gridEl.querySelectorAll(".marble");
    allMarbles.forEach((m) => {
      m.style.removeProperty("--hue");
      m.classList.add("face-down");
      m.classList.add("reveal-pulse");
      setTimeout(() => m.classList.remove("reveal-pulse"), 280);
    });

    // instruction 을 본 게임용 안내문으로 복원
    instructionEl.textContent = stage.instruction;

    state.locked = false;
    memState.previewing = false;
  }

  // 카운트다운 배지를 instruction 안쪽에 띄우고, 매초 팝업 애니메이션을 재생.
  // instruction 라인은 marble-area 위쪽에 있어서 구슬을 가리지 않는다.
  function showMemoryCountdown(num) {
    let badge = instructionEl.querySelector(".countdown-badge");
    if (!badge) {
      instructionEl.innerHTML =
        `<span>잘 기억해두자!</span>` +
        `<span class="countdown-badge">${num}</span>`;
      badge = instructionEl.querySelector(".countdown-badge");
    } else {
      badge.textContent = num;
    }
    badge.classList.remove("beat");
    void badge.offsetWidth; // reflow → 애니메이션 재시작
    badge.classList.add("beat");
  }

  function sfxTick() {
    tone(900, 0.10, "triangle", 0.16, 0);
  }

  function onMemoryClick(m, memState) {
    if (state.locked || memState.busy) return;
    if (memState.previewing) return; // 미리보기 동안에는 무반응
    if (!m.classList.contains("face-down")) return; // 이미 매치되었거나 펼쳐진 상태

    // 카드 뒤집기 = 진짜 색을 인라인으로 부여하면서 face-down 제거
    m.style.setProperty("--hue", m.dataset.color);
    m.classList.remove("face-down");
    m.classList.add("reveal-pulse");
    setTimeout(() => m.classList.remove("reveal-pulse"), 280);
    sfxFlip();
    memState.flipped.push(m);

    if (memState.flipped.length === 1) {
      // 첫 번째 카드를 펼친 직후. 연속 2회 이상 틀렸다면 같은 색의
      // 남은(face-down) 마블 한 장을 ✨로 살짝 알려준다.
      if (memState.wrongStreak >= 2) {
        const targetColor = m.dataset.color;
        const candidates = gridEl.querySelectorAll(".marble.face-down");
        for (const cand of candidates) {
          if (cand !== m && cand.dataset.color === targetColor) {
            cand.classList.add("hint-sparkle");
            memState.hinted = cand;
            break;
          }
        }
      }
      return;
    }

    // 두 번째 카드 펼침 → 힌트가 떠 있었다면 즉시 정리
    if (memState.hinted) {
      memState.hinted.classList.remove("hint-sparkle");
      memState.hinted = null;
    }

    // 두 장 펼쳐졌으면 비교
    memState.busy = true;
    const [a, b] = memState.flipped;
    const matched = (a.dataset.color === b.dataset.color);

    if (matched) {
      // 짝 맞춤 → 두 마블을 pop 으로 사라지게 하되 그리드 슬롯은 유지
      setTimeout(() => {
        sfxPop();
        a.classList.add("pop");
        b.classList.add("pop");
        a.setAttribute("aria-hidden", "true");
        b.setAttribute("aria-hidden", "true");
        memState.flipped = [];
        memState.wrongStreak = 0; // 성공했으니 연속 오답 카운터 초기화
        memState.pairsLeft -= 1;
        memState.busy = false;
        if (memState.pairsLeft === 0) {
          state.locked = true;
          setTimeout(() => onStageClear(), 360);
        }
      }, 320);
    } else {
      // 다른 색 → 부드러운 오답음 후 색을 다시 감추고 face-down 으로 복귀
      setTimeout(() => {
        sfxWrong();
        a.style.removeProperty("--hue");
        b.style.removeProperty("--hue");
        a.classList.add("face-down");
        b.classList.add("face-down");
        memState.flipped = [];
        memState.wrongStreak += 1; // 연속 오답 누적
        memState.busy = false;
      }, 800);
    }
  }

  function sfxFlip() {
    // 살짝 가벼운 카드 뒤집힘 톤
    tone(900, 0.05, "triangle", 0.13, 0);
    tone(700, 0.04, "triangle", 0.10, 0.04);
  }

  // [6단계] 따라 해봐! - 색 시퀀스 메모리 (24칸 · 5개 시퀀스)
  // 24개 구슬 중 5개가 차례로 빛나며 효과음을 들려주고, 아이는 같은 순서로
  // 콕콕 누른다. 데모는 1.5배속으로 재생하고, 끝나면 별도 안내 없이 바로
  // 따라할 수 있다. 우측 상단 '다시 보여줘' 버튼으로 데모를 재생할 수 있다.
  const SIMON_TONES = [
    261.63, 311.13, 349.23, 392.00, 440.00,
    466.16, 523.25, 587.33, 659.25,
  ];

  function renderStage9(stage) {
    const simonState = {
      progress: 0,
      sequence: stage.sequence,
      marbles: [],
      demoBusy: false,
    };

    for (let i = 0; i < stage.count; i++) {
      const color = stage.colors[i];
      const m = makeMarble({ color: color, aria: "구슬 " + (i + 1) });
      m.dataset.idx = i;
      simonState.marbles.push(m);
      m.addEventListener("click", () => onSimonClick(m, simonState, stage));
      gridEl.appendChild(m);
    }

    // 우측 상단 '다시 보여줘' 버튼
    const replay = document.createElement("button");
    replay.id = "replay-btn";
    replay.type = "button";
    replay.className = "replay-btn";
    replay.textContent = "다시 보여줘 🔁";
    replay.addEventListener("click", () => {
      if (simonState.demoBusy) return;
      playSimonDemo(simonState);
    });
    // marble-area 는 overflow:hidden 이라 버튼이 구슬을 가리므로, 카드(.stage-wrap)
    // 상단 우측에 붙여 그리드 위쪽에 띄운다.
    document.querySelector(".stage-wrap").appendChild(replay);

    // 짧은 지연 후 데모 시작 (그리드 레이아웃이 안정된 뒤)
    setTimeout(() => playSimonDemo(simonState), 500);
  }

  async function playSimonDemo(simonState) {
    state.locked = true;
    simonState.demoBusy = true;
    simonState.progress = 0;

    await showBanner("잘 봐!", "잘 보고 똑같이 따라해봐~", 1400);

    for (let i = 0; i < simonState.sequence.length; i++) {
      const idx = simonState.sequence[i];
      await pulseMarbleDemo(simonState.marbles[idx]);
    }

    // 데모 종료 → 별도 안내 팝업 없이 바로 따라할 수 있게 입력 잠금 해제
    state.locked = false;
    simonState.demoBusy = false;
  }

  async function pulseMarbleDemo(m) {
    // 기존 대비 1.5배속(재생 시간 ÷ 1.5)으로 더 빠르게 재생.
    const idx = parseInt(m.dataset.idx) || 0;
    const freq = SIMON_TONES[idx % SIMON_TONES.length];
    tone(freq, 0.42, "triangle", 0.24, 0);
    m.classList.add("simon-light");
    await sleep(480);
    m.classList.remove("simon-light");
    await sleep(200);
  }

  function pulseMarbleHit(m) {
    const idx = parseInt(m.dataset.idx) || 0;
    const freq = SIMON_TONES[idx % SIMON_TONES.length];
    tone(freq, 0.30, "triangle", 0.24, 0);
    m.classList.add("simon-light");
    setTimeout(() => m.classList.remove("simon-light"), 280);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function onSimonClick(m, simonState, stage) {
    if (state.locked || simonState.demoBusy) return;

    const idx = parseInt(m.dataset.idx);
    const expected = simonState.sequence[simonState.progress];

    if (idx === expected) {
      pulseMarbleHit(m);
      simonState.progress += 1;
      if (simonState.progress >= simonState.sequence.length) {
        state.locked = true;
        setTimeout(() => onStageClear(), 380);
      }
    } else {
      // 오답 → 살짝 흔들고 데모를 다시 보여줌
      shake(m);
      sfxWrong();
      showToast("앗! 다시 보여줄게~");
      state.locked = true;
      simonState.demoBusy = true;
      setTimeout(() => playSimonDemo(simonState), 700);
    }
  }

  // [10] 한글 가→하 순서 (한글 기차)
  // 정답 누름 음을 '반짝반짝 작은별' 동요 음계(도 도 솔 솔 라 라 솔 파 파 미 미 레 레 도)
  // 로 차례대로 들려준다. 14개 자음과 14개 음이 1:1 대응.
  const TWINKLE_NOTES = [
    261.63, 261.63, 392.00, 392.00, 440.00, 440.00, 392.00,
    349.23, 349.23, 329.63, 329.63, 293.66, 293.66, 261.63,
  ];
  function sfxTwinkleNote(noteIdx) {
    const freq = TWINKLE_NOTES[noteIdx];
    if (!freq) { sfxPop(); return; }
    // 본음 + 한 옥타브 위 부드러운 오버톤 → 동요 같은 따뜻한 음색
    tone(freq,     0.45, "triangle", 0.26, 0);
    tone(freq * 2, 0.30, "sine",     0.10, 0.04);
  }

  function renderStage10(stage) {
    for (let i = 0; i < stage.count; i++) {
      const ch = stage.chars[i];
      const m = makeMarble({
        color: stage.colors[i],
        text: ch,
        aria: `한글 ${ch}`,
      });
      m.dataset.ch = ch;
      m.addEventListener("click", () => {
        if (state.locked) return;
        const expected = stage.order[state.current_target_index];
        const ok = (ch === expected);
        if (ok) {
          // 누른 정답이 14개 시퀀스의 몇 번째인지(0-based)를 캡처해서 그 음을 재생
          const noteIdx = state.current_target_index;
          state.current_target_index += 1;
          // 마지막 '하'(인덱스 13)일 때는 700ms 딜레이를 둬서 'C' 음이 끝난 뒤에
          // 환호 소리가 깔끔하게 이어지도록 한다.
          const isLastNote = (noteIdx === stage.order.length - 1);
          onClick(
            m, true, "ordered",
            () => sfxTwinkleNote(noteIdx),
            isLastNote ? 700 : 0
          );
        } else {
          shake(m);
          showToast(`다음은 '${expected}' 차례야!`);
          sfxWrong();
        }
      });
      gridEl.appendChild(m);
    }
  }

  // [9단계] 알파벳 맞추기 (대문자 ↔ 소문자 매칭)
  // 세부1: 대문자 제시 → 소문자 12개 중 같은 글자 찾기
  // 세부2: 소문자 제시 → 대문자 12개 중 같은 글자 찾기
  function renderStage12(stage) {
    const subState = { step: 0 };
    renderAlphaSub(stage, subState);
  }

  function renderAlphaSub(stage, subState) {
    const sub = stage.subs[subState.step];
    const upperPrompt = (sub.promptCase === "upper");
    const UPPER = 65, LOWER = 97; // 'A', 'a'
    const promptChar = String.fromCharCode((upperPrompt ? UPPER : LOWER) + sub.targetIdx);
    // 마블에 표시되는 글자는 프롬프트의 반대 케이스
    const marbleBase = upperPrompt ? LOWER : UPPER;

    clearGrid();
    setupGrid(stage.count, stage.cols); // cols 미지정 → colsFor(12)
    instructionEl.innerHTML =
      `<span>이 알파벳과 <span class="accent">같은 글자</span>를 찾아봐!</span>` +
      `<span class="alpha-prompt">${promptChar}</span>`;

    for (let i = 0; i < stage.count; i++) {
      const letterIdx = sub.letterIdxs[i];
      const ch = String.fromCharCode(marbleBase + letterIdx);
      const m = makeMarble({ color: sub.colors[i], text: ch, aria: "알파벳 " + ch });
      const isAnswer = (letterIdx === sub.targetIdx);
      m.addEventListener("click", () => onAlphaClick(m, isAnswer, stage, subState));
      gridEl.appendChild(m);
    }
  }

  function onAlphaClick(m, isAnswer, stage, subState) {
    if (state.locked) return;
    if (m.disabled) return;
    if (!isAnswer) {
      shake(m);
      showToast(randomEncourage());
      sfxWrong();
      return;
    }

    sfxPop();
    pop(m);
    state.locked = true;
    if (subState.step === 0) {
      // 세부 2단계(소문자 제시 → 대문자 찾기)로 전환
      subState.step = 1;
      showToast("잘했어! 이번엔 반대로 찾아보자~");
      sfxStageClear();
      setTimeout(() => {
        state.locked = false;
        renderAlphaSub(stage, subState);
      }, 1000);
    } else {
      setTimeout(() => onStageClear(), 340);
    }
  }

  // [10단계] 다음에 나올 구슬 맞추기 (규칙성 있는 색 패턴 예측, 3서브 퀴즈)
  function renderStage13(stage) {
    const quizState = { step: 0 };
    renderPatternQuiz(stage, quizState);
  }

  function renderPatternQuiz(stage, quizState) {
    const quiz = stage.quizzes[quizState.step];
    clearGrid();
    // 커스텀 세로 레이아웃 (그리드 대신 flex). 시퀀스 행 + 보기 행.
    gridEl.style.display = "flex";
    gridEl.style.flexDirection = "column";
    gridEl.style.justifyContent = "center";
    gridEl.style.alignItems = "center";
    // 문항 ↔ 정답지 사이 간격을 넉넉히
    gridEl.style.gap = "clamp(34px, 8vh, 84px)";

    instructionEl.innerHTML =
      `<span><span class="accent">${quiz.len}번째</span> 구슬은 무슨 색일까? ` +
      `<span class="pattern-step">${quizState.step + 1} / ${stage.quizzes.length}</span></span>`;

    // 시퀀스 행: 번호가 붙은 색 구슬들(1~len-1) + 마지막 len번 무채색 정답칸
    const seqRow = document.createElement("div");
    seqRow.className = "pattern-row";
    quiz.sequence.forEach((color, i) => {
      const cell = document.createElement("div");
      cell.className = "marble pattern-cell";
      cell.style.setProperty("--hue", color);
      cell.textContent = String(i + 1);
      seqRow.appendChild(cell);
    });
    const unknown = document.createElement("div");
    unknown.className = "marble pattern-cell pattern-unknown";
    unknown.textContent = String(quiz.len); // 9 또는 10번
    seqRow.appendChild(unknown);
    gridEl.appendChild(seqRow);

    // 보기 행: 클릭 가능한 구슬 3개
    const choiceRow = document.createElement("div");
    choiceRow.className = "pattern-choices";
    quiz.choices.forEach((color) => {
      const c = makeMarble({ color: color, aria: "보기 구슬" });
      c.classList.add("pattern-choice");
      const isAnswer = (color === quiz.answer_color);
      c.addEventListener("click", () => onPatternClick(c, isAnswer, unknown, stage, quizState));
      choiceRow.appendChild(c);
    });
    gridEl.appendChild(choiceRow);
  }

  function onPatternClick(c, isAnswer, unknownCell, stage, quizState) {
    if (state.locked) return;
    if (c.disabled) return;
    if (!isAnswer) {
      shake(c);
      showToast(randomEncourage());
      sfxWrong();
      return;
    }

    // 정답 → 무채색 정답칸을 정답 색으로 공개 (번호는 그대로 유지)
    sfxPop();
    state.locked = true;
    const color = c.style.getPropertyValue("--hue");
    unknownCell.classList.remove("pattern-unknown");
    unknownCell.style.setProperty("--hue", color);
    unknownCell.classList.add("reveal-pulse");
    setTimeout(() => unknownCell.classList.remove("reveal-pulse"), 280);
    c.classList.add("pattern-picked");

    const next = quizState.step + 1;
    if (next >= stage.quizzes.length) {
      setTimeout(() => onStageClear(), 900);
    } else {
      showToast("정답이야! 다음 문제~");
      sfxStageClear();
      setTimeout(() => {
        state.locked = false;
        quizState.step = next;
        renderPatternQuiz(stage, quizState);
      }, 1100);
    }
  }

  // -------------------------------------------------------------------
  // 클릭 처리
  // -------------------------------------------------------------------
  function shake(el) {
    el.classList.remove("shake");
    void el.offsetWidth; // reflow
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 450);
  }

  function pop(el) {
    // PRD: 터진 구슬은 화면에서 사라지지만 그리드 슬롯은 그대로 유지한다
    // (.pop 애니메이션이 forwards 라서 opacity:0, scale:0.05 상태로 고정되고
    //  pointer-events:none 도 유지되어 더 이상 클릭되지 않는다)
    el.classList.add("pop");
    el.setAttribute("aria-hidden", "true");
    el.disabled = true;
  }

  function onClick(el, isCorrect, mode, sfxFn, clearDelay) {
    if (state.locked) return;
    if (!isCorrect) {
      shake(el);
      showToast(randomEncourage());
      sfxWrong();
      return;
    }

    // 정답
    state.locked = true;
    if (sfxFn) sfxFn();
    else sfxPop();
    pop(el);
    state.remaining_targets -= 1;

    setTimeout(() => { state.locked = false; }, 180);

    if (mode === "single" || state.remaining_targets <= 0) {
      // 단계 성공 트리거. clearDelay 가 주어지면 그만큼 기다렸다가 호출
      // (예: 10단계 마지막 'C' 음과 환호 소리가 겹치지 않도록 700ms 지연).
      if (clearDelay && clearDelay > 0) {
        setTimeout(() => onStageClear(), clearDelay);
      } else {
        onStageClear();
      }
    }
  }

  function randomEncourage() {
    const arr = [
      "다시 한번 찾아보자! ( T_T )",
      "조금만 천천히 해보자! (•́︿•̀)",
      "음~ 이건 아닐지도 몰라!",
      "괜찮아, 다시 찾아보자!",
      `${KIDS}, 자세히 보면 보일 거야! ✨`,
    ];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 단계 성공용 응원 메시지 풀 (정연·정우 이름 자연스럽게 섞기)
  const STAGE_CLEAR_MESSAGES = [
    "다음 단계로 가보자~ 🚂",
    `${KIDS}, 정말 잘했어!`,
    "와~ 멋져! 다음 칸도 가보자!",
    "척척척, 다음 놀이 출발~",
    `${KIDS}, 다음도 같이 해보자!`,
  ];
  function pickClearMsg() {
    return STAGE_CLEAR_MESSAGES[Math.floor(Math.random() * STAGE_CLEAR_MESSAGES.length)];
  }

  // -------------------------------------------------------------------
  // 단계 성공 / 최종 성공
  // -------------------------------------------------------------------
  async function onStageClear() {
    const cur = stages[state.current_stage];
    const next = state.current_stage + 1;
    const isLastStage = (next >= stages.length);

    // 스테이지별 특수 성공 이펙트
    if (cur.id === 10) {
      // 한글 기차: 환호 → 진짜 기차가 화면을 가로지름
      // (10단계는 onClick 이 마지막 음 뒤 700ms 딜레이로 호출하므로 겹치지 않음)
      sfxCheer();
      await sleep(CHEER_MS + CHEER_TO_TRAIN_GAP);
      await playTrain(cur);
    } else if (cur.id === 12) {
      // 알파벳 맞추기: 환호 → 알파벳이 사방으로 터지는 폭죽
      sfxCheer();
      await playAlphabetFireworks();
    } else if (!isLastStage) {
      sfxStageClear();
    }
    // 마지막 단계(특수 이펙트 없음)는 아래 최종 카드에서 sfxFinal 로 마무리

    if (isLastStage) {
      // 마지막 단계 완주 → 최종 성공 카드 + 캔버스 폭죽
      sfxFinal();
      updateProgress(stages.length); // 모두 done
      finalEl.classList.add("show");
      startFireworks();
      return;
    }

    await showBanner(`${state.current_stage + 1}단계 성공!`, pickClearMsg(), 1800);
    state.current_stage = next;
    updateProgress(state.current_stage);
    renderStage(stages[state.current_stage]);
  }

  // -------------------------------------------------------------------
  // 알파벳 폭죽 (9단계 성공 보상): 알파벳 글자들이 사방으로 터져 나감
  // -------------------------------------------------------------------
  function playAlphabetFireworks() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "alpha-overlay";
      document.body.appendChild(overlay);

      const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
      const COLORS = ["#E53935","#FB8C00","#FDD835","#43A047","#1E88E5","#8E24AA","#ff6fa5","#00b894"];
      const waves = 4;

      function spawnBurst() {
        const cx = window.innerWidth  * (0.25 + Math.random() * 0.5);
        const cy = window.innerHeight * (0.25 + Math.random() * 0.35);
        const n = 22;
        // 폭죽 팡! 소리
        sfxPop();
        tone(1200 + Math.random() * 400, 0.18, "triangle", 0.12, 0);
        for (let i = 0; i < n; i++) {
          const el = document.createElement("span");
          el.className = "alpha-particle";
          el.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
          el.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
          el.style.left = cx + "px";
          el.style.top  = cy + "px";
          overlay.appendChild(el);
          const ang  = (Math.PI * 2 * i) / n + Math.random() * 0.4;
          const dist = 140 + Math.random() * 280;
          const dx = Math.cos(ang) * dist;
          const dy = Math.sin(ang) * dist - 40; // 살짝 위로 솟았다가
          const rot = Math.random() * 720 - 360;
          const scl = 0.6 + Math.random() * 1.3;
          requestAnimationFrame(() => {
            el.style.transform = `translate(${dx}px, ${dy + 90}px) rotate(${rot}deg) scale(${scl})`;
            el.style.opacity = "0";
          });
          setTimeout(() => el.remove(), 1700);
        }
      }

      for (let w = 0; w < waves; w++) setTimeout(spawnBurst, w * 420);
      setTimeout(() => { overlay.remove(); resolve(); }, waves * 420 + 1500);
    });
  }

  // -------------------------------------------------------------------
  // 한글 기차 애니메이션 (마지막 10단계 성공 보상)
  // -------------------------------------------------------------------
  function playTrain(stage) {
    trainEl.innerHTML = "";

    // 기차는 왼쪽 → 오른쪽 으로 달린다. flex 의 가장 오른쪽 요소가 진행 방향의
    // 선두(leading edge)가 되므로:
    //   DOM 순서 :  💨  하  파  ...  나  가  🚂
    //   시각적 순서: [좌] 트레일 ───────────  선두 [우]
    // 관찰자에게는 🚂 → 가 → 나 → ... → 하 → 💨 순으로 지나간다.

    // 꼬리(연기) - 가장 왼쪽 = 트레일링
    const smoke = document.createElement("span");
    smoke.className = "smoke";
    smoke.textContent = "💨";
    trainEl.appendChild(smoke);

    // 객차: 하 → 가 (역순으로 DOM 추가). 시각적으로는 통과 시 가→하 알파벳순.
    for (let i = stage.order.length - 1; i >= 0; i--) {
      const ch = stage.order[i];
      const idx = stage.chars.indexOf(ch);
      const color = stage.colors[idx] || "#ffb7d3";

      // 객차들 사이의 연결고리: 첫 객차(하) 앞에는 추가하지 않음
      if (i < stage.order.length - 1) {
        const link = document.createElement("span");
        link.className = "coupling";
        trainEl.appendChild(link);
      }

      const car = document.createElement("span");
      car.className = "car";
      car.style.setProperty("--c", color);
      car.textContent = ch;
      trainEl.appendChild(car);
    }

    // 기관차와 마지막 객차(가) 사이 연결고리
    const lastLink = document.createElement("span");
    lastLink.className = "coupling";
    trainEl.appendChild(lastLink);

    // 기관차 - 가장 오른쪽 = 선두
    const loco = document.createElement("span");
    loco.className = "loco";
    loco.textContent = "🚂";
    trainEl.appendChild(loco);

    // 애니메이션 트리거
    trainOverlay.classList.add("run");
    void trainEl.offsetWidth; // reflow
    trainEl.classList.add("run");
    sfxTrain();

    return new Promise((resolve) => {
      setTimeout(() => {
        trainOverlay.classList.remove("run");
        trainEl.classList.remove("run");
        resolve();
      }, 4800);
    });
  }

  function sfxTrain() {
    // 기적 소리 (높→낮)
    tone(880, 0.20, "sine", 0.20, 0);
    tone(660, 0.26, "sine", 0.20, 0.20);
    // 칙칙폭폭 (느려진 속도에 맞춰 펄스 수와 간격을 늘림)
    const start = 0.65;
    const interval = 0.34;
    const pulses = 12;
    for (let i = 0; i < pulses; i++) {
      tone(110, 0.07, "square", 0.16, start + i * interval);
    }
  }

  // -------------------------------------------------------------------
  // 폭죽 애니메이션 (Canvas)
  // -------------------------------------------------------------------
  let fwRunning = false;
  function startFireworks() {
    if (fwRunning) return;
    fwRunning = true;
    const ctx = fwCanvas.getContext("2d");
    function resize() {
      fwCanvas.width = window.innerWidth;
      fwCanvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const particles = [];
    const colors = ["#ff7aa2","#7ac6ff","#ffd166","#9be08a","#c780fa","#ff9f45","#ff5a6a"];

    function burst(x, y) {
      const n = 50 + Math.floor(Math.random() * 30);
      const c = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const sp = 3 + Math.random() * 4;
        particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          color: c,
          size: 2 + Math.random() * 2.5,
        });
      }
    }

    let lastBurst = 0;
    function frame(ts) {
      ctx.fillStyle = "rgba(255, 245, 250, 0.18)";
      ctx.fillRect(0, 0, fwCanvas.width, fwCanvas.height);

      if (ts - lastBurst > 650) {
        burst(
          fwCanvas.width * (0.15 + Math.random() * 0.7),
          fwCanvas.height * (0.2 + Math.random() * 0.45)
        );
        lastBurst = ts;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.06; // gravity
        p.life -= 0.012;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (fwRunning) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------
  // 시작 / 재시작
  // -------------------------------------------------------------------
  function startGame() {
    state.current_stage = 0;
    updateProgress(0);
    renderStage(stages[0]);
  }

  restartBtn.addEventListener("click", () => {
    // 페이지 리로드 → Streamlit 재실행 → 새 random 데이터
    finalEl.classList.remove("show");
    fwRunning = false;
    // 부모 프레임에 알리기 (있을 때만), 아니면 자기 reload
    try {
      if (window.parent && window.parent !== window) {
        window.parent.location.reload();
        return;
      }
    } catch (e) { /* cross-origin이면 자기만 리로드 */ }
    window.location.reload();
  });

  // 사용자 첫 인터랙션 후 AudioContext 깨우기 (브라우저 정책)
  document.addEventListener("pointerdown", () => { ac(); }, { once: true });

  // 윈도우 리사이즈 + 폰트 로딩 + iframe 마운트 등으로 인한 사이즈 변동을
  // 한 곳에서 처리: marble-area 가 실제로 차지한 영역이 바뀔 때마다
  // 그리드 컬럼/행과 마블 크기를 재계산한다.
  let _roT = 0;
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      clearTimeout(_roT);
      _roT = setTimeout(refreshGrid, 16);
    });
    ro.observe(marbleArea);
  } else {
    window.addEventListener("resize", refreshGrid);
  }

  // 게임 시작
  startGame();
})();
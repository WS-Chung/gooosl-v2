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
  const stagePillEl   = $("#stage-pill");
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
    return Math.min(5, Math.ceil(Math.sqrt(count)));
  }

  function updateProgress(stageIdx) {
    dotsEl.innerHTML = "";
    for (let i = 0; i < stages.length; i++) {
      const d = document.createElement("span");
      d.className = "d" + (i < stageIdx ? " done" : (i === stageIdx ? " now" : ""));
      dotsEl.appendChild(d);
    }
    stagePillEl.textContent = `${stageIdx + 1}단계 / ${stages.length}`;
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

    // 이전 스테이지에서 남았을 수 있는 7단계 트레이 흔적 정리
    marbleArea.removeAttribute("data-stage");
    const oldTray = document.getElementById("tray-panel");
    if (oldTray) oldTray.remove();

    stageTitleEl.textContent = stage.title;
    clearGrid();
    setupGrid(stage.count, stage.cols);

    // 인스트럭션 (3·6·7단계는 색칩 등 강조 포함)
    if (stage.id === 3) {
      instructionEl.innerHTML =
        `<span class="color-chip" style="background:${stage.target_color}"></span>` +
        `<span class="accent">${stage.target_color_name}</span> 구슬을 모두 찾아보자!`;
    } else if (stage.id === 6) {
      instructionEl.innerHTML =
        `<span class="color-chip" style="background:${stage.ref_color}"></span>` +
        `<span class="accent">${stage.ref_color_name}</span> 구슬 ` +
        `<span class="accent">${stage.direction}</span>에 있는 구슬을 찾아봐~`;
    } else if (stage.id === 7) {
      const t = stage.targets;
      instructionEl.innerHTML =
        `<span class="color-chip" style="background:${t[0].color}"></span>` +
        `<span class="accent">${t[0].name}</span> 구슬 ` +
        `<span class="accent">${t[0].count}개</span>와 ` +
        `<span class="color-chip" style="background:${t[1].color}"></span>` +
        `<span class="accent">${t[1].name}</span> 구슬 ` +
        `<span class="accent">${t[1].count}개</span>를 접시에 올려줘!`;
    } else {
      instructionEl.textContent = stage.instruction;
    }

    if (stage.id === 1) renderStage1(stage);
    else if (stage.id === 2) renderStage2(stage);
    else if (stage.id === 3) renderStage3(stage);
    else if (stage.id === 4) renderStage4(stage);
    else if (stage.id === 5) renderStage5(stage);
    else if (stage.id === 6) renderStage6(stage);
    else if (stage.id === 7) renderStage7(stage);
    else if (stage.id === 8) renderStage8(stage);
    else if (stage.id === 9) renderStage9(stage);
    else if (stage.id === 10) renderStage10(stage);
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

  // [1] 큰 구슬
  function renderStage1(stage) {
    for (let i = 0; i < stage.count; i++) {
      const isBig = (i === stage.big_index);
      const m = makeMarble({
        color: stage.colors[i],
        extraClass: isBig ? ["big"] : [],
        aria: isBig ? "가장 큰 구슬" : "구슬",
      });
      m.addEventListener("click", () => onClick(m, isBig, "single"));
      gridEl.appendChild(m);
    }
  }

  // [2] 불 켜진 구슬
  function renderStage2(stage) {
    const lit = new Set(stage.lit_indices);
    for (let i = 0; i < stage.count; i++) {
      const isLit = lit.has(i);
      const m = makeMarble({
        extraClass: [isLit ? "bulb-on" : "bulb-off"],
        aria: isLit ? "반짝이는 구슬" : "꺼진 구슬",
      });
      m.addEventListener("click", () => onClick(m, isLit, "multi"));
      gridEl.appendChild(m);
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

  // [4] 숫자 1→9 순서
  function renderStage4(stage) {
    for (let i = 0; i < stage.count; i++) {
      const num = stage.numbers[i];
      const m = makeMarble({
        color: stage.colors[i],
        text: String(num),
        aria: `숫자 ${num}`,
      });
      m.dataset.num = num;
      m.addEventListener("click", () => {
        if (state.locked) return;
        const expected = state.current_target_index + 1;
        const ok = (num === expected);
        if (ok) {
          state.current_target_index += 1;
          onClick(m, true, "ordered");
        } else {
          shake(m);
          showToast("다음은 " + expected + "번이야!");
          sfxWrong();
        }
      });
      gridEl.appendChild(m);
    }
  }

  // [5] 모양이 다른 구슬
  function renderStage5(stage) {
    const diff = new Set(stage.different_indices);
    for (let i = 0; i < stage.count; i++) {
      const isDiff = diff.has(i);
      const m = makeMarble({
        color: stage.base_color,
        extraClass: isDiff ? [stage.pattern] : [],
      });
      m.addEventListener("click", () => onClick(m, isDiff, "multi"));
      gridEl.appendChild(m);
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

  // [7] 색·개수 놀이 - 드래그로 접시에 담기
  function renderStage7(stage) {
    // 좌·우 분할 레이아웃 활성화 (CSS 가 선택자로 적용)
    marbleArea.setAttribute("data-stage", "tray");

    // 트레이 상태 초기화
    const trayState = {
      counts: {},                // { "빨간색": 1, "파란색": 0 }
      targetMap: new Map(),      // name -> { color, name, count }
      panel: null, slots: null, counterEl: null,
    };
    for (const t of stage.targets) {
      trayState.counts[t.name] = 0;
      trayState.targetMap.set(t.name, t);
    }

    // 좌측: 슬롯 래퍼로 감싼 마블 배치 → 드래그로 떠올라도 그리드 칸 유지
    for (let i = 0; i < stage.count; i++) {
      const data = stage.marbles[i];
      const wrap = document.createElement("div");
      wrap.className = "tray-source-slot";

      const m = makeMarble({
        color: data.color,
        aria: `${data.name} 구슬`,
      });
      m.dataset.colorName = data.name;
      m.dataset.color = data.color;

      attachTrayDrag(m, stage, trayState);

      wrap.appendChild(m);
      gridEl.appendChild(wrap);
    }

    // 우측: 접시 패널을 marble-area 의 형제로 추가
    const panel = buildTrayPanel(stage);
    marbleArea.appendChild(panel);
    trayState.panel = panel;
    trayState.slots = panel.querySelector(".tray-slots");
    trayState.counterEl = panel.querySelector(".tray-counter");
    refreshTrayCounter(stage, trayState);
  }

  function buildTrayPanel(stage) {
    const panel = document.createElement("div");
    panel.id = "tray-panel";
    panel.className = "tray-panel";

    const label = document.createElement("div");
    label.className = "tray-label";
    label.textContent = "🍽 예쁜 접시";
    panel.appendChild(label);

    const slots = document.createElement("div");
    slots.className = "tray-slots";
    for (let i = 0; i < stage.tray_total; i++) {
      const s = document.createElement("div");
      s.className = "tray-slot";
      slots.appendChild(s);
    }
    panel.appendChild(slots);

    const counter = document.createElement("div");
    counter.className = "tray-counter";
    panel.appendChild(counter);

    return panel;
  }

  function refreshTrayCounter(stage, trayState) {
    trayState.counterEl.innerHTML = "";
    for (const t of stage.targets) {
      const item = document.createElement("div");
      item.className = "item";
      if (trayState.counts[t.name] >= t.count) item.classList.add("done");
      item.innerHTML =
        `<span class="chip" style="background:${t.color}"></span>` +
        `<span>${t.name} ${trayState.counts[t.name]} / ${t.count}</span>`;
      trayState.counterEl.appendChild(item);
    }
  }

  // 마블 한 개에 Pointer Events 기반 드래그를 부착.
  // 마우스/터치/펜을 단일 코드 경로로 처리하며, setPointerCapture 로 손가락이
  // 마블 밖으로 나가도 이벤트가 끊기지 않도록 보장한다.
  function attachTrayDrag(marble, stage, trayState) {
    let drag = null;

    marble.addEventListener("pointerdown", onDown);

    function onDown(e) {
      if (state.locked) return;
      if (marble.classList.contains("placed")) return;
      if (drag) return;

      e.preventDefault();

      const rect = marble.getBoundingClientRect();
      drag = {
        pointerId: e.pointerId,
        startX: rect.left,
        startY: rect.top,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        // position:fixed 컨테이닝 블록의 viewport 좌표 (브라우저별로 다름)
        cbX: 0,
        cbY: 0,
      };

      try { marble.setPointerCapture(e.pointerId); } catch (_) {}

      // 너비/높이를 명시적으로 박아두어 부모 분리 후에도 같은 크기 유지.
      marble.style.width  = drag.width  + "px";
      marble.style.height = drag.height + "px";
      marble.classList.add("dragging");

      // ★ Windows Chrome 좌표 보정:
      // .stage-wrap 의 backdrop-filter 처럼 ancestor 의 일부 CSS 속성이 있으면
      // position:fixed 의 기준점이 viewport 가 아니라 그 ancestor 박스가 된다.
      // (예: 좌측에 250px 떨어진 박스가 컨테이닝 블록이면 style.left=500 이
      //  실제로는 viewport 750 위치에 그려진다.)
      // 빈 좌표(0,0)를 한 번 그어 실제 viewport 위치를 측정 → 오프셋을 구한 뒤
      // 모든 좌표 계산에서 빼준다. 컨테이닝 블록이 viewport 인 브라우저(iOS 등)
      // 에서는 (0,0) 이 그대로 반환되어 보정값이 0 → no-op 으로 동작한다.
      marble.style.left = "0px";
      marble.style.top  = "0px";
      const probe = marble.getBoundingClientRect();
      drag.cbX = probe.left;
      drag.cbY = probe.top;

      // 컨테이닝 블록 좌표계로 환산하여 원래 위치에 정확히 안착
      marble.style.left = (rect.left - drag.cbX) + "px";
      marble.style.top  = (rect.top  - drag.cbY) + "px";

      marble.addEventListener("pointermove", onMove);
      marble.addEventListener("pointerup", onUp);
      marble.addEventListener("pointercancel", onCancel);
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const x = e.clientX - drag.offsetX - drag.cbX;
      const y = e.clientY - drag.offsetY - drag.cbY;
      marble.style.left = x + "px";
      marble.style.top  = y + "px";

      // 트레이 위로 호버되었을 때 시각적 강조 (clientX/Y 그대로 사용)
      if (trayState.panel) {
        const r = trayState.panel.getBoundingClientRect();
        const inside =
          e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom;
        trayState.panel.classList.toggle("over", inside);
      }
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      removeMoveListeners();

      if (trayState.panel) trayState.panel.classList.remove("over");
      const r = trayState.panel.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom;

      if (inside) {
        attemptDrop();
      } else {
        snapBack();
      }
    }

    function onCancel(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      removeMoveListeners();
      snapBack();
    }

    function removeMoveListeners() {
      marble.removeEventListener("pointermove", onMove);
      marble.removeEventListener("pointerup", onUp);
      marble.removeEventListener("pointercancel", onCancel);
      try { marble.releasePointerCapture(drag.pointerId); } catch (_) {}
    }

    function attemptDrop() {
      const colorName = marble.dataset.colorName;
      const target = trayState.targetMap.get(colorName);

      // 정답이 아닌 색상
      if (!target) {
        sfxWrong();
        showToast(`${colorName}은(는) 찾는 색이 아니야!`);
        snapBack(true);
        return;
      }
      // 해당 색이 이미 충분 (실제로는 가용 개수 == 찾을 개수라 거의 발생 안 함)
      if (trayState.counts[colorName] >= target.count) {
        sfxWrong();
        showToast(`${colorName} 구슬은 이미 충분해!`);
        snapBack(true);
        return;
      }

      // 정답 → 접시 슬롯으로 안착
      sfxPop();
      placeInTraySlot();
      trayState.counts[colorName] += 1;
      refreshTrayCounter(stage, trayState);

      // 모든 조건 충족 검사
      const allDone = stage.targets.every(t =>
        (trayState.counts[t.name] || 0) >= t.count
      );
      if (allDone) {
        // 0.3초 후 단계 성공 처리 (마지막 안착 애니메이션이 끝나도록)
        state.locked = true;
        setTimeout(() => onStageClear(), 320);
      }
    }

    function placeInTraySlot() {
      // 비어있는 다음 슬롯 찾기
      const allSlots = trayState.slots.querySelectorAll(".tray-slot");
      let slot = null;
      for (const s of allSlots) {
        if (s.children.length === 0) { slot = s; break; }
      }
      if (!slot) slot = trayState.slots; // fallback

      const tr = slot.getBoundingClientRect();

      // 슬롯의 테두리(2px dashed)를 제외한 컨텐츠 박스 사이즈를 정확히 계산.
      // 이 사이즈가 곧 안착 후 CSS 의 .tray-slot > .marble { width:100% } 값과
      // 일치하므로, 스냅 종료 시점에 사이즈 점프가 일어나지 않는다.
      const slotCS = window.getComputedStyle(slot);
      const bL = parseFloat(slotCS.borderLeftWidth)  || 0;
      const bR = parseFloat(slotCS.borderRightWidth) || 0;
      const bT = parseFloat(slotCS.borderTopWidth)   || 0;
      const bB = parseFloat(slotCS.borderBottomWidth)|| 0;
      const placedW = Math.max(0, tr.width  - bL - bR);
      const placedH = Math.max(0, tr.height - bT - bB);
      const targetX = tr.left + bL + (tr.width  - bL - bR - placedW) / 2;
      const targetY = tr.top  + bT + (tr.height - bT - bB - placedH) / 2;

      marble.classList.remove("dragging");
      marble.classList.add("snapping");
      // 컨테이닝 블록 좌표계로 환산
      marble.style.left   = (targetX - drag.cbX) + "px";
      marble.style.top    = (targetY - drag.cbY) + "px";
      marble.style.width  = placedW + "px";
      marble.style.height = placedH + "px";
      marble.style.transform = "scale(1)";

      const settle = () => {
        // 슬롯에 재배치 + 인라인 스타일 정리. 이후 사이즈는
        // CSS .tray-slot > .marble { width:100%; height:100% } 가 책임진다.
        slot.appendChild(marble);
        marble.classList.remove("snapping");
        marble.classList.add("placed");
        marble.style.position = "";
        marble.style.left = "";
        marble.style.top = "";
        marble.style.transform = "";
        marble.style.width = "";
        marble.style.height = "";
        drag = null;
      };
      setTimeout(settle, 280);
    }

    function snapBack(withShake) {
      if (!drag) return;
      if (withShake) {
        marble.classList.add("shake");
        setTimeout(() => marble.classList.remove("shake"), 420);
      }
      marble.classList.remove("dragging");
      marble.classList.add("snapping");
      // 컨테이닝 블록 좌표계로 환산
      marble.style.left = (drag.startX - drag.cbX) + "px";
      marble.style.top  = (drag.startY - drag.cbY) + "px";
      marble.style.transform = "scale(1)";

      setTimeout(() => {
        marble.classList.remove("snapping");
        marble.style.position = "";
        marble.style.left = "";
        marble.style.top = "";
        marble.style.transform = "";
        marble.style.width = "";
        marble.style.height = "";
        drag = null;
      }, 280);
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

  // [9] 따라 해봐! - 색 시퀀스 메모리
  // 9개 서로 다른 색의 구슬 중 3개가 차례로 빛나며 효과음을 들려주고,
  // 아이는 같은 순서로 콕콕 누른다. 틀리면 데모를 다시 보여준다.
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

    // 짧은 지연 후 데모 시작 (그리드 레이아웃이 안정된 뒤)
    setTimeout(() => playSimonDemo(simonState), 500);
  }

  async function playSimonDemo(simonState) {
    state.locked = true;
    simonState.demoBusy = true;
    simonState.progress = 0;

    await showBanner("잘 봐!", "구슬이 빛나는 순서를 기억하자~", 1400);

    for (let i = 0; i < simonState.sequence.length; i++) {
      const idx = simonState.sequence[i];
      await pulseMarbleDemo(simonState.marbles[idx]);
    }

    await showBanner("이제 따라해봐!", "순서대로 콕콕 눌러보자!", 1400);

    state.locked = false;
    simonState.demoBusy = false;
  }

  async function pulseMarbleDemo(m) {
    // 5~6세 아이가 따라가기에 충분한 속도로 1.5배 늘려둠.
    const idx = parseInt(m.dataset.idx) || 0;
    const freq = SIMON_TONES[idx % SIMON_TONES.length];
    tone(freq, 0.63, "triangle", 0.24, 0);
    m.classList.add("simon-light");
    await sleep(720);
    m.classList.remove("simon-light");
    await sleep(300);
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
    // 마지막 단계(10단계)는 짧은 환호 소리로 마무리. 그 외 단계는 기존 상승 코드.
    // 10단계는 onClick 측에서 700ms 딜레이를 두고 호출하므로 마지막 음과
    // 환호가 겹치지 않는다.
    const isLastStage = (state.current_stage + 1 >= stages.length);
    if (isLastStage) {
      sfxCheer();
    } else {
      sfxStageClear();
    }
    const next = state.current_stage + 1;
    if (next >= stages.length) {
      finalClear();
      return;
    }
    await showBanner(`${state.current_stage + 1}단계 성공!`, pickClearMsg(), 1800);
    state.current_stage = next;
    updateProgress(state.current_stage);
    renderStage(stages[state.current_stage]);
  }

  async function finalClear() {
    // 마지막 스테이지(현재 10단계: 한글 기차)를 성공하면 진짜 기차가
    // 화면을 가로지른 뒤 폭죽 + 성공 카드가 등장한다.
    // 환호는 onStageClear 에서 이미 시작됐으므로, 환호가 다 끝나고
    // 짧은 침묵 구간을 둔 뒤에 기차 사운드가 자연스럽게 이어지도록 기다린다.
    await sleep(CHEER_MS + CHEER_TO_TRAIN_GAP);
    const lastStage = stages[stages.length - 1];
    await playTrain(lastStage);
    sfxFinal();
    updateProgress(stages.length); // 모두 done
    finalEl.classList.add("show");
    startFireworks();
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

/* game/data.py 의 JavaScript 포팅. Math.random() 기반.
 * 모든 스테이지의 색상·위치·정답을 매 페이지 로드 시 새로 생성한다.
 * Python 의 random.shuffle / sample / choice / randint / randrange / uniform
 * 동작에 1:1 대응하는 헬퍼를 두고 그 위에 generator 함수들을 구현했다.
 */
(function (window) {
  // ─────────────────────────────────────────────────────────────
  //  Random 헬퍼 (Python random 모듈 대응)
  // ─────────────────────────────────────────────────────────────
  function randrange(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }
  function randint(a, b) {
    // inclusive 양쪽 끝
    return a + Math.floor(Math.random() * (b - a + 1));
  }
  function uniform(a, b) {
    return a + Math.random() * (b - a);
  }
  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, k) {
    // k 개의 서로 다른 원소를 무작위로 추출 (Python random.sample)
    return shuffle(arr).slice(0, k);
  }
  function range(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(i);
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  //  상수 (data.py 와 동일)
  // ─────────────────────────────────────────────────────────────

  // 1·5단계: 부드러운 파스텔 (배경과 잘 어울리는 톤)
  const PASTEL_PALETTE = [
    "#FF9AA2", "#FFB7B2", "#FFDAC1", "#FFE49C", "#E2F0CB",
    "#B5EAD7", "#A0E7E5", "#C7CEEA", "#D5AAFF", "#F8B4D9",
  ];

  // 4단계 색상 매칭 놀이용 (무지개 6색).
  // 남색은 파란색과 유사해 같은 화면에 함께 등장 시 혼동을 줄 수 있어 제외.
  const MISSION_COLORS = {
    "#E53935": "빨간색",
    "#FB8C00": "주황색",
    "#FDD835": "노란색",
    "#43A047": "초록색",
    "#1E88E5": "파란색",
    "#8E24AA": "보라색",
  };

  // 6·7·8단계: 어린이용 무지개 7원색 + 보조 3색.
  // 우선적으로 PRIMARY(빨주노초파남보) 에서 채우고, 더 필요한 단계에 한해
  // SUPPLEMENTARY(분홍·갈색·청록) 를 추가 투입한다 (pickPrioritizedColors 참조).
  const NAMED_PRIMARY = [
    ["#E53935", "빨간색"],
    ["#FB8C00", "주황색"],
    ["#FDD835", "노란색"],
    ["#43A047", "초록색"],
    ["#1E88E5", "파란색"],   // 약간 짙은 하늘색
    ["#0D47A1", "남색"],     // 매우 진한 파란색
    ["#8E24AA", "보라색"],
  ];
  const NAMED_SUPPLEMENTARY = [
    ["#EC407A", "분홍색"],
    ["#6D4C41", "갈색"],
    ["#00897B", "청록색"],
  ];
  // 통합 풀이 필요한 곳을 위해 호환용으로도 노출 (현재 코드에서는 거의 미사용)
  const NAMED_COLORS = NAMED_PRIMARY.concat(NAMED_SUPPLEMENTARY);

  // 6단계 방향: [한글 이름, row 변화량, col 변화량]
  const DIRECTIONS = [
    ["위",     -1,  0],
    ["아래",    1,  0],
    ["왼쪽",    0, -1],
    ["오른쪽",  0,  1],
  ];

  // 10단계 한글 자음 (가나다순) 14자
  const HANGUL_ORDER = [
    "가", "나", "다", "라", "마", "바", "사",
    "아", "자", "차", "카", "타", "파", "하",
  ];

  // ─────────────────────────────────────────────────────────────
  //  HSL 색상환 균등 분할 → N 개 고유 색상
  // ─────────────────────────────────────────────────────────────
  function generateDistinctColors(n, saturation, lightness, hueJitter) {
    if (saturation === undefined) saturation = 72;
    if (lightness  === undefined) lightness  = 68;
    if (hueJitter  === undefined) hueJitter  = 6;

    const baseOffset = uniform(0, 360);
    const step = 360.0 / n;
    const hues = [];
    for (let i = 0; i < n; i++) {
      let h = (baseOffset + i * step + uniform(-hueJitter, hueJitter)) % 360;
      if (h < 0) h += 360;
      hues.push(Math.floor(h));
    }
    const shuffled = shuffle(hues);
    return shuffled.map((h) => "hsl(" + h + ", " + saturation + "%, " + lightness + "%)");
  }

  // 무지개 7원색을 우선 채우고, 부족한 만큼만 보조 색상에서 추가로 뽑는다.
  // 반환값은 [hex, name] tuple 배열 (랜덤 순서). N 이 7 이하면 무지개에서만 추출.
  function pickPrioritizedColors(n) {
    const primary = shuffle(NAMED_PRIMARY);
    if (n <= primary.length) return primary.slice(0, n);
    const need = n - primary.length;
    const sup = shuffle(NAMED_SUPPLEMENTARY).slice(0, need);
    return primary.concat(sup);
  }

  // ─────────────────────────────────────────────────────────────
  //  스테이지별 데이터 생성기
  // ─────────────────────────────────────────────────────────────

  function generateStage1() {
    const count = 12;
    const big_index = randrange(count);
    const colors = [];
    for (let i = 0; i < count; i++) colors.push(choice(PASTEL_PALETTE));
    return {
      id: 1,
      title: "어떤 구슬이 가장 클까?",
      instruction: "가장 큰 구슬을 콕! 찾아보자",
      count: count,
      colors: colors,
      big_index: big_index,
      big_scale: 1.2,
      targets_total: 1,
    };
  }

  function generateStage2() {
    const count = 15;
    const lit_count = randint(3, 6);
    const lit_indices = sample(range(count), lit_count).slice().sort((a, b) => a - b);
    return {
      id: 2,
      title: "반짝반짝 불이 켜진 구슬!",
      instruction: "반짝이는 구슬을 모두 찾아 톡 터뜨려보자",
      count: count,
      lit_indices: lit_indices,
      targets_total: lit_count,
    };
  }

  function generateStage3() {
    const count = 12;
    const palette_keys = sample(Object.keys(MISSION_COLORS), 4);
    const target_color = choice(palette_keys);
    const other_colors = palette_keys.filter((c) => c !== target_color);

    const target_count = randint(3, 5);
    const target_indices = sample(range(count), target_count);
    const target_set = new Set(target_indices);

    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(target_set.has(i) ? target_color : choice(other_colors));
    }

    const target_name = MISSION_COLORS[target_color];
    return {
      id: 3,
      title: "똑같은 색깔 구슬 모으기",
      instruction: target_name + " 구슬을 모두 찾아보자!",
      count: count,
      colors: colors,
      target_color: target_color,
      target_color_name: target_name,
      target_indices: target_indices.slice().sort((a, b) => a - b),
      targets_total: target_count,
    };
  }

  function generateStage4() {
    const count = 9;
    const numbers = shuffle(range(count).map((i) => i + 1));
    const colors = generateDistinctColors(count);
    return {
      id: 4,
      title: "차례차례 숫자 세기",
      instruction: "1부터 9까지 순서대로 콕콕 눌러보자",
      count: count,
      numbers: numbers,
      colors: colors,
      targets_total: count,
    };
  }

  function generateStage5() {
    const count = 12;
    const different_indices = sample(range(count), 2).slice().sort((a, b) => a - b);
    const base_color = choice(PASTEL_PALETTE);
    const pattern = choice(["pattern-stripe", "pattern-star"]);
    return {
      id: 5,
      title: "모양이 다른 구슬 찾기",
      instruction: "살~짝 다른 구슬 두 개를 찾아보자",
      count: count,
      base_color: base_color,
      different_indices: different_indices,
      pattern: pattern,
      targets_total: 2,
    };
  }

  function generateStage6Position() {
    const cols = 3, rows = 3;
    const count = cols * rows;

    // 9칸 → 무지개 7색 + 보조 2색을 priority 헬퍼로 자동 구성, 위치는 무작위
    const chosen = shuffle(pickPrioritizedColors(count));

    const colors = chosen.map((p) => p[0]);
    const color_names = chosen.map((p) => p[1]);

    const dirEntry = choice(DIRECTIONS);
    const dir_name = dirEntry[0], dr = dirEntry[1], dc = dirEntry[2];
    const candidates = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          candidates.push([r, c]);
        }
      }
    }
    const refRC = choice(candidates);
    const ref_r = refRC[0], ref_c = refRC[1];
    const ans_r = ref_r + dr, ans_c = ref_c + dc;

    const ref_index = ref_r * cols + ref_c;
    const answer_index = ans_r * cols + ans_c;

    return {
      id: 6,
      title: "어디에 있는 구슬일까?",
      instruction: "",
      count: count,
      cols: cols,
      rows: rows,
      colors: colors,
      color_names: color_names,
      ref_index: ref_index,
      ref_color: colors[ref_index],
      ref_color_name: color_names[ref_index],
      direction: dir_name,
      answer_index: answer_index,
      targets_total: 1,
    };
  }

  function generateStage7Tray() {
    const total = choice([3, 4]);
    const n = randint(1, total - 1);
    const m = total - n;

    // 정답 2색 + 디스트랙터 풀 3색 = 총 5색만 필요 → 모두 무지개에서 추출
    const pool = pickPrioritizedColors(5);
    const target_a = pool[0];
    const target_b = pool[1];
    const distractor_pool = pool.slice(2, 5);

    const grid_count = randint(9, 12);
    const distractor_count = grid_count - n - m;
    const distractors = [];
    for (let i = 0; i < distractor_count; i++) {
      distractors.push(choice(distractor_pool));
    }

    let marbles_arr = [];
    for (let i = 0; i < n; i++) marbles_arr.push(target_a);
    for (let i = 0; i < m; i++) marbles_arr.push(target_b);
    marbles_arr = marbles_arr.concat(distractors);
    const marbles_shuffled = shuffle(marbles_arr);

    return {
      id: 7,
      title: "예쁜 접시에 담아줘",
      instruction: "",
      count: grid_count,
      marbles: marbles_shuffled.map((p) => ({ color: p[0], name: p[1] })),
      targets: [
        { color: target_a[0], name: target_a[1], count: n },
        { color: target_b[0], name: target_b[1], count: m },
      ],
      tray_total: n + m,
      targets_total: 1,
    };
  }

  function generateStage8Memory() {
    const pairs_count = 6;
    const count = pairs_count * 2;

    // 6쌍 → 모두 무지개 원색에서 추출 (7원색 중 6개를 임의 선택)
    const chosen = pickPrioritizedColors(pairs_count).map((p) => p[0]);
    const marbles = shuffle(chosen.concat(chosen));

    return {
      id: 8,
      title: "똑같은 짝꿍 찾기",
      instruction: "구슬을 두 개씩 뒤집어서 똑같은 짝을 찾아보자!",
      count: count,
      cols: 4,
      colors: marbles,
      pairs_count: pairs_count,
      targets_total: pairs_count,
    };
  }

  function generateStage9Simon() {
    const count = 9;
    const sequence_len = 4;
    const colors = generateDistinctColors(count);
    const sequence = sample(range(count), sequence_len);
    return {
      id: 9,
      title: "따라 해봐!",
      instruction: "구슬이 빛나는 순서대로 콕콕 눌러보자!",
      count: count,
      cols: 3,
      colors: colors,
      sequence: sequence,
      sequence_len: sequence_len,
      targets_total: sequence_len,
    };
  }

  function generateStage10() {
    const count = HANGUL_ORDER.length;
    const chars = shuffle(HANGUL_ORDER);
    const colors = generateDistinctColors(count);
    return {
      id: 10,
      title: "한글 기차 출발!",
      instruction: "가, 나, 다... 순서대로 눌러서 기차를 출발시켜보자!",
      count: count,
      chars: chars,
      order: HANGUL_ORDER.slice(),
      colors: colors,
      targets_total: count,
    };
  }

  function generateAllStages() {
    return {
      stages: [
        // 새 난이도 곡선: 쉬운 인지 → 순차/공간 → 기억·소근육 → 한글 서열
        generateStage1(),         // 1단계: 가장 큰 구슬 (크기 변별)
        generateStage5(),         // 2단계: 모양 다른 (변별/집중)
        generateStage2(),         // 3단계: 반짝이는 구슬 (시각 인지)
        generateStage3(),         // 4단계: 색상 매칭
        generateStage4(),         // 5단계: 1→9 수 서열
        generateStage6Position(), // 6단계: 색·방향 공간 인지
        generateStage9Simon(),    // 7단계: 따라 해봐! 순차 기억
        generateStage7Tray(),     // 8단계: 색·개수 드래그
        generateStage8Memory(),   // 9단계: 짝 찾기 (작업 기억)
        generateStage10(),        // 10단계: 한글 기차 (마지막)
      ],
      palette: PASTEL_PALETTE,
      mission_colors: MISSION_COLORS,
    };
  }

  // 외부 노출:
  //  - generateAllStages: 향후 in-place 재시작에 쓸 수 있는 생성 함수
  //  - GAME_DATA: 페이지 로드 시점의 게임 데이터 (game.js 가 그대로 사용)
  window.generateAllStages = generateAllStages;
  window.GAME_DATA = generateAllStages();
})(window);

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
  //  상수 (data.py 와 동일 + 무지개 원색 톤으로 통일)
  // ─────────────────────────────────────────────────────────────

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

  // 모든 색을 띄우는 단계의 기본 풀:
  //   PRIMARY = 빨·주·노·초·파·남·보 무지개 7원색 (우선 사용)
  //   SUPPLEMENTARY = 분홍·갈색·에메랄드 (7개 초과로 색이 더 필요할 때만 투입)
  // pickPrioritizedColors(n) 가 N 에 따라 자동 조립한다.
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
    ["#FFCAD4", "분홍색"],
    ["#6D4C41", "갈색"],
    ["#00B894", "에메랄드색"],
  ];
  // 통합 풀이 필요한 곳을 위해 호환용으로도 노출
  const NAMED_COLORS = NAMED_PRIMARY.concat(NAMED_SUPPLEMENTARY);
  // 무지개 7원색의 hex 만 모은 편의 배열 (1·5·10단계가 사용)
  const RAINBOW_HEXES = NAMED_PRIMARY.map((p) => p[0]);

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
  //  무지개 7원색을 우선 채우고, 부족한 만큼만 보조 색상에서 추가로 뽑는다.
  //  반환값은 [hex, name] tuple 배열 (랜덤 순서). N 이 7 이하면 무지개에서만 추출.
  // ─────────────────────────────────────────────────────────────
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

  // [1단계] 반짝반짝 불이 켜진 구슬! (24개 확장 + 3판 반복)
  // 24개 중 9~12개에 불이 켜지고, 켜진 구슬을 누르면 사라지지 않고 일반(꺼진)
  // 구슬로 바뀐다. 한 판의 불을 모두 끄면 새 판이 시작되고, 총 3판을 모두
  // 끝내야 단계 성공. 무작위성은 data.js 가 소유하므로 3판치 불 배치를 미리 생성.
  function generateStage2() {
    const count = 24;
    const rounds = 3;
    const lit_rounds = [];
    for (let r = 0; r < rounds; r++) {
      const lit_count = randint(9, 12);
      const lit_indices = sample(range(count), lit_count).slice().sort((a, b) => a - b);
      lit_rounds.push(lit_indices);
    }
    return {
      id: 2,
      title: "반짝반짝 불이 켜진 구슬!",
      instruction: "반짝이는 구슬을 모두 콕 눌러서 불을 꺼보자!",
      count: count,
      rounds: rounds,
      lit_rounds: lit_rounds,
      targets_total: 0, // 렌더러가 라운드 상태로 직접 관리
    };
  }

  // [2단계] 똑같은 색깔 구슬 모으기 (24개 확장)
  // 4개 색상을 제시하고 그중 한 색을 5~6개 배치 → 그 색 구슬을 모두 찾는다.
  // 개수가 12→24 로 늘어난 것만으로 난이도를 높였다.
  function generateStage3() {
    const count = 24;
    const palette_keys = sample(Object.keys(MISSION_COLORS), 4);
    const target_color = choice(palette_keys);
    const other_colors = palette_keys.filter((c) => c !== target_color);

    const target_count = randint(5, 6);
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

  // [4단계] 차례차례 숫자 세기 (12개 · 오름차순 → 내림차순 2세부 단계)
  // 1~12 숫자를 무작위 배치. 먼저 1→12 오름차순으로 누르고, 성공하면 위치를
  // 새로 섞어 12→1 내림차순으로 누른다. 색은 장식(숫자로 식별)이라 반복 허용.
  function generateStage4() {
    const count = 12;
    function makeArrangement() {
      const numbers = shuffle(range(count).map((i) => i + 1));
      const colors = [];
      for (let i = 0; i < count; i++) colors.push(choice(RAINBOW_HEXES));
      return { numbers: numbers, colors: colors };
    }
    return {
      id: 4,
      title: "차례차례 숫자 세기",
      instruction: "1부터 12까지 순서대로 콕콕 눌러보자",
      count: count,
      // [0] = 오름차순 배치, [1] = 내림차순용 재배치
      arrangements: [makeArrangement(), makeArrangement()],
      targets_total: 0, // 렌더러가 오름/내림 2세부 단계로 직접 관리
    };
  }

  // [3단계·신규] 가장 많이 있는 구슬 찾기
  // 24개를 5색으로 분배: 분포 [8,5,5,4,2] = 24. 최다(8)를 도드라지게 해 한눈에 잘
  // 보이도록 했다. 먼저 "가장 많은" 색을 모두 없애고, 이어서 "가장 적은" 색을 모두
  // 없애는 2단계 세부 문제로 구성된다.
  function generateStage11() {
    const count = 24;
    const numColors = 5;
    // 대비가 뚜렷한 빨·주·노·초·파·보 6색 중 5색 사용
    const chosen = sample(Object.entries(MISSION_COLORS), numColors); // [hex, name] tuple 5개
    // 색 ↔ 개수 무작위 대응 (분포 [8,5,5,4,2])
    const template = [8, 5, 5, 4, 2];
    const perm = shuffle(range(numColors));
    const counts = new Array(numColors);
    perm.forEach((colorIdx, k) => { counts[colorIdx] = template[k]; });

    const colorList = [];
    for (let i = 0; i < numColors; i++) {
      for (let k = 0; k < counts[i]; k++) colorList.push(chosen[i][0]);
    }
    const colors = shuffle(colorList);

    const mostColorIdx = counts.indexOf(8);   // 최다
    const leastColorIdx = counts.indexOf(2);  // 최소

    return {
      id: 11,
      title: "가장 많이 있는 구슬 찾기",
      instruction: "가장 많이 있는 색깔을 찾아서 없애봐!",
      count: count,
      colors: colors,
      most_color: chosen[mostColorIdx][0],
      most_name: chosen[mostColorIdx][1],
      most_count: 8,
      least_color: chosen[leastColorIdx][0],
      least_name: chosen[leastColorIdx][1],
      least_count: 2,
      targets_total: 0, // 렌더러가 세부 단계로 직접 관리
    };
  }

  // [5단계] 어디에 있는 구슬일까? (24칸 · 6×4 고정 그리드)
  // 기준 색은 화면에 딱 1개만 존재(유일)해서 아이가 찾을 수 있고, 거기서부터
  // 상하좌우 1~3칸 또는 대각선 1칸 떨어진 구슬을 찾는다. 방향/거리를 다변화.
  function generateStage6Position() {
    const cols = 6, rows = 4;
    const count = cols * rows; // 24

    // 오프셋 후보: [설명, dr, dc]
    const stepWord = (n, word) => (n === 1 ? ("바로 " + word) : (n + "칸 " + word));
    const offsets = [];
    for (let n = 1; n <= 3; n++) {
      offsets.push([stepWord(n, "위"),     -n,  0]);
      offsets.push([stepWord(n, "아래"),    n,  0]);
      offsets.push([stepWord(n, "왼쪽"),    0, -n]);
      offsets.push([stepWord(n, "오른쪽"),  0,  n]);
    }
    offsets.push(["왼쪽 위",    -1, -1]);
    offsets.push(["오른쪽 위",  -1,  1]);
    offsets.push(["왼쪽 아래",   1, -1]);
    offsets.push(["오른쪽 아래", 1,  1]);

    // 격자 안에 기준+오프셋이 들어가는 유효한 후보가 나올 때까지 오프셋 선택
    let dirName, dr, dc, candidates;
    do {
      const off = choice(offsets);
      dirName = off[0]; dr = off[1]; dc = off[2];
      candidates = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) candidates.push([r, c]);
        }
      }
    } while (candidates.length === 0);

    const refRC = choice(candidates);
    const ref_r = refRC[0], ref_c = refRC[1];
    const ref_index = ref_r * cols + ref_c;
    const answer_index = (ref_r + dr) * cols + (ref_c + dc);

    // 기준 색은 유일하게 1개. 나머지 칸은 다른 색들에서 무작위(반복 허용).
    const palette = pickPrioritizedColors(7); // [hex, name] 무지개 7색
    const refPair = palette[0];
    const others = palette.slice(1);
    const colors = [];
    const color_names = [];
    for (let i = 0; i < count; i++) {
      if (i === ref_index) {
        colors.push(refPair[0]); color_names.push(refPair[1]);
      } else {
        const p = choice(others);
        colors.push(p[0]); color_names.push(p[1]);
      }
    }

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
      ref_color: refPair[0],
      ref_color_name: refPair[1],
      direction: dirName,
      answer_index: answer_index,
      targets_total: 1,
    };
  }

  function generateStage8Memory() {
    const pairs_count = 8;      // 4×4 = 16개 = 8쌍
    const count = pairs_count * 2;

    // 8쌍 → 무지개 7원색 + 보조 1색 = 8색을 각각 2번씩 배치
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

  // [6단계] 따라 해봐! (16칸 · 4×4 · 4개 시퀀스)
  // 색은 장식(위치 index 로 식별)이라 무지개에서 반복 추출. 빛나는 순서 4개를
  // 데모로 보여준 뒤 아이가 그대로 따라 누른다.
  function generateStage9Simon() {
    const count = 16;
    const sequence_len = 4;
    const colors = [];
    for (let i = 0; i < count; i++) colors.push(choice(RAINBOW_HEXES));
    const sequence = sample(range(count), sequence_len);
    return {
      id: 9,
      title: "따라 해봐!",
      instruction: "구슬이 빛나는 순서대로 콕콕 눌러보자!",
      count: count,
      cols: 4,
      colors: colors,
      sequence: sequence,
      sequence_len: sequence_len,
      targets_total: sequence_len,
    };
  }

  function generateStage10() {
    const count = HANGUL_ORDER.length; // 14
    const chars = shuffle(HANGUL_ORDER);
    // 무지개 7원색을 각각 2번씩 = 14개를 무작위 위치에 배치.
    // 한글은 글자로 식별되므로 같은 색이 두 번 등장해도 게임에 무관.
    const colors = shuffle(RAINBOW_HEXES.concat(RAINBOW_HEXES));
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

  // [9단계] 알파벳 맞추기 (대문자 ↔ 소문자 매칭, 2세부 단계)
  // 세부1: 대문자 제시 → 소문자 12개 중 같은 알파벳 찾기
  // 세부2: 소문자 제시 → 대문자 12개 중 같은 알파벳 찾기
  // 색은 장식(글자로 식별)이라 무지개에서 반복 추출.
  // 대·소문자 모양이 같은 c·o·s·v·x·z 는 제외(2,14,18,21,23,25).
  const ALPHA_POOL = range(26).filter((i) => [2, 14, 18, 21, 23, 25].indexOf(i) < 0);
  function generateStage12() {
    const count = 12;
    function makeSub(promptCase) {
      const letterIdxs = sample(ALPHA_POOL, count); // 모양이 다른 알파벳 20자 중 12개
      const targetIdx = choice(letterIdxs);
      const colors = [];
      for (let i = 0; i < count; i++) colors.push(choice(RAINBOW_HEXES));
      return {
        promptCase: promptCase,     // "upper" | "lower" (제시되는 글자의 케이스)
        targetIdx: targetIdx,       // 정답 알파벳 인덱스
        letterIdxs: shuffle(letterIdxs),
        colors: colors,
      };
    }
    return {
      id: 12,
      title: "알파벳 맞추기",
      instruction: "",
      count: count,
      subs: [makeSub("upper"), makeSub("lower")],
      targets_total: 0, // 렌더러가 2세부 단계로 직접 관리
    };
  }

  // [10단계] 다음에 나올 구슬 맞추기 (규칙성 있는 색 패턴 예측, 3서브 퀴즈)
  // 각 퀴즈는 규칙적으로 반복되는 색 나열 뒤 '?'(무채색)를 두고, 보기 3개 중
  // 다음에 올 색을 고른다. 서브1(주기2) → 서브2(주기3, AAB) → 서브3(주기3, ABC)
  // 로 갈수록 어려워진다. 색은 대비가 뚜렷한 빨주노초파보 6색에서 매번 무작위.
  function generateStage13() {
    const palette = Object.keys(MISSION_COLORS); // 빨·주·노·초·파·보 hex 6개
    // 문항 길이 len(9~10). 1~(len-1)번은 규칙적 색 구슬, len번(마지막)이 무채색 정답칸.
    function makeQuiz(patternUnit, numColors) {
      const len = randint(9, 10);
      const period = patternUnit.length;
      const cols = sample(palette, numColors); // 서로 다른 색
      const sequence = []; // 1~(len-1)번 구슬 색
      for (let i = 0; i < len - 1; i++) {
        sequence.push(cols[patternUnit[i % period]]);
      }
      const answer_color = cols[patternUnit[(len - 1) % period]]; // len번 구슬 정답 색
      // 보기 3개: 정답 + 패턴에 등장한 색 우선, 부족하면 다른 색으로 채움
      const choices = [];
      const push = (c) => { if (choices.indexOf(c) < 0 && choices.length < 3) choices.push(c); };
      push(answer_color);
      cols.forEach(push);
      shuffle(palette).forEach(push);
      return { len: len, sequence: sequence, answer_color: answer_color, choices: shuffle(choices) };
    }
    return {
      id: 13,
      title: "다음에 나올 구슬은?",
      instruction: "",
      count: 10, // 커스텀 렌더 (setupGrid 안전값)
      quizzes: [
        makeQuiz([0, 1], 2),    // 서브1: A B A B … (주기2, 쉬움)
        makeQuiz([0, 0, 1], 2), // 서브2: A A B A A B … (주기3, 보통)
        makeQuiz([0, 1, 2], 3), // 서브3: A B C A B C … (주기3, 어려움)
      ],
      targets_total: 0,
    };
  }

  function generateAllStages() {
    return {
      stages: [
        // 총 10단계. 시각 인지 → 색·수량 → 순차/공간 → 기억 → 한글 → 알파벳 → 패턴 예측
        generateStage2(),         // 1단계: 반짝이는 구슬 (24개·3회, 시각 인지)
        generateStage3(),         // 2단계: 색상 매칭 (24개)
        generateStage11(),        // 3단계: 가장 많이/적게 있는 색 (수량 비교)
        generateStage4(),         // 4단계: 1↔12 수 서열 (오름/내림)
        generateStage6Position(), // 5단계: 색·방향 공간 인지 (24칸)
        generateStage9Simon(),    // 6단계: 따라 해봐! 순차 기억 (5개)
        generateStage8Memory(),   // 7단계: 짝 찾기 (작업 기억, 4×4)
        generateStage10(),        // 8단계: 한글 기차 (기차 이펙트)
        generateStage12(),        // 9단계: 알파벳 맞추기 (알파벳 폭죽)
        generateStage13(),        // 10단계: 다음에 나올 구슬 (패턴 예측, 마지막)
      ],
    };
  }

  // 외부 노출:
  //  - generateAllStages: 향후 in-place 재시작에 쓸 수 있는 생성 함수
  //  - GAME_DATA: 페이지 로드 시점의 게임 데이터 (game.js 가 그대로 사용)
  window.generateAllStages = generateAllStages;
  window.GAME_DATA = generateAllStages();
})(window);

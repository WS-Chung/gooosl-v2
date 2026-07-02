# 말랑말랑 구슬 팡팡 (정적 버전 / Vercel 배포용)

5~6세 정연이·정우용 인지 발달 게임의 **정적 사이트 버전**. 기존 Streamlit
버전(`../`)에서 Python 의존성을 모두 걷어내고 단일 페이지 정적 자산으로
재구성했다. 매 페이지 로드 시마다 JavaScript 의 `Math.random()` 으로 모든
스테이지의 색·위치·정답이 새로 생성되므로 게임 경험은 동일하다.

## 폴더 구조

```
bead-v2/
├── index.html        # 페이지 뼈대 (link/script 태그만)
├── styles.css        # 전체 스타일 (약 20KB)
├── data.js           # 8개 스테이지의 무작위 데이터 생성기 (data.py 의 JS 포팅)
├── game.js           # 게임 로직: 렌더·드래그·사운드·애니메이션 (약 40KB)
└── README.md
```

스크립트 로딩 순서는 HTML 의 `<script defer>` 가 보장:
`data.js` 가 먼저 실행되어 `window.GAME_DATA` 를 채우고, 이어서 `game.js` 가
그 데이터를 읽어 게임을 시작한다.

## 로컬에서 미리보기

`file://` 로 직접 열면 브라우저 보안 정책상 일부 동작이 제한될 수 있어 간단한
정적 서버로 띄우는 것을 권장.

Python 내장 서버 (별도 설치 불필요):

```bash
cd bead-v2
python -m http.server 8000
# 브라우저: http://localhost:8000
```

또는 Node 가 있다면:

```bash
npx serve bead-v2
```

## Vercel 배포

가장 단순한 경로 — 별도 설정 없이 정적 호스팅으로 자동 인식된다.

1. GitHub 저장소에 `bead-v2/` 를 푸시 (또는 이 폴더만 별도 저장소로)
2. https://vercel.com 에서 New Project → 저장소 연결
3. Root Directory 로 `bead-v2` 지정 (저장소 루트가 이 폴더라면 비워둠)
4. Framework Preset: **Other** (정적 사이트)
5. Build Command, Output Directory 모두 비워둠
6. Deploy

`vercel.json` 같은 설정 파일이 필요 없다. `index.html` 이 루트에 있으면 Vercel
이 그걸 진입점으로 잡고 CDN 엣지에 캐시한다.

CLI 로 직접 배포할 수도 있다:

```bash
npm i -g vercel
cd bead-v2
vercel        # 프리뷰 배포
vercel --prod # 프로덕션 배포
```

## Streamlit 버전 대비 장점

- **앱 슬립 없음** — 정적 파일이라 잠들 개념 자체가 없음. 24시간 즉시 응답
- **로딩 시간 단축** — Streamlit 부트스트랩(1~3초) 없이 100~300ms 수준
- **iframe 중첩 제거** — 게임이 진짜 풀스크린으로 뜸. 좌표 보정 같은 잔가시 ↓
- **무료 티어 한도 여유** — Vercel free 가 Streamlit Cloud 보다 훨씬 너그러움
- **커스텀 도메인 무료** — `우리아이.app` 같은 주소도 가능
- **빠른 배포 워크플로** — `git push` → 자동 배포, 미리보기 URL, 즉시 롤백

## 코드 변환 메모

`data.py` → `data.js` 1:1 포팅 표:

| Python `random` | JavaScript 헬퍼 |
| --- | --- |
| `random.randrange(n)` | `randrange(n)` (= `Math.floor(Math.random() * n)`) |
| `random.randint(a, b)` | `randint(a, b)` (양쪽 끝 포함) |
| `random.uniform(a, b)` | `uniform(a, b)` |
| `random.choice(arr)` | `choice(arr)` |
| `random.shuffle(arr)` | `shuffle(arr)` (Fisher–Yates) |
| `random.sample(arr, k)` | `sample(arr, k)` |
| `range(n)` | `range(n)` (배열 반환) |

상수(`PASTEL_PALETTE`, `NAMED_COLORS`, `MISSION_COLORS`, `DIRECTIONS`,
`HANGUL_ORDER`)는 값 그대로 옮겼고, 10개 스테이지 generator 도 동작이 동일하게
대응된다.

## "다시 하기" 동작

최종 성공 카드의 [다시 하기] 버튼은 `window.location.reload()` 로 페이지를
새로 띄운다. 정적 파일이라 거의 즉시 다시 시작되며, `data.js` 가 다시 실행되어
새로운 `Math.random()` 시드로 게임 데이터가 새로 생성된다.

향후 in-place 재시작이 필요하면 `window.generateAllStages()` 를 그대로 호출해
`window.GAME_DATA` 를 갱신하는 식으로 확장 가능 (data.js 가 이 함수를 외부에
이미 노출해 두었다).

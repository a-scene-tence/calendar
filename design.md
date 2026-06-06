# design.md — 캘린더 앱 디자인 시스템 (29cm 에디토리얼)

> 이 문서는 캘린더 대시보드(Next.js + Tailwind v4)의 **시각 디자인 시스템**을 정의한다.
> 디자인 토큰·컴포넌트 스타일을 바꿀 때 본 문서를 **반드시 함께 갱신**한다.
>
> 관련 문서: 작업 규칙 [`CLAUDE.md`](./CLAUDE.md) · 기능 사양 [`spec.md`](./spec.md)
> 마지막 업데이트: 2026-06-06 (세리프 디스플레이 + 페이퍼 오프화이트 + 완전 각짐)

---

## 1. 디자인 원칙

1. **페이퍼 + 활자**: 페이지는 웜 오프화이트 **페이퍼(`#F4EEE2`)**, 카드/모달은 살짝 밝은
   **서피스(`#FBF8F2`)**, 본문은 따뜻한 **잉크(`#1A1A1A`)**. 활자(특히 세리프 디스플레이)가
   화면의 주인공.
2. **모노크롬 + 단일 포인트**: 그레이 + 차콜(`--color-brand #111111`) 1포인트. 강조·버튼·활성·
   포커스·"오늘"은 차콜.
3. **기능색은 데이터/상태에만**: 공휴일·일요일=레드, 수입/성공=그린, 경고=오렌지. UI 크롬
   (버튼·탭·카드)에는 쓰지 않는다.
4. **카테고리 색은 도트·일정 막대에서만**: 카테고리 칩 자체는 모노톤. 카테고리 고유색은
   **사각 도트**(칩 좌측·검색 행·상세 행)와 **일정 막대(데이터 바)** 두 곳에서만 표현(유일한 컬러
   예외).
5. **플랫 + 헤어라인**: 그림자 대신 1px 헤어라인 보더(`var(--border)` = `#eaeaea`). 예외는
   바텀시트/팝업 오버레이 그림자만.
6. **완전 각짐**: 모든 모서리 라디우스는 **0**. 도트·드래그 핸들·"오늘" 마커·컬러 스와치도 포함.

---

## 2. 컬러 토큰 (`app/globals.css` `@theme`)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--paper` | `#F4EEE2` | 페이지 배경(웜 오프화이트, 잡지 종이) |
| `--surface` | `#FBF8F2` | 카드/모달 표면(페이퍼보다 살짝 밝은 화이트) |
| `--ink` | `#1A1A1A` | 본문 잉크(따뜻한 차콜) |
| `--color-brand` | `#111111` | 강조 포인트(버튼·활성·포커스·"오늘"·아이콘 시드). Tailwind `brand` 유틸 생성 |
| `--color-brand-hover` | `#000000` | 차콜 버튼 hover |
| `--color-brand-50` | `#f7f7f8` | 옅은 채움(브랜드 버튼 hover 배경) |
| `--color-brand-100` | `#f2f2f2` | 옅은 채움(강조 배경) |
| `--border` | `#eaeaea` | 헤어라인 보더·구분선·그리드 라인 (`border-[var(--border)]`) |
| `--muted` | `#8a8a8e` | 보조 텍스트(주로 Tailwind `text-gray-400/500`로 대체 사용) |

기능색은 Tailwind 기본 팔레트를 사용한다: 레드 `red-500/400/50`(공휴일·삭제·일요일), 그린
`green`(수입), 앰버 `amber`(경고). 중립은 Tailwind `gray-*` 램프.

> `bg-[var(--paper)]`·`bg-[var(--surface)]`·`text-[var(--ink)]`를 단일 출처로 사용한다.
> `bg-white`·`bg-gray-50` 같은 직접 컬러는 **인풋/세그먼트 트랙 등 의도된 곳에서만** 사용.

---

## 3. 타이포그래피

### 폰트 토큰

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--font-sans` | Pretendard Variable + system fallback | 본문 전반(기본) |
| `--font-display` | Cormorant Garamond, Noto Serif KR, Pretendard 폴백 | 세리프 디스플레이(헤더·표제·로그인 카피) |

- Latin은 **Cormorant Garamond**(이탤릭 활용), Korean은 **Noto Serif KR**로 자동 폴백.
- 본문/숫자: Pretendard, `font-variant-numeric: tabular-nums`, `letter-spacing:-0.01em`.
- 디스플레이 유틸: `.font-display` (globals.css base 레이어 정의 — `font-feature-settings: liga,
  ss01`, `letter-spacing:-0.005em`).

### 사용처

| 위치 | 토큰 | 예 |
|------|------|-----|
| 월 표제(`JUNE 2026`) | `--font-display` | 4xl~5xl, italic |
| 선택일 상세 헤더 | `--font-display` | xl, 정자 |
| 검색 헤더 | `--font-display` | xl |
| 모달 헤더(일정/카테고리) | `--font-display` | 2xl |
| 로그인 페이지 브랜드 카피 | `--font-display` | 3xl italic |
| 본문·날짜 숫자·일정 막대·칩 텍스트·요일 헤더 | `--font-sans` | 작은 사이즈 가독성 |

| 사이즈 위계(본문) | size | weight |
|------|------|--------|
| 본문 | 14px | 500 |
| 라벨·보조 | 11~12px | 500 |
| 일정 막대 | 9px | 600 |
| 날짜 숫자 | 10px | 600 |

---

## 4. 라디우스

**모든 라디우스 = 0** (`rounded-none`). 예외 없음 — 도트·드래그 핸들·"오늘" 마커·컬러 스와치·
바텀시트 상단 포함. 인쇄물 컷처럼 모든 모서리가 각짐.

> 시각적으로 도트가 너무 작아 보이면 px 단위로 크기를 조정한다(예: `h-2 w-2` 사각). `rounded-full`을
> 다시 도입하지 않는다.

---

## 5. 보더 vs 섀도우

- **헤어라인 기본**: 카드·인풋·세그먼트 활성칩은 `border-[var(--border)]` + `box-shadow:none`.
- **그림자 예외(엘리베이션)**: 바텀시트/모달 오버레이(`shadow-[0_-8px_32px_...]` 등)만.
- **호버**: 리스트/버튼은 배경 틴트(`hover:bg-gray-50/100`)만, 리프트(translateY)·그림자 없음.
  `:active` 마이크로 스케일(`active:scale-95` 등)·`active:opacity-80`(막대)은 유지.

---

## 6. 아이콘 시스템 (`components/Icon.tsx`)

- **라인 아이콘**: 의존성 없는 인라인 SVG. `viewBox 0 0 24 24`,
  `stroke:currentColor; fill:none; stroke-width:1.6; round cap/join`. `currentColor` 상속.
- **등록 슬러그**: `plus · chevron-left · chevron-right · x · arrow-up · arrow-down · search ·
  settings`. 새 아이콘은 같은 규격으로 `PATHS`에 추가.
- **사용**: `<Icon name="search" className="h-4 w-4 text-gray-400" />`.
- **금지**: 유니코드 글리프(`‹ › ✕ ↑ ↓ +`)·이모지를 아이콘으로 직접 쓰지 않는다.
- **로고**: `public/logo.svg`·`public/icon.svg` 차콜 `#111111` 모노크롬.

---

## 7. 컴포넌트 스펙

| 컴포넌트 | 스펙 |
|----------|------|
| 카드(월 그리드·로그인) | `bg-[var(--surface)]` + 헤어라인, `rounded-none`, 그림자 없음 |
| 월 표제 | `font-display` italic, 4xl~5xl, ink 색 |
| 기본 버튼 | 차콜 배경 + 화이트, `rounded-none`, weight 600~700 |
| 보조/취소 버튼 | `bg-gray-100 text-gray-700`, `rounded-none` |
| 위험 버튼(삭제) | `bg-red-50 text-red-500`, `rounded-none` |
| 인풋·셀렉트·검색 | `bg-gray-50` + `border-transparent`, `rounded-none`, focus 차콜 보더 + `ring-brand/15` |
| 카테고리 칩 | `rounded-none`. **선택**=`bg-[var(--ink)] text-white` + 좌측 사각 도트(카테고리색). **미선택**=`bg-gray-100 text-gray-700` + 좌측 사각 도트(카테고리색). 둘 다 모노톤(칩 배경은 카테고리색 채우지 않음) |
| 세그먼트(단일/다중) | 트랙 `rounded-none bg-gray-100`, 활성=화이트+헤어라인 |
| 일정 막대 | 카테고리색 배경 + `barTextColor` 자동 대비, `text-[9px]`, **끝 각짐(`rounded-none`)**, 시간 미표시 |
| 상세/검색 리스트 행 | `rounded-none`, hover `bg-gray-50`, 좌측 카테고리색 사각 도트(`h-2 w-2`) |
| 안내 박스(반복 범위) | 중립 `bg-gray-50` + 헤어라인(앰버 색 사용 안 함) |
| 아이콘 버튼(이전/다음/닫기) | `h-7 w-7`, `rounded-none`, `Icon` + `text-gray-500` |
| 바텀시트 | `rounded-none`(상단도 각짐), 드래그 핸들(가는 사각 막대) + 스와이프 닫기 유지, 엘리베이션 그림자 예외 |
| "오늘" 마커 | `bg-brand text-white` 사각 채움(`h-5 w-5 rounded-none`) |
| 카테고리 도트 | `h-2 w-2 rounded-none`, 카테고리색(또는 공휴일은 `HOLIDAY_COLOR`) |
| 드래그 핸들 | 가는 사각 막대(`h-[3px] w-10 bg-gray-300`) |
| 컬러 스와치(카테고리 관리) | 사각(`rounded-none`), 채움색 = 카테고리색 |

---

## 8. 데이터 색 정책

- **카테고리 칩 자체는 모노톤**. 선택=차콜 채움, 미선택=그레이 채움.
- **카테고리 고유색은 단 두 곳에서만**:
  1. **사각 도트**(칩 좌측·검색 행·상세 행) — 카테고리 식별.
  2. **일정 막대(데이터 바)** — 막대 텍스트색은 `barTextColor`(YIQ)로 자동 대비.
- **일요일·공휴일 = 레드**(`text-red-500`): 달력 관례 + 기능색.
- **토요일 = 중립 그레이**(블루 사용 안 함). "오늘"은 차콜 **사각** 채움(`bg-brand text-white`).
- 신규 카테고리 기본색은 차콜 또는 저채도 톤.

---

## 9. Do / Don't

**Do**: 페이퍼 + 서피스 + 잉크 토큰 사용, 헤어라인 보더, 차콜 강조, tabular 숫자,
넉넉한 여백, 굵기·세리프 디스플레이로 위계, 라인 아이콘, **완전 각짐(rounded-none)**.

**Don't**: 그라데이션, **둥근 모서리(`rounded-*` 일체, `rounded-full` 도트 포함)**, 무거운
그림자(시트 제외), 크롬에 블루/앰버, 장식 색, 유니코드 글리프/이모지 아이콘, 컬러 타일 배경,
**칩 배경을 카테고리색으로 채우기**, 페이퍼 위 강한 순백 카드.

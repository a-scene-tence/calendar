# design.md — 캘린더 앱 디자인 시스템 (29cm 에디토리얼)

> 이 문서는 캘린더 대시보드(Next.js + Tailwind v4)의 **시각 디자인 시스템**을 정의한다.
> 디자인 토큰·컴포넌트 스타일을 바꿀 때 본 문서를 **반드시 함께 갱신**한다.
>
> 관련 문서: 작업 규칙 [`CLAUDE.md`](./CLAUDE.md) · 기능 사양 [`spec.md`](./spec.md)
> 마지막 업데이트: 2026-06-06 (모노크롬 차콜 전환 + 라인 아이콘 + 라디우스 샤프닝)

---

## 1. 디자인 원칙

1. **모노크롬 + 단일 포인트**: 화이트/그레이 + 포인트 1개(차콜 `#111111`). 강조·버튼·활성·포커스·
   "오늘"은 차콜.
2. **기능색은 데이터/상태에만**: 공휴일·일요일=레드, 수입/성공=그린, 경고=오렌지. UI 크롬
   (버튼·탭·카드)에는 쓰지 않는다.
3. **카테고리 색은 데이터 예외**: 캘린더(카테고리)별 고유색은 일정 막대·칩·도트에서 **데이터
   식별** 목적으로 유지한다(유일한 컬러 예외).
4. **플랫 + 헤어라인**: 그림자 대신 1px 헤어라인 보더(`var(--border)` = `#eaeaea`). 예외는
   바텀시트/팝업 오버레이 그림자만.
5. **여백 우선 · 타이포가 주인공**: Pretendard, 넉넉한 패딩. 제목 굵게(700~800), 본문 400~500,
   숫자는 `tabular-nums`.

---

## 2. 컬러 토큰 (`app/globals.css` `@theme`)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-brand` | `#111111` | 포인트(버튼·활성·포커스·"오늘"·FAB). Tailwind `brand` 유틸 생성 |
| `--color-brand-hover` | `#000000` | 차콜 버튼 hover |
| `--color-brand-50` | `#f7f7f8` | 옅은 채움(브랜드 버튼 hover 배경) |
| `--color-brand-100` | `#f2f2f2` | 옅은 채움(강조 배경) |
| `--border` | `#eaeaea` | 헤어라인 보더·구분선 (`border-[var(--border)]`) |
| `--muted` | `#8a8a8e` | 보조 텍스트(주로 Tailwind `text-gray-400/500`로 대체 사용) |

기능색은 Tailwind 기본 팔레트를 사용한다: 레드 `red-500/400/50`(공휴일·삭제·일요일),
그린 `green`/`--olt`(수입), 앰버 `amber`(세션 경고). 중립은 Tailwind `gray-*` 램프.

> `--color-brand`만 바꾸면 `bg-brand`·`text-brand`·`ring-brand`·`accent-[var(--color-brand)]`·
> `bg-brand-50/100`·`hover:bg-brand-hover` 사용처가 전부 자동 변환된다(단일 출처).

---

## 3. 타이포그래피

- **폰트**: Pretendard Variable(폴백 system-ui, Apple SD Gothic Neo …).
- **숫자**: `body { font-variant-numeric: tabular-nums }` — 날짜·금액 정렬 일관성.
- **기본**: 14px / line-height 1.5 / `letter-spacing:-0.01em`.

| 용도 | size | weight |
|------|------|--------|
| 앱 타이틀(로고 옆) | 18px | 800 |
| 카드/섹션 제목 | 14px | 700~800 |
| 본문·일정 제목 | 13~14px | 500 |
| 라벨·보조(`.muted`) | 11~12px | 500 |
| 일정 막대 | 9px | 600 |

---

## 4. 스페이싱 & 라디우스

- **스페이싱**: 8pt 기반. 카드 패딩 모바일 `12px`, 태블릿+ `20px`. 모달 패딩 `20/24`.
- **라디우스 스케일**(Tailwind v4: `rounded-sm`=4 · `rounded-lg`=8 · `rounded-2xl`=16):

| 용도 | 클래스 | px |
|------|--------|-----|
| 카드·모달·바텀시트 | `rounded-2xl` (시트는 `rounded-t-2xl`) | 16 |
| 버튼·리스트 행·안내 박스·모달 내부 섹션 | `rounded-lg` | 8 |
| 인풋·셀렉트·검색·칩·세그먼트·컬러 스와치·일정 막대 끝 | `rounded-sm` | 4 |
| 도트·아바타·드래그 핸들·"오늘" 원형 | `rounded-full` | — |

---

## 5. 보더 vs 섀도우

- **헤어라인 기본**: 카드·인풋·세그먼트 활성칩은 `border` + `box-shadow:none`.
- **그림자 예외(엘리베이션)**: 바텀시트/모달 오버레이(`shadow-[0_-8px_32px_...]` 등)만.
- **호버**: 리스트/버튼은 배경 틴트(`hover:bg-gray-50/100`)만, 리프트(translateY)·그림자 없음.
  `:active` 마이크로 스케일(`active:scale-95` 등)·`active:opacity-80`(막대)은 유지.

---

## 6. 아이콘 시스템 (`components/Icon.tsx`)

- **라인 아이콘**: 의존성 없는 인라인 SVG. `viewBox 0 0 24 24`,
  `stroke:currentColor; fill:none; stroke-width:1.6; round cap/join`. `currentColor` 상속으로
  차콜/뮤트 컨텍스트를 자동으로 따른다.
- **등록 슬러그**: `plus · chevron-left · chevron-right · x · arrow-up · arrow-down · search ·
  settings`. 새 아이콘은 같은 규격(1.6 stroke, 24 viewBox)으로 `PATHS`에 추가.
- **사용**: `<Icon name="search" className="h-4 w-4 text-gray-400" />`. 크기는 className으로.
- **금지**: 유니코드 글리프(`‹ › ✕ ↑ ↓ +`)·이모지를 아이콘으로 직접 쓰지 않는다.
- **로고**: `public/logo.svg`·`public/icon.svg` 차콜 `#111111` 모노크롬(내부 흰 디바이더 유지).

---

## 7. 컴포넌트 스펙

| 컴포넌트 | 스펙 |
|----------|------|
| 카드(월 그리드·로그인) | 화이트 + 헤어라인, `rounded-2xl`, 그림자 없음 |
| 기본 버튼 | 차콜 배경 + 화이트, `rounded-lg`, weight 600~700 |
| 보조/취소 버튼 | `bg-gray-100 text-gray-700`, `rounded-lg` |
| 위험 버튼(삭제) | `bg-red-50 text-red-500`, `rounded-lg` |
| 인풋·셀렉트·검색 | `bg-gray-50` + `border-transparent`, `rounded-sm`, focus 차콜 보더 + `ring-brand/15` |
| 칩(카테고리) | `rounded-sm`. 미선택=`bg-gray-100`+도트(카테고리색) / 선택=카테고리색 채움 |
| 세그먼트(단일/다중) | 트랙 `rounded-sm bg-gray-100`, 활성=화이트+헤어라인 |
| 일정 막대 | 카테고리색 배경 + `barTextColor` 자동 대비, `text-[9px]`, 끝 `rounded-l/r-sm`, 시간 미표시 |
| 상세/검색 리스트 행 | `rounded-lg`, hover `bg-gray-50`, 시간 컬럼은 종일만 "종일" |
| 안내 박스(반복 범위) | 중립 `bg-gray-50` + 헤어라인(앰버 색 사용 안 함) |
| 아이콘 버튼(이전/다음/닫기) | `h-7 w-7`, `rounded-lg`, `Icon` + `text-gray-500` |
| 바텀시트 | `rounded-t-2xl`, 드래그 핸들 + 스와이프 닫기 유지, 엘리베이션 그림자 예외 |

---

## 8. 데이터 색 정책

- **카테고리 고유색**: 칩(선택 채움)·도트·일정 막대에서 유지(유일한 컬러 예외). 막대 텍스트색은
  `barTextColor`(YIQ)로 자동 대비.
- **일요일·공휴일 = 레드**(`text-red-500`): 달력 관례 + 기능색.
- **토요일 = 중립 그레이**(블루 사용 안 함). "오늘"은 차콜 원형(`bg-brand text-white`).
- 신규 카테고리 기본색은 차콜 또는 저채도 톤.

---

## 9. Do / Don't

**Do**: 헤어라인 보더, 차콜 강조, tabular 숫자, 넉넉한 여백, 굵기로 위계, 라인 아이콘,
인풋 4px·버튼 8px·카드 16px.
**Don't**: 그라데이션, 24px 라운드, 무거운 그림자(시트 제외), 크롬에 블루/앰버, 장식 색,
유니코드 글리프/이모지 아이콘, 컬러 타일 배경.

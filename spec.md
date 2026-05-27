# 캘린더 앱 기획서 (spec.md)

> 최종 수정: 2026-05-27
> 상태: **로컬 우선(local-first) 캘린더** — 외부 로그인/서버 없이 기기(localStorage)에 저장.

## 1. 개요 & 목표

외부 로그인 없이 **개인 기기(브라우저 localStorage)에 일정을 저장·관리**하는 캘린더 웹앱.
월 그리드에서 보고, 추가/수정/검색하며, 외부 캘린더 백업(.ics)을 업로드해 가져오고 내보낼 수 있다.

- **모바일 우선**, 태블릿·PC 반응형.
- **완전 클라이언트 전용 PWA** — 서버 API·인증 없음, 오프라인 동작.
- 개인 사용 전제(단일 사용자).

### 범위
- 월 그리드(다일 막대), 카테고리(로컬)별 단일/다중 표시.
- 일정 추가/수정/삭제, 전체 기간 검색(클라이언트).
- 카테고리 추가/수정/삭제, 한국 공휴일 내장 표시(읽기전용).
- **ICS 가져오기(업로드)·내보내기(백업 다운로드)**.

### 비목표 (Non-goals)
- 외부 동기화(구글/삼성 등 실시간 연동), 다중 사용자, 서버 저장.
- ICS 반복 일정(RRULE) 전개 — 현재는 첫 발생만 단일 일정으로 가져옴.

## 2. 대상 기기 & 반응형

| 구분 | 너비 | 레이아웃 |
|---|---|---|
| 모바일 | < 640px | 1열(우선 설계 기준) |
| 태블릿/PC | ≥ 640px | 중앙 정렬 단일 컬럼 |

- 모바일 우선 설계 후 상위 브레이크포인트 확장. 터치 타깃 ≥ 44px.

## 3. 아키텍처

| 영역 | 결정 |
|---|---|
| 프레임워크 | **Next.js (App Router)** — 정적 출력(서버 API 라우트 없음) |
| 데이터 | **브라우저 localStorage** (클라이언트 전용) |
| 가져오기/내보내기 | **ICS(iCalendar) 파일** — 자체 파서/생성기(`lib/ics.ts`) |
| 호스팅 | **Cloudflare Workers** (정적 자산 서빙, `@opennextjs/cloudflare`) |
| 모바일 제공 | **PWA 설치형** (manifest + service worker) |

### 데이터 흐름
```
[브라우저 UI]  ⇄  lib/local-store.ts  ⇄  localStorage("calendar.v1")
       ▲                                   │
       └── ICS 업로드 → parseIcs ──────────┘
       └── 내보내기 ← buildIcs ────────────┘
공휴일: lib/holidays.ts(내장, 읽기전용)을 로드 시 주입(저장 안 함)
```
- 서버/외부 호출 없음. 모든 로직이 클라이언트에서 실행.

## 4. 데이터 저장 (localStorage)

키 `calendar.v1` = `{ calendars: Calendar[] }` (공휴일 제외, 사용자 카테고리만 저장).

```ts
type Calendar = { id; name; color; isHoliday?; events: CalendarEvent[] };
type CalendarEvent = {
  id;            // `${calendarId}:${eventId}`
  eventId;       // uuid 또는 ICS UID
  calendarId; summary;
  start;         // 종일 "YYYY-MM-DD" / 시간 "YYYY-MM-DDTHH:mm:ss"
  end?;          // 종일 종료는 exclusive(다음 날)
  location?; description?;
};
```
- 최초 실행 시 기본 카테고리(할일/한일/생활/기타) 시드.
- 공휴일은 `lib/holidays.ts`(2024–2027)에서 로드 시 주입 — 저장하지 않아 데이터 갱신이 쉬움.
- **백업**: localStorage는 기기·오리진 종속이며 캐시 삭제 시 사라짐 → ICS 내보내기로 백업 권장.

## 5. 인증 & 보안
- **인증 없음**(개인 기기 로컬 저장). 외부 전송 없음 → 시크릿/토큰 불필요.

## 6. PWA 요구사항
- `manifest.webmanifest`, Service Worker(**Serwist**), 앱 셸 precache. 오프라인 완전 동작.

## 7. 외부 캘린더에서 가져오기 (ICS)
- 구글/삼성/네이버 등에서 캘린더를 **.ics로 내보내기(백업)** 한 뒤, 앱의 "카테고리 관리 → ICS 가져오기"
  에서 대상 카테고리를 골라 업로드.
- 지원: SUMMARY/DTSTART/DTEND/LOCATION/DESCRIPTION/UID, 종일(VALUE=DATE)·시간(UTC/naive).
- 반복(RRULE)은 첫 발생만 단일 일정으로 가져옴(추후 전개 가능).

## 8. 로드맵
1. 로컬 우선 전환(localStorage + ICS 가져오기/내보내기 + 공휴일 내장). ✅
2. PWA 마감 + Cloudflare 정적 배포.
3. (선택) 주/일 뷰, 반복(RRULE) 전개, IndexedDB 이전(용량 확장).

## 9. 검증
- `npm run dev`에서 모바일 뷰포트로 시드/추가/수정/삭제/검색/ICS 가져오기·내보내기/새로고침 유지 확인.
- PWA 설치 + 오프라인 동작 확인. Cloudflare 프리뷰 배포.

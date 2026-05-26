# 캘린더 앱 기획서 (spec.md)

> 최종 수정: 2026-05-26
> 상태: 캘린더 전용 앱(가계부 기능 제거됨)

## 1. 개요 & 목표

Google 캘린더 기반 **개인 일정 관리 웹앱**. 삼성 캘린더를 구글 동기화로 받아 월 그리드에서 보고,
일정을 추가/수정/검색한다.

- **모바일 우선**, 태블릿·PC에서도 동일 코드로 사용(반응형).
- 개인 사용 전제(단일 사용자). 다중 사용자/협업은 비목표.

### 범위
- 월 그리드(다일 일정 연결 막대), 카테고리(Google 캘린더)별 표시 단일/다중 선택.
- 일정 추가/수정/삭제(쓰기 가능 캘린더), 전체 기간 검색.
- 카테고리(Google 캘린더) 추가/수정/삭제, 공휴일 표시.

### 향후(백로그)
- 주/일 뷰, 반복 일정 표시, 알림.

### 비목표 (Non-goals)
- OS 홈 화면 진짜 위젯(§9 참고).
- 다중 사용자 / 권한 분리.

## 2. 대상 기기 & 반응형

| 구분 | 너비 | 레이아웃 |
|---|---|---|
| 모바일 | < 640px | 1열(우선 설계 기준) |
| 태블릿 | 640–1024px | 중앙 정렬 단일 컬럼 |
| PC | > 1024px | 중앙 정렬 단일 컬럼 |

- 모바일 우선으로 설계 후 상위 브레이크포인트 확장.
- 터치 타깃 ≥ 44px, 한 손 조작 고려.

## 3. 아키텍처

| 영역 | 결정 |
|---|---|
| 프론트엔드+백엔드 | **Next.js (App Router)** — API Route에서 OAuth/연동 처리 |
| 호스팅 | **Cloudflare Pages + Workers** (어댑터 `@opennextjs/cloudflare`) |
| 모바일 제공 | **PWA 설치형** (manifest + service worker) |
| 캘린더 | 삼성 캘린더 → 구글 동기화 → **Google Calendar API**(읽기/쓰기) |
| 인증/토큰 | **Supabase** (Auth + `user_tokens`에 Google refresh_token 저장) |

### 데이터 흐름

```
[삼성 캘린더 앱] --(구글 계정 동기화)--> [Google Calendar]
                                              |
                                              | Google Calendar API
                                              v
[Next.js (Cloudflare)] <--> [브라우저/PWA]
        ^
        |  서버에서만 시크릿/토큰 취급 (Supabase: 인증 + refresh_token)
```

- 시크릿(Google client secret 등)은 **서버(API Route / Cloudflare 환경변수)** 에서만 사용.
  클라이언트 번들에 포함 금지.

## 4. 데이터 저장 (Supabase)

가계부 기능 제거로 앱 데이터 테이블은 사용하지 않는다. Supabase는 **인증(구글 로그인)** 과
**Google refresh_token 저장**에만 사용.

### `user_tokens`
```sql
create table user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_refresh_token text not null,
  updated_at timestamptz default now()
);
alter table user_tokens enable row level security;
create policy "own_token" on user_tokens
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
- RLS: 본인 행만 접근(`auth.uid() = user_id`).
- 일정 데이터는 Supabase에 저장하지 않고 매 요청 시 Google Calendar API에서 읽는다.

## 5. 인증 & 보안

- **Supabase Auth(구글 로그인)** 단일 로그인. 구글 로그인 시 Calendar 스코프를 함께 요청해
  캘린더 읽기/쓰기 토큰 확보.
- Google OAuth 스코프: `https://www.googleapis.com/auth/calendar`.
- `access_type=offline` + `prompt=consent`로 refresh_token 확보 → `user_tokens`에 저장,
  서버에서 만료 시 갱신. 액세스 토큰을 클라이언트에 노출하지 않음.
- 시크릿 보관: 로컬은 `.env.local`(커밋 금지), 배포는 Cloudflare 환경변수/Secrets.

## 6. PWA 요구사항

- `manifest.webmanifest`: 이름, 아이콘(192/512, maskable), `display: standalone`, 테마/배경색.
- Service Worker: **Serwist** 사용.
- 캐시 전략: 앱 셸 precache, API 응답은 stale-while-revalidate.
- 설치 안내 UI(모바일에서 "홈 화면에 추가" 유도).

## 7. 삼성 캘린더 연동 설정 가이드 (사용자 작업)

삼성 캘린더는 공개 API가 없어 **구글 캘린더 경유**로 읽는다.

1. 삼성 캘린더 앱 → 설정 → 캘린더 관리 → **구글 계정 추가**(없으면 계정 추가).
2. 구글 계정의 **캘린더 동기화 ON**. 삼성 일정을 구글 캘린더로 보내려면 일정 저장 캘린더를
   해당 구글 계정 캘린더로 지정(또는 기존 일정 이동).
3. 앱에서 동일 구글 계정으로 로그인 → 일정이 표시됨.

> 주의: 삼성 계정 전용(로컬) 캘린더에만 저장된 일정은 구글로 동기화되지 않으므로,
> 구글 캘린더에 저장되도록 설정해야 앱에 노출된다.

## 8. 모바일 위젯 검토

- **PWA는 OS 홈 화면 진짜 위젯을 만들 수 없다**(iOS 미지원, 안드로이드 사실상 불가).
- **1단계: PWA 설치형** — 홈 화면 아이콘·전체화면·오프라인. 한 코드로 전 기기 대응.
- **향후 옵션**: 네이티브 위젯(Android App Widget / iOS WidgetKit) 또는 우회(Scriptable / KWGT).

## 9. 로드맵

1. 스캐폴딩: Next.js + PWA + Cloudflare 어댑터 + Supabase 클라이언트. ✅
2. Supabase Auth(구글 로그인) + refresh_token 저장/갱신. ✅
3. 월 그리드 캘린더(Google Calendar API), 다일 막대, 일정 추가/수정. ✅
4. 전체 기간 검색, 년/월 드롭다운, 카테고리 관리·표시 선택. ✅
5. PWA 마감(설치/오프라인) + Cloudflare 배포.
6. (선택) 주/일 뷰, 반복 일정, 위젯.

## 10. 검증 (앱 단계)

- `npm run dev`로 모바일 뷰포트에서 레이아웃·동작 확인.
- PWA 설치 테스트 + Lighthouse PWA 감사 통과.
- 테스트 구글 계정으로 캘린더 OAuth 플로우 및 일정 표시/추가/수정/검색 확인.
- Cloudflare 프리뷰 배포로 실제 환경 확인.

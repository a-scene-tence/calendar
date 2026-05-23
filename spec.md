# 개인 대시보드 기획서 (spec.md)

> 최종 수정: 2026-05-23
> 상태: v1 기획 / 구현 전

## 1. 개요 & 목표

흩어져 있는 개인 정보(가계부, 일정 등)를 **하나의 대시보드에서 한 눈에** 보기 위한 개인용 웹앱.

- **모바일 우선**, 태블릿·PC에서도 동일 코드로 사용(반응형).
- **확장 가능**: 카드(위젯) 단위로 항목을 계속 추가(할 일, 날씨, 메모 등).
- 개인 사용 전제(단일 사용자). 다중 사용자/협업은 비목표.

### v1 범위
- 캘린더 요약 카드: 오늘 / 이번 주 일정.
- 가계부 요약 카드: 이번 달 지출·수입·잔액, 최근 거래 N건.

### 향후(백로그)
- 할 일, 날씨, 메모, 습관 트래커 등 카드 추가.
- 네이티브/우회 모바일 위젯(§9).

### 비목표 (Non-goals)
- OS 홈 화면 진짜 위젯(v1 제외, §9 참고).
- 가계부 전체 기능 재구현 — 대시보드는 **요약만** 표시.
- 다중 사용자 / 권한 분리.

## 2. 대상 기기 & 반응형

| 구분 | 너비 | 레이아웃 |
|---|---|---|
| 모바일 | < 640px | 1열 카드 스택(우선 설계 기준) |
| 태블릿 | 640–1024px | 2열 그리드 |
| PC | > 1024px | 2–3열 그리드 |

- 모바일 우선으로 설계 후 상위 브레이크포인트 확장.
- 터치 타깃 ≥ 44px, 한 손 조작 고려.

## 3. 아키텍처

| 영역 | 결정 |
|---|---|
| 프론트엔드+백엔드 | **Next.js (App Router)** — API Route에서 OAuth/연동 처리 |
| 호스팅 | **Cloudflare Pages + Workers** (어댑터 `@opennextjs/cloudflare`) |
| 모바일 제공 | **PWA 설치형** (manifest + service worker) |
| 캘린더 | 삼성 캘린더 → 구글 동기화 → **Google Calendar API**(읽기 전용) |
| 데이터 저장 | **Supabase** (Postgres + Auth) — 다기기 동기화 & 가계부 연동의 단일 소스 |

### 데이터 흐름

```
[삼성 캘린더 앱] --(구글 계정 동기화)--> [Google Calendar]
                                              |
                                              | Google Calendar API (calendar.readonly)
                                              v
[가계부 앱] --읽기/쓰기--> [Supabase] <--읽기-- [Next.js (Cloudflare)] <--> [브라우저/PWA]
                                                        ^
                                                        |  서버에서만 시크릿/토큰 취급
```

- 시크릿(Google client secret, Supabase service key 등)은 **서버(API Route / Cloudflare 환경변수)** 에서만 사용. 클라이언트 번들에 포함 금지.

## 4. 데이터 모델 (Supabase)

> 가계부와 대시보드가 **동일 Supabase 프로젝트**를 공유. 아래 스키마가 두 앱 간 계약(contract).

### 가계부 공유 스키마 (초안)
```sql
-- 계정/지갑
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  type text,                       -- cash | card | bank ...
  created_at timestamptz default now()
);

-- 카테고리
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  kind text not null               -- income | expense
);

-- 거래
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  account_id uuid references accounts(id),
  category_id uuid references categories(id),
  kind text not null,              -- income | expense
  amount numeric(14,2) not null,
  currency text default 'KRW',
  occurred_at timestamptz not null,
  memo text,
  created_at timestamptz default now()
);
```

### RLS (Row Level Security)
- 모든 테이블 RLS 활성화.
- 정책: `user_id = auth.uid()` 인 행만 select/insert/update/delete 허용.
- 대시보드는 동일 사용자 토큰으로 접근 → 본인 데이터만 조회.

### 대시보드용 조회 (요약)
- 이번 달 지출/수입 합계, 잔액, 최근 거래 N건은 **뷰 또는 서버 쿼리**로 계산.

## 5. 인증 & 보안

- **Supabase Auth(구글 로그인)** 로 단일 로그인. 구글 로그인 시 Calendar 스코프를 함께 요청해
  캘린더 접근 토큰 확보(인증 + 캘린더 권한 일원화).
- Google OAuth 스코프: `https://www.googleapis.com/auth/calendar.readonly`.
- 토큰 갱신/저장은 서버에서 처리. 액세스 토큰을 클라이언트에 노출하지 않음.
- 시크릿 보관: 로컬은 `.env.local`(커밋 금지), 배포는 Cloudflare 환경변수/Secrets.

## 6. PWA 요구사항

- `manifest.webmanifest`: 이름, 아이콘(192/512, maskable), `display: standalone`, 테마/배경색.
- Service Worker: **Serwist**(또는 next-pwa) 사용.
- 캐시 전략: 앱 셸 precache, API 응답은 stale-while-revalidate, 오프라인 시 마지막 요약 표시.
- 설치 안내 UI(모바일에서 "홈 화면에 추가" 유도).

## 7. 삼성 캘린더 연동 설정 가이드 (사용자 작업)

삼성 캘린더는 공개 API가 없어 **구글 캘린더 경유**로 읽는다.

1. 삼성 캘린더 앱 → 설정 → 캘린더 관리 → **구글 계정 추가**(없으면 계정 추가).
2. 구글 계정의 **캘린더 동기화 ON**. 삼성 일정을 구글 캘린더로 보내려면 일정 저장 캘린더를
   해당 구글 계정 캘린더로 지정(또는 기존 일정 이동).
3. 대시보드에서 동일 구글 계정으로 로그인 → 일정이 표시됨.

> 주의: 삼성 계정 전용(로컬) 캘린더에만 저장된 일정은 구글로 동기화되지 않으므로,
> 구글 캘린더에 저장되도록 설정해야 대시보드에 노출된다.

## 8. 가계부 마이그레이션 가이드 (localStorage → Supabase)

현재 가계부는 데이터를 **브라우저 localStorage(JSON)** 에만 저장한다. localStorage는
origin·기기에 묶여 ① 다른 도메인의 대시보드가 읽을 수 없고 ② 기기 간 동기화가 불가하다.
"여러 기기에서 한 눈에"를 만족하려면 서버 측 공유 저장소가 필요하다.

**이행 절차** (가계부 저장소 `claude/consolidate-sdk-deployment-H1RJb`에서 별도 수행):
1. Supabase 프로젝트 생성, §4 스키마 적용, RLS 정책 설정.
2. 가계부에 Supabase 클라이언트 + 구글 로그인 도입.
3. 기존 localStorage JSON을 §4 테이블 구조로 매핑하는 **일회성 임포트** 작성
   (앱 첫 로그인 시 localStorage 데이터를 읽어 Supabase로 업로드).
4. 가계부 읽기/쓰기를 Supabase로 전환. localStorage는 오프라인 캐시 용도로만 잔존(선택).

> 두 앱은 분리 유지하고 **Supabase 스키마를 공유**한다. 대시보드는 요약만 읽는다.
> (이 저장소의 GitHub 접근 범위 밖이므로 가계부 수정은 해당 저장소에서 진행)

## 9. 모바일 위젯 검토

- **PWA는 OS 홈 화면 진짜 위젯을 만들 수 없다**(iOS 미지원, 안드로이드 사실상 불가).
- **1단계(v1): PWA 설치형** — 홈 화면 아이콘·전체화면·오프라인. 한 코드로 전 기기 대응.
- **향후 옵션(진짜 위젯이 필요할 때)**:
  - 네이티브: 안드로이드 App Widget(Kotlin), iOS WidgetKit(Swift) — 별도 앱 개발 필요.
  - 우회(무료·앱스토어 불필요): iOS **Scriptable**, 안드로이드 **KWGT** 가 대시보드 JSON
    API를 읽어 위젯에 렌더. 수동 설정 부담은 있음.

## 10. 로드맵

1. **문서**: `spec.md`, `CLAUDE.md` 작성 — *현재 단계*.
2. 스캐폴딩: Next.js + PWA + Cloudflare 어댑터(`@opennextjs/cloudflare`) + Supabase 클라이언트.
3. Supabase 스키마/Auth 구성, 가계부 데이터 이행(§8).
4. 캘린더 요약 카드(Google Calendar API).
5. 가계부 요약 카드(Supabase 조회).
6. PWA 마감(설치/오프라인) + Cloudflare 배포.
7. (선택) 네이티브/우회 위젯(§9).

## 11. 검증 (앱 단계)

- `npm run dev`로 모바일 뷰포트에서 카드 레이아웃·동작 확인.
- PWA 설치 테스트 + Lighthouse PWA 감사 통과.
- Supabase 더미 데이터로 가계부 요약 카드 표시 확인.
- 테스트 구글 계정으로 캘린더 OAuth 플로우 및 일정 표시 확인.
- Cloudflare 프리뷰 배포로 실제 환경 확인.

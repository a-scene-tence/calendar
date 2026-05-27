# CLAUDE.md — 작업 규칙 & 학습 로그

> Claude Code가 프로젝트 메모리로 자동 로드하는 파일. 작업 규칙과 버그 학습 로그를 여기에 둔다.
> 상세 기획은 `spec.md` 참고.

## 프로젝트 개요

**로컬 우선(local-first) 캘린더 앱** — 외부 로그인/서버 없이 기기 localStorage에 일정 저장·관리
(월 그리드·다일 막대·검색·추가/수정). 외부 캘린더 백업 .ics 가져오기/내보내기, 한국 공휴일 내장.
모바일 우선, 태블릿/PC 대응. 스택: **Next.js (App Router, 정적) + Cloudflare Workers(정적 서빙)
+ PWA**. 서버 API·인증 없음.

> 이력: 가계부 기능 제거(2026-05) → 가계부 기획 무효. Google 캘린더 동기화 + Supabase 인증 방식도
> 제거(2026-05: 로컬 우선으로 전환). 데이터는 `lib/local-store.ts`가 localStorage로 관리하고,
> ICS는 `lib/ics.ts`, 공휴일은 `lib/holidays.ts`(내장)에서 처리.

## 작업 규칙

- **브랜치**: 모든 개발은 `claude/personal-dashboard-integration-PjDW6`에서 진행. 다른 브랜치로
  푸시 금지(명시적 허락 없이).
- **푸시**: `git push -u origin claude/personal-dashboard-integration-PjDW6`. 네트워크 실패 시
  지수 백오프(2s,4s,8s,16s)로 최대 4회 재시도.
- **커밋**: 작고 의미 있는 단위로. 메시지는 "왜"에 집중. 시크릿/`.env*` 커밋 금지.
- **모바일 우선**: 모든 UI는 모바일 레이아웃부터 설계 후 상위 브레이크포인트로 확장.
- **확장성**: 새 항목은 카드(위젯) 단위로 추가. 카드 간 결합도를 낮게 유지.
- **보안**: 시크릿/토큰은 서버(API Route / Cloudflare 환경변수)에서만 취급. 클라이언트 번들 노출 금지.
- **검증 의무**: UI 변경은 dev 서버에서 모바일 뷰포트로 확인. PWA/반응형 점검.
- **버그 발견 시**: 아래 "오류/버그 학습 로그"에 한 줄 추가하여 재발 방지.

## 명령어 (스캐폴딩 후 채움)

| 목적 | 명령 |
|---|---|
| 개발 서버 | `npm run dev` → http://localhost:3000 |
| 프로덕션 빌드 | `npm run build` |
| 린트 | `npm run lint` |
| Cloudflare 프리뷰 | `npm run preview` (로컬 Workers 에뮬레이션) |
| Cloudflare 배포 | `npm run deploy` |
| Supabase 마이그레이션 | `npx supabase db push` (Supabase CLI 설정 후) |
| Cloudflare 시크릿 등록 | `wrangler secret put <KEY>` |

## 오류/버그 학습 로그

작업 중 발생한 오류를 매번 한 줄씩 누적한다. 같은 실수를 반복하지 않기 위함.

| 날짜 | 증상 | 원인 | 해결 | 재발 방지 |
|---|---|---|---|---|
| _(예시)_ | _빌드 시 edge runtime 오류_ | _Node 전용 API 사용_ | _edge 호환 API로 교체_ | _Cloudflare 배포 대상 모듈은 edge 호환 확인_ |
| 2026-05-23 | `npm run dev` 시 `Cannot find native binding`(globals.css 컴파일 500) | Tailwind v4가 쓰는 네이티브 패키지(`@tailwindcss/oxide`,`lightningcss`)가 npm 옵셔널 디펜던시 버그(#4828)로 미설치. lockfile은 정상 | `rm -rf node_modules package-lock.json && npm install`(클린 재설치) | 새 환경(Codespace/CI/Cloudflare 빌드)에서 의존성 문제 시 `npm install` 말고 lockfile까지 지우고 재설치 또는 `npm ci` 사용 |
| 2026-05-24 | `npm run build` 타입 에러: `Cannot find name 'ServiceWorkerGlobalScope'` + `__SW_MANIFEST` 없음 (`app/sw.ts`) | tsconfig에 webworker lib 미포함, `__SW_MANIFEST`는 Serwist 빌드 주입 전역이라 타입 미선언 | `sw.ts` 상단에 `/// <reference lib="webworker" />` + `declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry\|string)[] }` | 서비스워커 파일은 webworker lib 참조 + 빌드 주입 전역 타입 직접 선언 |
| 2026-05-24 | `npm run build` 타입 에러: `cookiesToSet implicitly has 'any'` (`lib/supabase/*.ts`) | `@supabase/ssr` setAll 콜백 파라미터 타입 미지정 | 파라미터에 `{name:string;value:string;options:Record<string,unknown>}[]` 명시 | strict 모드에서 콜백 인자는 명시적 타입 부여 |
| 2026-05-24 | 캘린더 월 그리드에서 날짜 숫자가 일정 막대와 겹쳐 보임 | `<button>`은 단일 내용을 **세로 중앙 정렬**해서 `pt-1`로 상단 고정이 안 됨 → 숫자가 셀 중앙(~31px)에 위치, top-6 막대와 겹침 | 날짜칸 버튼에 `flex flex-col items-center` 부여해 숫자를 상단 고정 | 버튼 내부 내용을 상단 정렬하려면 `flex flex-col` 명시(버튼 기본 세로중앙정렬 주의) |
| 2026-05-26 | Cloudflare 배포 불가(`opennextjs-cloudflare build`/`deploy`) | `open-next.config.ts` 누락 + `wrangler.jsonc`가 Pages용(`pages_build_output_dir`)이라 어댑터 v1 Workers 모델과 불일치 | `open-next.config.ts` 추가 + `wrangler.jsonc`를 `main`+`assets`(Workers)로 교체 | `@opennextjs/cloudflare` v1은 Workers 배포(`wrangler deploy`) + `open-next.config.ts` 필수. Pages 설정 사용 금지 |
| 2026-05-27 | 로컬 우선 전환 시 "API 라우트에서 localStorage 읽기" 설계 오류 가능성 | localStorage는 **브라우저 전용** — 서버(Workers) API 라우트에서 접근 불가 | 데이터 로직을 클라이언트 스토어(`lib/local-store.ts`)로 옮기고 API 라우트 전체 삭제 | 로컬 저장은 클라이언트 컴포넌트/모듈에서만. 서버 라우트로 우회 금지 |

### 알려진 주의점 (시작 전 메모)
- **로컬 저장 한계**: localStorage는 origin·기기 종속, 캐시 삭제 시 소실, ~5MB 한계.
  → 백업은 ICS 내보내기로. 데이터 접근은 항상 클라이언트(`lib/local-store.ts`)에서.
- **ICS 가져오기**: 반복(RRULE)은 첫 발생만 단일 일정으로 가져옴. 종일 DTEND는 exclusive(다음 날).
- **공휴일**: `lib/holidays.ts`(2024–2027, 내장·읽기전용). 로드 시 주입하고 저장하지 않음. 음력/대체
  공휴일은 best-effort이므로 부정확하면 표를 직접 보정.
- **외부 캘린더**: 실시간 동기화 없음. 구글/삼성 등에서 .ics로 내보낸 뒤 업로드(`spec.md` §7).
- **Next.js on Cloudflare**: 정적 출력 + Workers 정적 서빙. Node 전용 API 주의.

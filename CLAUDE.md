# CLAUDE.md — 작업 규칙 & 학습 로그

> Claude Code가 프로젝트 메모리로 자동 로드하는 파일. 작업 규칙과 버그 학습 로그를 여기에 둔다.
> 상세 기획은 `spec.md` 참고.

## 프로젝트 개요

캘린더 앱 — Google 캘린더 기반 개인 일정 관리(월 그리드·다일 막대·검색·일정 추가/수정). 모바일 우선,
태블릿/PC 대응. 스택: **Next.js (App Router) + Cloudflare Workers + PWA + Supabase(인증/구글
토큰) + Google Calendar API**.

**배포 URL**: https://personal-dashboard.skynjy.workers.dev (workers.dev 무료 서브도메인,
Google OAuth External + Testing 모드 — 공유 대상 Gmail을 사전에 Test users로 등록 필요).
Vercel 자동 배포(git push 연동)도 병행 가능 — 도메인은 연결 후 기입. 배포 절차는 `DEPLOY.md` 참고.

> 가계부 기능은 제거됨(2026-05: 캘린더 전용 앱으로 전환). `spec.md`의 가계부 관련 내용은 더 이상
> 유효하지 않음. Supabase는 인증과 Google refresh_token 저장(`user_tokens`)에만 사용.

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
- **디자인 시스템**: 시각 토큰·컴포넌트 스타일은 [`design.md`](./design.md)(29cm 에디토리얼)가 단일
  출처. 디자인 변경 시 코드와 `design.md`를 **함께 갱신**.
- **버그 발견 시**: 아래 "오류/버그 학습 로그"에 한 줄 추가하여 재발 방지.

## 명령어 (스캐폴딩 후 채움)

| 목적 | 명령 |
|---|---|
| 개발 서버 | `npm run dev` → http://localhost:3000 |
| 프로덕션 빌드 | `npm run build` |
| 린트 | `npm run lint` |
| Cloudflare 프리뷰 | `npm run preview` (로컬 Workers 에뮬레이션) |
| Cloudflare 배포 | `npm run deploy` (로컬 PC에서 실행 — 웹 세션은 cloudflare.com 차단됨) |
| Vercel 배포 | git push 시 자동(대시보드 연결). 수동: `vercel --prod`. 절차는 `DEPLOY.md` |
| Supabase 마이그레이션 | Dashboard SQL Editor 권장(`DEPLOY.md` §6). CLI는 `link --project-ref msjnyyoxuhltmxapxvms` 후 `db push` |
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
| 2026-05-28 | Claude Code 웹 세션에서 `wrangler whoami/deploy` 호출 시 `Host not in allowlist` 403 | 이 환경의 egress 프록시(Anthropic sandbox)가 `api.cloudflare.com`/`*.cloudflare.com` 호스트 전체를 차단 | `npm run deploy`는 로컬 PC 또는 네트워크 정책이 완화된 세션에서 실행 | `wrangler` 명령은 환경 네트워크 정책에 의존. 웹 세션에서 배포 시 `api.cloudflare.com` 허용 정책 사용 또는 로컬 실행 |
| 2026-05-31 | "열 때마다 다시 로그인 필요"(`세션이 만료되었습니다(Google 토큰 만료)`) | Supabase는 JWT만 자동 갱신 — `session.provider_token`(Google access_token)은 발급 시점 값 그대로 ~1시간 후 stale. `refreshGoogleToken`이 매 요청마다 캐시 없이 raw refresh 시도 → 실패 시 401 | `user_tokens`에 `google_access_token`·`access_expires_at` 캐시 컬럼 추가(마이그레이션), `refreshGoogleToken`이 만료 60초 전까지 캐시 반환 + 갱신 시 저장. API 라우트는 캐시 함수 우선 호출(provider_token은 폴백) | provider 토큰은 Supabase가 갱신하지 않음 — 앱이 직접 관리. OAuth Testing 모드는 refresh_token TTL 7일이라 주기적 재로그인 불가피(해소하려면 Google Verified 등록) |
| 2026-05-31 | "7일마다 재로그인"이 Supabase 백업으로 해결될 거라 오해 | refresh_token은 이미 `user_tokens`에 저장(백업)돼 있음 — 7일 만료는 Google **OAuth Testing 모드** 정책(서버측 refresh_token 무효화)이 원인이지 토큰 분실이 아님 | Google 콘솔에서 동의화면을 **Production으로 게시**(미인증이면 경고 1회 통과) + 전환 후 1회 재로그인으로 영구 refresh_token 재발급. 절차는 `DEPLOY.md` §5 | 토큰 만료 ≠ 토큰 분실. 게시 상태(Testing/Production)가 TTL을 결정. Vercel/CF 배포 플랫폼 전환과는 무관 |
| 2026-06-06 | 1차 모노크롬 전환만으론 에디토리얼 톤이 약함(산세리프 일색·시스템 그레이 배경·둥근 모서리가 잡지 인쇄물 톤을 희석) | 디자인 토큰이 표면/잉크 분리 없이 그레이만 사용. 디스플레이 폰트 슬롯 없음. 라디우스 스케일이 4/8/16로 살아 있음 | `--paper`/`--surface`/`--ink` 신설, 모든 `rounded-*` → `rounded-none`(도트·핸들·"오늘" 포함), 카테고리 칩 모노톤(도트만 색). 화이트 톤 확정: `--paper #F5F5F4`+`--surface #FFFFFF`. **세리프 디스플레이(`--font-display`)는 도입했다 롤백** — 한글이 Noto Serif KR로 떠 본문(Pretendard)과 이질적, 전부 Pretendard로 통일 | 큰 톤 변경은 토큰 단에서 처리하고 컴포넌트는 토큰만 참조 — 시각 토큰은 `design.md` 단일 출처. **한글 UI에 라틴 세리프 도입 주의: 한글은 세리프 폴백(명조)으로 떨어져 톤이 깨짐**. 로고는 브랜드색(파스텔블루 `#A8C8EF`) 유지 — 모노크롬 규칙 예외 |

### 알려진 주의점 (시작 전 메모)
- **Next.js on Cloudflare**: Node 전용 API 사용 시 edge 런타임에서 실패할 수 있음.
  `@opennextjs/cloudflare` 호환성/런타임 제약 확인 필요.
- **Supabase RLS**: 테이블 생성 후 RLS 정책 누락 시 데이터가 안 보이거나 전체 노출될 수 있음.
  테이블마다 `user_id = auth.uid()` 정책을 반드시 설정.
- **localStorage**: origin·기기 종속. 크로스도메인/다기기 동기화 불가 → 공유 데이터는 Supabase 사용.
- **삼성 캘린더**: 공개 API 없음. 구글 캘린더 동기화 경유로만 읽음(`spec.md` §7).
- **OAuth 운영 모드**: External + Testing. 공유 대상 Gmail을 Google Cloud Console → OAuth consent
  screen → Test users에 등록하지 않으면 동의 화면에서 `access_denied`. 최대 100명 한도.

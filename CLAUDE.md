# CLAUDE.md — 작업 규칙 & 학습 로그

> Claude Code가 프로젝트 메모리로 자동 로드하는 파일. 작업 규칙과 버그 학습 로그를 여기에 둔다.
> 상세 기획은 `spec.md` 참고.

## 프로젝트 개요

개인 대시보드 — 가계부·캘린더 등 개인 정보를 하나의 화면에서 본다. 모바일 우선, 태블릿/PC 대응.
스택: **Next.js (App Router) + Cloudflare Pages/Workers + PWA + Supabase + Google Calendar API**.

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

### 알려진 주의점 (시작 전 메모)
- **Next.js on Cloudflare**: Node 전용 API 사용 시 edge 런타임에서 실패할 수 있음.
  `@opennextjs/cloudflare` 호환성/런타임 제약 확인 필요.
- **Supabase RLS**: 테이블 생성 후 RLS 정책 누락 시 데이터가 안 보이거나 전체 노출될 수 있음.
  테이블마다 `user_id = auth.uid()` 정책을 반드시 설정.
- **localStorage**: origin·기기 종속. 크로스도메인/다기기 동기화 불가 → 공유 데이터는 Supabase 사용.
- **삼성 캘린더**: 공개 API 없음. 구글 캘린더 동기화 경유로만 읽음(`spec.md` §7).

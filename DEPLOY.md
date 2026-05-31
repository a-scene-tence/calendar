# 배포 가이드 (Vercel · Cloudflare) + 로그인 유지

이 앱은 **Vercel(권장: git 푸시 시 자동 배포)**과 **Cloudflare Workers(기존)** 두 곳에 모두 배포할 수 있다.
두 배포는 서로 독립이며 같은 Supabase 프로젝트·Google OAuth를 공유한다.

> ⚠️ **가장 흔한 함정**: 새 배포 도메인을 Supabase의 Redirect URL 허용목록에 등록하지 않으면 로그인이
> `access_denied`/리다이렉트 실패로 막힌다. 아래 2번을 반드시 먼저 처리할 것.

---

## 1. Vercel 자동 배포 (권장)

매 수정마다 수동 배포할 필요 없이 **git push → 자동 빌드·배포**된다.

### 최초 1회 설정
1. https://vercel.com → **Add New… → Project** → GitHub 저장소 연결.
   - 원격이 `a-scene-tence/calendar.git`로 이동했다는 push 경고가 있으니, **실제 GitHub 저장소 이름을 확인**한
     뒤 그 저장소를 선택한다(이름 불일치 시 엉뚱한 repo에 연결됨).
2. Framework Preset은 **Next.js**로 자동 감지된다(별도 `vercel.json` 불필요).
3. **Settings → Environment Variables**에 4개 등록:

   | 변수 | 환경 | 비고 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Production / Preview / Development | 공개값 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production / Preview / Development | 공개값 |
   | `GOOGLE_CLIENT_ID` | Production / Preview | 시크릿 |
   | `GOOGLE_CLIENT_SECRET` | Production / Preview | 시크릿 |

4. **Deploy** 클릭 → `https://<프로젝트>.vercel.app` 발급.

### Production Branch 주의
개발 브랜치가 `claude/personal-dashboard-integration-PjDW6`라 Vercel 기본값(`main`)과 다르다. 둘 중 하나:
- Vercel **Settings → Git → Production Branch**를 위 개발 브랜치로 지정, 또는
- `main`에 머지하는 흐름을 채택(머지 시 자동 Production 배포, 그 외 브랜치는 Preview 배포).

---

## 2. Supabase 리다이렉트 허용목록 (필수)

Supabase Dashboard → **Authentication → URL Configuration**:
- **Redirect URLs**에 새 배포 도메인 추가:
  - `https://<프로젝트>.vercel.app/**`
  - (Cloudflare 병행 시) `https://personal-dashboard.skynjy.workers.dev/**`
  - 로컬: `http://localhost:3000/**`
- **Site URL**도 주력 도메인으로 갱신 권장.

앱 코드의 `redirectTo`는 `${location.origin}/api/auth/callback`라 도메인별로 자동 대응하므로, 허용목록만
맞으면 여러 도메인이 동시에 동작한다.

---

## 3. Google Cloud Console 리다이렉트 (확인만)

Google OAuth의 **Authorized redirect URI**는 앱 도메인이 아니라 **Supabase 콜백**을 가리킨다:
```
https://<supabase-project>.supabase.co/auth/v1/callback
```
따라서 Vercel/Cloudflare 도메인이 바뀌어도 **변경 불필요** — 등록돼 있는지만 확인한다.

---

## 4. Cloudflare Workers 배포 (병행 유지)

기존 방식 그대로 사용 가능. 웹 세션은 `api.cloudflare.com`이 차단되므로 **로컬 PC에서** 실행:
```bash
wrangler secret put GOOGLE_CLIENT_ID      # 최초 1회
wrangler secret put GOOGLE_CLIENT_SECRET  # 최초 1회
npm run deploy                            # opennextjs-cloudflare build && wrangler deploy
```
`wrangler.jsonc`의 `vars`에 Supabase 공개값이 들어 있다.

---

## 5. 로그인 7일 만료 해소 (가장 중요)

### 증상
정기적으로 사용해도 약 7일마다 다시 로그인해야 한다.

### 진짜 원인
토큰이 분실돼서가 아니다. Google `refresh_token`은 이미 Supabase `user_tokens` 테이블에 저장(백업)돼 있다.
원인은 **Google 정책**이다: OAuth 동의화면 게시 상태가 **"Testing"**이면 Google이 발급한 모든
`refresh_token`을 **7일 후 무효화**한다. 이는 서버측 Google 정책이라 Supabase 백업·쿠키·배포 플랫폼
(Vercel/Cloudflare) 변경으로는 우회할 수 없다.

> 즉, **Vercel 전환과 로그인 7일 만료는 무관**하다. 아래 게시 전환이 유일한 근본 해결책이다.

### 해결: 동의화면을 Production으로 게시
1. Google Cloud Console → **APIs & Services → OAuth consent screen** → **PUBLISH APP**
   → 게시 상태가 **"In production"**으로 바뀐다.
2. Calendar는 **민감(sensitive) 스코프**라, 인증을 받지 않은 Production 앱은 로그인 시
   **"Google hasn't verified this app"** 경고가 뜬다 → **Advanced → Go to … (unsafe)**로 1회 통과.
   - 통과 후에는 `refresh_token`이 7일에 만료되지 않는다(개인/소수 사용자에 적합).
3. **전환 후 1회 재로그인 필수**: Testing 시절에 발급된 기존 refresh_token은 이미 무효일 수 있다.
   로그아웃 후 다시 로그인하면(`prompt=consent`로 매번 동의) 영구 refresh_token이 재발급된다.

### (선택) 경고 화면까지 없애려면
전체 앱 인증 필요 — 개인정보처리방침 URL, 홈페이지, 도메인 소유 확인, 스코프 심사. 개인용 앱에는 보통
과하다.

### 만료 외 무효화 사유(참고)
Production이어도 다음에는 refresh_token이 끊긴다: 사용자가 액세스 해제, 6개월 미사용, 동일 client·user에
대해 토큰 한도 초과 등.

---

## 6. 데이터베이스 마이그레이션 (Dashboard SQL Editor 권장)

저장소에 `supabase/config.toml`이 없어 곧바로 `npx supabase db push`를 실행하면
**`Cannot find project ref`** 오류가 난다. CLI를 설정하지 않아도 되는 **대시보드 직접 실행** 경로를
사용한다(현재까지 마이그레이션 2개로 적어 자동화 이득보다 단순함이 큼).

### 절차
1. https://supabase.com/dashboard → 프로젝트 `msjnyyoxuhltmxapxvms` 선택
   (project ref는 `wrangler.jsonc`의 Supabase URL 서브도메인에서 확인 가능).
2. 좌측 **SQL Editor → New query**.
3. `supabase/migrations/20260531000001_user_tokens_access_cache.sql` 내용을 그대로 붙여넣기:
   ```sql
   ALTER TABLE user_tokens
     ADD COLUMN IF NOT EXISTS google_access_token text,
     ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
   ```
4. **Run** (또는 ⌘/Ctrl+Enter). `IF NOT EXISTS` 덕분에 재실행해도 안전.
5. 검증 쿼리:
   ```sql
   SELECT column_name
     FROM information_schema.columns
    WHERE table_name = 'user_tokens'
    ORDER BY ordinal_position;
   ```
   `google_access_token`, `access_expires_at` 두 줄이 보이면 성공.

> 미적용이어도 앱은 동작한다 — `refreshGoogleToken`의 캐시 update는 try/catch로 감싸져 컬럼이 없으면
> 조용히 건너뜀(`lib/google-token.ts`). 다만 캐시 효과가 사라져 매 요청마다 Google API에 refresh 요청이
> 가는 비효율만 남는다.

### (참고) 향후 CLI 자동화가 필요해지면
DB 비밀번호를 알고 있을 때만 1회 설정 — Codespaces에서도 동작:
```bash
npx supabase login                                       # device-code 브라우저 인증
npx supabase link --project-ref msjnyyoxuhltmxapxvms     # DB 비밀번호 입력
npx supabase db push
```
`link` 후 저장소 루트에 `supabase/config.toml`이 생겨 다음부터 `db push`만으로 동작.
DB 비밀번호 분실 시 Dashboard → Project Settings → Database → reset.

---

## 7. 배포 후 검증 체크리스트

- [ ] Vercel: 푸시 → 자동 배포 성공, `https://<app>.vercel.app` 로딩.
- [ ] 로그인 왕복 정상(= Supabase Redirect URL 등록 확인됨).
- [ ] 모바일 뷰포트에서 월 그리드가 한 화면에 들어옴.
- [ ] Google 콘솔 Production 게시 + 1회 재로그인 완료.
- [ ] **7일 이상 경과 후에도 재로그인 없이** 캘린더가 로드됨(핵심 수용 기준).

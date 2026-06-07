# Do & Done — 앱인토스 미니앱 빌드

토스 미니앱 마켓 배포용 캘린더. **메인 Next.js 캘린더(루트)와 분리된 Vite SPA**.
구글/Supabase 미사용, 모든 데이터는 단말 `localStorage`에 저장(JSON 백업/복원 지원).

## 빠른 실행 (로컬 PC)

```bash
cd toss
npm install         # node ≥ 20
npm run dev         # http://localhost:5173
npm run build       # vite 정적 빌드 → dist/
npx ait build       # do-done.ait 생성 (앱인토스 콘솔 업로드용)
```

이 클라우드 세션에서는 `*.toss.im`이 차단돼 `ait build`가 실패한다 — 정상이며 로컬에서 빌드한다.

## 구조

- `granite.config.ts` — 앱인토스 메타(brand·webViewProps·permissions).
- `vite.config.ts` — Vite + React SWC.
- `src/lib/store.ts` — localStorage CRUD + JSON export/import.
- `src/lib/date.ts` — 월 그리드·다일 일정 계산.
- `src/components/` — `MonthGrid`, `DayPanel`, `EventModal`, `BackupModal`.

자세한 절차·아이콘 호스팅·콘솔 업로드는 루트 `DEPLOY.md` §8 참고.

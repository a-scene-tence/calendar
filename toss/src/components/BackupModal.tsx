import { useRef, useState } from 'react';
import { exportJson, importJson, type ImportMode } from '@/lib/store';
import { saveTextFileViaToss } from '@/lib/toss';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';

type Props = {
  onClose: () => void;
  onImported: () => void;
};

export function BackupModal({ onClose, onImported }: Props) {
  const { sheetRef, sheetStyle } = useSwipeToDismiss(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const fileName = () => `do-done-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // 브라우저(개발/웹) 폴백: Blob 다운로드
  const downloadInBrowser = (json: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    const json = exportJson();
    try {
      // 토스 웹뷰: 네이티브 파일 저장(<a download>은 웹뷰에서 동작 안 함)
      await saveTextFileViaToss(fileName(), json, 'application/json');
      setMsg({ kind: 'ok', text: '백업 파일을 저장했습니다.' });
    } catch {
      try {
        downloadInBrowser(json);
        setMsg({ kind: 'ok', text: '백업 파일을 내려받았습니다.' });
      } catch {
        setMsg({
          kind: 'error',
          text: '파일 저장에 실패했습니다. 아래 텍스트를 복사해 보관하세요.',
        });
        setPasteText(json);
      }
    } finally {
      setBusy(false);
    }
  };

  const applyImport = (text: string) => {
    try {
      const result = importJson(text, mode);
      setMsg({
        kind: 'ok',
        text: `복원 완료: 일정 ${result.importedEvents}개, 카테고리 ${result.importedCategories}개`,
      });
      onImported();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : '복원에 실패했습니다.' });
    }
  };

  const handleFile = async (file: File) => {
    try {
      applyImport(await file.text());
    } catch {
      setMsg({ kind: 'error', text: '파일을 읽지 못했습니다.' });
    }
  };

  return (
    <div className="modal-backdrop animate-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        style={sheetStyle}
        className="modal animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-handle" />
        <h2>로컬 백업</h2>

        <p className="backup-msg">
          모든 일정·카테고리는 단말에만 저장됩니다. 기기 변경/초기화 전에 백업 파일을 내려받아
          두세요.
        </p>

        <div className="form-row">
          <button className="btn btn-primary" onClick={handleExport} disabled={busy}>
            JSON으로 내보내기
          </button>
        </div>

        <hr className="rule" />

        <div className="form-row">
          <label>가져오기 방식</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
            <option value="merge">병합 (동일 id 덮어쓰기)</option>
            <option value="replace">덮어쓰기 (기존 전체 삭제)</option>
          </select>
        </div>

        <div className="form-row">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            백업 파일 선택…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="form-row">
          <label>또는 백업 JSON 붙여넣기</label>
          <textarea
            rows={3}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder='{"version":1, ...}'
          />
          <button
            className="btn"
            disabled={!pasteText.trim()}
            onClick={() => applyImport(pasteText)}
          >
            붙여넣기로 복원
          </button>
        </div>

        {msg && <p className={`backup-msg ${msg.kind}`}>{msg.text}</p>}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

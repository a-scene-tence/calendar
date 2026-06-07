import { useRef, useState } from 'react';
import { exportJson, importJson, type ImportMode } from '@/lib/store';

type Props = {
  onClose: () => void;
  onImported: () => void;
};

export function BackupModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const handleExport = () => {
    const json = exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `do-done-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMsg({ kind: 'ok', text: '백업 파일을 내려받았습니다.' });
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = importJson(text, mode);
      setMsg({
        kind: 'ok',
        text: `복원 완료: 일정 ${result.importedEvents}개, 카테고리 ${result.importedCategories}개`,
      });
      onImported();
    } catch (e) {
      setMsg({
        kind: 'error',
        text: e instanceof Error ? e.message : '복원에 실패했습니다.',
      });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>로컬 백업</h2>

        <p className="backup-msg">
          모든 일정·카테고리는 단말에만 저장됩니다. 기기 변경/초기화 전에 백업 파일을 내려받아
          두세요.
        </p>

        <div className="form-row">
          <button className="btn btn-primary" onClick={handleExport}>
            JSON으로 내보내기
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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

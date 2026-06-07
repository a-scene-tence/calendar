// 앱인토스 네이티브 브릿지 래퍼. 토스 웹뷰에서는 브라우저의 `<a download>`가 동작하지
// 않으므로 파일 저장은 `saveBase64Data`로 처리한다. 웹/개발(브라우저)에서는 브릿지 호출이
// 실패하므로 호출부에서 폴백(Blob 다운로드)을 쓴다. 임포트 시점 크래시를 피하려고 동적 import.

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// 토스 환경에서 텍스트 파일을 단말에 저장. 실패하면 throw → 호출부 폴백.
export async function saveTextFileViaToss(
  fileName: string,
  text: string,
  mimeType: string
): Promise<void> {
  const mod = (await import('@apps-in-toss/web-framework')) as {
    saveBase64Data?: (p: { data: string; fileName: string; mimeType: string }) => Promise<void>;
  };
  if (typeof mod.saveBase64Data !== 'function') {
    throw new Error('saveBase64Data unavailable');
  }
  await mod.saveBase64Data({ data: toBase64Utf8(text), fileName, mimeType });
}

type HapticType =
  | 'tickWeak'
  | 'tap'
  | 'tickMedium'
  | 'softMedium'
  | 'basicWeak'
  | 'basicMedium'
  | 'success'
  | 'error';

// 햅틱(있으면). 브라우저/실패는 조용히 무시.
export function haptic(type: HapticType = 'tickWeak'): void {
  void (async () => {
    try {
      const mod = (await import('@apps-in-toss/web-framework')) as {
        generateHapticFeedback?: (o: { type: string }) => Promise<void>;
      };
      await mod.generateHapticFeedback?.({ type });
    } catch {
      /* noop */
    }
  })();
}

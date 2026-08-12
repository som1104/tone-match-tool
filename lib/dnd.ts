export function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => f.type.startsWith("image/"));
}

// 드래그 앤 드롭된 항목을 재귀적으로 읽어서 이미지 파일만 모아 반환한다.
// 폴더째 끌어다 놓으면 하위 폴더까지 모두 탐색한다 (webkitGetAsEntry 기반).
export async function readDroppedImageFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items || []);
  const getEntry = (item: DataTransferItem): any =>
    typeof (item as any).webkitGetAsEntry === "function" ? (item as any).webkitGetAsEntry() : null;
  const entries = items.map(getEntry).filter(Boolean);

  // webkitGetAsEntry를 지원하지 않는 환경에서는 기존 파일 목록으로 대체
  if (entries.length === 0) {
    return filterImageFiles(dataTransfer.files);
  }

  const files: File[] = [];

  async function walk(entry: any): Promise<void> {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch: any[];
      do {
        batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child);
      } while (batch.length > 0);
    }
  }

  await Promise.all(entries.map(walk));
  return filterImageFiles(files);
}

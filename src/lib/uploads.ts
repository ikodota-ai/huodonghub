export interface UploadSession {
  filename: string;
  size: number;
  chunks: number;
  received: Set<number>;
  dir: string;
}

const g = globalThis as unknown as { __dthUploads?: Map<string, UploadSession> };
export const uploadSessions: Map<string, UploadSession> = g.__dthUploads ?? new Map();
g.__dthUploads = uploadSessions;

export function getUpload(id: string): UploadSession | undefined {
  return uploadSessions.get(id);
}

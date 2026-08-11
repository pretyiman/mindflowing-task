import { api } from './client';

export interface QuickCaptureResult {
  mapId: string;
  nodeId: string;
  nodeName: string;
}

export const inboxApi = {
  quickCapture: (name: string) => api.post<QuickCaptureResult>('/inbox/quick-capture', { name })
};

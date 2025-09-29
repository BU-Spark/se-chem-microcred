export interface CreateMuxUploadOptions {
  title: string;
}

export async function createMuxUpload(_options: CreateMuxUploadOptions) {
  return {
    id: 'mux-upload-placeholder',
    status: 'pending',
  };
}

export interface GetMuxPlaybackOptions {
  playbackId: string;
}

export async function getMuxPlayback(_options: GetMuxPlaybackOptions) {
  return {
    id: 'mux-playback-placeholder',
    ready: false,
  };
}

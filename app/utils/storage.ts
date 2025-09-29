export interface SignedUrlRequest {
  fileName: string;
  contentType: string;
}

export async function createSignedUploadUrl(_request: SignedUrlRequest) {
  return {
    url: 'https://example.com/upload-placeholder',
    fields: {},
  };
}

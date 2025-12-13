export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

function clampSize(size: number | null) {
  if (!size || !Number.isFinite(size)) return 360;
  return Math.min(Math.max(size, 64), 1024);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = url.searchParams.get('data');
  const sizeParam = Number.parseInt(url.searchParams.get('size') ?? '', 10);
  const size = clampSize(Number.isFinite(sizeParam) ? sizeParam : null);

  if (!data) {
    return NextResponse.json({ error: 'Missing required data parameter.' }, { status: 400 });
  }

  try {
    const png = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return new NextResponse(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        // Allow long-lived caching because the QR payload is deterministic
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR code', error);
    return NextResponse.json({ error: 'Failed to generate QR code.' }, { status: 500 });
  }
}

export async function HEAD(request: Request) {
  // Mirror GET logic but omit the body; still validate inputs.
  const url = new URL(request.url);
  const data = url.searchParams.get('data');
  const sizeParam = Number.parseInt(url.searchParams.get('size') ?? '', 10);
  const size = clampSize(Number.isFinite(sizeParam) ? sizeParam : null);

  if (!data) {
    return NextResponse.json({ error: 'Missing required data parameter.' }, { status: 400 });
  }

  try {
    const png = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR code (HEAD)', error);
    return NextResponse.json({ error: 'Failed to generate QR code.' }, { status: 500 });
  }
}

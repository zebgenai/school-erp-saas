import QRCode from 'qrcode';

export async function qrTokenToPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    type: 'png',
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
  });
}

export async function qrTokenToSvg(token: string): Promise<string> {
  return QRCode.toString(token, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

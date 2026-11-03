const RAD = Math.PI / 180;

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const latFromMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

export function heatImage(bounds, estimate, width = 420) {
  const yN = mercY(bounds.north);
  const yS = mercY(bounds.south);
  const xSpan = (bounds.east - bounds.west) * RAD;
  const height = Math.max(64, Math.round((width * (yN - yS)) / xSpan));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let j = 0; j < height; j++) {
    const lat = latFromMercY(yN + ((yS - yN) * (j + 0.5)) / height);
    for (let i = 0; i < width; i++) {
      const lng = bounds.west + ((bounds.east - bounds.west) * (i + 0.5)) / width;
      const e = estimate(lat, lng);
      const k = (j * width + i) * 4;
      if (!e.rgb) continue;
      img.data[k] = e.rgb[0];
      img.data[k + 1] = e.rgb[1];
      img.data[k + 2] = e.rgb[2];
      img.data[k + 3] = Math.round(255 * Math.pow(e.conf, 0.85) * 0.9);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

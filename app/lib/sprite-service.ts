export type SpritePalette = {
  blue: string;
  green: string;
  white: string;
  red: string;
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const tintedCache = new Map<string, Promise<string>>();

function rgb(value: string): readonly [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return [Number.parseInt(normalized.slice(1, 3), 16), Number.parseInt(normalized.slice(3, 5), 16), Number.parseInt(normalized.slice(5, 7), 16)];
}

export function applySpritePalette(pixels: Uint8ClampedArray, palette: SpritePalette) {
  const replacements = [rgb(palette.blue), rgb(palette.green), rgb(palette.white), rgb(palette.red)] as const;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const yellowMask = red > 150 && green > 120 && blue < 105 && red + green > blue * 3;
    if (yellowMask) {
      pixels[index + 3] = 0;
      continue;
    }
    const mask = blue > red * 1.35 && blue > green * 1.15 ? 0
      : green > red * 1.3 && green > blue * 1.25 ? 1
        : red > green * 1.45 && red > blue * 1.45 ? 3
          : red > 235 && green > 235 && blue > 235 ? 2 : -1;
    if (mask < 0) continue;
    const replacement = replacements[mask as 0 | 1 | 2 | 3];
    const shade = Math.max(red, green, blue) / 255;
    pixels[index] = Math.round(replacement[0] * shade);
    pixels[index + 1] = Math.round(replacement[1] * shade);
    pixels[index + 2] = Math.round(replacement[2] * shade);
  }
  return pixels;
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Sprite could not be decoded."));
    image.src = source;
  });
  imageCache.set(source, pending);
  pending.catch(() => imageCache.delete(source));
  return pending;
}

export function tintSprite(source: string, palette: SpritePalette, signal?: AbortSignal): Promise<string> {
  const key = `${source}|${palette.blue}|${palette.green}|${palette.white}|${palette.red}`;
  const cached = tintedCache.get(key);
  if (cached) return cached;
  const pending = loadImage(source).then((image) => {
    if (signal?.aborted) throw new DOMException("Sprite request cancelled.", "AbortError");
    if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error("Sprite dimensions exceed 4096 pixels.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) throw new Error("Sprite canvas is unavailable.");
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applySpritePalette(imageData.data, palette);
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  });
  tintedCache.set(key, pending);
  pending.catch(() => tintedCache.delete(key));
  return pending;
}

export function clearSpriteCaches() {
  imageCache.clear();
  tintedCache.clear();
}

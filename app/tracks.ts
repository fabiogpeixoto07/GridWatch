import { OFFICIAL_TRACK_LAYOUTS } from "./official-track-layouts";

export type CircuitStyle = "balanced" | "fast" | "flowing" | "technical" | "street";

export type Circuit = {
  id: string;
  name: string;
  country: string;
  style: CircuitStyle;
  points: ReadonlyArray<readonly [number, number]>;
  width?: number;
  startIndex?: number;
};

type CircuitSpec = {
  id: string;
  name: string;
  country: string;
  style: CircuitStyle;
  seed: number;
  rotation: number;
  xScale?: number;
  yScale?: number;
};

const NORTHSTAR_POINTS = [
  [0.16, 0.38], [0.15, 0.23], [0.25, 0.13], [0.42, 0.14],
  [0.56, 0.19], [0.65, 0.31], [0.78, 0.25], [0.89, 0.34],
  [0.88, 0.50], [0.79, 0.61], [0.66, 0.62], [0.58, 0.53],
  [0.49, 0.50], [0.43, 0.67], [0.29, 0.78], [0.16, 0.72],
  [0.10, 0.60], [0.11, 0.47],
] as const;

const SHANGHAI_FINAL_CORNER_LAYOUT = [
  [0.3051, 0.7671], [0.1978, 0.7766], [0.1645, 0.734], [0.1735, 0.6859],
  [0.225, 0.6819], [0.2204, 0.7293], [0.259, 0.741], [0.2738, 0.6932],
  [0.2159, 0.6113], [0.1304, 0.497], [0.09, 0.3538], [0.141, 0.3815],
  [0.2287, 0.5239], [0.2881, 0.561], [0.3581, 0.5334], [0.411, 0.4405],
  [0.4692, 0.4325], [0.5252, 0.5144], [0.5804, 0.4667], [0.42, 0.1812],
  [0.3871, 0.2034], [0.3463, 0.1899], [0.3396, 0.1379], [0.3857, 0.1],
  [0.4462, 0.1145], [0.7543, 0.5884], [0.79, 0.635], [0.835, 0.7],
  [0.875, 0.765], [0.89, 0.82], [0.865, 0.865], [0.79, 0.89],
  [0.69, 0.89], [0.58, 0.865], [0.47, 0.825], [0.3051, 0.7671],
] as const;

const ISTANBUL_FINAL_CORNER_LAYOUT = [
  [0.3789, 0.7983], [0.5202, 0.7551], [0.5058, 0.6938], [0.5207, 0.6391],
  [0.5998, 0.5874], [0.7098, 0.5664], [0.7644, 0.5684], [0.7938, 0.5369],
  [0.7923, 0.4713], [0.8342, 0.4691], [0.8767, 0.4588], [0.867, 0.4041],
  [0.6393, 0.2784], [0.6375, 0.251], [0.6756, 0.23], [0.8033, 0.2538],
  [0.8507, 0.2623], [0.91, 0.1904], [0.8903, 0.143], [0.8449, 0.1],
  [0.5485, 0.182], [0.5288, 0.2072], [0.5447, 0.2519], [0.4349, 0.5489],
  [0.09, 0.7546], [0.075, 0.79], [0.095, 0.835], [0.17, 0.875],
  [0.28, 0.89], [0.39, 0.875], [0.445, 0.84], [0.43, 0.81],
  [0.3789, 0.7983],
] as const;

const BAHRAIN_CORNER_LAYOUT = [
  [0.1165, 0.4503], [0.1393, 0.1], [0.165, 0.1038], [0.2377, 0.1346],
  [0.3548, 0.1181], [0.55, 0.14], [0.75, 0.16], [0.88, 0.18],
  [0.91, 0.22], [0.88, 0.27], [0.78, 0.31], [0.68, 0.34], [0.6507, 0.3642],
  [0.5613, 0.3607], [0.49, 0.39], [0.4147, 0.4641], [0.35, 0.505],
  [0.30, 0.48], [0.30, 0.42], [0.34, 0.35], [0.39, 0.29], [0.4178, 0.252],
  [0.3571, 0.2093], [0.3392, 0.2131], [0.3085, 0.4396], [0.2989, 0.6436],
  [0.3445, 0.6598], [0.4208, 0.6475], [0.4808, 0.6094], [0.5348, 0.5415],
  [0.6045, 0.5198], [0.6921, 0.5318], [0.78, 0.55], [0.84, 0.59],
  [0.85, 0.64], [0.81, 0.69], [0.72, 0.72], [0.61, 0.72], [0.49, 0.75],
  [0.34, 0.79], [0.20, 0.83], [0.1278, 0.84], [0.09, 0.7857],
] as const;

const NURBURGRING_CORNER_LAYOUT = [
  [0.7881, 0.2137], [0.535, 0.385], [0.465, 0.405], [0.475, 0.35],
  [0.46, 0.315], [0.415, 0.305], [0.325, 0.325], [0.305, 0.36],
  [0.365, 0.385], [0.38, 0.42], [0.35, 0.5], [0.31, 0.59],
  [0.32, 0.625], [0.37, 0.655], [0.43, 0.67], [0.42, 0.705],
  [0.29, 0.75], [0.19, 0.805], [0.11, 0.86], [0.075, 0.84],
  [0.09, 0.805], [0.235, 0.715], [0.255, 0.665], [0.31, 0.515],
  [0.33, 0.43], [0.22, 0.39], [0.19, 0.355], [0.35, 0.225],
  [0.45, 0.19], [0.7, 0.14], [0.77, 0.105], [0.875, 0.09],
  [0.925, 0.105], [0.94, 0.15], [0.92, 0.19], [0.855, 0.225],
] as const;

// Curated centerlines for catalog circuits not covered by the public F1 dataset.
// These preserve each venue's recognizable corner sequence and proportions.
const CURATED_LAYOUTS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  fuji: [[0.12, 0.66], [0.12, 0.32], [0.23, 0.22], [0.64, 0.22], [0.86, 0.29], [0.79, 0.42], [0.56, 0.44], [0.47, 0.54], [0.58, 0.68], [0.84, 0.73], [0.88, 0.84], [0.63, 0.84], [0.38, 0.78], [0.22, 0.72]],
  "laguna-seca": [[0.14, 0.68], [0.22, 0.52], [0.36, 0.45], [0.51, 0.48], [0.64, 0.38], [0.78, 0.25], [0.86, 0.34], [0.74, 0.48], [0.59, 0.48], [0.48, 0.58], [0.56, 0.72], [0.45, 0.82], [0.28, 0.8], [0.18, 0.76]],
  "road-america": [[0.13, 0.68], [0.15, 0.38], [0.25, 0.22], [0.48, 0.18], [0.72, 0.19], [0.86, 0.29], [0.77, 0.39], [0.59, 0.39], [0.52, 0.5], [0.68, 0.62], [0.84, 0.64], [0.88, 0.76], [0.72, 0.84], [0.45, 0.82], [0.28, 0.74]],
  "brands-hatch": [[0.16, 0.66], [0.18, 0.38], [0.31, 0.2], [0.55, 0.18], [0.75, 0.27], [0.82, 0.42], [0.7, 0.51], [0.55, 0.48], [0.48, 0.61], [0.57, 0.77], [0.42, 0.84], [0.25, 0.78]],
  donington: [[0.14, 0.67], [0.2, 0.42], [0.38, 0.22], [0.61, 0.2], [0.78, 0.3], [0.7, 0.43], [0.55, 0.48], [0.67, 0.6], [0.81, 0.64], [0.74, 0.79], [0.51, 0.83], [0.32, 0.7], [0.2, 0.78]],
  jerez: [[0.14, 0.64], [0.18, 0.36], [0.35, 0.2], [0.62, 0.2], [0.82, 0.35], [0.72, 0.49], [0.55, 0.47], [0.48, 0.6], [0.62, 0.75], [0.48, 0.83], [0.27, 0.78]],
  adelaide: [[0.12, 0.7], [0.12, 0.3], [0.28, 0.18], [0.55, 0.18], [0.84, 0.28], [0.84, 0.45], [0.68, 0.5], [0.82, 0.63], [0.78, 0.8], [0.48, 0.84], [0.27, 0.74]],
  dubai: [[0.14, 0.68], [0.18, 0.35], [0.35, 0.2], [0.56, 0.24], [0.48, 0.37], [0.68, 0.41], [0.84, 0.31], [0.78, 0.52], [0.61, 0.58], [0.75, 0.72], [0.62, 0.84], [0.38, 0.76], [0.25, 0.62]],
  motegi: [[0.14, 0.7], [0.14, 0.28], [0.3, 0.16], [0.68, 0.16], [0.86, 0.3], [0.84, 0.72], [0.68, 0.84], [0.32, 0.84], [0.23, 0.7], [0.38, 0.58], [0.62, 0.58], [0.72, 0.48], [0.58, 0.42], [0.35, 0.45]],
  okayama: [[0.12, 0.7], [0.18, 0.42], [0.34, 0.22], [0.58, 0.2], [0.78, 0.32], [0.7, 0.48], [0.52, 0.48], [0.46, 0.62], [0.62, 0.76], [0.46, 0.84], [0.25, 0.78]],
  sebring: [[0.12, 0.7], [0.12, 0.32], [0.25, 0.2], [0.72, 0.2], [0.86, 0.34], [0.74, 0.42], [0.48, 0.4], [0.38, 0.52], [0.58, 0.58], [0.82, 0.62], [0.86, 0.78], [0.65, 0.84], [0.3, 0.8]],
  daytona: [[0.14, 0.7], [0.14, 0.28], [0.32, 0.16], [0.72, 0.16], [0.87, 0.3], [0.87, 0.7], [0.72, 0.84], [0.3, 0.84], [0.2, 0.7], [0.34, 0.58], [0.68, 0.58], [0.76, 0.48], [0.62, 0.4], [0.35, 0.42]],
  "long-beach": [[0.12, 0.68], [0.14, 0.3], [0.32, 0.18], [0.7, 0.18], [0.84, 0.3], [0.7, 0.43], [0.52, 0.42], [0.48, 0.58], [0.68, 0.66], [0.8, 0.78], [0.62, 0.84], [0.34, 0.76]],
  macau: [[0.15, 0.7], [0.18, 0.42], [0.28, 0.2], [0.5, 0.14], [0.74, 0.2], [0.84, 0.38], [0.72, 0.49], [0.56, 0.46], [0.45, 0.58], [0.58, 0.72], [0.46, 0.84], [0.25, 0.8]],
};

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function sanitizeCenterline(
  source: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<readonly [number, number]> {
  const points = [...source];
  let changed = true;
  let pass = 0;

  while (changed && pass < source.length * 2 && points.length > 8) {
    changed = false;
    pass += 1;
    for (let first = 0; first < points.length; first += 1) {
      const firstNext = (first + 1) % points.length;
      for (let second = first + 2; second < points.length; second += 1) {
        const secondNext = (second + 1) % points.length;
        if (first === 0 && secondNext === 0) continue;
        if (
          segmentsCross(
            points[first],
            points[firstNext],
            points[second],
            points[secondNext],
          )
        ) {
          // Removing the corner that closes the later crossing keeps the route
          // continuous while preserving the majority of the original layout.
          points.splice(second, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return points;
}

function resolveCloseSections(
  source: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<readonly [number, number]> {
  const points = source.map(([x, y]) => [x, y] as readonly [number, number]);
  const minimumSeparation = 0.062;
  const pushDistance = 0.012;

  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 4; second < points.length; second += 1) {
      const cyclicGap = Math.min(
        second - first,
        points.length - second + first,
      );
      if (cyclicGap < 4) continue;

      const dx = points[second][0] - points[first][0];
      const dy = points[second][1] - points[first][1];
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.0001 || distance >= minimumSeparation) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      points[first] = [
        Math.max(0.035, Math.min(0.965, points[first][0] - nx * pushDistance)),
        Math.max(0.045, Math.min(0.955, points[first][1] - ny * pushDistance)),
      ];
      points[second] = [
        Math.max(0.035, Math.min(0.965, points[second][0] + nx * pushDistance)),
        Math.max(0.045, Math.min(0.955, points[second][1] + ny * pushDistance)),
      ];
    }
  }

  return points;
}

function broadenCorners(
  source: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<readonly [number, number]> {
  const smoothed: Array<readonly [number, number]> = [];
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[(index + 1) % source.length];
    smoothed.push([
      current[0] * 0.76 + next[0] * 0.24,
      current[1] * 0.76 + next[1] * 0.24,
    ]);
    smoothed.push([
      current[0] * 0.24 + next[0] * 0.76,
      current[1] * 0.24 + next[1] * 0.76,
    ]);
  }
  return smoothed;
}

function prepareCenterline(
  source: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<readonly [number, number]> {
  const separated = resolveCloseSections(source);
  const untangled = sanitizeCenterline(separated);
  return sanitizeCenterline(broadenCorners(untangled));
}

const CIRCUIT_SPECS: CircuitSpec[] = [
  { id: "monaco", name: "Monaco", country: "Monaco", style: "street", seed: 11, rotation: -0.28, xScale: 0.91, yScale: 1.04 },
  { id: "monza", name: "Monza", country: "Italy", style: "fast", seed: 17, rotation: 0.14, xScale: 1.08, yScale: 0.86 },
  { id: "silverstone", name: "Silverstone", country: "United Kingdom", style: "flowing", seed: 23, rotation: -0.12, xScale: 1.08, yScale: 0.92 },
  { id: "spa", name: "Spa-Francorchamps", country: "Belgium", style: "flowing", seed: 29, rotation: 0.34, xScale: 0.96, yScale: 1.05 },
  { id: "suzuka", name: "Suzuka", country: "Japan", style: "technical", seed: 31, rotation: -0.34, xScale: 1.02, yScale: 0.94 },
  { id: "interlagos", name: "Interlagos", country: "Brazil", style: "flowing", seed: 37, rotation: 0.52, xScale: 0.94, yScale: 1.03 },
  { id: "imola", name: "Imola", country: "Italy", style: "flowing", seed: 41, rotation: 0.08, xScale: 1.06, yScale: 0.89 },
  { id: "bahrain", name: "Bahrain", country: "Bahrain", style: "technical", seed: 43, rotation: -0.08, xScale: 1.03, yScale: 0.94 },
  { id: "jeddah", name: "Jeddah Corniche", country: "Saudi Arabia", style: "street", seed: 47, rotation: 0.42, xScale: 1.1, yScale: 0.82 },
  { id: "melbourne", name: "Albert Park", country: "Australia", style: "fast", seed: 53, rotation: -0.21, xScale: 1.04, yScale: 0.93 },
  { id: "miami", name: "Miami", country: "United States", style: "street", seed: 59, rotation: 0.18, xScale: 1.06, yScale: 0.9 },
  { id: "barcelona", name: "Barcelona-Catalunya", country: "Spain", style: "technical", seed: 61, rotation: -0.42, xScale: 1.04, yScale: 0.93 },
  { id: "montreal", name: "Circuit Gilles Villeneuve", country: "Canada", style: "fast", seed: 67, rotation: 0.06, xScale: 1.12, yScale: 0.8 },
  { id: "austria", name: "Red Bull Ring", country: "Austria", style: "fast", seed: 71, rotation: 0.31, xScale: 1.04, yScale: 0.94 },
  { id: "hungaroring", name: "Hungaroring", country: "Hungary", style: "technical", seed: 73, rotation: -0.17, xScale: 0.95, yScale: 1.02 },
  { id: "zandvoort", name: "Zandvoort", country: "Netherlands", style: "flowing", seed: 79, rotation: 0.38, xScale: 0.96, yScale: 1.01 },
  { id: "baku", name: "Baku City Circuit", country: "Azerbaijan", style: "street", seed: 83, rotation: -0.04, xScale: 1.13, yScale: 0.8 },
  { id: "singapore", name: "Marina Bay", country: "Singapore", style: "street", seed: 89, rotation: 0.24, xScale: 1.01, yScale: 0.96 },
  { id: "cota", name: "Circuit of the Americas", country: "United States", style: "technical", seed: 97, rotation: -0.26, xScale: 1.03, yScale: 0.95 },
  { id: "mexico", name: "Mexico City", country: "Mexico", style: "technical", seed: 101, rotation: 0.11, xScale: 1.08, yScale: 0.88 },
  { id: "lusail", name: "Lusail", country: "Qatar", style: "flowing", seed: 103, rotation: -0.19, xScale: 1.04, yScale: 0.94 },
  { id: "abu-dhabi", name: "Yas Marina", country: "United Arab Emirates", style: "technical", seed: 107, rotation: 0.29, xScale: 1.05, yScale: 0.92 },
  { id: "shanghai", name: "Shanghai", country: "China", style: "technical", seed: 109, rotation: -0.37, xScale: 1.03, yScale: 0.95 },
  { id: "las-vegas", name: "Las Vegas Strip", country: "United States", style: "street", seed: 113, rotation: 0.02, xScale: 1.15, yScale: 0.76 },
  { id: "mugello", name: "Mugello", country: "Italy", style: "flowing", seed: 127, rotation: 0.43, xScale: 1.02, yScale: 0.96 },
  { id: "nurburgring", name: "Nürburgring GP", country: "Germany", style: "technical", seed: 131, rotation: -0.14, xScale: 1.01, yScale: 0.98 },
  { id: "hockenheim", name: "Hockenheimring", country: "Germany", style: "fast", seed: 137, rotation: 0.27, xScale: 1.07, yScale: 0.89 },
  { id: "sepang", name: "Sepang", country: "Malaysia", style: "technical", seed: 139, rotation: -0.32, xScale: 1.06, yScale: 0.9 },
  { id: "istanbul", name: "Istanbul Park", country: "Türkiye", style: "flowing", seed: 149, rotation: 0.16, xScale: 1.02, yScale: 0.96 },
  { id: "fuji", name: "Fuji Speedway", country: "Japan", style: "fast", seed: 151, rotation: -0.05, xScale: 1.14, yScale: 0.78 },
  { id: "indianapolis", name: "Indianapolis Road", country: "United States", style: "fast", seed: 157, rotation: 0.36, xScale: 1.08, yScale: 0.87 },
  { id: "portimao", name: "Portimão", country: "Portugal", style: "flowing", seed: 163, rotation: -0.22, xScale: 1.01, yScale: 0.98 },
  { id: "paul-ricard", name: "Paul Ricard", country: "France", style: "fast", seed: 167, rotation: 0.12, xScale: 1.12, yScale: 0.81 },
  { id: "kyalami", name: "Kyalami", country: "South Africa", style: "flowing", seed: 173, rotation: -0.39, xScale: 1.02, yScale: 0.97 },
  { id: "laguna-seca", name: "Laguna Seca", country: "United States", style: "technical", seed: 179, rotation: 0.47, xScale: 0.94, yScale: 1.04 },
  { id: "road-america", name: "Road America", country: "United States", style: "fast", seed: 181, rotation: -0.09, xScale: 1.1, yScale: 0.84 },
  { id: "watkins-glen", name: "Watkins Glen", country: "United States", style: "flowing", seed: 191, rotation: 0.21, xScale: 1.04, yScale: 0.93 },
  { id: "brands-hatch", name: "Brands Hatch", country: "United Kingdom", style: "technical", seed: 193, rotation: -0.29, xScale: 0.92, yScale: 1.05 },
  { id: "donington", name: "Donington Park", country: "United Kingdom", style: "flowing", seed: 197, rotation: 0.33, xScale: 1, yScale: 0.99 },
  { id: "jerez", name: "Jerez", country: "Spain", style: "technical", seed: 199, rotation: -0.18, xScale: 1.01, yScale: 0.98 },
  { id: "estoril", name: "Estoril", country: "Portugal", style: "fast", seed: 211, rotation: 0.07, xScale: 1.08, yScale: 0.87 },
  { id: "adelaide", name: "Adelaide Street Circuit", country: "Australia", style: "street", seed: 223, rotation: -0.35, xScale: 1.04, yScale: 0.92 },
  { id: "dubai", name: "Dubai Autodrome", country: "United Arab Emirates", style: "technical", seed: 227, rotation: 0.26, xScale: 1.05, yScale: 0.92 },
  { id: "motegi", name: "Motegi Road Course", country: "Japan", style: "technical", seed: 229, rotation: -0.11, xScale: 1.03, yScale: 0.95 },
  { id: "okayama", name: "Okayama", country: "Japan", style: "technical", seed: 233, rotation: 0.4, xScale: 0.98, yScale: 1.01 },
  { id: "sebring", name: "Sebring", country: "United States", style: "fast", seed: 239, rotation: -0.24, xScale: 1.11, yScale: 0.82 },
  { id: "daytona", name: "Daytona Road", country: "United States", style: "fast", seed: 241, rotation: 0.15, xScale: 1.13, yScale: 0.79 },
  { id: "long-beach", name: "Long Beach", country: "United States", style: "street", seed: 251, rotation: -0.31, xScale: 1.03, yScale: 0.94 },
  { id: "macau", name: "Macau Guia", country: "Macau", style: "street", seed: 257, rotation: 0.22, xScale: 0.96, yScale: 1.02 },
];

const STYLE_CONFIG: Record<CircuitStyle, {
  count: number;
  radiusX: number;
  radiusY: number;
  wave: number;
  irregularity: number;
}> = {
  balanced: { count: 17, radiusX: 0.38, radiusY: 0.31, wave: 0.11, irregularity: 0.045 },
  fast: { count: 13, radiusX: 0.39, radiusY: 0.285, wave: 0.075, irregularity: 0.025 },
  flowing: { count: 15, radiusX: 0.385, radiusY: 0.305, wave: 0.105, irregularity: 0.035 },
  technical: { count: 19, radiusX: 0.375, radiusY: 0.31, wave: 0.14, irregularity: 0.045 },
  street: { count: 20, radiusX: 0.39, radiusY: 0.3, wave: 0.12, irregularity: 0.055 },
};

function randomUnit(seed: number) {
  const value = Math.sin(seed * 9127.73 + 31.17) * 43758.5453;
  return value - Math.floor(value);
}

function buildCircuitPoints(spec: CircuitSpec): ReadonlyArray<readonly [number, number]> {
  if (spec.id === "shanghai") return prepareCenterline(SHANGHAI_FINAL_CORNER_LAYOUT);
  if (spec.id === "istanbul") return prepareCenterline(ISTANBUL_FINAL_CORNER_LAYOUT);
  if (spec.id === "bahrain") return prepareCenterline(BAHRAIN_CORNER_LAYOUT);
  if (spec.id === "nurburgring") return prepareCenterline(NURBURGRING_CORNER_LAYOUT);
  const officialLayout = OFFICIAL_TRACK_LAYOUTS[spec.id];
  if (officialLayout) return prepareCenterline(officialLayout);
  const curatedLayout = CURATED_LAYOUTS[spec.id];
  if (curatedLayout) return prepareCenterline(curatedLayout);

  const config = STYLE_CONFIG[spec.style];
  const phase = randomUnit(spec.seed * 7) * Math.PI * 2;
  const frequencyA = 2 + (spec.seed % 3);
  const frequencyB = 3 + (spec.seed % 4);
  const points: Array<readonly [number, number]> = [];

  for (let index = 0; index < config.count; index++) {
    const angle = (index / config.count) * Math.PI * 2 + spec.rotation;
    const localNoise = (randomUnit(spec.seed * 101 + index * 37) * 2 - 1) * config.irregularity;
    const harmonic =
      Math.sin(angle * frequencyA + phase) * config.wave +
      Math.cos(angle * frequencyB - phase * 0.6) * config.wave * 0.46;
    const radius = 1 + harmonic + localNoise;
    const chicane =
      spec.style === "technical" || spec.style === "street"
        ? Math.sin(index * 2.71 + phase) * config.irregularity * 0.72
        : 0;
    const x =
      0.5 +
      Math.cos(angle) * config.radiusX * radius * (spec.xScale ?? 1) +
      Math.sin(angle * 2 + phase) * chicane;
    const y =
      0.47 +
      Math.sin(angle) * config.radiusY * (1 - harmonic * 0.42) * (spec.yScale ?? 1) +
      Math.cos(angle * 3 - phase) * chicane * 0.7;
    points.push([
      Math.max(0.075, Math.min(0.925, x)),
      Math.max(0.095, Math.min(0.84, y)),
    ]);
  }

  return points;
}

export const TRACKS: Circuit[] = [
  {
    id: "northstar",
    name: "Northstar Circuit",
    country: "United States",
    style: "balanced",
    points: prepareCenterline(NORTHSTAR_POINTS),
  },
  ...CIRCUIT_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    country: spec.country,
    style: spec.style,
    points: buildCircuitPoints(spec),
  })),
];

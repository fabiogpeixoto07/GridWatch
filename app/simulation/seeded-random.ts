export const SEEDED_RANDOM_ALGORITHM = "xoshiro128ss-v1" as const;

export type SeededRandomSnapshot = Readonly<{
  algorithm: typeof SEEDED_RANDOM_ALGORITHM;
  state: readonly [number, number, number, number];
}>;

const UINT32_RANGE = 0x1_0000_0000;

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function splitMix32(value: number) {
  let mixed = (value + 0x9e37_79b9) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0_aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a_2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

function normalizeSeed(seed: number) {
  if (!Number.isFinite(seed)) throw new TypeError("Seed must be a finite number.");
  return Math.trunc(seed) >>> 0;
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

export class SeededRandom {
  private state: [number, number, number, number];

  constructor(seed: number) {
    let cursor = normalizeSeed(seed);
    this.state = [0, 0, 0, 0].map(() => {
      cursor = splitMix32(cursor);
      return cursor;
    }) as [number, number, number, number];
    if (this.state.every((value) => value === 0)) this.state[0] = 0x9e37_79b9;
  }

  nextUint32() {
    const [state0, state1, state2, state3] = this.state;
    const result = Math.imul(rotateLeft(Math.imul(state1, 5) >>> 0, 7), 9) >>> 0;
    const temporary = (state1 << 9) >>> 0;

    this.state[2] = (state2 ^ state0) >>> 0;
    this.state[3] = (state3 ^ state1) >>> 0;
    this.state[1] = (state1 ^ this.state[2]) >>> 0;
    this.state[0] = (state0 ^ this.state[3]) >>> 0;
    this.state[2] = (this.state[2] ^ temporary) >>> 0;
    this.state[3] = rotateLeft(this.state[3], 11);
    return result;
  }

  /** Returns a value in the half-open interval [0, 1). */
  nextFloat() {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Returns an unbiased integer in the half-open interval [minimum, maximumExclusive). */
  nextInt(minimum: number, maximumExclusive: number) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximumExclusive) || maximumExclusive <= minimum) {
      throw new RangeError("Seeded random integer bounds must be safe integers with maximumExclusive greater than minimum.");
    }
    const span = maximumExclusive - minimum;
    if (span > UINT32_RANGE) throw new RangeError("Seeded random integer range cannot exceed 2^32 values.");
    const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % span);
    let value = this.nextUint32();
    while (value >= rejectionLimit) value = this.nextUint32();
    return minimum + (value % span);
  }

  snapshot(): SeededRandomSnapshot {
    return Object.freeze({
      algorithm: SEEDED_RANDOM_ALGORITHM,
      state: Object.freeze([...this.state]) as readonly [number, number, number, number],
    });
  }

  restore(snapshot: SeededRandomSnapshot) {
    if (snapshot.algorithm !== SEEDED_RANDOM_ALGORITHM
      || !Array.isArray(snapshot.state)
      || snapshot.state.length !== 4
      || !snapshot.state.every(isUint32)
      || snapshot.state.every((value) => value === 0)) {
      throw new TypeError("Invalid seeded random snapshot.");
    }
    this.state = [...snapshot.state];
  }

  static fromSnapshot(snapshot: SeededRandomSnapshot) {
    const random = new SeededRandom(0);
    random.restore(snapshot);
    return random;
  }
}

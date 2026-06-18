const VERSION = 7;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 156;
const ECC_CODEWORDS_PER_BLOCK = 20;
const BLOCK_COUNT = 2;

export function createQrMatrix(text: string): boolean[][] {
  const dataCodewords = encodeDataCodewords(text);
  const codewords = addErrorCorrectionAndInterleave(dataCodewords);
  const modules = createMatrix<boolean | null>(SIZE, null);
  const functionModules = createMatrix<boolean>(SIZE, false);

  drawFunctionPatterns(modules, functionModules);
  drawCodewords(modules, functionModules, codewords);
  drawFormatBits(modules, functionModules, 0);

  return modules.map((row) => row.map(Boolean));
}

function encodeDataCodewords(text: string): number[] {
  const bytes = Array.from(text).map((char) => char.charCodeAt(0) & 0xff);
  const bits: number[] = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const capacityBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let pad = 0xec; codewords.length < DATA_CODEWORDS; pad ^= 0xfd) {
    codewords.push(pad);
  }
  if (codewords.length > DATA_CODEWORDS) {
    throw new Error("QR payload is too long");
  }
  return codewords;
}

function addErrorCorrectionAndInterleave(data: number[]): number[] {
  const blockDataLength = DATA_CODEWORDS / BLOCK_COUNT;
  const divisor = reedSolomonComputeDivisor(ECC_CODEWORDS_PER_BLOCK);
  const blocks = Array.from({ length: BLOCK_COUNT }, (_, index) => data.slice(index * blockDataLength, (index + 1) * blockDataLength));
  const eccBlocks = blocks.map((block) => reedSolomonComputeRemainder(block, divisor));
  const result: number[] = [];

  for (let i = 0; i < blockDataLength; i += 1) {
    for (const block of blocks) result.push(block[i]);
  }
  for (let i = 0; i < ECC_CODEWORDS_PER_BLOCK; i += 1) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}

function drawFunctionPatterns(modules: (boolean | null)[][], functionModules: boolean[][]) {
  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, SIZE - 4, 3);
  drawFinderPattern(modules, functionModules, 3, SIZE - 4);

  for (let i = 0; i < SIZE; i += 1) {
    if (!functionModules[6][i]) setFunctionModule(modules, functionModules, i, 6, i % 2 === 0);
    if (!functionModules[i][6]) setFunctionModule(modules, functionModules, 6, i, i % 2 === 0);
  }

  for (const x of [6, 22, 38]) {
    for (const y of [6, 22, 38]) {
      if (!functionModules[y][x]) drawAlignmentPattern(modules, functionModules, x, y);
    }
  }

  drawFormatBits(modules, functionModules, 0);
  drawVersionBits(modules, functionModules);
  setFunctionModule(modules, functionModules, 8, SIZE - 8, true);
}

function drawFinderPattern(modules: (boolean | null)[][], functionModules: boolean[][], centerX: number, centerY: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, functionModules, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(modules: (boolean | null)[][], functionModules: boolean[][], centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(modules, functionModules, centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawCodewords(modules: (boolean | null)[][], functionModules: boolean[][], codewords: number[]) {
  const dataBits = codewords.flatMap((codeword) => Array.from({ length: 8 }, (_, index) => (codeword >>> (7 - index)) & 1));
  let bitIndex = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? SIZE - 1 - vert : vert;
        if (functionModules[y][x]) continue;
        const bit = bitIndex < dataBits.length ? dataBits[bitIndex] === 1 : false;
        modules[y][x] = bit !== maskBit(x, y);
        bitIndex += 1;
      }
    }
  }
}

function drawFormatBits(modules: (boolean | null)[][], functionModules: boolean[][], mask: number) {
  const errorCorrectionLow = 1;
  const data = (errorCorrectionLow << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  for (let i = 0; i <= 5; i += 1) setFunctionModule(modules, functionModules, 8, i, getBit(bits, i));
  setFunctionModule(modules, functionModules, 8, 7, getBit(bits, 6));
  setFunctionModule(modules, functionModules, 8, 8, getBit(bits, 7));
  setFunctionModule(modules, functionModules, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(modules, functionModules, 14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i += 1) setFunctionModule(modules, functionModules, SIZE - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(modules, functionModules, 8, SIZE - 15 + i, getBit(bits, i));
  setFunctionModule(modules, functionModules, 8, SIZE - 8, true);
}

function drawVersionBits(modules: (boolean | null)[][], functionModules: boolean[][]) {
  let remainder = VERSION;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) ? 0x1f25 : 0);
  }
  const bits = (VERSION << 12) | remainder;
  for (let i = 0; i < 18; i += 1) {
    const bit = getBit(bits, i);
    const a = SIZE - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(modules, functionModules, a, b, bit);
    setFunctionModule(modules, functionModules, b, a, bit);
  }
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= reedSolomonMultiply(coefficient, factor);
    });
  }
  return result;
}

function reedSolomonMultiply(left: number, right: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ (((result >>> 7) & 1) ? 0x11d : 0);
    if (((right >>> i) & 1) !== 0) result ^= left;
  }
  return result & 0xff;
}

function setFunctionModule(modules: (boolean | null)[][], functionModules: boolean[][], x: number, y: number, dark: boolean) {
  modules[y][x] = dark;
  functionModules[y][x] = true;
}

function maskBit(x: number, y: number) {
  return (x + y) % 2 === 0;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0;
}

function createMatrix<T>(size: number, value: T): T[][] {
  return Array.from({ length: size }, () => Array(size).fill(value));
}

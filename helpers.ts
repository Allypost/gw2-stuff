import { config as readEnvFile } from "https://deno.land/x/dotenv/mod.ts";

const encoder = new TextEncoder();

const { GW2_API_BASE: baseUri, GW2_API_TOKEN: token } = readEnvFile({
  safe: true,
});

const baseUrl = new URL(baseUri);

export const itemsFileName = "items.json";
export const itemsMapFileName = "items.map.json";

export const moveUpLines = (numLines: number = 1) =>
  logRaw(`\x1b[${numLines}A`);
export const clearLine = () => logRaw("\x1b[2K\r");

export const logRaw = (text: string) =>
  Deno.stdout.writeSync(encoder.encode(text));
export const log = (...args: any) => console.log("|>", ...args);
export const logOverride = (...args: any) => {
  moveUpLines(1);
  clearLine();
  log(...args);
};

export const fileTextAppender = (file: Deno.File) => (text: string) =>
  file.writeSync(encoder.encode(text));

export const arrayChunk = (array: Array<any>, chunkSize: number) =>
  Array(Math.ceil(array.length / chunkSize))
    .fill(null)
    .map((_, i) => i)
    .map((_, i) => array.slice(i * chunkSize, i * chunkSize + chunkSize));

export class AtomicUInt32Array {
  #array: Uint32Array;

  constructor(elementCount: number) {
    const buffer = new SharedArrayBuffer(
      Uint32Array.BYTES_PER_ELEMENT * elementCount
    );

    this.#array = new Uint32Array(buffer).fill(0);
  }

  get(index: number): number {
    return Atomics.load(this.#array, index);
  }

  set(index: number, value: number): number {
    return Atomics.store(this.#array, index, value);
  }

  increment(index: number): number {
    Atomics.add(this.#array, index, 1);

    return this.get(index);
  }

  sum(): number {
    return this.#array.reduce((acc, a) => acc + a);
  }
}

export class AtomicUintCounter {
  #atomicArray: AtomicUInt32Array;

  constructor() {
    this.#atomicArray = new AtomicUInt32Array(1);
  }

  get value(): number {
    return this.#atomicArray.get(0);
  }

  increment(): number {
    return this.#atomicArray.increment(0);
  }
}

export const getApi = async (endpoint: string, fallback: any = null) => {
  const url = new URL(endpoint, baseUrl);

  if (url.origin === baseUrl.origin) {
    url.pathname = baseUrl.pathname + url.pathname;
  }

  url.searchParams.append("access_token", token);

  try {
    const res = await fetch(url.toString());

    return await res.json();
  } catch (err) {
    console.error(err);
    return fallback;
  }
};

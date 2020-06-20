// @ts-ignore: Deno caching stupid stuff
import { config as readEnvFile } from "https://deno.land/x/dotenv/mod.ts";
// @ts-ignore: Deno caching stupid stuff
import { join as pathJoin, dirname } from "https://deno.land/std/path/mod.ts";

const encoder = new TextEncoder();

export enum WorkerMessageTypeWorker {
  STATUS = "worker-status",
  DATA = "worker-data",
}

export enum WorkerMessageTypeHost {
  FETCH = "host-fetch",
}

export interface WorkerMessage {
  id?: number;
  type: WorkerMessageTypeWorker | WorkerMessageTypeHost;
  data: any;
}

export interface Gw2CommercePriceNormalized {
  sellsFor: number;
  buysFor: number;
  normalizedSellsFor: number;
  normalizedBuysFor: number;
}

export interface Gw2Item {
  name: string;
  id: number;
  multiplier?: number;
  ah: Gw2CommercePriceNormalized;
}

export interface Gw2ItemMap {
  [id: number]: Gw2Item;
}

export interface Gw2CommercePrice {
  id: number;
  whitelisted: boolean;
  buys: {
    quantity: number;
    unit_price: number;
  };
  sells: {
    quantity: number;
    unit_price: number;
  };
}

const { GW2_API_BASE: baseUri, GW2_API_TOKEN: token } = readEnvFile({
  safe: true,
});

const baseUrl = new URL(baseUri);

const __dirname = dirname(new URL(import.meta.url).pathname);

export const itemsFileName = pathJoin(
  __dirname,
  "../",
  "data",
  "items.json"
);
export const itemsMapFileName = pathJoin(
  __dirname,
  "../",
  "data",
  "items.map.json"
);

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const moveUpLines = (numLines: number = 1): number =>
  logRaw(`\x1b[${numLines}A`);
export const moveDownLines = (numLines: number = 1): number =>
  logRaw(`\x1b[${numLines}B`);
export const clearLine = (): number => logRaw("\x1b[2K\r");

export const logRaw = (text: string): number =>
  Deno.stdout.writeSync(encoder.encode(text));
export const log = (...args: any): void => console.log("|>", ...args);
export const logOverride = (...args: any): void => {
  moveUpLines(1);
  clearLine();
  log(...args);
};

export const fileTextAppender = (file: Deno.File) => (text: string): number =>
  file.writeSync(encoder.encode(text));

export const arrayChunk = <T>(array: Array<T>, chunkSize: number): T[][] =>
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

  forEach(
    cb: (value: number, key: number, array: Uint32Array) => void,
    thisArg?: any
  ): void {
    this.#array.forEach(cb, thisArg);
  }
}

export class AtomicCounter {
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

export class Gw2Api {
  static async get<T>(endpoint: string, fallback?: T): Promise<T | any> {
    const url = new URL(endpoint, baseUrl);

    if (url.origin === baseUrl.origin) {
      url.pathname = baseUrl.pathname + url.pathname;
    }

    url.searchParams.append("access_token", token);

    try {
      let res = await fetch(url.toString());

      while (res.status === 429) {
        await sleep(1000);
        res = await fetch(url.toString());
      }

      return await res.json();
    } catch (err) {
      console.error(err);
      return fallback;
    }
  }
}

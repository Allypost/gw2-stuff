#!/usr/bin/env -S deno run --allow-read --allow-net=api.guildwars2.com --allow-env

// @ts-ignore: Deno caching stupid stuff
import * as Colours from "https://deno.land/std/fmt/colors.ts";
import {
  log,
  logOverride,
  itemsFileName,
  Gw2Api,
  Gw2Item,
  Gw2ItemMap,
  Gw2CommercePrice,
} from "./includes/helpers.ts";

const sets = [
  "Ice Reaver",
  "Dark Wing",
  "Draconic",
  "Seven Reapers",
  "Endless Ocean",
  "Bioluminescent",
  "Branded",
  "Defiant Glass",
];

const types = [
  "Axe",
  "Longbow",
  "Short Bow",
  "Dagger",
  "Focus",
  "Greatsword",
  "Hammer",
  "Mace",
  "Pistol",
  "Rifle",
  "Scepter",
  "Shield",
  "Staff",
  "Sword",
  "Torch",
  "Warhorn",
];

const multiplier = [1, 2];

const setMultipliers = sets.map((setName, i) => [setName, multiplier[i] || 3]);

log("Parsing items file...");
const itemList: Gw2Item[] = JSON.parse(await Deno.readTextFile(itemsFileName));
logOverride("Parsed items file");

const regex = new RegExp(
  sets
    .map((setName) => `(?:${setName} (?:${types.join("|")}) Skin)`)
    .filter((a) => a)
    .reduce((str, acc) => `${acc}|${str}`, "")
    .replace(/\|$/, "")
);

log("Filtering items...");
const setItems = itemList.filter(({ name }) => regex.test(name));

setMultipliers.forEach(([setName, multiplier]) => {
  setItems.forEach((item) => {
    if (!item.name.startsWith(String(setName))) {
      return;
    }

    item.multiplier = Number(multiplier);
  });
});

const setItemMap: Gw2ItemMap = Object.fromEntries(
  setItems.map((item: any) => [item.id, item])
);
logOverride("Filtered items");

const setItemIds = setItems.map(({ id }) => id).join(",");

log("Fetching trading post data...");
const ahData: Gw2CommercePrice[] = await Gw2Api.get(
  `/commerce/prices?ids=${setItemIds}`
);
logOverride("Fetched trading post data");

const finalItems: Gw2Item[] = ahData
  .map(({ id, ...ahInfo }) => ({
    ...setItemMap[id],
    ah: {
      sellsFor: ahInfo.sells.unit_price,
      buysFor: ahInfo.buys.unit_price,
    },
  }))
  .map(({ ah, multiplier, ...item }) => ({
    ...item,
    ah: {
      ...ah,
      normalizedSellsFor: Math.round(ah.sellsFor / Number(multiplier)),
      normalizedBuysFor: Math.round(ah.buysFor / Number(multiplier)),
    },
  }));

const maxLens = Array(5).fill(0);

for (const item of finalItems) {
  Object.values([
    item.name,
    item.ah.buysFor,
    item.ah.sellsFor,
    item.ah.normalizedBuysFor,
    item.ah.normalizedSellsFor,
  ]).forEach((e, i) => {
    maxLens[i] = Math.max(String(e).length, maxLens[i]);
  });
}

const sortKey = "normalizedSellsFor";

const p = (i: number, text: string | number): string =>
  String(text).padStart(maxLens[i]);
const y = (i: number, text: string | number): string =>
  Colours.yellow(p(i, text));

finalItems
  .sort((a, b) => b.ah[sortKey] - a.ah[sortKey])
  .forEach(({ name, ah }) =>
    console.log(
      `${p(0, name)}:`,
      y(1, ah.buysFor),
      "|",
      y(3, ah.normalizedBuysFor),
      "<=>",
      y(4, ah.normalizedSellsFor),
      "|",
      y(2, ah.sellsFor)
    )
  );

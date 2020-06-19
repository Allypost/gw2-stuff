#!/usr/bin/env -S deno run --allow-read --allow-net=api.guildwars2.com

import { log, logOverride, itemsFileName, getApi } from "./helpers.ts";
import * as Colours from "https://deno.land/std/fmt/colors.ts";

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
const itemList = JSON.parse(await Deno.readTextFile(itemsFileName));
logOverride("Parsed items file");

const regex = new RegExp(
  "(?:" +
    sets
      .map((setName) => new RegExp(`${setName} (?:${types.join("|")}) Skin`))
      .reduce((str, acc) => `${acc})|(?:${str}`, "")
      .replace(/\//g, "") +
    ")"
);

log("Filtering items...");
const setItems = itemList.filter(({ name }) => regex.test(name));

setMultipliers.forEach(([setName, multiplier]) => {
  setItems.forEach((item) => {
    if (!item.name.startsWith(setName)) {
      return;
    }

    item.multiplier = multiplier;
  });
});

const setItemMap = Object.fromEntries(setItems.map((item) => [item.id, item]));
logOverride("Filtered items");

const setItemIds = setItems.map(({ id }) => id).join(",");

log("Fetching trading post data...");
const ahData = await getApi(`/commerce/prices?ids=${setItemIds}`);
logOverride("Fetched trading post data");

const finalItems = ahData
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
      normalizedSellsFor: Math.round(ah.sellsFor / multiplier),
      normalizedBuysFor: Math.round(ah.buysFor / multiplier),
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

const p = (i, text) => String(text).padStart(maxLens[i]);
const y = (i, text) => Colours.yellow(p(i, text));

finalItems
  .sort((a, b) => b.ah[sortKey] - a.ah[sortKey])
  .forEach(({ name, ah }) =>
    console.log(
      `${p(0, name)}:`,
      y(1, ah.buysFor),
      "|",
      y(3, ah.normalizedBuysFor),
      "<=>",
      y(2, ah.sellsFor),
      "|",
      y(4, ah.normalizedSellsFor)
    )
  );

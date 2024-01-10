import { Lucid } from "./mod.ts";

const lucid = new Lucid();
lucid.utils = new Utils(lucid);
const mintingPolicy = lucid.utils.nativeScriptFromJson({
  type: "all",
  scripts: [
    {
      type: "sig",
      keyHash: "5bbae9aefd79f42808c8e72bf785da1ca0be913ded023f0a47d5f502",
    },
    {
      type: "before",
      slot: lucid.utils.unixTimeToSlot(new Date("2040-01-01").getTime()),
    },
  ],
});
console.log(mintingPolicy);

import { C } from "../core/mod.ts";
import { CostModels } from "../mod.ts";
import { ProtocolParameters } from "../types/types.ts";

export function createCostModels(costModels: CostModels): C.Costmdls {
  const costmdls = C.Costmdls.new();

  // add plutus v1
  const costmdlV1 = C.CostModel.new();
  Object.values(costModels.PlutusV1).forEach((cost, index) => {
    costmdlV1.set(index, C.Int.new(C.BigNum.from_str(cost.toString())));
  });
  costmdls.insert(C.Language.new_plutus_v1(), costmdlV1);

  // add plutus v2
  const costmdlV2 = C.CostModel.new_plutus_v2();
  Object.values(costModels.PlutusV2 || []).forEach((cost, index) => {
    costmdlV2.set(index, C.Int.new(C.BigNum.from_str(cost.toString())));
  });
  costmdls.insert(C.Language.new_plutus_v2(), costmdlV2);

  return costmdls;
}

export const PROTOCOL_PARAMETERS_DEFAULT: ProtocolParameters = {
  minFeeA: 44,
  minFeeB: 155381,
  maxTxSize: 16384,
  maxValSize: 5000,
  keyDeposit: 2000000n,
  poolDeposit: 500000000n,
  priceMem: 0.0577,
  priceStep: 0.0000721,
  maxTxExMem: 14000000n,
  maxTxExSteps: 10000000000n,
  coinsPerUtxoByte: 4310n,
  collateralPercentage: 150,
  maxCollateralInputs: 3,
  costModels: {
    PlutusV1: [
      205665, 812, 1, 1, 1000, 571, 0, 1, 1000, 24177, 4, 1, 1000, 32, 117366,
      10475, 4, 23000, 100, 23000, 100, 23000, 100, 23000, 100, 23000, 100,
      23000, 100, 100, 100, 23000, 100, 19537, 32, 175354, 32, 46417, 4, 221973,
      511, 0, 1, 89141, 32, 497525, 14068, 4, 2, 196500, 453240, 220, 0, 1, 1,
      1000, 28662, 4, 2, 245000, 216773, 62, 1, 1060367, 12586, 1, 208512, 421,
      1, 187000, 1000, 52998, 1, 80436, 32, 43249, 32, 1000, 32, 80556, 1,
      57667, 4, 1000, 10, 197145, 156, 1, 197145, 156, 1, 204924, 473, 1,
      208896, 511, 1, 52467, 32, 64832, 32, 65493, 32, 22558, 32, 16563, 32,
      76511, 32, 196500, 453240, 220, 0, 1, 1, 69522, 11687, 0, 1, 60091, 32,
      196500, 453240, 220, 0, 1, 1, 196500, 453240, 220, 0, 1, 1, 806990, 30482,
      4, 1927926, 82523, 4, 265318, 0, 4, 0, 85931, 32, 205665, 812, 1, 1,
      41182, 32, 212342, 32, 31220, 32, 32696, 32, 43357, 32, 32247, 32, 38314,
      32, 9462713, 1021, 10,
    ],
    PlutusV2: [
      205665, 812, 1, 1, 1000, 571, 0, 1, 1000, 24177, 4, 1, 1000, 32, 117366,
      10475, 4, 23000, 100, 23000, 100, 23000, 100, 23000, 100, 23000, 100,
      23000, 100, 100, 100, 23000, 100, 19537, 32, 175354, 32, 46417, 4, 221973,
      511, 0, 1, 89141, 32, 497525, 14068, 4, 2, 196500, 453240, 220, 0, 1, 1,
      1000, 28662, 4, 2, 245000, 216773, 62, 1, 1060367, 12586, 1, 208512, 421,
      1, 187000, 1000, 52998, 1, 80436, 32, 43249, 32, 1000, 32, 80556, 1,
      57667, 4, 1000, 10, 197145, 156, 1, 197145, 156, 1, 204924, 473, 1,
      208896, 511, 1, 52467, 32, 64832, 32, 65493, 32, 22558, 32, 16563, 32,
      76511, 32, 196500, 453240, 220, 0, 1, 1, 69522, 11687, 0, 1, 60091, 32,
      196500, 453240, 220, 0, 1, 1, 196500, 453240, 220, 0, 1, 1, 1159724,
      392670, 0, 2, 806990, 30482, 4, 1927926, 82523, 4, 265318, 0, 4, 0, 85931,
      32, 205665, 812, 1, 1, 41182, 32, 212342, 32, 31220, 32, 32696, 32, 43357,
      32, 32247, 32, 38314, 32, 35892428, 10, 57996947, 18975, 10, 38887044,
      32947, 10,
    ],
  },
};

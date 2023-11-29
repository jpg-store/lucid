import { TransactionBuilder } from "../core/libs/cardano_multiplatform_lib/nodejs/cardano_multiplatform_lib.generated.js";
import { Address, Assets, C, CertificateValidator, Datum, Lucid, MintingPolicy, OutputData, PoolParams, Redeemer, RewardAddress, SpendingValidator, Tx, WithdrawalValidator } from "../mod.js";
import { FreeableBucket } from "./freeable.js";
export declare function getScriptWitness(redeemer: Redeemer, datum?: Datum): C.ScriptWitness;
export declare function getStakeCredential(hash: string, type: "Key" | "Script"): C.StakeCredential;
export declare function createPoolRegistration(poolParams: PoolParams, lucid: Lucid): Promise<C.PoolRegistration>;
export declare function attachScript(tx: Tx, { type, script, }: SpendingValidator | MintingPolicy | CertificateValidator | WithdrawalValidator): void;
export declare function addressFromWithNetworkCheck(address: Address | RewardAddress, lucid: Lucid): C.Address;
export declare function getDatumFromOutputData(outputData?: OutputData): {
    datum?: C.Datum | undefined;
    plutusData?: C.PlutusData;
};
export declare function createOutput({ bucket, address, assets, outputData, lucid, txBuilder, }: {
    bucket: FreeableBucket;
    address: Address;
    assets: Assets;
    outputData: OutputData;
    lucid: Lucid;
    txBuilder: TransactionBuilder;
}): C.TransactionOutput;

import { C } from "../core/mod.js";
import { applyDoubleCborEncoding, fromHex, toHex } from "../utils/mod.js";
import packageJson from "../../package.js";
import { Freeables } from "../utils/freeable.js";
export class Blockfrost {
    constructor(url, projectId) {
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "projectId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.url = url;
        this.projectId = projectId || "";
    }
    async getProtocolParameters() {
        const result = await fetch(`${this.url}/epochs/latest/parameters`, {
            headers: { project_id: this.projectId, lucid },
        }).then((res) => res.json());
        return {
            minFeeA: parseInt(result.min_fee_a),
            minFeeB: parseInt(result.min_fee_b),
            maxTxSize: parseInt(result.max_tx_size),
            maxValSize: parseInt(result.max_val_size),
            keyDeposit: BigInt(result.key_deposit),
            poolDeposit: BigInt(result.pool_deposit),
            priceMem: parseFloat(result.price_mem),
            priceStep: parseFloat(result.price_step),
            maxTxExMem: BigInt(result.max_tx_ex_mem),
            maxTxExSteps: BigInt(result.max_tx_ex_steps),
            coinsPerUtxoByte: BigInt(result.coins_per_utxo_size),
            collateralPercentage: parseInt(result.collateral_percent),
            maxCollateralInputs: parseInt(result.max_collateral_inputs),
            costModels: result.cost_models,
        };
    }
    async getUtxos(addressOrCredential) {
        const queryPredicate = (() => {
            if (typeof addressOrCredential === "string")
                return addressOrCredential;
            const hash = addressOrCredential.type === "Key"
                ? C.Ed25519KeyHash.from_hex(addressOrCredential.hash)
                : C.ScriptHash.from_hex(addressOrCredential.hash);
            const credentialBech32 = hash.to_bech32("addr_vkh"); // should be 'script' according to CIP-0005, but to maintain bakcwards compatabiltiy I am not changing this
            hash.free();
            return credentialBech32;
        })();
        let result = [];
        let page = 1;
        while (true) {
            const pageResult = await fetch(`${this.url}/addresses/${queryPredicate}/utxos?page=${page}`, { headers: { project_id: this.projectId, lucid } }).then((res) => res.json());
            if (pageResult.error) {
                if (pageResult.status_code === 404) {
                    return [];
                }
                else {
                    throw new Error("Could not fetch UTxOs from Blockfrost. Try again.");
                }
            }
            result = result.concat(pageResult);
            if (pageResult.length <= 0)
                break;
            page++;
        }
        return this.blockfrostUtxosToUtxos(result);
    }
    async getUtxosWithUnit(addressOrCredential, unit) {
        const queryPredicate = (() => {
            if (typeof addressOrCredential === "string")
                return addressOrCredential;
            const hash = addressOrCredential.type === "Key"
                ? C.Ed25519KeyHash.from_hex(addressOrCredential.hash)
                : C.ScriptHash.from_hex(addressOrCredential.hash);
            const credentialBech32 = hash.to_bech32("addr_vkh"); // should be 'script' according to CIP-0005, but to maintain bakcwards compatabiltiy I am not changing this
            hash.free();
            return credentialBech32;
        })();
        let result = [];
        let page = 1;
        while (true) {
            const pageResult = await fetch(`${this.url}/addresses/${queryPredicate}/utxos/${unit}?page=${page}`, { headers: { project_id: this.projectId, lucid } }).then((res) => res.json());
            if (pageResult.error) {
                if (pageResult.status_code === 404) {
                    return [];
                }
                else {
                    throw new Error("Could not fetch UTxOs from Blockfrost. Try again.");
                }
            }
            result = result.concat(pageResult);
            if (pageResult.length <= 0)
                break;
            page++;
        }
        return this.blockfrostUtxosToUtxos(result);
    }
    async getUtxoByUnit(unit) {
        const addresses = await fetch(`${this.url}/assets/${unit}/addresses?count=2`, { headers: { project_id: this.projectId, lucid } }).then((res) => res.json());
        if (!addresses || addresses.error) {
            throw new Error("Unit not found.");
        }
        if (addresses.length > 1) {
            throw new Error("Unit needs to be an NFT or only held by one address.");
        }
        const address = addresses[0].address;
        const utxos = await this.getUtxosWithUnit(address, unit);
        if (utxos.length > 1) {
            throw new Error("Unit needs to be an NFT or only held by one address.");
        }
        return utxos[0];
    }
    async getUtxosByOutRef(outRefs) {
        // TODO: Make sure old already spent UTxOs are not retrievable.
        const queryHashes = [...new Set(outRefs.map((outRef) => outRef.txHash))];
        const utxos = await Promise.all(queryHashes.map(async (txHash) => {
            const result = await fetch(`${this.url}/txs/${txHash}/utxos`, {
                headers: { project_id: this.projectId, lucid },
            }).then((res) => res.json());
            if (!result || result.error) {
                return [];
            }
            const utxosResult = result.outputs.map((
            // deno-lint-ignore no-explicit-any
            r) => ({
                ...r,
                tx_hash: txHash,
            }));
            return this.blockfrostUtxosToUtxos(utxosResult);
        }));
        return utxos
            .reduce((acc, utxos) => acc.concat(utxos), [])
            .filter((utxo) => outRefs.some((outRef) => utxo.txHash === outRef.txHash &&
            utxo.outputIndex === outRef.outputIndex));
    }
    async getDelegation(rewardAddress) {
        const result = await fetch(`${this.url}/accounts/${rewardAddress}`, {
            headers: { project_id: this.projectId, lucid },
        }).then((res) => res.json());
        if (!result || result.error) {
            return { poolId: null, rewards: 0n };
        }
        return {
            poolId: result.pool_id || null,
            rewards: BigInt(result.withdrawable_amount),
        };
    }
    async getDatum(datumHash) {
        const datum = await fetch(`${this.url}/scripts/datum/${datumHash}/cbor`, {
            headers: { project_id: this.projectId, lucid },
        })
            .then((res) => res.json())
            .then((res) => res.cbor);
        if (!datum || datum.error) {
            throw new Error(`No datum found for datum hash: ${datumHash}`);
        }
        return datum;
    }
    awaitTx(txHash, checkInterval = 3000) {
        return new Promise((res) => {
            const confirmation = setInterval(async () => {
                const isConfirmed = await fetch(`${this.url}/txs/${txHash}`, {
                    headers: { project_id: this.projectId, lucid },
                }).then((res) => res.json());
                if (isConfirmed && !isConfirmed.error) {
                    clearInterval(confirmation);
                    await new Promise((res) => setTimeout(() => res(1), 1000));
                    return res(true);
                }
            }, checkInterval);
        });
    }
    async submitTx(tx) {
        const result = await fetch(`${this.url}/tx/submit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/cbor",
                project_id: this.projectId,
                lucid,
            },
            body: fromHex(tx),
        }).then((res) => res.json());
        if (!result || result.error) {
            if (result?.status_code === 400)
                throw new Error(result.message);
            else
                throw new Error("Could not submit transaction.");
        }
        return result;
    }
    async blockfrostUtxosToUtxos(result) {
        return (await Promise.all(result.map(async (r) => ({
            txHash: r.tx_hash,
            outputIndex: r.output_index,
            assets: Object.fromEntries(r.amount.map(({ unit, quantity }) => [unit, BigInt(quantity)])),
            address: r.address,
            datumHash: (!r.inline_datum && r.data_hash) || undefined,
            datum: r.inline_datum || undefined,
            scriptRef: r.reference_script_hash
                ? await (async () => {
                    const { type } = await fetch(`${this.url}/scripts/${r.reference_script_hash}`, {
                        headers: { project_id: this.projectId, lucid },
                    }).then((res) => res.json());
                    // TODO: support native scripts
                    if (type === "Native" || type === "native") {
                        throw new Error("Native script ref not implemented!");
                    }
                    const { cbor: script } = await fetch(`${this.url}/scripts/${r.reference_script_hash}/cbor`, { headers: { project_id: this.projectId, lucid } }).then((res) => res.json());
                    return {
                        type: type === "plutusV1" ? "PlutusV1" : "PlutusV2",
                        script: applyDoubleCborEncoding(script),
                    };
                })()
                : undefined,
        }))));
    }
}
/**
 * This function is temporarily needed only, until Blockfrost returns the datum natively in Cbor.
 * The conversion is ambigious, that's why it's better to get the datum directly in Cbor.
 */
export function datumJsonToCbor(json) {
    const convert = (json) => {
        const bucket = [];
        try {
            if (!isNaN(json.int)) {
                const int = C.BigInt.from_str(json.int.toString());
                bucket.push(int);
                return C.PlutusData.new_integer(int);
            }
            else if (json.bytes || !isNaN(Number(json.bytes))) {
                return C.PlutusData.new_bytes(fromHex(json.bytes));
            }
            else if (json.map) {
                const m = C.PlutusMap.new();
                bucket.push(m);
                json.map.forEach(({ k, v }) => {
                    const key = convert(k);
                    bucket.push(key);
                    const value = convert(v);
                    bucket.push(value);
                    m.insert(key, value);
                });
                return C.PlutusData.new_map(m);
            }
            else if (json.list) {
                const l = C.PlutusList.new();
                bucket.push(l);
                json.list.forEach((v) => {
                    const value = convert(v);
                    bucket.push(value);
                    l.add(value);
                });
                return C.PlutusData.new_list(l);
            }
            else if (!isNaN(json.constructor)) {
                const l = C.PlutusList.new();
                bucket.push(l);
                json.fields.forEach((v) => {
                    const value = convert(v);
                    bucket.push(value);
                    l.add(value);
                });
                const constructorIndex = C.BigNum.from_str(json.constructor.toString());
                bucket.push(constructorIndex);
                const plutusData = C.ConstrPlutusData.new(constructorIndex, l);
                bucket.push(plutusData);
                return C.PlutusData.new_constr_plutus_data(plutusData);
            }
            throw new Error("Unsupported type");
        }
        finally {
            Freeables.free(...bucket);
        }
    };
    const convertedJson = convert(json);
    const cbor = convertedJson.to_bytes();
    convertedJson.free();
    return toHex(cbor);
}
const lucid = packageJson.version; // Lucid version

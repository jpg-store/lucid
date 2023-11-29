import { decode, decodeString, encodeToString, } from "../../deps/deno.land/std@0.100.0/encoding/hex.js";
import { C } from "../core/mod.js";
import { generateMnemonic } from "../misc/bip39.js";
import { crc8 } from "../misc/crc8.js";
import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime, unixTimeToEnclosingSlot, } from "../plutus/time.js";
import { Data } from "../plutus/data.js";
import { Freeables } from "./freeable.js";
export class Utils {
    constructor(lucid) {
        Object.defineProperty(this, "lucid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.lucid = lucid;
    }
    validatorToAddress(validator, stakeCredential) {
        const bucket = [];
        const networkId = networkToId(this.lucid.network);
        try {
            const validatorHash = this.validatorToScriptHash(validator);
            if (stakeCredential) {
                const validatorScriptHash = C.ScriptHash.from_hex(validatorHash);
                bucket.push(validatorScriptHash);
                const paymentPart = C.StakeCredential.from_scripthash(validatorScriptHash);
                bucket.push(paymentPart);
                let stakePart;
                if (stakeCredential.type === "Key") {
                    const keyHash = C.Ed25519KeyHash.from_hex(stakeCredential.hash);
                    stakePart = C.StakeCredential.from_keyhash(keyHash);
                    keyHash.free();
                }
                else {
                    const scriptHash = C.ScriptHash.from_hex(stakeCredential.hash);
                    stakePart = C.StakeCredential.from_scripthash(scriptHash);
                    scriptHash.free();
                }
                bucket.push(stakePart);
                const baseAddress = C.BaseAddress.new(networkId, paymentPart, stakePart);
                bucket.push(baseAddress);
                const address = baseAddress.to_address();
                bucket.push(address);
                return address.to_bech32(undefined);
            }
            else {
                const validatorScriptHash = C.ScriptHash.from_hex(validatorHash);
                bucket.push(validatorScriptHash);
                const paymentPart = C.StakeCredential.from_scripthash(validatorScriptHash);
                bucket.push(paymentPart);
                const enterpriseAddress = C.EnterpriseAddress.new(networkId, paymentPart);
                bucket.push(enterpriseAddress);
                const address = enterpriseAddress.to_address();
                bucket.push(address);
                return address.to_bech32(undefined);
            }
        }
        finally {
            Freeables.free(...bucket);
        }
    }
    credentialToAddress(paymentCredential, stakeCredential) {
        const networkId = networkToId(this.lucid.network);
        const bucket = [];
        try {
            if (stakeCredential) {
                let paymentPart;
                let stakePart;
                if (paymentCredential.type === "Key") {
                    const keyHash = C.Ed25519KeyHash.from_hex(paymentCredential.hash);
                    bucket.push(keyHash);
                    paymentPart = C.StakeCredential.from_keyhash(keyHash);
                }
                else {
                    const scriptHash = C.ScriptHash.from_hex(paymentCredential.hash);
                    bucket.push(scriptHash);
                    paymentPart = C.StakeCredential.from_scripthash(scriptHash);
                }
                bucket.push(paymentPart);
                if (stakeCredential.type === "Key") {
                    const keyHash = C.Ed25519KeyHash.from_hex(stakeCredential.hash);
                    bucket.push(keyHash);
                    stakePart = C.StakeCredential.from_keyhash(keyHash);
                }
                else {
                    const scriptHash = C.ScriptHash.from_hex(stakeCredential.hash);
                    bucket.push(scriptHash);
                    stakePart = C.StakeCredential.from_scripthash(scriptHash);
                }
                bucket.push(stakePart);
                const baseAddress = C.BaseAddress.new(networkId, paymentPart, stakePart);
                bucket.push(baseAddress);
                const address = baseAddress.to_address();
                bucket.push(address);
                return address.to_bech32(undefined);
            }
            else {
                let paymentPart;
                if (paymentCredential.type === "Key") {
                    const keyHash = C.Ed25519KeyHash.from_hex(paymentCredential.hash);
                    bucket.push(keyHash);
                    paymentPart = C.StakeCredential.from_keyhash(keyHash);
                }
                else {
                    const scriptHash = C.ScriptHash.from_hex(paymentCredential.hash);
                    bucket.push(scriptHash);
                    paymentPart = C.StakeCredential.from_scripthash(scriptHash);
                }
                bucket.push(paymentPart);
                const enterpriseAddress = C.EnterpriseAddress.new(networkId, paymentPart);
                bucket.push(enterpriseAddress);
                const address = enterpriseAddress.to_address();
                bucket.push(address);
                return address.to_bech32(undefined);
            }
        }
        finally {
            Freeables.free(...bucket);
        }
    }
    validatorToRewardAddress(validator) {
        const bucket = [];
        const validatorHash = this.validatorToScriptHash(validator);
        const scriptHash = C.ScriptHash.from_hex(validatorHash);
        bucket.push(scriptHash);
        const stakePart = C.StakeCredential.from_scripthash(scriptHash);
        bucket.push(stakePart);
        const rewardAddress = C.RewardAddress.new(networkToId(this.lucid.network), stakePart);
        bucket.push(rewardAddress);
        const address = rewardAddress.to_address();
        bucket.push(address);
        const bech32 = address.to_bech32(undefined);
        Freeables.free(...bucket);
        return bech32;
    }
    credentialToRewardAddress(stakeCredential) {
        const bucket = [];
        let stakePart;
        if (stakeCredential.type === "Key") {
            const keyHash = C.Ed25519KeyHash.from_hex(stakeCredential.hash);
            bucket.push(keyHash);
            stakePart = C.StakeCredential.from_keyhash(keyHash);
        }
        else {
            const scriptHash = C.ScriptHash.from_hex(stakeCredential.hash);
            bucket.push(scriptHash);
            stakePart = C.StakeCredential.from_scripthash(scriptHash);
        }
        bucket.push(stakePart);
        const rewardAddress = C.RewardAddress.new(networkToId(this.lucid.network), stakePart);
        bucket.push(rewardAddress);
        const address = rewardAddress.to_address();
        bucket.push(address);
        const bech32 = address.to_bech32(undefined);
        Freeables.free(...bucket);
        return bech32;
    }
    validatorToScriptHash(validator) {
        const bucket = [];
        try {
            switch (validator.type) {
                case "Native": {
                    const nativeScript = C.NativeScript.from_bytes(fromHex(validator.script));
                    bucket.push(nativeScript);
                    const hash = nativeScript.hash(C.ScriptHashNamespace.NativeScript);
                    bucket.push(hash);
                    return hash.to_hex();
                }
                case "PlutusV1": {
                    const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(validator.script)));
                    bucket.push(plutusScript);
                    const hash = plutusScript.hash(C.ScriptHashNamespace.PlutusV1);
                    bucket.push(hash);
                    return hash.to_hex();
                }
                case "PlutusV2": {
                    const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(validator.script)));
                    bucket.push(plutusScript);
                    const hash = plutusScript.hash(C.ScriptHashNamespace.PlutusV2);
                    bucket.push(hash);
                    return hash.to_hex();
                }
                default:
                    throw new Error("No variant matched");
            }
        }
        finally {
            Freeables.free(...bucket);
        }
    }
    mintingPolicyToId(mintingPolicy) {
        return this.validatorToScriptHash(mintingPolicy);
    }
    datumToHash(datum) {
        const plutusData = C.PlutusData.from_bytes(fromHex(datum));
        const hash = C.hash_plutus_data(plutusData);
        plutusData.free();
        const datumHash = hash.to_hex();
        hash.free();
        return datumHash;
    }
    scriptHashToCredential(scriptHash) {
        return {
            type: "Script",
            hash: scriptHash,
        };
    }
    keyHashToCredential(keyHash) {
        return {
            type: "Key",
            hash: keyHash,
        };
    }
    generatePrivateKey() {
        return generatePrivateKey();
    }
    generateSeedPhrase() {
        return generateSeedPhrase();
    }
    unixTimeToSlot(unixTime) {
        return unixTimeToEnclosingSlot(unixTime, SLOT_CONFIG_NETWORK[this.lucid.network]);
    }
    slotToUnixTime(slot) {
        return slotToBeginUnixTime(slot, SLOT_CONFIG_NETWORK[this.lucid.network]);
    }
    /** Address can be in Bech32 or Hex. */
    getAddressDetails(address) {
        return getAddressDetails(address);
    }
    /**
     * Convert a native script from Json to the Hex representation.
     * It follows this Json format: https://github.com/input-output-hk/cardano-node/blob/master/doc/reference/simple-scripts.md
     */
    nativeScriptFromJson(nativeScript) {
        return nativeScriptFromJson(nativeScript);
    }
    paymentCredentialOf(address) {
        return paymentCredentialOf(address);
    }
    stakeCredentialOf(rewardAddress) {
        return stakeCredentialOf(rewardAddress);
    }
    getMinAdaForOutput(output) {
        const minAda = C.min_ada_required(output, C.BigNum.from_str(this.lucid.protocolParameters.coinsPerUtxoByte.toString()));
        return BigInt(minAda.to_str()).valueOf();
    }
}
function addressFromHexOrBech32(address) {
    try {
        return C.Address.from_bytes(fromHex(address));
    }
    catch (_e) {
        try {
            return C.Address.from_bech32(address);
        }
        catch (_e) {
            throw new Error("Could not deserialize address.");
        }
    }
}
/** Address can be in Bech32 or Hex. */
export function getAddressDetails(address) {
    const bucket = [];
    // wrapped in an outer try to ensure that memory is freed
    try {
        // Base Address
        try {
            const parsedAddress = addressFromHexOrBech32(address);
            bucket.push(parsedAddress);
            const baseAddress = C.BaseAddress.from_address(parsedAddress);
            bucket.push(baseAddress);
            let paymentCredential;
            const paymentCred = baseAddress.payment_cred();
            bucket.push(paymentCred);
            if (paymentCred.kind() === 0) {
                const keyHash = paymentCred.to_keyhash();
                bucket.push(keyHash);
                paymentCredential = {
                    type: "Key",
                    hash: toHex(keyHash.to_bytes()),
                };
            }
            else {
                const scriptHash = paymentCred.to_scripthash();
                bucket.push(scriptHash);
                paymentCredential = {
                    type: "Script",
                    hash: toHex(scriptHash.to_bytes()),
                };
            }
            let stakeCredential;
            const stakeCred = baseAddress.stake_cred();
            bucket.push(stakeCred);
            if (stakeCred.kind() === 0) {
                const keyHash = stakeCred.to_keyhash();
                bucket.push(keyHash);
                stakeCredential = {
                    type: "Key",
                    hash: toHex(keyHash.to_bytes()),
                };
            }
            else {
                const scriptHash = stakeCred.to_scripthash();
                bucket.push(scriptHash);
                stakeCredential = {
                    type: "Script",
                    hash: toHex(scriptHash.to_bytes()),
                };
            }
            const cAddress = baseAddress.to_address();
            bucket.push(cAddress);
            return {
                type: "Base",
                networkId: cAddress.network_id(),
                address: {
                    bech32: cAddress.to_bech32(undefined),
                    hex: toHex(cAddress.to_bytes()),
                },
                paymentCredential,
                stakeCredential,
            };
        }
        catch (_e) {
            /* pass */
        }
        // Enterprise Address
        try {
            const parsedAddress = addressFromHexOrBech32(address);
            bucket.push(parsedAddress);
            const enterpriseAddress = C.EnterpriseAddress.from_address(parsedAddress);
            bucket.push(enterpriseAddress);
            let paymentCredential;
            const paymentCred = enterpriseAddress.payment_cred();
            bucket.push(paymentCred);
            if (paymentCred.kind() === 0) {
                const keyHash = paymentCred.to_keyhash();
                bucket.push(keyHash);
                paymentCredential = {
                    type: "Key",
                    hash: toHex(keyHash.to_bytes()),
                };
            }
            else {
                const scriptHash = paymentCred.to_scripthash();
                bucket.push(scriptHash);
                paymentCredential = {
                    type: "Script",
                    hash: toHex(scriptHash.to_bytes()),
                };
            }
            const cAddress = enterpriseAddress.to_address();
            bucket.push(cAddress);
            return {
                type: "Enterprise",
                networkId: cAddress.network_id(),
                address: {
                    bech32: cAddress.to_bech32(undefined),
                    hex: toHex(cAddress.to_bytes()),
                },
                paymentCredential,
            };
        }
        catch (_e) {
            /* pass */
        }
        // Pointer Address
        try {
            const parsedAddress = addressFromHexOrBech32(address);
            bucket.push(parsedAddress);
            const pointerAddress = C.PointerAddress.from_address(parsedAddress);
            bucket.push(pointerAddress);
            let paymentCredential;
            const paymentCred = pointerAddress.payment_cred();
            bucket.push(paymentCred);
            if (paymentCred.kind() === 0) {
                const keyHash = paymentCred.to_keyhash();
                bucket.push(keyHash);
                paymentCredential = {
                    type: "Key",
                    hash: toHex(keyHash.to_bytes()),
                };
            }
            else {
                const scriptHash = paymentCred.to_scripthash();
                bucket.push(scriptHash);
                paymentCredential = {
                    type: "Script",
                    hash: toHex(scriptHash.to_bytes()),
                };
            }
            const cAddress = pointerAddress.to_address();
            bucket.push(cAddress);
            return {
                type: "Pointer",
                networkId: cAddress.network_id(),
                address: {
                    bech32: cAddress.to_bech32(undefined),
                    hex: toHex(cAddress.to_bytes()),
                },
                paymentCredential,
            };
        }
        catch (_e) {
            /* pass */
        }
        // Reward Address
        try {
            const parsedAddress = addressFromHexOrBech32(address);
            bucket.push(parsedAddress);
            const rewardAddress = C.RewardAddress.from_address(parsedAddress);
            bucket.push(rewardAddress);
            let stakeCredential;
            const paymentCred = rewardAddress.payment_cred();
            bucket.push(paymentCred);
            if (paymentCred.kind() === 0) {
                const keyHash = paymentCred.to_keyhash();
                bucket.push(keyHash);
                stakeCredential = {
                    type: "Key",
                    hash: toHex(keyHash.to_bytes()),
                };
            }
            else {
                const scriptHash = paymentCred.to_scripthash();
                bucket.push(scriptHash);
                stakeCredential = {
                    type: "Script",
                    hash: toHex(scriptHash.to_bytes()),
                };
            }
            const cAddress = rewardAddress.to_address();
            bucket.push(cAddress);
            return {
                type: "Reward",
                networkId: cAddress.network_id(),
                address: {
                    bech32: cAddress.to_bech32(undefined),
                    hex: toHex(cAddress.to_bytes()),
                },
                stakeCredential,
            };
        }
        catch (_e) {
            /* pass */
        }
        // Limited support for Byron addresses
        try {
            const parsedAddress = ((address) => {
                try {
                    return C.ByronAddress.from_bytes(fromHex(address));
                }
                catch (_e) {
                    try {
                        return C.ByronAddress.from_base58(address);
                    }
                    catch (_e) {
                        throw new Error("Could not deserialize address.");
                    }
                }
            })(address);
            bucket.push(parsedAddress);
            const cAddress = parsedAddress.to_address();
            bucket.push(cAddress);
            return {
                type: "Byron",
                networkId: parsedAddress.network_id(),
                address: {
                    bech32: "",
                    hex: toHex(cAddress.to_bytes()),
                },
            };
        }
        catch (_e) {
            /* pass */
        }
        throw new Error("No address type matched for: " + address);
    }
    finally {
        Freeables.free(...bucket);
    }
}
export function paymentCredentialOf(address) {
    const { paymentCredential } = getAddressDetails(address);
    if (!paymentCredential) {
        throw new Error("The specified address does not contain a payment credential.");
    }
    return paymentCredential;
}
export function stakeCredentialOf(rewardAddress) {
    const { stakeCredential } = getAddressDetails(rewardAddress);
    if (!stakeCredential) {
        throw new Error("The specified address does not contain a stake credential.");
    }
    return stakeCredential;
}
export function generatePrivateKey() {
    const ed25519 = C.PrivateKey.generate_ed25519();
    const bech32 = ed25519.to_bech32();
    ed25519.free();
    return bech32;
}
export function generateSeedPhrase() {
    return generateMnemonic(256);
}
export function valueToAssets(value) {
    const bucket = [];
    const assets = {};
    const lovelace = value.coin();
    bucket.push(lovelace);
    assets["lovelace"] = BigInt(lovelace.to_str());
    const ma = value.multiasset();
    bucket.push(ma);
    if (ma) {
        const multiAssets = ma.keys();
        bucket.push(multiAssets);
        for (let j = 0; j < multiAssets.len(); j++) {
            const policy = multiAssets.get(j);
            bucket.push(policy);
            const policyAssets = ma.get(policy);
            bucket.push(policyAssets);
            const assetNames = policyAssets.keys();
            bucket.push(assetNames);
            for (let k = 0; k < assetNames.len(); k++) {
                const policyAsset = assetNames.get(k);
                bucket.push(policyAsset);
                const quantity = policyAssets.get(policyAsset);
                bucket.push(quantity);
                const unit = toHex(policy.to_bytes()) + toHex(policyAsset.name());
                assets[unit] = BigInt(quantity.to_str());
            }
        }
    }
    Freeables.free(...bucket);
    return assets;
}
export function assetsToValue(assets) {
    const bucket = [];
    const multiAsset = C.MultiAsset.new();
    bucket.push(multiAsset);
    const lovelace = assets["lovelace"];
    const units = Object.keys(assets);
    const policies = Array.from(new Set(units
        .filter((unit) => unit !== "lovelace")
        .map((unit) => unit.slice(0, 56))));
    policies.forEach((policy) => {
        const policyUnits = units.filter((unit) => unit.slice(0, 56) === policy);
        const assetsValue = C.Assets.new();
        policyUnits.forEach((unit) => {
            const assetName = C.AssetName.new(fromHex(unit.slice(56)));
            bucket.push(assetName);
            const quantity = C.BigNum.from_str(assets[unit].toString());
            bucket.push(quantity);
            assetsValue.insert(assetName, quantity);
        });
        const policyId = C.ScriptHash.from_bytes(fromHex(policy));
        bucket.push(policyId);
        multiAsset.insert(policyId, assetsValue);
    });
    const coin = C.BigNum.from_str(lovelace ? lovelace.toString() : "0");
    bucket.push(coin);
    const value = C.Value.new(coin);
    if (units.length > 1 || !lovelace)
        value.set_multiasset(multiAsset);
    Freeables.free(...bucket);
    return value;
}
export function fromScriptRef(scriptRef) {
    const bucket = [];
    try {
        const script = scriptRef.get();
        bucket.push(script);
        const kind = script.kind();
        switch (kind) {
            case 0: {
                const native = script.as_native();
                bucket.push(native);
                return {
                    type: "Native",
                    script: toHex(native.to_bytes()),
                };
            }
            case 1: {
                const plutusV1 = script.as_plutus_v1();
                bucket.push(plutusV1);
                return {
                    type: "PlutusV1",
                    script: toHex(plutusV1.to_bytes()),
                };
            }
            case 2: {
                const plutusV2 = script.as_plutus_v2();
                bucket.push(plutusV2);
                return {
                    type: "PlutusV2",
                    script: toHex(plutusV2.to_bytes()),
                };
            }
            default:
                throw new Error("No variant matched.");
        }
    }
    finally {
        Freeables.free(...bucket);
    }
}
export function toScriptRef(script) {
    const bucket = [];
    try {
        switch (script.type) {
            case "Native": {
                const nativeScript = C.NativeScript.from_bytes(fromHex(script.script));
                bucket.push(nativeScript);
                const cScript = C.Script.new_native(nativeScript);
                bucket.push(cScript);
                return C.ScriptRef.new(cScript);
            }
            case "PlutusV1": {
                const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(script.script)));
                bucket.push(plutusScript);
                const cScript = C.Script.new_plutus_v1(plutusScript);
                bucket.push(cScript);
                return C.ScriptRef.new(cScript);
            }
            case "PlutusV2": {
                const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(script.script)));
                bucket.push(plutusScript);
                const cScript = C.Script.new_plutus_v2(plutusScript);
                bucket.push(cScript);
                return C.ScriptRef.new(cScript);
            }
            default:
                throw new Error("No variant matched.");
        }
    }
    finally {
        Freeables.free(...bucket);
    }
}
export function utxoToCore(utxo) {
    const bucket = [];
    const address = (() => {
        try {
            console.log("success");
            return C.Address.from_bech32(utxo.address);
        }
        catch (_e) {
            const byronAddress = C.ByronAddress.from_base58(utxo.address);
            bucket.push(byronAddress);
            return byronAddress.to_address();
        }
    })();
    bucket.push(address);
    const value = assetsToValue(utxo.assets);
    bucket.push(value);
    const output = C.TransactionOutput.new(address, value);
    bucket.push(output);
    if (utxo.datumHash) {
        const dataHash = C.DataHash.from_bytes(fromHex(utxo.datumHash));
        bucket.push(dataHash);
        const datum = C.Datum.new_data_hash(dataHash);
        bucket.push(datum);
        output.set_datum(datum);
    }
    // inline datum
    if (!utxo.datumHash && utxo.datum) {
        const plutusData = C.PlutusData.from_bytes(fromHex(utxo.datum));
        bucket.push(plutusData);
        const data = C.Data.new(plutusData);
        bucket.push(data);
        const datum = C.Datum.new_data(data);
        bucket.push(datum);
        output.set_datum(datum);
    }
    if (utxo.scriptRef) {
        const scriptRef = toScriptRef(utxo.scriptRef);
        bucket.push(scriptRef);
        output.set_script_ref(scriptRef);
    }
    const hash = C.TransactionHash.from_bytes(fromHex(utxo.txHash));
    bucket.push(hash);
    const index = C.BigNum.from_str(utxo.outputIndex.toString());
    bucket.push(index);
    const input = C.TransactionInput.new(hash, index);
    bucket.push(input);
    const coreUtxo = C.TransactionUnspentOutput.new(input, output);
    Freeables.free(...bucket);
    return coreUtxo;
}
export function coreToUtxo(coreUtxo) {
    const bucket = [];
    const input = coreUtxo.input();
    bucket.push(input);
    const output = coreUtxo.output();
    bucket.push(output);
    const txId = input.transaction_id();
    bucket.push(txId);
    const txHash = toHex(txId.to_bytes());
    const index = input.index();
    bucket.push(index);
    const outputIndex = parseInt(index.to_str());
    const amount = output.amount();
    bucket.push(amount);
    const assets = valueToAssets(amount);
    const cAddress = output.address();
    bucket.push(cAddress);
    const byronAddress = cAddress.as_byron();
    bucket.push(byronAddress);
    const address = byronAddress
        ? byronAddress.to_base58()
        : cAddress.to_bech32(undefined);
    const cDatum = output.datum();
    bucket.push(cDatum);
    const dataHash = cDatum?.as_data_hash();
    bucket.push(dataHash);
    const datumHash = dataHash?.to_hex();
    const cDatumData = cDatum?.as_data();
    bucket.push(cDatumData);
    const plutusData = cDatumData?.get();
    bucket.push(plutusData);
    const datum = plutusData && toHex(plutusData.to_bytes());
    const cScriptRef = output.script_ref();
    bucket.push(cScriptRef);
    const scriptRef = cScriptRef && fromScriptRef(cScriptRef);
    const utxo = {
        txHash,
        outputIndex,
        assets,
        address,
        datumHash,
        datum,
        scriptRef,
    };
    Freeables.free(...bucket);
    return utxo;
}
export function networkToId(network) {
    switch (network) {
        case "Preview":
            return 0;
        case "Preprod":
            return 0;
        case "Custom":
            return 0;
        case "Mainnet":
            return 1;
        default:
            throw new Error("Network not found");
    }
}
export function fromHex(hex) {
    return decodeString(hex);
}
export function toHex(bytes) {
    return encodeToString(bytes);
}
/** Convert a Hex encoded string to a Utf-8 encoded string. */
export function toText(hex) {
    return new TextDecoder().decode(decode(new TextEncoder().encode(hex)));
}
/** Convert a Utf-8 encoded string to a Hex encoded string. */
export function fromText(text) {
    return toHex(new TextEncoder().encode(text));
}
export function toPublicKey(privateKey) {
    const sKey = C.PrivateKey.from_bech32(privateKey);
    const vKey = sKey.to_public();
    const bech32 = vKey.to_bech32();
    Freeables.free(sKey, vKey);
    return bech32;
}
/** Padded number in Hex. */
function checksum(num) {
    return crc8(fromHex(num)).toString(16).padStart(2, "0");
}
export function toLabel(num) {
    if (num < 0 || num > 65535) {
        throw new Error(`Label ${num} out of range: min label 1 - max label 65535.`);
    }
    const numHex = num.toString(16).padStart(4, "0");
    return "0" + numHex + checksum(numHex) + "0";
}
export function fromLabel(label) {
    if (label.length !== 8 || !(label[0] === "0" && label[7] === "0")) {
        return null;
    }
    const numHex = label.slice(1, 5);
    const num = parseInt(numHex, 16);
    const check = label.slice(5, 7);
    return check === checksum(numHex) ? num : null;
}
/**
 * @param name Hex encoded
 */
export function toUnit(policyId, name, label) {
    const hexLabel = Number.isInteger(label) ? toLabel(label) : "";
    const n = name ? name : "";
    if ((n + hexLabel).length > 64) {
        throw new Error("Asset name size exceeds 32 bytes.");
    }
    if (policyId.length !== 56) {
        throw new Error(`Policy id invalid: ${policyId}.`);
    }
    return policyId + hexLabel + n;
}
/**
 * Splits unit into policy id, asset name (entire asset name), name (asset name without label) and label if applicable.
 * name will be returned in Hex.
 */
export function fromUnit(unit) {
    const policyId = unit.slice(0, 56);
    const assetName = unit.slice(56) || null;
    const label = fromLabel(unit.slice(56, 64));
    const name = (() => {
        const hexName = Number.isInteger(label) ? unit.slice(64) : unit.slice(56);
        return hexName || null;
    })();
    return { policyId, assetName, name, label };
}
/**
 * Convert a native script from Json to the Hex representation.
 * It follows this Json format: https://github.com/input-output-hk/cardano-node/blob/master/doc/reference/simple-scripts.md
 */
export function nativeScriptFromJson(nativeScript) {
    const cNativeScript = C.encode_json_str_to_native_script(JSON.stringify(nativeScript), "", C.ScriptSchema.Node);
    const script = toHex(cNativeScript.to_bytes());
    cNativeScript.free();
    return {
        type: "Native",
        script,
    };
}
export function applyParamsToScript(plutusScript, params, type) {
    const p = (type ? Data.castTo(params, type) : params);
    // cPlutusScript ownership is passed to rust, so don't free
    const cPlutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(plutusScript)));
    const cParams = C.PlutusList.from_bytes(fromHex(Data.to(p)));
    const cScript = C.apply_params_to_plutus_script(cParams, cPlutusScript);
    const script = toHex(cScript.to_bytes());
    Freeables.free(cParams, cScript);
    return script;
}
export const chunk = (array, size) => {
    const chunks = [];
    const n = array.length;
    let i = 0;
    while (i < n) {
        chunks.push(array.slice(i, (i += size)));
    }
    return chunks;
};
/** Returns double cbor encoded script. If script is already double cbor encoded it's returned as it is. */
export function applyDoubleCborEncoding(script) {
    try {
        C.PlutusScript.from_bytes(C.PlutusScript.from_bytes(fromHex(script)).bytes());
        return script;
    }
    catch (_e) {
        const plutusScript = C.PlutusScript.new(fromHex(script));
        const bytes = plutusScript.to_bytes();
        plutusScript.free();
        return toHex(bytes);
    }
}
export function addAssets(...assets) {
    return assets.reduce((a, b) => {
        for (const k in b) {
            if (Object.hasOwn(b, k)) {
                a[k] = (a[k] || 0n) + b[k];
            }
        }
        return a;
    }, {});
}

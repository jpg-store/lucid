import { C, applyDoubleCborEncoding, assetsToValue, fromHex, networkToId, toScriptRef, } from "../mod.js";
import { Freeables } from "./freeable.js";
export function getScriptWitness(redeemer, datum) {
    const bucket = [];
    try {
        const plutusRedeemer = C.PlutusData.from_bytes(fromHex(redeemer));
        const plutusData = datum
            ? C.PlutusData.from_bytes(fromHex(datum))
            : undefined;
        const plutusWitness = C.PlutusWitness.new(plutusRedeemer, plutusData, undefined);
        // We shouldn't free plutusData as it is an Option
        bucket.push(plutusRedeemer, plutusWitness);
        return C.ScriptWitness.new_plutus_witness(plutusWitness);
    }
    finally {
        Freeables.free(...bucket);
    }
}
export function getStakeCredential(hash, type) {
    if (type === "Key") {
        const keyHash = C.Ed25519KeyHash.from_bytes(fromHex(hash));
        const credential = C.StakeCredential.from_keyhash(keyHash);
        Freeables.free(keyHash);
        return credential;
    }
    const scriptHash = C.ScriptHash.from_bytes(fromHex(hash));
    const credential = C.StakeCredential.from_scripthash(scriptHash);
    Freeables.free(scriptHash);
    return credential;
}
export async function createPoolRegistration(poolParams, lucid) {
    const bucket = [];
    try {
        const poolOwners = C.Ed25519KeyHashes.new();
        bucket.push(poolOwners);
        poolParams.owners.forEach((owner) => {
            const { stakeCredential } = lucid.utils.getAddressDetails(owner);
            if (stakeCredential?.type === "Key") {
                const keyHash = C.Ed25519KeyHash.from_hex(stakeCredential.hash);
                poolOwners.add(keyHash);
                bucket.push(keyHash);
            }
            else
                throw new Error("Only key hashes allowed for pool owners.");
        });
        const metadata = poolParams.metadataUrl
            ? await fetch(poolParams.metadataUrl).then((res) => res.arrayBuffer())
            : null;
        const metadataHash = metadata
            ? C.PoolMetadataHash.from_bytes(C.hash_blake2b256(new Uint8Array(metadata)))
            : null;
        const relays = C.Relays.new();
        bucket.push(metadataHash, relays);
        poolParams.relays.forEach((relay) => {
            switch (relay.type) {
                case "SingleHostIp": {
                    const ipV4 = relay.ipV4
                        ? C.Ipv4.new(new Uint8Array(relay.ipV4.split(".").map((b) => parseInt(b))))
                        : undefined;
                    const ipV6 = relay.ipV6
                        ? C.Ipv6.new(fromHex(relay.ipV6.replaceAll(":", "")))
                        : undefined;
                    const host = C.SingleHostAddr.new(relay.port, ipV4, ipV6);
                    const newRelay = C.Relay.new_single_host_addr(host);
                    //We shouldn't free ipV4 and ipV6 as they are optionals
                    bucket.push(host, newRelay);
                    relays.add(newRelay);
                    break;
                }
                case "SingleHostDomainName": {
                    const record = C.DNSRecordAorAAAA.new(relay.domainName);
                    const host = C.SingleHostName.new(relay.port, record);
                    const newRelay = C.Relay.new_single_host_name(host);
                    bucket.push(record, host, newRelay);
                    relays.add(newRelay);
                    break;
                }
                case "MultiHost": {
                    const record = C.DNSRecordSRV.new(relay.domainName);
                    const host = C.MultiHostName.new(record);
                    const newRelay = C.Relay.new_multi_host_name(host);
                    bucket.push(record, host, newRelay);
                    relays.add(newRelay);
                    break;
                }
            }
        });
        const operator = C.Ed25519KeyHash.from_bech32(poolParams.poolId);
        const vrfKeyHash = C.VRFKeyHash.from_hex(poolParams.vrfKeyHash);
        const pledge = C.BigNum.from_str(poolParams.pledge.toString());
        const cost = C.BigNum.from_str(poolParams.cost.toString());
        const margin = C.UnitInterval.from_float(poolParams.margin);
        const addr = addressFromWithNetworkCheck(poolParams.rewardAddress, lucid);
        const rewardAddress = C.RewardAddress.from_address(addr);
        const url = C.Url.new(poolParams.metadataUrl);
        const poolMetadata = metadataHash
            ? C.PoolMetadata.new(url, metadataHash)
            : undefined;
        bucket.push(operator, vrfKeyHash, pledge, cost, margin, addr, rewardAddress, url, poolMetadata);
        const params = C.PoolParams.new(operator, vrfKeyHash, pledge, cost, margin, rewardAddress, poolOwners, relays, poolMetadata);
        const poolRegistration = C.PoolRegistration.new(params);
        return poolRegistration;
    }
    finally {
        Freeables.free(...bucket);
    }
}
export function attachScript(tx, { type, script, }) {
    if (type === "Native") {
        const nativeScript = C.NativeScript.from_bytes(fromHex(script));
        tx.txBuilder.add_native_script(nativeScript);
        Freeables.free(nativeScript);
        return;
    }
    else if (type === "PlutusV1") {
        const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(script)));
        tx.txBuilder.add_plutus_script(plutusScript);
        Freeables.free(plutusScript);
        return;
    }
    else if (type === "PlutusV2") {
        const plutusScript = C.PlutusScript.from_bytes(fromHex(applyDoubleCborEncoding(script)));
        tx.txBuilder.add_plutus_v2_script(plutusScript);
        Freeables.free(plutusScript);
        return;
    }
    throw new Error("No variant matched.");
}
export function addressFromWithNetworkCheck(address, lucid) {
    const { type, networkId } = lucid.utils.getAddressDetails(address);
    const actualNetworkId = networkToId(lucid.network);
    if (networkId !== actualNetworkId) {
        throw new Error(`Invalid address: Expected address with network id ${actualNetworkId}, but got ${networkId}`);
    }
    if (type === "Byron") {
        const byron = C.ByronAddress.from_base58(address);
        const addr = byron.to_address();
        byron.free();
        return addr;
    }
    return C.Address.from_bech32(address);
}
export function getDatumFromOutputData(outputData) {
    if (outputData?.hash) {
        const hash = C.DataHash.from_hex(outputData.hash);
        const datum = C.Datum.new_data_hash(hash);
        hash.free();
        return { datum };
    }
    else if (outputData?.asHash) {
        const plutusData = C.PlutusData.from_bytes(fromHex(outputData.asHash));
        const dataHash = C.hash_plutus_data(plutusData);
        const datum = C.Datum.new_data_hash(dataHash);
        dataHash.free();
        return { plutusData, datum };
    }
    else if (outputData?.inline) {
        const plutusData = C.PlutusData.from_bytes(fromHex(outputData.inline));
        const data = C.Data.new(plutusData);
        const datum = C.Datum.new_data(data);
        Freeables.free(plutusData, data);
        return { datum };
    }
    else {
        return {};
    }
}
export function createOutput({ bucket, address, assets, outputData, lucid, txBuilder, }) {
    const addr = addressFromWithNetworkCheck(address, lucid);
    const value = assetsToValue(assets);
    const output = C.TransactionOutput.new(addr, value);
    bucket.push(output, addr, value);
    if (outputData.hash) {
        const dataHash = C.DataHash.from_hex(outputData.hash);
        const datum = C.Datum.new_data_hash(dataHash);
        bucket.push(dataHash, datum);
        output.set_datum(datum);
    }
    else if (outputData.asHash) {
        const plutusData = C.PlutusData.from_bytes(fromHex(outputData.asHash));
        const dataHash = C.hash_plutus_data(plutusData);
        const datum = C.Datum.new_data_hash(dataHash);
        bucket.push(plutusData, dataHash, datum);
        output.set_datum(datum);
        txBuilder.add_plutus_data(plutusData);
    }
    else if (outputData.inline) {
        const plutusData = C.PlutusData.from_bytes(fromHex(outputData.inline));
        const data = C.Data.new(plutusData);
        const datum = C.Datum.new_data(data);
        bucket.push(plutusData, data, datum);
        output.set_datum(datum);
    }
    const script = outputData.scriptRef;
    if (script) {
        const scriptRef = toScriptRef(script);
        bucket.push(scriptRef);
        output.set_script_ref(toScriptRef(script));
    }
    return output;
}

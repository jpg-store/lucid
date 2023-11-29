import { C } from "../core/mod.js";
import { coreToUtxo, fromHex, fromUnit, paymentCredentialOf, toHex, toUnit, Utils, utxoToCore, } from "../utils/mod.js";
import { Tx } from "./tx.js";
import { TxComplete } from "./tx_complete.js";
import { discoverOwnUsedTxKeyHashes, walletFromSeed } from "../misc/wallet.js";
import { signData, verifyData } from "../misc/sign_data.js";
import { Message } from "./message.js";
import { SLOT_CONFIG_NETWORK } from "../plutus/time.js";
import { Data } from "../plutus/data.js";
import { Emulator } from "../provider/emulator.js";
import { Freeables } from "../utils/freeable.js";
import { getTransactionBuilderConfig } from "../utils/transaction_builder_config.js";
export class Lucid {
    constructor() {
        Object.defineProperty(this, "protocolParameters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "slotConfig", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "wallet", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "provider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "network", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "Mainnet"
        });
        Object.defineProperty(this, "utils", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static async new({ provider, network, protocolParameters, }) {
        const lucid = new this();
        if (network)
            lucid.network = network;
        if (protocolParameters) {
            lucid.protocolParameters = protocolParameters;
        }
        if (provider) {
            lucid.provider = provider;
            if (lucid.provider instanceof Emulator) {
                lucid.network = "Custom";
                SLOT_CONFIG_NETWORK[lucid.network] = {
                    zeroTime: lucid.provider.now(),
                    zeroSlot: 0,
                    slotLength: 1000,
                };
            }
        }
        if (provider && !lucid.protocolParameters) {
            const protocolParameters = await provider.getProtocolParameters();
            lucid.protocolParameters = protocolParameters;
        }
        lucid.slotConfig = SLOT_CONFIG_NETWORK[lucid.network];
        lucid.utils = new Utils(lucid);
        return lucid;
    }
    getTransactionBuilderConfig() {
        if (!this.protocolParameters) {
            throw new Error("Protocol parameters or slot config not set. Set a provider or iniatilize with protocol parameters.");
        }
        return getTransactionBuilderConfig(this.protocolParameters, this.slotConfig, {
            // deno-lint-ignore no-explicit-any
            url: this.provider?.url,
            // deno-lint-ignore no-explicit-any
            projectId: this.provider?.projectId,
        });
    }
    /**
     * Switch provider and/or network.
     * If provider or network unset, no overwriting happens. Provider or network from current instance are taken then.
     */
    async switchProvider(provider, network) {
        if (this.network === "Custom") {
            throw new Error("Cannot switch when on custom network.");
        }
        const lucid = await Lucid.new({ provider, network });
        this.protocolParameters = lucid.protocolParameters;
        this.slotConfig = lucid.slotConfig;
        this.provider = provider || this.provider;
        // Given that protoclParameters and provider are optional we should fetch protocol parameters if they are not set when switiching providers
        if (!this.protocolParameters && provider) {
            this.protocolParameters = await provider.getProtocolParameters();
        }
        this.network = network || this.network;
        this.wallet = lucid.wallet;
        return this;
    }
    newTx() {
        return new Tx(this);
    }
    fromTx(tx) {
        return new TxComplete(this, C.Transaction.from_bytes(fromHex(tx)));
    }
    /** Signs a message. Expects the payload to be Hex encoded. */
    newMessage(address, payload) {
        return new Message(this, address, payload);
    }
    /** Verify a message. Expects the payload to be Hex encoded. */
    verifyMessage(address, payload, signedMessage) {
        const { paymentCredential, stakeCredential, address: { hex: addressHex }, } = this.utils.getAddressDetails(address);
        const keyHash = paymentCredential?.hash || stakeCredential?.hash;
        if (!keyHash)
            throw new Error("Not a valid address provided.");
        return verifyData(addressHex, keyHash, payload, signedMessage);
    }
    currentSlot() {
        return this.utils.unixTimeToSlot(Date.now());
    }
    utxosAt(addressOrCredential) {
        return this.provider.getUtxos(addressOrCredential);
    }
    utxosAtWithUnit(addressOrCredential, unit) {
        return this.provider.getUtxosWithUnit(addressOrCredential, unit);
    }
    /** Unit needs to be an NFT (or optionally the entire supply in one UTxO). */
    utxoByUnit(unit) {
        return this.provider.getUtxoByUnit(unit);
    }
    utxosByOutRef(outRefs) {
        return this.provider.getUtxosByOutRef(outRefs);
    }
    delegationAt(rewardAddress) {
        return this.provider.getDelegation(rewardAddress);
    }
    awaitTx(txHash, checkInterval = 3000) {
        return this.provider.awaitTx(txHash, checkInterval);
    }
    async datumOf(utxo, type) {
        if (!utxo.datum) {
            if (!utxo.datumHash) {
                throw new Error("This UTxO does not have a datum hash.");
            }
            utxo.datum = await this.provider.getDatum(utxo.datumHash);
        }
        return Data.from(utxo.datum, type);
    }
    /** Query CIP-0068 metadata for a specifc asset. */
    async metadataOf(unit) {
        const { policyId, name, label } = fromUnit(unit);
        switch (label) {
            case 222:
            case 333:
            case 444: {
                const utxo = await this.utxoByUnit(toUnit(policyId, name, 100));
                const metadata = (await this.datumOf(utxo));
                return Data.toJson(metadata.fields[0]);
            }
            default:
                throw new Error("No variant matched.");
        }
    }
    /**
     * Cardano Private key in bech32; not the BIP32 private key or any key that is not fully derived.
     * Only an Enteprise address (without stake credential) is derived.
     */
    selectWalletFromPrivateKey(privateKey) {
        const priv = C.PrivateKey.from_bech32(privateKey);
        const publicKey = priv.to_public();
        priv.free();
        const pubKeyHash = publicKey.hash();
        publicKey.free();
        this.wallet = {
            address: () => {
                const bucket = [];
                const stakeCredential = C.StakeCredential.from_keyhash(pubKeyHash);
                bucket.push(stakeCredential);
                const enterpriseAddress = C.EnterpriseAddress.new(this.network === "Mainnet" ? 1 : 0, stakeCredential);
                bucket.push(enterpriseAddress);
                const address = enterpriseAddress.to_address();
                bucket.push(address);
                const bech32 = address.to_bech32(undefined);
                Freeables.free(...bucket);
                return Promise.resolve(bech32);
            },
            rewardAddress: () => Promise.resolve(null),
            getUtxos: async () => {
                return await this.utxosAt(paymentCredentialOf(await this.wallet.address()));
            },
            getUtxosCore: async () => {
                const utxos = await this.utxosAt(paymentCredentialOf(await this.wallet.address()));
                const coreUtxos = C.TransactionUnspentOutputs.new();
                utxos.forEach((utxo) => {
                    const coreUtxo = utxoToCore(utxo);
                    coreUtxos.add(coreUtxo);
                    coreUtxo.free();
                });
                return coreUtxos;
            },
            getDelegation: () => {
                return Promise.resolve({ poolId: null, rewards: 0n });
            },
            signTx: (tx) => {
                const bucket = [];
                const txBody = tx.body();
                bucket.push(txBody);
                const hash = C.hash_transaction(txBody);
                bucket.push(hash);
                const witness = C.make_vkey_witness(hash, priv);
                bucket.push(witness);
                const txWitnessSetBuilder = C.TransactionWitnessSetBuilder.new();
                bucket.push(txWitnessSetBuilder);
                txWitnessSetBuilder.add_vkey(witness);
                const witnessSet = txWitnessSetBuilder.build();
                Freeables.free(...bucket);
                return Promise.resolve(witnessSet);
            },
            signMessage: (address, payload) => {
                const { paymentCredential, address: { hex: hexAddress }, } = this.utils.getAddressDetails(address);
                const keyHash = paymentCredential?.hash;
                const originalKeyHash = pubKeyHash.to_hex();
                if (!keyHash || keyHash !== originalKeyHash) {
                    throw new Error(`Cannot sign message for address: ${address}.`);
                }
                return Promise.resolve(signData(hexAddress, payload, privateKey));
            },
            submitTx: async (tx) => {
                return await this.provider.submitTx(tx);
            },
        };
        return this;
    }
    selectWallet(api) {
        const getAddressHex = async () => {
            const [addressHex] = await api.getUsedAddresses();
            if (addressHex)
                return addressHex;
            const [unusedAddressHex] = await api.getUnusedAddresses();
            return unusedAddressHex;
        };
        this.wallet = {
            address: async () => {
                const addressHex = await getAddressHex();
                const address = C.Address.from_bytes(fromHex(addressHex));
                const bech32 = address.to_bech32(undefined);
                address.free();
                return bech32;
            },
            rewardAddress: async () => {
                const [rewardAddressHex] = await api.getRewardAddresses();
                if (rewardAddressHex) {
                    const address = C.Address.from_bytes(fromHex(rewardAddressHex));
                    const rewardAddress = C.RewardAddress.from_address(address);
                    address.free();
                    const addr = rewardAddress.to_address();
                    rewardAddress.free();
                    const bech32 = addr.to_bech32(undefined);
                    addr.free();
                    return bech32;
                }
                return null;
            },
            getCollateralCore: () => {
                return undefined;
            },
            getUtxos: async () => {
                const utxos = ((await api.getUtxos()) || []).map((utxo) => {
                    const parsedUtxo = C.TransactionUnspentOutput.from_bytes(fromHex(utxo));
                    const finalUtxo = coreToUtxo(parsedUtxo);
                    parsedUtxo.free();
                    return finalUtxo;
                });
                return utxos;
            },
            getUtxosCore: async () => {
                const utxos = C.TransactionUnspentOutputs.new();
                ((await api.getUtxos()) || []).forEach((utxo) => {
                    const coreUtxo = C.TransactionUnspentOutput.from_bytes(fromHex(utxo));
                    utxos.add(coreUtxo);
                    coreUtxo.free();
                });
                return utxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            signTx: async (tx) => {
                const witnessSet = await api.signTx(toHex(tx.to_bytes()), true);
                return C.TransactionWitnessSet.from_bytes(fromHex(witnessSet));
            },
            signMessage: async (address, payload) => {
                const cAddress = C.Address.from_bech32(address);
                const hexAddress = toHex(cAddress.to_bytes());
                cAddress.free();
                return await api.signData(hexAddress, payload);
            },
            submitTx: async (tx) => {
                const txHash = await api.submitTx(tx);
                return txHash;
            },
        };
        return this;
    }
    /**
     * Emulates a wallet by constructing it with the utxos and an address.
     * If utxos are not set, utxos are fetched from the provided address.
     */
    selectWalletFrom({ address, utxos, rewardAddress }) {
        const addressDetails = this.utils.getAddressDetails(address);
        this.wallet = {
            address: () => Promise.resolve(address),
            rewardAddress: () => {
                if (!rewardAddress && addressDetails.stakeCredential) {
                    if (addressDetails.stakeCredential.type === "Key") {
                        const keyHash = C.Ed25519KeyHash.from_hex(addressDetails.stakeCredential.hash);
                        const stakeCredential = C.StakeCredential.from_keyhash(keyHash);
                        keyHash.free();
                        const rewardAddress = C.RewardAddress.new(this.network === "Mainnet" ? 1 : 0, stakeCredential);
                        stakeCredential.free();
                        const address = rewardAddress.to_address();
                        rewardAddress.free();
                        const bech32 = address.to_bech32(undefined);
                        address.free();
                        return Promise.resolve(bech32);
                    }
                }
                return Promise.resolve(rewardAddress ?? null);
            },
            getCollateralCore: () => {
                if (!collateral || !collateral.length) {
                    return undefined;
                }
                const coreUtxos = C.TransactionUnspentOutputs.new();
                collateral.forEach((utxo) => coreUtxos.add(utxoToCore(utxo)));
                return coreUtxos;
            },
            getUtxos: async () => {
                return utxos ? utxos : await this.utxosAt(paymentCredentialOf(address));
            },
            getUtxosCore: async () => {
                const coreUtxos = C.TransactionUnspentOutputs.new();
                (utxos
                    ? utxos
                    : await this.utxosAt(paymentCredentialOf(address))).forEach((utxo) => {
                    const coreUtxo = utxoToCore(utxo);
                    coreUtxos.add(coreUtxo);
                    coreUtxo.free();
                });
                return coreUtxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            signTx: () => Promise.reject("Not implemented"),
            signMessage: () => Promise.reject("Not implemented"),
            submitTx: (tx) => this.provider.submitTx(tx),
        };
        return this;
    }
    /**
     * Select wallet from a seed phrase (e.g. 15 or 24 words). You have the option to choose between a Base address (with stake credential)
     * and Enterprise address (without stake credential). You can also decide which account index to derive. By default account 0 is derived.
     */
    selectWalletFromSeed(seed, options) {
        const bucket = [];
        const { address, rewardAddress, paymentKey, stakeKey } = walletFromSeed(seed, {
            addressType: options?.addressType || "Base",
            accountIndex: options?.accountIndex || 0,
            password: options?.password,
            network: this.network,
        });
        const paymentPrivateKey = C.PrivateKey.from_bech32(paymentKey);
        bucket.push(paymentPrivateKey);
        const paymentPublicKey = paymentPrivateKey.to_public();
        bucket.push(paymentPublicKey);
        const paymentPubKeyHash = paymentPublicKey.hash();
        bucket.push(paymentPubKeyHash);
        const paymentKeyHash = paymentPubKeyHash.to_hex();
        const getStakeKeyHash = (stakeKey) => {
            const stakePrivateKey = C.PrivateKey.from_bech32(stakeKey);
            bucket.push(stakePrivateKey);
            const stakePublicKey = stakePrivateKey.to_public();
            bucket.push(stakePublicKey);
            const stakePubKeyHash = stakePublicKey.hash();
            bucket.push(stakePubKeyHash);
            const stakeKeyHash = stakePubKeyHash.to_hex();
            return stakeKeyHash;
        };
        const stakeKeyHash = stakeKey ? getStakeKeyHash(stakeKey) : "";
        const privKeyHashMap = {
            [paymentKeyHash]: paymentKey,
            [stakeKeyHash]: stakeKey,
        };
        this.wallet = {
            address: () => Promise.resolve(address),
            rewardAddress: () => Promise.resolve(rewardAddress || null),
            getUtxos: () => this.utxosAt(paymentCredentialOf(address)),
            getUtxosCore: async () => {
                const coreUtxos = C.TransactionUnspentOutputs.new();
                (await this.utxosAt(paymentCredentialOf(address))).forEach((utxo) => {
                    const coreUtxo = utxoToCore(utxo);
                    coreUtxos.add(coreUtxo);
                    coreUtxo.free();
                });
                return coreUtxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            signTx: async (tx) => {
                const utxos = await this.utxosAt(address);
                const ownKeyHashes = [paymentKeyHash, stakeKeyHash];
                const usedKeyHashes = discoverOwnUsedTxKeyHashes(tx, ownKeyHashes, utxos);
                const txWitnessSetBuilder = C.TransactionWitnessSetBuilder.new();
                usedKeyHashes.forEach((keyHash) => {
                    const txBody = tx.body();
                    const hash = C.hash_transaction(txBody);
                    txBody.free();
                    const privateKey = C.PrivateKey.from_bech32(privKeyHashMap[keyHash]);
                    const witness = C.make_vkey_witness(hash, privateKey);
                    hash.free();
                    privateKey.free();
                    txWitnessSetBuilder.add_vkey(witness);
                    witness.free();
                });
                const txWitnessSet = txWitnessSetBuilder.build();
                txWitnessSetBuilder.free();
                return txWitnessSet;
            },
            signMessage: (address, payload) => {
                const { paymentCredential, stakeCredential, address: { hex: hexAddress }, } = this.utils.getAddressDetails(address);
                const keyHash = paymentCredential?.hash || stakeCredential?.hash;
                const privateKey = privKeyHashMap[keyHash];
                if (!privateKey) {
                    throw new Error(`Cannot sign message for address: ${address}.`);
                }
                return Promise.resolve(signData(hexAddress, payload, privateKey));
            },
            submitTx: async (tx) => {
                return await this.provider.submitTx(tx);
            },
        };
        Freeables.free(...bucket);
        return this;
    }
}

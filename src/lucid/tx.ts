import { C } from "../core/mod.ts";
import { Data, PROTOCOL_PARAMETERS_DEFAULT } from "../mod.ts";
import {
  Address,
  Assets,
  CertificateValidator,
  Configuration,
  Datum,
  Json,
  Label,
  Lovelace,
  MintingPolicy,
  OutputData,
  PaymentKeyHash,
  PoolId,
  PoolParams,
  Redeemer,
  RewardAddress,
  SpendingValidator,
  StakeKeyHash,
  UnixTime,
  UTxO,
  WithdrawalValidator,
} from "../types/mod.ts";
import {
  addressFromWithNetworkCheck,
  attachScript,
  createPoolRegistration,
  getDatumFromOutputData,
  getScriptWitness,
  getStakeCredential,
} from "../utils/cml.ts";
import { type FreeableBucket, Freeables } from "../utils/freeable.ts";
import {
  assetsToValue,
  fromHex,
  toHex,
  utxoToCore,
  valueToAssets,
  chunk,
  createOutput,
} from "../utils/mod.ts";
import { Lucid } from "./lucid.ts";
import { defaultConfig } from "./tx_config.ts";
import { TxComplete } from "./tx_complete.ts";

export class Tx {
  txBuilder: C.TransactionBuilder;
  /** Stores the tx instructions, which get executed after calling .complete() */
  private tasks: ((that: Tx) => unknown)[];
  private lucid: Lucid;
  configuration = defaultConfig;

  constructor(lucid: Lucid) {
    this.lucid = lucid;
    this.txBuilder = C.TransactionBuilder.new(
      lucid.getTransactionBuilderConfig(),
    );
    this.tasks = [];
  }

  /** Read data from utxos. These utxos are only referenced and not spent. */
  readFrom(utxos: UTxO[]): Tx {
    this.tasks.push(async (that) => {
      const bucket: FreeableBucket = [];
      try {
        for (const utxo of utxos) {
          if (utxo.datumHash) {
            utxo.datum = Data.to(await that.lucid.datumOf(utxo));
            // Add datum to witness set, so it can be read from validators
            const plutusData = C.PlutusData.from_bytes(fromHex(utxo.datum!));
            bucket.push(plutusData);
            that.txBuilder.add_plutus_data(plutusData);
          }
          const coreUtxo = utxoToCore(utxo);
          bucket.push(coreUtxo);
          that.txBuilder.add_reference_input(coreUtxo);
        }
      } finally {
        Freeables.free(...bucket);
      }
    });
    return this;
  }

  /**
   * Customize the transaction builder
   */
  config(newConfig: Partial<Configuration>) {
    this.configuration = { ...this.configuration, ...newConfig };
    return this;
  }

  /**
   * A public key or native script input.
   * With redeemer it's a plutus script input.
   */
  collectFrom(utxos: UTxO[], redeemer?: Redeemer): Tx {
    this.tasks.push(async (that) => {
      const bucket: FreeableBucket = [];
      try {
        for (const utxo of utxos) {
          if (utxo.datumHash && !utxo.datum) {
            utxo.datum = Data.to(await that.lucid.datumOf(utxo));
          }
          const coreUtxo = utxoToCore(utxo);
          bucket.push(coreUtxo);
          // We don't free Options as the ownership is passed to the txBuilder
          const scriptWitness = redeemer
            ? getScriptWitness(
                redeemer,
                utxo.datumHash && utxo.datum ? utxo.datum : undefined,
              )
            : undefined;

          that.txBuilder.add_input(coreUtxo, scriptWitness);
        }
      } finally {
        Freeables.free(...bucket);
      }
    });
    return this;
  }

  /**
   * All assets should be of the same policy id.
   * You can chain mintAssets functions together if you need to mint assets with different policy ids.
   * If the plutus script doesn't need a redeemer, you still need to specifiy the void redeemer.
   */
  mintAssets(assets: Assets, redeemer?: Redeemer): Tx {
    this.tasks.push((that) => {
      const bucket: FreeableBucket = [];
      try {
        const units = Object.keys(assets);
        const policyId = units[0].slice(0, 56);
        const mintAssets = C.MintAssets.new();
        bucket.push(mintAssets);
        units.forEach((unit) => {
          if (unit.slice(0, 56) !== policyId) {
            throw new Error(
              "Only one policy id allowed. You can chain multiple mintAssets functions together if you need to mint assets with different policy ids.",
            );
          }
          const assetName = C.AssetName.new(fromHex(unit.slice(56)));
          const int = C.Int.from_str(assets[unit].toString());
          // Int is being passed by value so we don't need to free it
          bucket.push(assetName);
          mintAssets.insert(assetName, int);
        });
        const scriptHash = C.ScriptHash.from_bytes(fromHex(policyId));
        // We don't free Options as the ownership is passed to the txBuilder
        const scriptWitness = redeemer ? getScriptWitness(redeemer) : undefined;
        bucket.push(scriptHash);
        that.txBuilder.add_mint(scriptHash, mintAssets, scriptWitness);
      } finally {
        Freeables.free(...bucket);
      }
    });
    return this;
  }

  /** Pay to a public key or native script address. */
  payToAddress(address: Address, assets: Assets): Tx {
    this.tasks.push((that) => {
      const addr = addressFromWithNetworkCheck(address, that.lucid);
      const value = assetsToValue(assets);

      const output = C.TransactionOutput.new(addr, value);
      const minAda = that.lucid.utils.getMinAdaForOutput(output);
      assets.lovelace = assets.lovelace > minAda ? assets.lovelace : minAda;
      const valueWithMinAda = assetsToValue(assets);
      const outputWithMinAda = C.TransactionOutput.new(addr, valueWithMinAda);
      that.txBuilder.add_output(outputWithMinAda);
      Freeables.free(output, addr, value, valueWithMinAda, outputWithMinAda);
    });
    return this;
  }

  /** Pay to a public key or native script address with datum or scriptRef. */
  payToAddressWithData(
    address: Address,
    outputData: Datum | OutputData,
    assets: Assets,
  ): Tx {
    this.tasks.push((that) => {
      const bucket: FreeableBucket = [];
      try {
        if (typeof outputData === "string") {
          outputData = { asHash: outputData };
        }

        if (
          [outputData.hash, outputData.asHash, outputData.inline].filter(
            (b) => b,
          ).length > 1
        ) {
          throw new Error(
            "Not allowed to set hash, asHash and inline at the same time.",
          );
        }

        const output = createOutput({
          bucket,
          txBuilder: that.txBuilder,
          lucid: that.lucid,
          address,
          outputData,
          assets,
        });
        const minAda = this.lucid.utils.getMinAdaForOutput(output);
        const assetsWithMinAda = { ...assets };
        assetsWithMinAda.lovelace =
          assets.lovelace > minAda ? assets.lovelace : minAda;
        const outputWithMinAda = createOutput({
          bucket,
          txBuilder: that.txBuilder,
          lucid: that.lucid,
          address,
          outputData,
          assets: assetsWithMinAda,
        });
        bucket.push(output, outputWithMinAda);

        that.txBuilder.add_output(outputWithMinAda);
      } finally {
        Freeables.free(...bucket);
      }
    });
    return this;
  }

  /** Pay to a plutus script address with datum or scriptRef. */
  payToContract(
    address: Address,
    outputData: Datum | OutputData,
    assets: Assets,
  ): Tx {
    if (typeof outputData === "string") {
      outputData = { asHash: outputData };
    }

    if (!(outputData.hash || outputData.asHash || outputData.inline)) {
      throw new Error(
        "No datum set. Script output becomes unspendable without datum.",
      );
    }
    return this.payToAddressWithData(address, outputData, assets);
  }

  /** Delegate to a stake pool. */
  delegateTo(
    rewardAddress: RewardAddress,
    poolId: PoolId,
    redeemer?: Redeemer,
  ): Tx {
    this.tasks.push((that) => {
      const addressDetails = that.lucid.utils.getAddressDetails(rewardAddress);

      if (addressDetails.type !== "Reward" || !addressDetails.stakeCredential) {
        throw new Error("Not a reward address provided.");
      }
      const credential = getStakeCredential(
        addressDetails.stakeCredential.hash,
        addressDetails.stakeCredential.type,
      );

      const keyHash = C.Ed25519KeyHash.from_bech32(poolId);
      const delegation = C.StakeDelegation.new(credential, keyHash);
      // We don't free Options as the ownership is passed to the txBuilder
      const scriptWitness = redeemer ? getScriptWitness(redeemer) : undefined;
      const certificate = C.Certificate.new_stake_delegation(delegation);
      that.txBuilder.add_certificate(certificate, scriptWitness);
      Freeables.free(keyHash, delegation, credential, certificate);
    });
    return this;
  }

  /** Register a reward address in order to delegate to a pool and receive rewards. */
  registerStake(rewardAddress: RewardAddress): Tx {
    this.tasks.push((that) => {
      const addressDetails = that.lucid.utils.getAddressDetails(rewardAddress);

      if (addressDetails.type !== "Reward" || !addressDetails.stakeCredential) {
        throw new Error("Not a reward address provided.");
      }
      const credential = getStakeCredential(
        addressDetails.stakeCredential.hash,
        addressDetails.stakeCredential.type,
      );
      const stakeRegistration = C.StakeRegistration.new(credential);
      const certificate =
        C.Certificate.new_stake_registration(stakeRegistration);

      that.txBuilder.add_certificate(certificate, undefined);
      Freeables.free(credential, stakeRegistration, certificate);
    });
    return this;
  }

  /** Deregister a reward address. */
  deregisterStake(rewardAddress: RewardAddress, redeemer?: Redeemer): Tx {
    this.tasks.push((that) => {
      const addressDetails = that.lucid.utils.getAddressDetails(rewardAddress);

      if (addressDetails.type !== "Reward" || !addressDetails.stakeCredential) {
        throw new Error("Not a reward address provided.");
      }
      const credential = getStakeCredential(
        addressDetails.stakeCredential.hash,
        addressDetails.stakeCredential.type,
      );
      const stakeDeregistration = C.StakeDeregistration.new(credential);
      const certificate =
        C.Certificate.new_stake_deregistration(stakeDeregistration);
      // We don't free Options as the ownership is passed to the txBuilder
      const scriptWitness = redeemer ? getScriptWitness(redeemer) : undefined;

      that.txBuilder.add_certificate(certificate, scriptWitness);
      Freeables.free(credential, stakeDeregistration, certificate);
    });
    return this;
  }

  /** Register a stake pool. A pool deposit is required. The metadataUrl needs to be hosted already before making the registration. */
  registerPool(poolParams: PoolParams): Tx {
    this.tasks.push(async (that) => {
      const poolRegistration = await createPoolRegistration(
        poolParams,
        that.lucid,
      );

      const certificate = C.Certificate.new_pool_registration(poolRegistration);

      that.txBuilder.add_certificate(certificate, undefined);
      Freeables.free(certificate, poolRegistration);
    });
    return this;
  }

  /** Update a stake pool. No pool deposit is required. The metadataUrl needs to be hosted already before making the update. */
  updatePool(poolParams: PoolParams): Tx {
    this.tasks.push(async (that) => {
      const poolRegistration = await createPoolRegistration(
        poolParams,
        that.lucid,
      );

      // This flag makes sure a pool deposit is not required
      poolRegistration.set_is_update(true);

      const certificate = C.Certificate.new_pool_registration(poolRegistration);
      Freeables.free(poolRegistration, certificate);

      that.txBuilder.add_certificate(certificate, undefined);
    });
    return this;
  }
  /**
   * Retire a stake pool. The epoch needs to be the greater than the current epoch + 1 and less than current epoch + eMax.
   * The pool deposit will be sent to reward address as reward after full retirement of the pool.
   */
  retirePool(poolId: PoolId, epoch: number): Tx {
    this.tasks.push((that) => {
      const keyHash = C.Ed25519KeyHash.from_bech32(poolId);
      const poolRetirement = C.PoolRetirement.new(keyHash, epoch);
      const certificate = C.Certificate.new_pool_retirement(poolRetirement);
      that.txBuilder.add_certificate(certificate, undefined);
      Freeables.free(keyHash, poolRetirement, certificate);
    });
    return this;
  }

  withdraw(
    rewardAddress: RewardAddress,
    amount: Lovelace,
    redeemer?: Redeemer,
  ): Tx {
    this.tasks.push((that) => {
      const addr = addressFromWithNetworkCheck(rewardAddress, that.lucid);
      const rewardAddr = C.RewardAddress.from_address(addr)!;
      const amountBigNum = C.BigNum.from_str(amount.toString());
      const scriptWitness = redeemer ? getScriptWitness(redeemer) : undefined;
      that.txBuilder.add_withdrawal(rewardAddr, amountBigNum, scriptWitness);
      Freeables.free(addr, rewardAddr, amountBigNum, scriptWitness);
    });
    return this;
  }

  /**
   * Needs to be a public key address.
   * The PaymentKeyHash is taken when providing a Base, Enterprise or Pointer address.
   * The StakeKeyHash is taken when providing a Reward address.
   */
  addSigner(address: Address | RewardAddress): Tx {
    const addressDetails = this.lucid.utils.getAddressDetails(address);

    if (!addressDetails.paymentCredential && !addressDetails.stakeCredential) {
      throw new Error("Not a valid address.");
    }

    const credential =
      addressDetails.type === "Reward"
        ? addressDetails.stakeCredential!
        : addressDetails.paymentCredential!;

    if (credential.type === "Script") {
      throw new Error("Only key hashes are allowed as signers.");
    }
    return this.addSignerKey(credential.hash);
  }

  /** Add a payment or stake key hash as a required signer of the transaction. */
  addSignerKey(keyHash: PaymentKeyHash | StakeKeyHash): Tx {
    this.tasks.push((that) => {
      const key = C.Ed25519KeyHash.from_bytes(fromHex(keyHash));
      that.txBuilder.add_required_signer(key);
      Freeables.free(key);
    });
    return this;
  }

  validFrom(unixTime: UnixTime): Tx {
    this.tasks.push((that) => {
      const slot = that.lucid.utils.unixTimeToSlot(unixTime);
      const slotNum = C.BigNum.from_str(slot.toString());
      that.txBuilder.set_validity_start_interval(slotNum);
      Freeables.free(slotNum);
    });
    return this;
  }

  validTo(unixTime: UnixTime): Tx {
    this.tasks.push((that) => {
      const slot = that.lucid.utils.unixTimeToSlot(unixTime);
      const slotNum = C.BigNum.from_str(slot.toString());
      that.txBuilder.set_ttl(slotNum);
      Freeables.free(slotNum);
    });
    return this;
  }

  attachMetadata(label: Label, metadata: Json): Tx {
    this.tasks.push((that) => {
      const labelNum = C.BigNum.from_str(label.toString());
      that.txBuilder.add_json_metadatum(labelNum, JSON.stringify(metadata));
      Freeables.free(labelNum);
    });
    return this;
  }

  /** Converts strings to bytes if prefixed with **'0x'**. */
  attachMetadataWithConversion(label: Label, metadata: Json): Tx {
    this.tasks.push((that) => {
      const labelNum = C.BigNum.from_str(label.toString());
      that.txBuilder.add_json_metadatum_with_schema(
        labelNum,
        JSON.stringify(metadata),
        C.MetadataJsonSchema.BasicConversions,
      );
      Freeables.free(labelNum);
    });
    return this;
  }

  /** Explicitely set the network id in the transaction body. */
  addNetworkId(id: number): Tx {
    this.tasks.push((that) => {
      const networkId = C.NetworkId.from_bytes(
        fromHex(id.toString(16).padStart(2, "0")),
      );
      that.txBuilder.set_network_id(networkId);
      Freeables.free(networkId);
    });
    return this;
  }

  attachSpendingValidator(spendingValidator: SpendingValidator): Tx {
    this.tasks.push((that) => {
      attachScript(that, spendingValidator);
    });
    return this;
  }

  attachMintingPolicy(mintingPolicy: MintingPolicy): Tx {
    this.tasks.push((that) => {
      attachScript(that, mintingPolicy);
    });
    return this;
  }

  attachCertificateValidator(certValidator: CertificateValidator): Tx {
    this.tasks.push((that) => {
      attachScript(that, certValidator);
    });
    return this;
  }

  attachWithdrawalValidator(withdrawalValidator: WithdrawalValidator): Tx {
    this.tasks.push((that) => {
      attachScript(that, withdrawalValidator);
    });
    return this;
  }

  /** Conditionally apply to the transaction. */
  applyIf(condition: boolean, callback: (thisTx: Tx) => unknown): Tx {
    if (condition) this.tasks.push((that) => callback(that));
    return this;
  }

  /** Apply to the transaction. */
  apply(callback: (thisTx: Tx) => unknown): Tx {
    this.tasks.push((that) => callback(that));
    return this;
  }

  /** Compose transactions. */
  compose(tx: Tx | null): Tx {
    if (tx) this.tasks = this.tasks.concat(tx.tasks);
    return this;
  }

  free() {
    this.txBuilder.free();
  }

  /** Completes the transaction. This might fail, you should free the txBuilder when you are done with it. */
  async complete(options?: {
    change?: { address?: Address; outputData?: OutputData };
    coinSelection?: boolean;
    nativeUplc?: boolean;
  }): Promise<TxComplete> {
    const bucket: FreeableBucket = [];
    const { enableChangeSplitting } = this.configuration;
    try {
      if (
        [
          options?.change?.outputData?.hash,
          options?.change?.outputData?.asHash,
          options?.change?.outputData?.inline,
        ].filter((b) => b).length > 1
      ) {
        throw new Error(
          "Not allowed to set hash, asHash and inline at the same time.",
        );
      }

      let task = this.tasks.shift();
      while (task) {
        await task(this);
        task = this.tasks.shift();
      }

      // We don't free `utxos` as it is passed as an Option to the txBuilder and the ownership is passed when passing an Option
      const utxos = await this.lucid.wallet.getUtxosCore();

      const collateral = this.lucid.wallet.getCollateralCore();

      // We don't free `changeAddress` as it is passed as an Option to the txBuilder and the ownership is passed when passing an Option
      const changeAddress: C.Address = addressFromWithNetworkCheck(
        options?.change?.address || (await this.lucid.wallet.address()),
        this.lucid,
      );

      if (options?.coinSelection || options?.coinSelection === undefined) {
        this.txBuilder.add_inputs_from(
          utxos,
          changeAddress,
          Uint32Array.from([
            200, // weight ideal > 100 inputs
            1000, // weight ideal < 100 inputs
            1500, // weight assets if plutus
            800, // weight assets if not plutus
            800, // weight distance if not plutus
            5000, // weight utxos
          ]),
        );
      }

      const { datum, plutusData } = getDatumFromOutputData(
        options?.change?.outputData,
      );
      if (plutusData) {
        this.txBuilder.add_plutus_data(plutusData);
      }
      bucket.push(datum, plutusData);
      if (enableChangeSplitting) {
        await this.splitChange();
      }
      this.txBuilder.balance(changeAddress, datum);

      const tx = await this.txBuilder.construct(
        collateral || utxos,
        changeAddress,
        options?.nativeUplc === undefined ? true : options?.nativeUplc,
      );

      return new TxComplete(this.lucid, tx);
    } finally {
      Freeables.free(...bucket);
    }
  }

  /** Return the current transaction body in Hex encoded Cbor. */
  async toString(): Promise<string> {
    let task = this.tasks.shift();
    while (task) {
      await task(this);
      task = this.tasks.shift();
    }

    return toHex(this.txBuilder.to_bytes());
  }

  /**
   * Splits remaining assets into multiple change outputs
   * if there's enough ADA to cover for minimum UTxO requirements.
   *
   * The objective is to create one collateral output as well as
   * as many pure outputs as possible, since they cost the least to be consumed.
   *
   * It does so by following these steps:
   * 1. Sort the native assets cannonically
   * 2. Add outputs with a maximum of N native assets until these are exhausted
   * 3. Continously create pure ADA outputs with half of the remaining amount
   *    until said remaining amount is below the minimum K
   *
   * This is the advanced UTxO management algorithm used by Eternl
   */
  private async splitChange() {
    const bucket: FreeableBucket = [];
    const { coinsPerUtxoByte } =
      this.lucid.protocolParameters || PROTOCOL_PARAMETERS_DEFAULT;
    const { changeNativeAssetChunkSize, changeMinUtxo } = this.configuration;

    const txInputs = this.txBuilder.get_explicit_input();
    const txOutputs = this.txBuilder.get_explicit_output();
    bucket.push(txInputs, txOutputs);
    const change = txInputs.checked_sub(txOutputs);

    let changeAda = change.coin();

    let changeAssets = valueToAssets(change);
    bucket.push(changeAda);
    const changeAssetsArray = Object.keys(changeAssets)
      .filter((v) => v !== "lovelace")
      // Sort canonically so we group policy IDs together
      .sort((a, b) => a.localeCompare(b));

    changeAssets = changeAssetsArray.reduce(
      (res, key) => Object.assign(res, { [key]: changeAssets[key] }),
      {},
    );

    const numOutputsWithNativeAssets = Math.ceil(
      changeAssetsArray.length / changeNativeAssetChunkSize,
    );

    let longestAddress = C.Address.from_bech32(
      await this.lucid.wallet.address(),
    );
    bucket.push(longestAddress);

    const outputs = this.txBuilder.outputs();
    bucket.push(outputs);
    for (let i = 0; i < outputs.len(); i++) {
      const output = outputs.get(i);
      bucket.push(output);
      const outputAddress = output.address();
      if (
        !longestAddress ||
        outputAddress.to_bech32(undefined).length >
          longestAddress.to_bech32(undefined).length
      ) {
        longestAddress = output.address();
      }
    }

    const txOutputValue = assetsToValue(changeAssets);
    const transactionOutput = C.TransactionOutput.new(
      longestAddress,
      txOutputValue,
    );
    const coinUtxoByte = C.BigNum.from_str(coinsPerUtxoByte.toString());
    const minAdaPerOutput = C.min_ada_required(transactionOutput, coinUtxoByte);
    bucket.push(
      txOutputValue,
      transactionOutput,
      coinUtxoByte,
      minAdaPerOutput,
    );

    // Do we have enough ADA in the change to split and still
    // statisfy minADA requirements?
    const numOutputsWithAssets = C.BigNum.from_str(
      numOutputsWithNativeAssets.toString(),
    );
    const changeAmount = minAdaPerOutput.checked_mul(numOutputsWithAssets);
    bucket.push(numOutputsWithAssets, changeAmount);
    const shouldSplitChange = changeAmount.compare(changeAda) < 0;

    const changeMultiAsset = change.multiasset();
    bucket.push(changeMultiAsset);
    if (changeMultiAsset && shouldSplitChange) {
      const assetChunks = chunk(changeAssetsArray, 20);

      const totalChunks = assetChunks.length;
      for (const [idx, piece] of assetChunks.entries()) {
        const isLastChunk = idx === totalChunks - 1;
        if (isLastChunk) {
          continue;
        }
        const val = assetsToValue(
          piece.reduce(
            (res, key) => Object.assign(res, { [key]: changeAssets[key] }),
            {},
          ),
        );
        bucket.push(val);
        const changeAddress = C.Address.from_bech32(
          await this.lucid.wallet.address(),
        );
        const minAdaTxOutput = C.TransactionOutput.new(changeAddress, val);

        const coinUtxoByte = C.BigNum.from_str(coinsPerUtxoByte.toString());
        const minAda = C.min_ada_required(minAdaTxOutput, coinUtxoByte);

        val.set_coin(minAda);
        changeAda = changeAda.checked_sub(minAda);
        const txOutputWithMinAda = C.TransactionOutput.new(changeAddress, val);
        bucket.push(changeAda, minAdaTxOutput);
        this.txBuilder.add_output(txOutputWithMinAda);
      }
    }

    const two = C.BigNum.from_str("2");
    const changeMinUtxoBigNum = C.BigNum.from_str(changeMinUtxo);
    let split = changeAda.checked_div(two);
    bucket.push(two, changeMinUtxoBigNum, split);
    while (
      // If the half is more than the minimum, we can split it
      split.compare(changeMinUtxoBigNum) >= 0
    ) {
      const half = changeAda.checked_div(two);
      changeAda = changeAda.checked_sub(half);
      split = changeAda.checked_div(two);

      const changeAddress = C.Address.from_bech32(
        await this.lucid.wallet.address(),
      );
      const halfValue = C.Value.new(half);
      const changeOutput = C.TransactionOutput.new(changeAddress, halfValue);
      bucket.push(
        half,
        changeAda,
        split,
        changeAddress,
        halfValue,
        changeOutput,
      );
      this.txBuilder.add_output(changeOutput);
    }
  }
}

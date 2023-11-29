import { C, SlotConfig } from "../mod.js";
import { ProtocolParameters } from "../types/mod.js";
export declare function getTransactionBuilderConfig(protocolParameters: ProtocolParameters, slotConfig: SlotConfig, blockfrostConfig: {
    url?: string;
    projectId?: string;
}): C.TransactionBuilderConfig;

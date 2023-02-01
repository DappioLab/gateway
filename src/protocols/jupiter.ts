import * as anchor from "@project-serum/anchor";
import { Jupiter, RouteInfo } from "@jup-ag/core";
import JSBI from "jsbi";
import { GatewayParams, IProtocolSwap, PAYLOAD_SIZE, SwapParams } from "../types";
import { GATEWAY_PROGRAM_ID, JUPITER_ADAPTER_PROGRAM_ID, JUPITER_PROGRAM_ID } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { getActivityIndex, getGatewayAuthority, sigHash } from "../utils";

// Parameter for storing `SwapLeg` from Jupiter
const MAX_SWAP_CONFIG_SIZE = 30;
// Parameter for swap hop allowed in Jupiter route, currently Jupiter set to 3.
// But we target to 2 due to CPI still have ix size restriction now, track progress here:
// https://github.com/solana-labs/solana/issues/26641
const MAX_ROUTE_HOP = 2;
// Constraint to avoid exceed tx size limit after adding gateway keys in swap tx Jupiter generated
const MAX_RAW_SWAP_TX_SIZE = anchor.web3.PACKET_DATA_SIZE - anchor.web3.PUBLIC_KEY_LENGTH * 5 - 8; //1072;

interface ProtocolJupiterParams extends SwapParams {
  userKey: anchor.web3.PublicKey;
}

export class ProtocolJupiter implements IProtocolSwap {
  private _jupiter: Jupiter;
  private _bestRoute: RouteInfo;
  private _transaction: anchor.web3.Transaction | anchor.web3.VersionedTransaction;
  private _addressLookupTableAccounts: anchor.web3.AddressLookupTableAccount[] = [];

  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams,
    private _params: ProtocolJupiterParams
  ) {}

  async build(): Promise<void> {
    this._jupiter = await Jupiter.load({
      connection: this._connection,
      cluster: "mainnet-beta",
      marketUrl: this._params.jupiterMarketUrl,
    });
    const routes = await this._jupiter.computeRoutes({
      inputMint: this._params.fromTokenMint,
      outputMint: this._params.toTokenMint,
      amount: JSBI.BigInt(Math.floor(this._params.amount)), // 1000000 => 1 USDC if inputToken.address is USDC mint
      slippageBps: Math.ceil(this._params.slippage * 100), // 100 = 1%
      // forceFetch (optional) to force fetching routes and not use the cache
      // intermediateTokens, if provided will only find routes that use the intermediate tokens
      // feeBps
    });

    this._bestRoute = routes.routesInfos[0];
    for (let [i, route] of routes.routesInfos.entries()) {
      console.log(i, ":");
      const { isLegible, swapTransaction, addressLookupTableAccounts } = await this._legibleRoute(route);
      if (isLegible) {
        this._bestRoute = route;
        this._transaction = swapTransaction;
        this._addressLookupTableAccounts = addressLookupTableAccounts;
        break;
      }
      if (i == routes.routesInfos.length - 1) {
        throw "Error: Failed to find a route that can pass through gateway.";
      }
    }
    console.log("========");
  }

  async swap(): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    let swapRouteConfig = Buffer.alloc(MAX_SWAP_CONFIG_SIZE);

    let txs: anchor.web3.Transaction[] = [];
    const preInstructions: anchor.web3.TransactionInstruction[] = [];
    const postInstructions: anchor.web3.TransactionInstruction[] = [];
    let remainingAccounts: anchor.web3.AccountMeta[];

    let swapTransaction: anchor.web3.Transaction | anchor.web3.VersionedTransaction;
    let addressLookupTableAccounts: anchor.web3.AddressLookupTableAccount[];
    if (this._transaction) {
      swapTransaction = this._transaction;
      addressLookupTableAccounts = this._addressLookupTableAccounts;
    } else {
      let exchangeInfo = await this._jupiter.exchange({
        routeInfo: this._bestRoute,
        userPublicKey: this._params.userKey,
      });
      swapTransaction = exchangeInfo.swapTransaction;
      addressLookupTableAccounts = exchangeInfo.addressLookupTableAccounts;
    }

    let isTxV2 = true;
    if ((swapTransaction as anchor.web3.Transaction).instructions) {
      isTxV2 = false;
    }

    if (isTxV2) {
      const swapTx = swapTransaction as anchor.web3.VersionedTransaction;
      const decompiledMessage = anchor.web3.TransactionMessage.decompile(swapTx.message, {
        addressLookupTableAccounts,
      });
      const tx = new anchor.web3.Transaction();
      for (let ix of decompiledMessage.instructions) {
        if (ix.programId.equals(JUPITER_PROGRAM_ID)) {
          const { _swapAmountConfig, _swapRouteConfig } = this._getSwapConfig(ix.data);
          _swapAmountConfig.copy(payload);
          _swapRouteConfig.copy(swapRouteConfig);
          tx.add(await this._wrap(ix));
        } else {
          tx.add(ix);
        }
      }
      (this._gatewayParams.swapAmountConfig as Uint8Array[]).push(payload.subarray(0, 18));
      (this._gatewayParams.swapRouteConfig as Uint8Array[]).push(swapRouteConfig);

      txs.push(tx);

      return { txs, input: payload };
    } else {
      let isPreIx = true;
      let swapIx: anchor.web3.TransactionInstruction;
      for (let ix of (swapTransaction as anchor.web3.Transaction).instructions) {
        if (ix.programId.equals(JUPITER_PROGRAM_ID)) {
          remainingAccounts = ix.keys;
          isPreIx = false;
          swapIx = ix;
        } else if (isPreIx) {
          preInstructions.push(ix);
        } else {
          postInstructions.push(ix);
        }
      }

      // Extract config
      const { _swapAmountConfig, _swapRouteConfig } = this._getSwapConfig(swapIx.data);
      _swapAmountConfig.copy(payload);
      _swapRouteConfig.copy(swapRouteConfig);
      (this._gatewayParams.swapAmountConfig as Uint8Array[]).push(payload.subarray(0, 18));
      (this._gatewayParams.swapRouteConfig as Uint8Array[]).push(swapRouteConfig);

      const preTx = new anchor.web3.Transaction();
      if (preInstructions.length > 0) preTx.add(...preInstructions);
      const postTx = new anchor.web3.Transaction();
      if (postInstructions.length > 0) postTx.add(...postInstructions);
      const txSwap = await this._gatewayProgram.methods
        .swap()
        .accounts({
          gatewayState: this._gatewayStateKey,
          adapterProgramId: JUPITER_ADAPTER_PROGRAM_ID,
          baseProgramId: JUPITER_PROGRAM_ID,
          activityIndex: await getActivityIndex(this._params.userKey),
          gatewayAuthority: getGatewayAuthority(),
        })
        .remainingAccounts(remainingAccounts)
        .transaction();

      txs.push(txSwap);
      if (preTx.instructions.length > 0) {
        txs = [preTx, ...txs];
      }
      if (postTx.instructions.length > 0) {
        txs = [...txs, postTx];
      }
    }

    return { txs, input: payload };
  }

  getSwapMinOutAmount(): number {
    return JSBI.toNumber(this._bestRoute.outAmount);
  }

  getAddressLookupTables(): anchor.web3.AddressLookupTableAccount[] {
    return this._addressLookupTableAccounts;
  }

  async getRoute() {
    return {
      ...this._bestRoute,
      transactionFeeInfo: await this._jupiter.getDepositAndFees({
        marketInfos: this._bestRoute.marketInfos,
        userPublicKey: this._params.userKey,
      }),
    };
  }

  private async _legibleRoute(routeInfo: RouteInfo): Promise<{
    isLegible: boolean;
    swapTransaction: anchor.web3.Transaction | anchor.web3.VersionedTransaction;
    addressLookupTableAccounts: anchor.web3.AddressLookupTableAccount[];
  }> {
    let { swapTransaction, addressLookupTableAccounts } = await this._jupiter.exchange({
      routeInfo,
      userPublicKey: this._params.userKey,
    });
    const isLegible =
      routeInfo.marketInfos.length <= MAX_ROUTE_HOP && swapTransaction.serialize().length <= MAX_RAW_SWAP_TX_SIZE;
    if (isLegible) console.log(swapTransaction.serialize().length);
    return { isLegible, swapTransaction, addressLookupTableAccounts };
  }

  private _getSwapConfig(data: Buffer): {
    _swapAmountConfig: Buffer;
    _swapRouteConfig: Buffer;
  } {
    let _swapAmountConfig = Buffer.alloc(PAYLOAD_SIZE);
    let _swapRouteConfig = Buffer.alloc(MAX_SWAP_CONFIG_SIZE);
    // Extract config
    const rawData = Uint8Array.from(data);
    const swapConfig = {
      protocolConfig: Buffer.from(rawData.slice(8, rawData.byteLength - 19)), // (regular)7 - 9 bytes, but sometimes(split swap) might be upto 17 bytes
      inputAmount: Buffer.from(rawData.slice(rawData.byteLength - 19, rawData.byteLength - 11)), // u64
      outputAmount: Buffer.from(rawData.slice(rawData.byteLength - 11, rawData.byteLength - 3)), // u64
      slippageBps: Buffer.from(rawData.slice(rawData.byteLength - 3, rawData.byteLength - 1)), // u16
      platformFeeBps: Buffer.from(rawData.slice(rawData.byteLength - 1, rawData.byteLength)), // u8
    };

    _swapAmountConfig.set(swapConfig.inputAmount);
    _swapAmountConfig.set(swapConfig.outputAmount, 8);
    _swapAmountConfig.set(swapConfig.slippageBps, 16);
    if (swapConfig.protocolConfig.length < MAX_SWAP_CONFIG_SIZE) {
      _swapRouteConfig.set([swapConfig.protocolConfig.length], 0);
      _swapRouteConfig.set(swapConfig.protocolConfig, 1);
    } else if (swapConfig.protocolConfig.length == MAX_SWAP_CONFIG_SIZE) {
      _swapAmountConfig.set(swapConfig.protocolConfig, 0);
    } else {
      throw `Error: Currently Gateway only support swap config under ${MAX_SWAP_CONFIG_SIZE} bytes,\nplease change to another route to fix it or wait for the updates.`;
    }

    return { _swapAmountConfig, _swapRouteConfig };
  }

  private async _wrap(ix: anchor.web3.TransactionInstruction): Promise<anchor.web3.TransactionInstruction> {
    const swapDiscriminator = Buffer.from(sigHash("global", "swap"), "hex");
    ix.data = swapDiscriminator;
    ix.programId = GATEWAY_PROGRAM_ID;
    ix.keys = [
      { pubkey: this._gatewayStateKey, isSigner: false, isWritable: true },
      { pubkey: JUPITER_ADAPTER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: JUPITER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: await getActivityIndex(this._params.userKey), isSigner: false, isWritable: false },
      { pubkey: getGatewayAuthority(), isSigner: false, isWritable: false },
      ...ix.keys,
    ];

    return ix;
  }
}

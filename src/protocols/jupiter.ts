import * as anchor from "@project-serum/anchor";
import { Jupiter, RouteInfo } from "@jup-ag/core";
import JSBI from "jsbi";
import { GatewayParams, IProtocolSwap, PAYLOAD_SIZE, SwapParams } from "../types";
import { GATEWAY_PROGRAM_ID, JUPITER_ADAPTER_PROGRAM_ID, JUPITER_PROGRAM_ID, WSOL } from "../ids";
import { getAssociatedTokenAddress } from "@solana/spl-token-v2";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { getActivityIndex, getGatewayAuthority, sigHash } from "../utils";
import { struct, u64 } from "@project-serum/borsh";
import { BN } from "bn.js";

interface ProtocolJupiterParams extends SwapParams {
  userKey: anchor.web3.PublicKey;
}

export class ProtocolJupiter implements IProtocolSwap {
  private _jupiter: Jupiter;
  private _bestRoute: RouteInfo;
  private _transactions: anchor.web3.Transaction[] = [];

  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams,
    private _params: ProtocolJupiterParams
  ) {}
  // constructor(
  //   private _connection: anchor.web3.Connection,
  //   private _gatewayProgram: anchor.Program<Gateway>,
  //   private _gatewayStateKey: anchor.web3.PublicKey,
  //   private _gatewayParams: GatewayParams
  // ) {}

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
    for (let route of routes.routesInfos) {
      if (route.marketInfos.length <= 2) {
        this._bestRoute = route;
        break;
      }
    }
  }

  async swap(): Promise<{ txs: (anchor.web3.Transaction | anchor.web3.VersionedTransaction)[]; input: Buffer }> {
    // Handle payload input here
    let payload = Buffer.alloc(PAYLOAD_SIZE);

    let txs: (anchor.web3.Transaction | anchor.web3.VersionedTransaction)[] = [];
    const preInstructions: anchor.web3.TransactionInstruction[] = [];
    const postInstructions: anchor.web3.TransactionInstruction[] = [];
    let remainingAccounts: anchor.web3.AccountMeta[];

    // tx v1
    // const { transactions } = await this._jupiter.exchange({
    //   routeInfo: this._bestRoute,
    //   userPublicKey: this._params.userKey,
    // });
    // const { setupTransaction, swapTransaction, cleanupTransaction } = transactions;

    // tx v2
    let { swapTransaction } = await this._jupiter.exchange({
      routeInfo: this._bestRoute,
      userPublicKey: this._params.userKey,
    });
    // console.log(swapTransaction);
    // console.log("compiledInstructions");
    // (swapTransaction as anchor.web3.VersionedTransaction).message.compiledInstructions.forEach((ix, i) => {
    //   console.log(`#${i}:`, ix);
    // });
    // console.log("addressTableLookups");
    // (swapTransaction as anchor.web3.VersionedTransaction).message.addressTableLookups.forEach((table, i) => {
    //   console.log(`#${i}:`, table.accountKey.toBase58());
    // });
    // console.log("staticAccountKeys");
    // (swapTransaction as anchor.web3.VersionedTransaction).message.staticAccountKeys.forEach((key, i) => {
    //   console.log(`#${i}:`, key.toBase58());
    // });

    let isTxV2 = true;
    if ((swapTransaction as anchor.web3.Transaction).instructions) {
      isTxV2 = false;
    }

    if (isTxV2) {
      const swapTx = swapTransaction as anchor.web3.VersionedTransaction;

      const originKeysLen = swapTx.message.staticAccountKeys.length;
      const writeIndexStart =
        swapTx.message.staticAccountKeys.length - swapTx.message.header.numReadonlyUnsignedAccounts;
      const keysToAppend = 5;
      const gatewayProgramIndex = originKeysLen + 1;
      const gatewayStateIndex = writeIndexStart;
      const jupiterAdapterProgramIndex = originKeysLen + 2;
      const activityIndex = originKeysLen + 3;
      const authorityIndex = originKeysLen + 4;

      let readOnlyKeys: anchor.web3.PublicKey[] = [];
      for (let i = 0; i < swapTx.message.header.numReadonlyUnsignedAccounts; i++) {
        readOnlyKeys = [swapTx.message.staticAccountKeys.pop(), ...readOnlyKeys];
      }
      swapTx.message.staticAccountKeys.push(this._gatewayStateKey);

      swapTx.message.staticAccountKeys.push(
        ...readOnlyKeys,
        GATEWAY_PROGRAM_ID,
        JUPITER_ADAPTER_PROGRAM_ID,
        await getActivityIndex(this._params.userKey),
        getGatewayAuthority()
      );
      let jupiterProgramIndex = swapTx.message.staticAccountKeys.length - 1;
      for (let [index, pubkey] of swapTx.message.staticAccountKeys.entries()) {
        if (pubkey.equals(JUPITER_PROGRAM_ID)) {
          jupiterProgramIndex = index;
        }
      }
      swapTx.message.header.numReadonlyUnsignedAccounts = swapTx.message.header.numReadonlyUnsignedAccounts + 4;

      let swapIndex = 0;
      let swapIx: anchor.web3.MessageCompiledInstruction;
      for (let [index, ix] of swapTx.message.compiledInstructions.entries()) {
        ix.accountKeyIndexes = ix.accountKeyIndexes.map((i) => {
          return i < originKeysLen ? (i < writeIndexStart ? i : i + 1) : i + keysToAppend;
        });
        ix.programIdIndex = ix.programIdIndex < writeIndexStart ? ix.programIdIndex : ix.programIdIndex + 1;
        swapTx.message.compiledInstructions[index] = ix;
        if (ix.programIdIndex == jupiterProgramIndex) {
          swapIndex = index;
          swapIx = ix;
        }
      }
      const swapDiscriminator = Buffer.from(sigHash("global", "swap"), "hex");

      const rawData = Uint8Array.from(swapIx.data);
      const swapConfig = {
        protocolConfig: Buffer.from(rawData.slice(8, rawData.byteLength - 19)), // 7 - 9 bytes
        inputAmount: Buffer.from(rawData.slice(rawData.byteLength - 19, rawData.byteLength - 11)), // u64
        outputAmount: Buffer.from(rawData.slice(rawData.byteLength - 11, rawData.byteLength - 3)), // u64
        slippageBps: Buffer.from(rawData.slice(rawData.byteLength - 3, rawData.byteLength - 1)), // u16
        platformFeeBps: Buffer.from(rawData.slice(rawData.byteLength - 1, rawData.byteLength)), // u8
      };

      payload.set(swapConfig.inputAmount);
      // console.log("payload:", payload);
      payload.set(swapConfig.outputAmount, 8);
      // console.log("payload:", payload);
      payload.set(swapConfig.slippageBps, 16);
      // console.log("payload:", payload);
      // payload.set(swapConfig.platformFeeBps, 18);
      // console.log("payload:", payload);
      payload.set(swapConfig.protocolConfig, 18);
      // console.log("payload:", payload);
      // payload.set([255], 18 + swapConfig.protocolConfig.length); // for on-chain identify
      // console.log("payload:", payload);

      this._gatewayParams.swapConfig.push(...swapConfig.inputAmount);
      this._gatewayParams.swapConfig.push(...swapConfig.outputAmount);
      this._gatewayParams.swapConfig.push(...swapConfig.slippageBps);
      // this._gatewayParams.swapConfig.push(...swapConfig.platformFeeBps);
      this._gatewayParams.swapConfig.push(...swapConfig.protocolConfig);
      console.log("swapConfig:", this._gatewayParams.swapConfig);
      swapIx.data = swapDiscriminator;
      swapIx.programIdIndex = gatewayProgramIndex;
      swapIx.accountKeyIndexes = [
        gatewayStateIndex,
        jupiterAdapterProgramIndex,
        jupiterProgramIndex,
        activityIndex,
        authorityIndex,
        ...swapIx.accountKeyIndexes,
      ];
      swapTx.message.compiledInstructions[swapIndex] = swapIx;
      // console.log("after wrap tx:", swapTx);
      // console.log("compiledInstructions");
      // swapTx.message.compiledInstructions.forEach((ix, i) => {
      //   console.log(`#${i}:`, ix);
      // });
      // console.log("staticAccountKeys");
      // swapTx.message.staticAccountKeys.forEach((key, i) => {
      //   console.log(`#${i}:`, key.toBase58());
      // });
      txs = [swapTx];
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
      const rawData = Uint8Array.from(swapIx.data);
      const swapConfig = {
        protocolConfig: Buffer.from(rawData.slice(8, rawData.byteLength - 19)), // 7 - 9 bytes
        inputAmount: Buffer.from(rawData.slice(rawData.byteLength - 19, rawData.byteLength - 11)), // u64
        outputAmount: Buffer.from(rawData.slice(rawData.byteLength - 11, rawData.byteLength - 3)), // u64
        slippageBps: Buffer.from(rawData.slice(rawData.byteLength - 3, rawData.byteLength - 1)), // u16
        platformFeeBps: Buffer.from(rawData.slice(rawData.byteLength - 1, rawData.byteLength)), // u8
      };
      // console.log("data:", swapIx.data);
      // console.log("swapConfig:", swapConfig);

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
        // .preInstructions(preInstructions)
        // .postInstructions(postInstructions)
        .remainingAccounts(remainingAccounts)
        .transaction();

      // console.log("remainingAccounts:");
      remainingAccounts.forEach((acc, i) => {
        console.log(`#${i}:`, acc.pubkey.toBase58());
      });

      payload.set(swapConfig.inputAmount);
      payload.set(swapConfig.outputAmount, 8);
      payload.set(swapConfig.slippageBps, 16);
      // payload.set(swapConfig.platformFeeBps, 18);
      payload.set(swapConfig.protocolConfig, 18);
      // payload.set([255], 19 + swapConfig.protocolConfig.length);
      // console.log("payload:", payload);
      // inputLayout.encode(
      //   {
      //     inputAmount: new anchor.BN(5000),
      //   },
      //   payload
      // );

      const inputAmount = new BN(swapConfig.inputAmount, "le");
      const outputAmount = new BN(swapConfig.outputAmount, "le");
      const slippage = new BN(swapConfig.slippageBps, "le");
      const fee = new BN(swapConfig.platformFeeBps, "le");

      // console.log("inputAmount:", Number(inputAmount));
      // console.log("outputAmount:", Number(outputAmount));
      // console.log("slippage:", Number(slippage));
      // console.log("fee:", Number(fee));

      this._gatewayParams.swapConfig.push(...swapConfig.inputAmount);
      this._gatewayParams.swapConfig.push(...swapConfig.outputAmount);
      this._gatewayParams.swapConfig.push(...swapConfig.slippageBps);
      // this._gatewayParams.swapConfig.push(...swapConfig.platformFeeBps);
      this._gatewayParams.swapConfig.push(...swapConfig.protocolConfig);
      console.log("swapConfig:", this._gatewayParams.swapConfig);

      // for (let transaction of [setupTransaction, txSwap, cleanupTransaction]
      //   .filter(Boolean)
      //   .filter((tx) => tx.instructions.length > 0)) {
      //   this._transactions.push(transaction);
      // }
      txs.push(txSwap);
      if (preTx.instructions.length > 0) {
        txs = [preTx, ...txs];
      }
      if (postTx.instructions.length > 0) {
        txs = [...txs, postTx];
      }
    }
    // console.log("setupTransaction:", setupTransaction);
    // console.log("txSwap:", txSwap);
    // console.log("cleanupTransaction:", cleanupTransaction);

    return { txs, input: payload };
  }

  getSwapMinOutAmount(): number {
    return JSBI.toNumber(this._bestRoute.outAmount);
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
}

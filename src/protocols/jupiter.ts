import * as anchor from "@project-serum/anchor";
import { Jupiter, RouteInfo } from "@jup-ag/core";
import JSBI from "jsbi";
import { IProtocolSwap } from "../types";
import { JUPITER_ADAPTER_PROGRAM_ID, JUPITER_PROGRAM_ID, WSOL } from "../ids";
import { getAssociatedTokenAddress } from "@solana/spl-token-v2";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { getActivityIndex, getGatewayAuthority } from "../utils";

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
      amount: JSBI.BigInt(this._params.amount), // 1000000 => 1 USDC if inputToken.address is USDC mint
      slippageBps: Math.ceil(this._params.slippage * 100), // 100 = 1%
      // forceFetch (optional) to force fetching routes and not use the cache
      // intermediateTokens, if provided will only find routes that use the intermediate tokens
      // feeBps
    });

    this._bestRoute = routes.routesInfos[0];
  }

  async swap(): Promise<anchor.web3.Transaction[]> {
    const preInstructions: anchor.web3.TransactionInstruction[] = [];
    const postInstructions: anchor.web3.TransactionInstruction[] = [];
    let remainingAccounts: anchor.web3.AccountMeta[];

    const { transactions } = await this._jupiter.exchange({
      routeInfo: this._bestRoute,
      userPublicKey: this._params.userKey,
    });
    const { setupTransaction, swapTransaction, cleanupTransaction } = transactions;

    // wrap through gateway
    // TODO: export params to gateway state
    let isPreIx = true;
    let swapIx: anchor.web3.TransactionInstruction;
    for (let ix of swapTransaction.instructions) {
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
      inputAmount: Buffer.from(
        rawData.slice(rawData.byteLength - 19, rawData.byteLength - 11)
      ), // u64
      outputAmount: Buffer.from(
        rawData.slice(rawData.byteLength - 11, rawData.byteLength - 3)
      ), // u64
      slippageBps: Buffer.from(
        rawData.slice(rawData.byteLength - 3, rawData.byteLength - 1)
      ), // u16
      platformFeeBps: Buffer.from(
        rawData.slice(rawData.byteLength - 1, rawData.byteLength)
      ), // u8
    };
    console.log("data:", swapIx.data);
    console.log("swapConfig:", swapConfig);

    const txSwap = await this._gatewayProgram.methods
      .swap()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: JUPITER_ADAPTER_PROGRAM_ID,
        baseProgramId: JUPITER_PROGRAM_ID,
        activityIndex: await getActivityIndex(this._params.userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    for (let transaction of [setupTransaction, txSwap, cleanupTransaction]
      .filter(Boolean)
      .filter((tx) => tx.instructions.length > 0)) {
      this._transactions.push(transaction);
    }

    if (this._transactions.length == 0) {
      throw new Error("Transactions are empty");
    }
    return this._transactions;
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

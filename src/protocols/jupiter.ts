import * as anchor from "@project-serum/anchor";
import { Jupiter, RouteInfo } from "@jup-ag/core";
import { IProtocolSwap } from "../types";
import { WSOL } from "../ids";
import { getAssociatedTokenAddress } from "@solana/spl-token-v2";

interface ProtocolJupiterParams {
  userKey: anchor.web3.PublicKey;
  fromTokenMint: anchor.web3.PublicKey;
  toTokenMint: anchor.web3.PublicKey;
  amount: number;
  slippage: number;
}

export class ProtocolJupiter implements IProtocolSwap {
  private _jupiter: Jupiter;
  private _bestRoute: RouteInfo;
  private _transactions: anchor.web3.Transaction[] = [];

  constructor(
    private _connection: anchor.web3.Connection,
    private _params: ProtocolJupiterParams
  ) {}

  async build(): Promise<void> {
    this._jupiter = await Jupiter.load({
      connection: this._connection,
      cluster: "mainnet-beta",
    });
    const routes = await this._jupiter.computeRoutes({
      inputMint: this._params.fromTokenMint,
      outputMint: this._params.toTokenMint,
      inputAmount: this._params.amount, // 1000000 => 1 USDC if inputToken.address is USDC mint
      slippage: this._params.slippage, // 1 = 1%
      // forceFetch (optional) to force fetching routes and not use the cache
      // intermediateTokens, if provided will only find routes that use the intermediate tokens
      // feeBps
    });

    this._bestRoute = routes.routesInfos[0];
  }

  async swap(): Promise<anchor.web3.Transaction[]> {
    const { transactions } = await this._jupiter.exchange({
      routeInfo: this._bestRoute,
      userPublicKey: this._params.userKey,
    });
    const { setupTransaction, swapTransaction, cleanupTransaction } =
      transactions;

    const userWSOLAta = await getAssociatedTokenAddress(
      WSOL,
      this._params.userKey
    );

    // Remove WSOL create instructions
    // if (setupTransaction) {
    //   setupTransaction.instructions = setupTransaction.instructions.filter(
    //     (ix) =>
    //       !(
    //         ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) &&
    //         ix.keys[1].pubkey.equals(userWSOLAta)
    //       )
    //   );
    // }

    // Remove WSOL create/close instructions
    // if (swapTransaction) {
    //   swapTransaction.instructions = swapTransaction.instructions
    //     .filter(
    //       (ix) =>
    //         !(
    //           ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) &&
    //           ix.keys[1].pubkey.equals(userWSOLAta)
    //         )
    //     )
    //     .filter(
    //       (ix) =>
    //         !(
    //           ix.programId.equals(TOKEN_PROGRAM_ID) &&
    //           ix.keys[0].pubkey.equals(userWSOLAta)
    //         )
    //     );
    // }

    // Remove WSOL close instructions
    // if (cleanupTransaction) {
    //   cleanupTransaction.instructions = cleanupTransaction.instructions.filter(
    //     (ix) =>
    //       !(
    //         ix.programId.equals(TOKEN_PROGRAM_ID) &&
    //         ix.keys[0].pubkey.equals(userWSOLAta)
    //       )
    //   );
    // }

    for (let transaction of [
      setupTransaction,
      swapTransaction,
      cleanupTransaction,
    ]
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
    return this._bestRoute.outAmountWithSlippage;
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

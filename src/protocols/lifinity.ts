import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  getActivityIndex,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { IPoolInfo, lifinity } from "@dappio-wonderland/navigator";
import {
  ActionType,
  AddLiquidityParams,
  GatewayParams,
  IProtocolPool,
  PAYLOAD_SIZE,
  RemoveLiquidityParams,
} from "../types";
import { LIFINITY_ADAPTER_PROGRAM_ID, NATIVE_SOL, WSOL } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { struct, u64, u8 } from "@project-serum/borsh";
export class ProtocolLifinity implements IProtocolPool {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async addLiquidity(
    params: AddLiquidityParams,
    poolInfo: IPoolInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([u64("tokenInAmount"), u8("poolDirection")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        tokenInAmount: new anchor.BN(params.tokenInAmount),
        // From Metadata
        poolDirection: this._gatewayParams.poolDirection,
      },
      payload
    );
    // Handle transaction here
    const pool = poolInfo as lifinity.PoolInfo;
    const userTokenAAccountKey = await getAssociatedTokenAddress(
      pool.tokenAMint,
      userKey
    );
    const userTokenBAccountKey = await getAssociatedTokenAddress(
      pool.tokenBMint,
      userKey
    );
    const userLPAccountKey = await getAssociatedTokenAddress(
      pool.lpMint,
      userKey
    );

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.AddLiquidity
    );
    const addLiquidityAmount = params.tokenInAmount;

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, pool.tokenAMint)
    );

    if (pool.tokenAMint.equals(NATIVE_SOL) || pool.tokenAMint.equals(WSOL)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: userTokenAAccountKey,
          lamports: Number(addLiquidityAmount),
        }),
        createSyncNativeInstruction(userTokenAAccountKey)
      );
      postInstructions.push(
        createCloseAccountInstruction(userTokenAAccountKey, userKey, userKey)
      );
    }

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, pool.tokenBMint)
    );

    if (pool.tokenBMint.equals(NATIVE_SOL) || pool.tokenBMint.equals(WSOL)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: userTokenBAccountKey,
          lamports: Number(addLiquidityAmount),
        }),
        createSyncNativeInstruction(userTokenBAccountKey)
      );
      postInstructions.push(
        createCloseAccountInstruction(userTokenBAccountKey, userKey, userKey)
      );
    }

    preInstructions.push(await createATAWithoutCheckIx(userKey, pool.lpMint));

    const authority = findProgramAddressSync(
      [pool.poolId.toBuffer()],
      lifinity.LIFINITY_PROGRAM_ID
    )[0];

    const remainingAccounts = [
      { pubkey: pool.poolId, isSigner: false, isWritable: true }, // 0
      { pubkey: authority, isSigner: false, isWritable: false }, // 1
      { pubkey: userKey, isSigner: true, isWritable: false }, // 2
      { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true }, // 3
      { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true }, // 4
      { pubkey: pool.tokenAAccount, isSigner: false, isWritable: true }, // 5
      { pubkey: pool.tokenBAccount, isSigner: false, isWritable: true }, // 6
      { pubkey: pool.lpMint, isSigner: false, isWritable: true }, // 7
      { pubkey: userLPAccountKey, isSigner: false, isWritable: true }, // 8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
      { pubkey: pool.poolConfig.key, isSigner: false, isWritable: false }, // 10
    ];

    const txAddLiquidity = await this._gatewayProgram.methods
      .addLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LIFINITY_ADAPTER_PROGRAM_ID,
        baseProgramId: lifinity.LIFINITY_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txAddLiquidity], input: payload };
  }

  async removeLiquidity(
    params: RemoveLiquidityParams,
    poolInfo: IPoolInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([u64("lpAmount"), u8("poolDirection")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        lpAmount: new anchor.BN(params.lpAmount),
        // From Metadata
        poolDirection: this._gatewayParams.poolDirection,
      },
      payload
    );
    // Handle transaction here
    const pool = poolInfo as lifinity.PoolInfo;
    const userTokenAAccountKey = await getAssociatedTokenAddress(
      pool.tokenAMint,
      userKey
    );
    const userTokenBAccountKey = await getAssociatedTokenAddress(
      pool.tokenBMint,
      userKey
    );
    const userLPAccountKey = await getAssociatedTokenAddress(
      pool.lpMint,
      userKey
    );

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, pool.tokenAMint)
    );

    if (pool.tokenAMint.equals(NATIVE_SOL) || pool.tokenAMint.equals(WSOL)) {
      postInstructions.push(
        createCloseAccountInstruction(userTokenAAccountKey, userKey, userKey)
      );
    }

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, pool.tokenBMint)
    );

    if (pool.tokenBMint.equals(NATIVE_SOL) || pool.tokenBMint.equals(WSOL)) {
      postInstructions.push(
        createCloseAccountInstruction(userTokenBAccountKey, userKey, userKey)
      );
    }

    const authority = findProgramAddressSync(
      [pool.poolId.toBuffer()],
      lifinity.LIFINITY_PROGRAM_ID
    )[0];

    const remainingAccounts = [
      { pubkey: pool.poolId, isSigner: false, isWritable: true }, // 0
      { pubkey: authority, isSigner: false, isWritable: false }, // 1
      { pubkey: userKey, isSigner: true, isWritable: false }, // 2
      { pubkey: userLPAccountKey, isSigner: false, isWritable: true }, // 3
      { pubkey: pool.tokenAAccount, isSigner: false, isWritable: true }, // 4
      { pubkey: pool.tokenBAccount, isSigner: false, isWritable: true }, // 5
      { pubkey: pool.lpMint, isSigner: false, isWritable: true }, // 6
      { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true }, // 7
      { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true }, // 8
      { pubkey: pool.poolFeeAccount, isSigner: false, isWritable: true }, // 9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 10
    ];

    const txRemoveLiquidity = await this._gatewayProgram.methods
      .removeLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LIFINITY_ADAPTER_PROGRAM_ID,
        baseProgramId: lifinity.LIFINITY_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txRemoveLiquidity], input: payload };
  }
}

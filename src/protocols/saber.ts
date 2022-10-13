import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { struct, u64 } from "@project-serum/borsh";
import {
  createATAWithoutCheckIx,
  getActivityIndex,
  getGatewayAuthority,
} from "../utils";
import { IFarmInfo, IPoolInfo, saber } from "@dappio-wonderland/navigator";
import {
  ActionType,
  GatewayParams,
  IProtocolFarm,
  IProtocolPool,
  PoolDirection,
} from "../types";
import { SABER_ADAPTER_PROGRAM_ID, WSOL } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { getMultipleAccounts } from "@dappio-wonderland/navigator/dist/utils";

export class ProtocolSaber implements IProtocolPool, IProtocolFarm {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async addLiquidity(
    poolInfo: IPoolInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const pool = poolInfo as saber.PoolInfo;

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

    const createUserTokenAAccountIx = await createATAWithoutCheckIx(
      userKey,
      pool.tokenAMint
    );
    preInstructions.push(createUserTokenAAccountIx);
    const createUserTokenBAccountIx = await createATAWithoutCheckIx(
      userKey,
      pool.tokenBMint
    );
    preInstructions.push(createUserTokenBAccountIx);
    const createUserLpAccountIx = await createATAWithoutCheckIx(
      userKey,
      pool.lpMint
    );
    preInstructions.push(createUserLpAccountIx);

    // Work-around of getting tokenAInAmount / tokenBInAmount
    const indexAddLiquidity = this._gatewayParams.actionQueue.indexOf(
      ActionType.AddLiquidity
    );

    const amount = this._gatewayParams.payloadQueue[indexAddLiquidity];

    // transfer and sync WSOL
    if (
      (this._gatewayParams.poolDirection == PoolDirection.Reverse &&
        pool.tokenAMint.equals(WSOL)) ||
      (this._gatewayParams.poolDirection == PoolDirection.Obverse &&
        pool.tokenBMint.equals(WSOL))
    ) {
      const userTokenAccountKey = await getAssociatedTokenAddress(
        WSOL,
        userKey
      );
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: userTokenAccountKey,
          lamports: Number(amount),
        }),
        createSyncNativeInstruction(userTokenAccountKey)
      );

      postInstructions.push(
        createCloseAccountInstruction(userTokenAccountKey, userKey, userKey)
      );
    }

    const { isWrapped, wrapInfo } =
      this._gatewayParams.poolDirection == PoolDirection.Reverse
        ? {
            isWrapped: pool.mintAWrapped,
            wrapInfo: pool.mintAWrapInfo,
          }
        : { isWrapped: pool.mintBWrapped, wrapInfo: pool.mintBWrapInfo };

    if (isWrapped) {
      let underlyingUserTokenAccountKey = await getAssociatedTokenAddress(
        wrapInfo.underlyingWrappedTokenMint,
        userKey
      );

      const underlyingUserTokenAccountInfo =
        await this._connection.getAccountInfo(underlyingUserTokenAccountKey);
      if (!underlyingUserTokenAccountInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            userKey,
            underlyingUserTokenAccountKey,
            userKey,
            pool.mintAWrapInfo?.underlyingWrappedTokenMint
          )
        );
      }

      preInstructions.push(
        this._getWrapIx(
          pool.mintAWrapInfo,
          userKey,
          amount.div(wrapInfo.multiplyer),
          underlyingUserTokenAccountKey,
          userTokenAAccountKey
        )
      );
    }

    const remainingAccounts = [
      { pubkey: pool.poolId, isSigner: false, isWritable: false },
      { pubkey: pool.authority, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true },
      { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true },
      { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
      { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
      { pubkey: pool.lpMint, isSigner: false, isWritable: true },
      { pubkey: userLPAccountKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    const txAddLiquidity = await this._gatewayProgram.methods
      .addLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SABER_ADAPTER_PROGRAM_ID,
        baseProgramId: saber.POOL_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txAddLiquidity];
  }

  async removeLiquidity(
    poolInfo: IPoolInfo,
    userKey: anchor.web3.PublicKey,
    removeLiquiditySingleToTokenMint: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const pool = poolInfo as saber.PoolInfo;
    let accountKeys: anchor.web3.PublicKey[] = [];
    const userTokenAAccountKey = await getAssociatedTokenAddress(
      pool.tokenAMint,
      userKey
    );
    accountKeys.push(userTokenAAccountKey);
    const userTokenBAccountKey = await getAssociatedTokenAddress(
      pool.tokenBMint,
      userKey
    );
    accountKeys.push(userTokenBAccountKey);
    const userLPAccountKey = await getAssociatedTokenAddress(
      pool.lpMint,
      userKey
    );
    let underlyingUserTokenAAccountKey: anchor.web3.PublicKey;
    if (pool.mintAWrapped) {
      underlyingUserTokenAAccountKey = await getAssociatedTokenAddress(
        pool.mintAWrapInfo?.underlyingWrappedTokenMint,
        userKey
      );
      accountKeys.push(underlyingUserTokenAAccountKey);
    }
    let underlyingUserTokenBAccountKey: anchor.web3.PublicKey;
    if (pool.mintBWrapped) {
      underlyingUserTokenBAccountKey = await getAssociatedTokenAddress(
        pool.mintBWrapInfo?.underlyingWrappedTokenMint,
        userKey
      );
      accountKeys.push(underlyingUserTokenBAccountKey);
    }

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const userTokenAccountInfos = await getMultipleAccounts(
      this._connection,
      accountKeys
    );
    const userTokenAAccountInfo = userTokenAccountInfos[0].account;
    if (!userTokenAAccountInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          userKey,
          userTokenAAccountKey,
          userKey,
          pool.tokenAMint
        )
      );
    }

    const userTokenBAccountInfo = userTokenAccountInfos[1].account;
    if (!userTokenBAccountInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          userKey,
          userTokenBAccountKey,
          userKey,
          pool.tokenBMint
        )
      );
    }

    // if Token A is wrapped
    if (pool.mintAWrapped) {
      // check underlying token account is created
      const underlyingUserTokenAAcountInfo = userTokenAccountInfos[2].account;
      if (!underlyingUserTokenAAcountInfo) {
        postInstructions.push(
          createAssociatedTokenAccountInstruction(
            userKey,
            underlyingUserTokenAAccountKey,
            userKey,
            pool.mintAWrapInfo?.underlyingWrappedTokenMint
          )
        );
      }

      postInstructions.push(
        this._getUnwrapIx(
          pool.mintAWrapInfo,
          userKey,
          userTokenAAccountKey,
          underlyingUserTokenAAccountKey
        )
      );
    }

    if (pool.mintBWrapped) {
      // check underlying token account is created
      const underlyingUserTokenBAcountInfo = pool.mintAWrapped
        ? userTokenAccountInfos[3].account
        : userTokenAccountInfos[2].account;
      if (!underlyingUserTokenBAcountInfo) {
        postInstructions.push(
          createAssociatedTokenAccountInstruction(
            userKey,
            underlyingUserTokenBAccountKey,
            userKey,
            pool.mintBWrapInfo?.underlyingWrappedTokenMint
          )
        );
      }

      postInstructions.push(
        this._getUnwrapIx(
          pool.mintBWrapInfo,
          userKey,
          userTokenBAccountKey,
          underlyingUserTokenBAccountKey
        )
      );
    }

    if (pool.tokenAMint.equals(WSOL) || pool.tokenBMint.equals(WSOL)) {
      const userWSOLTokenAccount = await getAssociatedTokenAddress(
        WSOL,
        userKey
      );
      postInstructions.push(
        createCloseAccountInstruction(userWSOLTokenAccount, userKey, userKey)
      );
    }

    const remainingAccounts = removeLiquiditySingleToTokenMint
      ? [
          { pubkey: pool.poolId, isSigner: false, isWritable: false },
          { pubkey: pool.authority, isSigner: false, isWritable: false },
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: pool.lpMint, isSigner: false, isWritable: true },
          { pubkey: userLPAccountKey, isSigner: false, isWritable: true },
          removeLiquiditySingleToTokenMint.equals(pool.tokenAMint)
            ? { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true }
            : { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
          removeLiquiditySingleToTokenMint.equals(pool.tokenAMint)
            ? { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true }
            : { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
          removeLiquiditySingleToTokenMint.equals(pool.tokenAMint)
            ? {
                pubkey: userTokenAAccountKey,
                isSigner: false,
                isWritable: true,
              }
            : {
                pubkey: userTokenBAccountKey,
                isSigner: false,
                isWritable: true,
              },
          removeLiquiditySingleToTokenMint.equals(pool.tokenAMint)
            ? {
                pubkey: pool.adminFeeAccountA,
                isSigner: false,
                isWritable: true,
              }
            : {
                pubkey: pool.adminFeeAccountB,
                isSigner: false,
                isWritable: true,
              },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ]
      : [
          { pubkey: pool.poolId, isSigner: false, isWritable: false },
          { pubkey: pool.authority, isSigner: false, isWritable: false },
          { pubkey: userKey, isSigner: true, isWritable: false },
          { pubkey: pool.lpMint, isSigner: false, isWritable: true },
          { pubkey: userLPAccountKey, isSigner: false, isWritable: true },
          { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
          { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
          { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true },
          { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true },
          { pubkey: pool.adminFeeAccountA, isSigner: false, isWritable: true },
          { pubkey: pool.adminFeeAccountB, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

    const txRemoveLiquidity = await this._gatewayProgram.methods
      .removeLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SABER_ADAPTER_PROGRAM_ID,
        baseProgramId: saber.POOL_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txRemoveLiquidity];
  }

  async stake(
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as saber.FarmInfo;

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const minerKey = await saber.infos.getFarmerId(farm, userKey);
    const minerVault = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      minerKey,
      true
    );
    const minerLpAccount = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      userKey
    );

    const ixs = await this._getCreateMinerInstruction(
      this._connection,
      userKey,
      farm.farmId,
      farm.tokenMintKey
    );

    // TODO: Add wrappers

    preInstructions = [...preInstructions, ...ixs];

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: minerKey, isSigner: false, isWritable: true },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: minerLpAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: saber.QUARRY_REWARDER,
        isSigner: false,
        isWritable: false,
      },
    ];

    const txStake = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SABER_ADAPTER_PROGRAM_ID,
        baseProgramId: saber.QURARRY_MINE_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txStake];
  }

  async unstake(
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as saber.FarmInfo;

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const minerKey = await saber.infos.getFarmerId(farm, userKey);
    const minerVault = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      minerKey,
      true
    );
    const minerLpAccount = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      userKey
    );
    const createMinerLpAccountIx = await createATAWithoutCheckIx(
      userKey,
      new anchor.web3.PublicKey(farm.tokenMintKey)
    );
    preInstructions.push(createMinerLpAccountIx);

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: minerKey, isSigner: false, isWritable: true },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: minerLpAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: saber.QUARRY_REWARDER,
        isSigner: false,
        isWritable: false,
      },
    ];

    const txUnstake = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SABER_ADAPTER_PROGRAM_ID,
        baseProgramId: saber.QURARRY_MINE_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txUnstake];
  }

  async harvest(
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as saber.FarmInfo;

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const minerKey = await saber.infos.getFarmerId(farm, userKey);
    const minerVault = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      minerKey,
      true
    );

    const userLpAccount = await getAssociatedTokenAddress(
      farm.tokenMintKey,
      userKey
    );
    const createUserLpAccountIx = await createATAWithoutCheckIx(
      userKey,
      farm.tokenMintKey
    );
    preInstructions.push(createUserLpAccountIx);

    const iouTokenAccount = await getAssociatedTokenAddress(
      saber.IOU_TOKEN_MINT,
      userKey
    );
    const createIouTokenAccountIx = await createATAWithoutCheckIx(
      userKey,
      saber.IOU_TOKEN_MINT
    );
    preInstructions.push(createIouTokenAccountIx);

    const remainingAccounts = [
      { pubkey: saber.MINT_WRAPPER, isSigner: false, isWritable: true },
      {
        pubkey: saber.QURARRY_MINT_WRAPPER,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: saber.FARM_MINTER, isSigner: false, isWritable: true },
      { pubkey: saber.IOU_TOKEN_MINT, isSigner: false, isWritable: true },
      { pubkey: iouTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: saber.CLAIM_FEE_TOKEN_ACCOUNT,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: minerKey, isSigner: false, isWritable: true },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: userLpAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: saber.QUARRY_REWARDER,
        isSigner: false,
        isWritable: false,
      },
    ];

    const txHarvest = await this._gatewayProgram.methods
      .harvest()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SABER_ADAPTER_PROGRAM_ID,
        baseProgramId: saber.QURARRY_MINE_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txHarvest];
  }

  private async _getCreateMinerInstruction(
    conn: anchor.web3.Connection,
    userKey: anchor.web3.PublicKey,
    farmId: anchor.web3.PublicKey,
    lpMint: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction[]> {
    let ixs = [] as anchor.web3.TransactionInstruction[];

    const [minerKey, bump] = await saber.infos.getFarmerIdWithBump(
      farmId,
      userKey
    );
    const minerVault = await getAssociatedTokenAddress(lpMint, minerKey, true);
    const accountInfos = await getMultipleAccounts(this._connection, [
      minerKey,
      minerVault,
    ]);

    const minerInfo = accountInfos[0].account;
    if (!minerInfo) {
      // Create Miner
      const dataLayout = struct([u64("bump")]);
      let bumpData = Buffer.alloc(dataLayout.span);
      dataLayout.encode(
        {
          bump: new anchor.BN(bump),
        },
        bumpData
      );
      // Invoke Quarry
      // TODO: Compute hash from function name instead of hard-coded string
      let dataString = "7e179d01935ef545".concat(bumpData.toString("hex"));
      let data = Buffer.from(dataString, "hex");

      // Create minerVault if needed

      const minerVaultInfo = accountInfos[1].account;
      if (!minerVaultInfo) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            userKey,
            minerVault,
            minerKey,
            lpMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      const keys = [
        { pubkey: userKey, isSigner: true, isWritable: true },
        { pubkey: minerKey, isSigner: false, isWritable: true },
        { pubkey: farmId, isSigner: false, isWritable: true },
        {
          pubkey: saber.QUARRY_REWARDER,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: anchor.web3.SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: userKey, isSigner: true, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: false },
        { pubkey: minerVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
      ixs.push(
        new anchor.web3.TransactionInstruction({
          keys,
          programId: saber.QURARRY_MINE_PROGRAM_ID,
          data,
        })
      );
    }

    return ixs;
  }

  private _getWrapIx(
    wrapInfo: saber.WrapInfo,
    userKey: anchor.web3.PublicKey,
    amount: anchor.BN,
    underlyingTokenAccount: anchor.web3.PublicKey,
    wrappedTokenAccount: anchor.web3.PublicKey
  ): anchor.web3.TransactionInstruction {
    const dataLayout = struct([u64("amount")]);
    let data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        amount: new anchor.BN(amount),
      },
      data
    );
    let datahex = data.toString("hex");
    // TODO: Compute hash from function name instead of hard-coded string
    let datastring = "f223c68952e1f2b6".concat(datahex);
    data = Buffer.from(datastring, "hex");

    const keys = [
      { pubkey: wrapInfo.wrapAuthority, isSigner: false, isWritable: true },
      { pubkey: wrapInfo.wrappedTokenMint, isSigner: false, isWritable: true },
      {
        pubkey: wrapInfo.underlyingTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },

      { pubkey: underlyingTokenAccount, isSigner: false, isWritable: true },
      { pubkey: wrappedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: saber.WRAP_PROGRAM_ID,
      data,
    });
  }

  private _getUnwrapIx(
    wrapInfo: saber.WrapInfo,
    userKey: anchor.web3.PublicKey,
    wrappedTokenAccount: anchor.web3.PublicKey,
    underlyingTokenAccount: anchor.web3.PublicKey
  ) {
    // TODO: Compute hash from function name instead of hard-coded string
    let datastring = "60f6a682e5322b46";
    let data = Buffer.from(datastring, "hex");

    const keys = [
      { pubkey: wrapInfo.wrapAuthority, isSigner: false, isWritable: true },
      { pubkey: wrapInfo.wrappedTokenMint, isSigner: false, isWritable: true },
      {
        pubkey: wrapInfo.underlyingTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: underlyingTokenAccount, isSigner: false, isWritable: true },
      { pubkey: wrappedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: saber.WRAP_PROGRAM_ID,
      data,
    });
  }
}

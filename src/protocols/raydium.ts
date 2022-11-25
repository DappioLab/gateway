import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { struct, u64, u8 } from "@project-serum/borsh";
import { createATAWithoutCheckIx, getActivityIndex, getGatewayAuthority } from "../utils";
import { IFarmInfo, IPoolInfo, raydium, utils } from "@dappio-wonderland/navigator";
import {
  AddLiquidityParams,
  GatewayParams,
  HarvestParams,
  IProtocolFarm,
  IProtocolPool,
  PAYLOAD_SIZE,
  PoolDirection,
  RemoveLiquidityParams,
  StakeParams,
  UnstakeParams,
} from "../types";
import { RAYDIUM_ADAPTER_PROGRAM_ID, SERUM_PROGRAM_ID, WSOL } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";

const WSOL_BUFFER_FACTOR = 1.01; // 1%, actual amount might be different since pool balance might change.

export class ProtocolRaydium implements IProtocolPool, IProtocolFarm {
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
        poolDirection: this._gatewayParams.poolDirection,
      },
      payload
    );

    // Handle transaction here
    const pool = poolInfo as raydium.PoolInfo;
    const poolWrapper = new raydium.PoolInfoWrapper(pool);
    const userTokenAAccountKey = await getAssociatedTokenAddress(pool.tokenAMint, userKey);
    const userTokenBAccountKey = await getAssociatedTokenAddress(pool.tokenBMint, userKey);
    const userLPAccountKey = await getAssociatedTokenAddress(pool.lpMint, userKey);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const createUserTokenAAccountIx = await createATAWithoutCheckIx(userKey, pool.tokenAMint);
    preInstructions.push(createUserTokenAAccountIx);
    const createUserTokenBAccountIx = await createATAWithoutCheckIx(userKey, pool.tokenBMint);
    preInstructions.push(createUserTokenBAccountIx);
    const createUserLpAccountIx = await createATAWithoutCheckIx(userKey, pool.lpMint);
    preInstructions.push(createUserLpAccountIx);

    let amount = BigInt(params.tokenInAmount);

    let isWSOL = false;

    if (pool.tokenAMint.equals(WSOL)) {
      isWSOL = true;
      if (this._gatewayParams.poolDirection == PoolDirection.Obverse) {
        amount = poolWrapper.getTokenAAmount(amount);
      }
    } else if (pool.tokenBMint.equals(WSOL)) {
      isWSOL = true;
      if (this._gatewayParams.poolDirection == PoolDirection.Reverse) {
        amount = poolWrapper.getTokenBAmount(amount);
      }
    }

    if (isWSOL) {
      const userTokenAccountKey = await getAssociatedTokenAddress(WSOL, userKey);
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: userTokenAccountKey,
          lamports: Math.floor(Number(amount) * WSOL_BUFFER_FACTOR),
        }),
        createSyncNativeInstruction(userTokenAccountKey)
      );

      postInstructions.push(createCloseAccountInstruction(userTokenAccountKey, userKey, userKey));
    }

    const remainingAccounts = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pool.poolId, isSigner: false, isWritable: true },
      { pubkey: raydium.AMM_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: pool.ammOpenOrders, isSigner: false, isWritable: false },
      { pubkey: pool.ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: pool.lpMint, isSigner: false, isWritable: true },
      { pubkey: pool.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pool.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pool.serumMarket, isSigner: false, isWritable: false },
      { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true },
      { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true },
      { pubkey: userLPAccountKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: pool.marketEventQueue, isSigner: false, isWritable: false },
    ];

    const txAddLiquidity = await this._gatewayProgram.methods
      .addLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: RAYDIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: pool.version == 4 ? raydium.POOL_PROGRAM_ID_V4 : raydium.POOL_PROGRAM_ID_V5,
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
        poolDirection: this._gatewayParams.poolDirection,
      },
      payload
    );

    // Handle transaction here
    const pool = poolInfo as raydium.PoolInfo;
    const userTokenAAccountKey = await getAssociatedTokenAddress(pool.tokenAMint, userKey);
    const userTokenBAccountKey = await getAssociatedTokenAddress(pool.tokenBMint, userKey);
    const userLPAccountKey = await getAssociatedTokenAddress(pool.lpMint, userKey);
    const userTokenAccountInfos = await utils.getMultipleAccounts(this._connection, [
      userTokenAAccountKey,
      userTokenBAccountKey,
    ]);

    const poolWithMarketInfo = raydium.poolsWithMarketInfo.find((p) => pool.poolId.toString() == p.id);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const setComputeUnitLimitParams = { units: 600000 };
    const setComputeUnitLimitIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit(setComputeUnitLimitParams);
    preInstructions.push(setComputeUnitLimitIx);

    const userTokenAAccountInfo = userTokenAccountInfos[0].account;
    if (!userTokenAAccountInfo) {
      const createUserTokenAAccountIx = createAssociatedTokenAccountInstruction(
        userKey,
        userTokenAAccountKey,
        userKey,
        pool.tokenAMint
      );
      preInstructions.push(createUserTokenAAccountIx);
    }

    const userTokenBAccountInfo = userTokenAccountInfos[1].account;
    if (!userTokenBAccountInfo) {
      const createUserTokenBAccountIx = createAssociatedTokenAccountInstruction(
        userKey,
        userTokenBAccountKey,
        userKey,
        pool.tokenBMint
      );
      preInstructions.push(createUserTokenBAccountIx);
    }

    if (pool.tokenAMint.equals(WSOL) || pool.tokenBMint.equals(WSOL)) {
      const userTokenAccountKey = await getAssociatedTokenAddress(WSOL, userKey);
      postInstructions.push(createCloseAccountInstruction(userTokenAccountKey, userKey, userKey));
    }

    const remainingAccounts = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pool.poolId, isSigner: false, isWritable: true },
      { pubkey: raydium.AMM_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: pool.ammOpenOrders, isSigner: false, isWritable: true },
      { pubkey: pool.ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: pool.lpMint, isSigner: false, isWritable: true },
      { pubkey: pool.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pool.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pool.poolWithdrawQueue, isSigner: false, isWritable: true },
      {
        pubkey: pool.poolTempLpTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SERUM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pool.serumMarket, isSigner: false, isWritable: true },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketBaseVault),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketQuoteVault),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketAuthority),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: userLPAccountKey, isSigner: false, isWritable: true },
      { pubkey: userTokenAAccountKey, isSigner: false, isWritable: true },
      { pubkey: userTokenBAccountKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketEventQueue),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketBids),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(poolWithMarketInfo.marketAsks),
        isSigner: false,
        isWritable: true,
      },
    ];

    const txRemoveLiquidity = await this._gatewayProgram.methods
      .removeLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: RAYDIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: pool.version == 4 ? raydium.POOL_PROGRAM_ID_V4 : raydium.POOL_PROGRAM_ID_V5,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txRemoveLiquidity], input: payload };
  }

  async stake(
    params: StakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("lpAmount"), u8("version")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        lpAmount: new anchor.BN(params.lpAmount),
        version: params.version || 1,
      },
      payload
    );

    // Handle transaction here
    const farm = farmInfo as raydium.FarmInfo;
    const farmAuthority = await this._getFarmAuthority(farm);
    const farmWithMints = raydium.farmsWithMints.find((f) => farm.farmId.toString() == f.id);

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const ledgerKey = await raydium.infos.getFarmerId(farm, userKey, farm.version);
    const ledgerAccountInfo = await this._connection.getAccountInfo(ledgerKey);
    if (!ledgerAccountInfo) {
      preInstructions.push(this._getCreateLedgerInstruction({ farm, userKey, ledgerKey }));
    }

    const userLpTokenAccount = await getAssociatedTokenAddress(
      new anchor.web3.PublicKey(farmWithMints.lpMint),
      userKey
    );

    const remainingAccounts = [
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmAuthority, isSigner: false, isWritable: false },
      { pubkey: ledgerKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: false, isWritable: false },
      { pubkey: userLpTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: farm.poolLpTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: await getAssociatedTokenAddress(new anchor.web3.PublicKey(farmWithMints.rewardMints[0]), userKey),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[0]),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    if (farm.version == 5) {
      remainingAccounts.push({
        pubkey: await getAssociatedTokenAddress(new anchor.web3.PublicKey(farmWithMints.rewardMints[1]), userKey),
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[1]),
        isSigner: false,
        isWritable: true,
      });
    }

    const txStake = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: RAYDIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: farm.version == 3 ? raydium.FARM_PROGRAM_ID_V3 : raydium.FARM_PROGRAM_ID_V5,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txStake], input: payload };
  }

  async unstake(
    params: UnstakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("shareAmount"), u8("version")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.shareAmount),
        version: params.version || 1,
      },
      payload
    );

    // Handle transaction here
    const farm = farmInfo as raydium.FarmInfo;

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const farmAuthority = await this._getFarmAuthority(farm);
    const farmWithMints = raydium.farmsWithMints.find((f) => farm.farmId.toString() == f.id);
    const ledgerKey = await raydium.infos.getFarmerId(farm, userKey, farm.version);
    const userLpTokenAccount = await getAssociatedTokenAddress(
      new anchor.web3.PublicKey(farmWithMints.lpMint),
      userKey
    );

    const createUserLpTokenAccountIx = await createATAWithoutCheckIx(
      userKey,
      new anchor.web3.PublicKey(farmWithMints.lpMint)
    );
    preInstructions.push(createUserLpTokenAccountIx);

    const remainingAccounts = [
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmAuthority, isSigner: false, isWritable: false },
      { pubkey: ledgerKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: false, isWritable: false },
      { pubkey: userLpTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: farm.poolLpTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: await getAssociatedTokenAddress(new anchor.web3.PublicKey(farmWithMints.rewardMints[0]), userKey),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[0]),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    if (farm.version == 5) {
      remainingAccounts.push({
        pubkey: await getAssociatedTokenAddress(new anchor.web3.PublicKey(farmWithMints.rewardMints[1]), userKey),
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[1]),
        isSigner: false,
        isWritable: true,
      });
    }

    const txUnstake = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: RAYDIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: farm.version == 3 ? raydium.FARM_PROGRAM_ID_V3 : raydium.FARM_PROGRAM_ID_V5,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txUnstake], input: payload };
  }

  async harvest(
    params: HarvestParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u8("version")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        version: params.version || 1,
      },
      payload
    );

    // Handle transaction here
    const farm = farmInfo as raydium.FarmInfo;

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const farmAuthority = await this._getFarmAuthority(farm);
    const farmWithMints = raydium.farmsWithMints.find((f) => farm.farmId.toString() == f.id);
    const ledgerKey = await raydium.infos.getFarmerId(farm, userKey, farm.version);
    const userLpTokenAccount = await getAssociatedTokenAddress(
      new anchor.web3.PublicKey(farmWithMints.lpMint),
      userKey
    );
    const createUserLpTokenAccountIx = await createATAWithoutCheckIx(
      userKey,
      new anchor.web3.PublicKey(farmWithMints.lpMint)
    );
    preInstructions.push(createUserLpTokenAccountIx);

    const userRewardTokenAccount = await getAssociatedTokenAddress(
      new anchor.web3.PublicKey(farmWithMints.rewardMints[0]),
      userKey
    );

    const createUserRewardTokenAccountIx = await createATAWithoutCheckIx(
      userKey,
      new anchor.web3.PublicKey(farmWithMints.rewardMints[0])
    );
    preInstructions.push(createUserRewardTokenAccountIx);

    const remainingAccounts = [
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmAuthority, isSigner: false, isWritable: false },
      { pubkey: ledgerKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: false, isWritable: false },
      { pubkey: userLpTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: farm.poolLpTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userRewardTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[0]),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    if (farm.version == 5) {
      remainingAccounts.push({
        pubkey: await getAssociatedTokenAddress(new anchor.web3.PublicKey(farmWithMints.rewardMints[1]), userKey),
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: new anchor.web3.PublicKey(farmWithMints.rewardVaults[1]),
        isSigner: false,
        isWritable: true,
      });

      const createUserRewardTokenBAccountIx = await createATAWithoutCheckIx(
        userKey,
        new anchor.web3.PublicKey(farmWithMints.rewardMints[1])
      );
      preInstructions.push(createUserRewardTokenBAccountIx);
    }

    const txHarvest = await this._gatewayProgram.methods
      .harvest()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: RAYDIUM_ADAPTER_PROGRAM_ID,
        baseProgramId: farm.version == 3 ? raydium.FARM_PROGRAM_ID_V3 : raydium.FARM_PROGRAM_ID_V5,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txHarvest], input: payload };
  }

  private async _getFarmAuthority(farm: raydium.FarmInfo): Promise<anchor.web3.PublicKey> {
    const [key, _] =
      farm.version > 3
        ? await anchor.web3.PublicKey.findProgramAddress([farm.farmId.toBuffer()], raydium.FARM_PROGRAM_ID_V5)
        : await anchor.web3.PublicKey.findProgramAddress([farm.farmId.toBuffer()], raydium.FARM_PROGRAM_ID_V3);
    return key;
  }

  private _getCreateLedgerInstruction({
    farm,
    userKey,
    ledgerKey,
  }: {
    farm: raydium.FarmInfo;
    userKey: anchor.web3.PublicKey;
    ledgerKey: anchor.web3.PublicKey;
  }) {
    // Check version
    if (farm.version !== 3 && farm.version !== 5) {
      throw new Error(`invalid farm version: version = ${farm.version}`);
    }

    const instruction = farm.version === 3 ? 9 : 10;
    const programId = farm.version === 3 ? raydium.FARM_PROGRAM_ID_V3 : raydium.FARM_PROGRAM_ID_V5;

    const LAYOUT = struct([u8("instruction")]);
    const data = Buffer.alloc(LAYOUT.span);

    LAYOUT.encode(
      {
        instruction,
      },
      data
    );

    const keys = [
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: ledgerKey, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new anchor.web3.TransactionInstruction({
      programId,
      keys,
      data,
    });
  }
}

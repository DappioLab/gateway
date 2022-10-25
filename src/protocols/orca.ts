import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  NATIVE_MINT,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { getActivityIndex, getGatewayAuthority } from "../utils";
import {
  IFarmInfo,
  IPoolInfo,
  orca,
  utils,
} from "@dappio-wonderland/navigator";
import {
  ActionType,
  AddLiquidityParams,
  GatewayParams,
  HarvestParams,
  IProtocolFarm,
  IProtocolPool,
  PoolDirection,
  RemoveLiquidityParams,
  StakeParams,
  UnstakeParams,
} from "../types";
import { ORCA_ADAPTER_PROGRAM_ID } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";

export class ProtocolOrca implements IProtocolPool, IProtocolFarm {
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
    // Handle input payload here
    // TODO

    // Handle transaction here
    const pool = poolInfo as orca.PoolInfo;
    const poolInfoWrapper = (await orca.infos.getPoolWrapper(
      this._connection,
      poolInfo.poolId
    )) as orca.PoolInfoWrapper;

    let authority = await poolInfoWrapper.getAuthority();
    let aTokenATA = await getAssociatedTokenAddress(
      poolInfo.tokenAMint,
      userKey
    );
    let bTokenATA = await getAssociatedTokenAddress(
      poolInfo.tokenBMint,
      userKey
    );
    let lpTokenATA = await getAssociatedTokenAddress(poolInfo.lpMint, userKey);
    let swapATA: anchor.web3.PublicKey;
    if (this._gatewayParams.poolDirection == PoolDirection.Obverse) {
      swapATA = bTokenATA;
    } else {
      swapATA = aTokenATA;
    }
    let remainingAccounts = [
      { pubkey: poolInfo.poolId, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: swapATA, isSigner: false, isWritable: true },
      { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
      { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
      { pubkey: pool.lpMint, isSigner: false, isWritable: true },
      { pubkey: lpTokenATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    let closeAccount: anchor.web3.TransactionInstruction[] = [];

    let createATAs = [
      await utils.createATAWithoutCheckIx(userKey, poolInfo.tokenAMint),
      await utils.createATAWithoutCheckIx(userKey, poolInfo.tokenBMint),
      await utils.createATAWithoutCheckIx(userKey, poolInfo.lpMint),
    ];
    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.AddLiquidity
    );
    if (pool.tokenAMint.equals(NATIVE_MINT)) {
      createATAs.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: aTokenATA,
          lamports: new anchor.BN(
            this._gatewayParams.payloadQueue[indexSupply]
          ).toNumber(),
        })
      );
      createATAs.push(createSyncNativeInstruction(aTokenATA));
      closeAccount.push(
        createCloseAccountInstruction(aTokenATA, userKey, userKey)
      );
    }
    if (pool.tokenBMint.equals(NATIVE_MINT)) {
      createATAs.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: bTokenATA,
          lamports: new anchor.BN(
            this._gatewayParams.payloadQueue[indexSupply]
          ).toNumber(),
        })
      );
      createATAs.push(createSyncNativeInstruction(bTokenATA));
      closeAccount.push(
        createCloseAccountInstruction(bTokenATA, userKey, userKey)
      );
    }

    const txAddLiquidity = await this._gatewayProgram.methods
      .addLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: ORCA_ADAPTER_PROGRAM_ID,
        baseProgramId: orca.ORCA_POOL_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(createATAs)
      .postInstructions(closeAccount)
      .remainingAccounts(remainingAccounts)
      .transaction();

    // TODO: Replace dummy input payload
    return { txs: [txAddLiquidity], input: Buffer.alloc(0) };
  }

  async removeLiquidity(
    params: RemoveLiquidityParams,
    poolInfo: IPoolInfo,
    userKey: anchor.web3.PublicKey,
    singleToTokenMint?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    // TODO

    // Handle transaction here
    const pool = poolInfo as orca.PoolInfo;
    const poolInfoWrapper = (await orca.infos.getPoolWrapper(
      this._connection,
      poolInfo.poolId
    )) as orca.PoolInfoWrapper;
    let authority = await poolInfoWrapper.getAuthority();
    let aTokenATA = await getAssociatedTokenAddress(
      poolInfo.tokenAMint,
      userKey
    );
    let bTokenATA = await getAssociatedTokenAddress(
      poolInfo.tokenBMint,
      userKey
    );
    let lpTokenATA = await getAssociatedTokenAddress(poolInfo.lpMint, userKey);
    let remainingAccounts = [];
    let closeAccount: anchor.web3.TransactionInstruction[] = [];
    if (singleToTokenMint) {
      let destAccount = pool.tokenAMint.equals(singleToTokenMint)
        ? aTokenATA
        : bTokenATA;
      remainingAccounts = [
        { pubkey: poolInfo.poolId, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: userKey, isSigner: true, isWritable: false },
        { pubkey: pool.lpMint, isSigner: false, isWritable: true },
        { pubkey: lpTokenATA, isSigner: false, isWritable: true },
        { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
        { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
        { pubkey: destAccount, isSigner: false, isWritable: true },
        { pubkey: pool.feeAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
      console.log(destAccount.toString());
    } else {
      remainingAccounts = [
        { pubkey: poolInfo.poolId, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: userKey, isSigner: true, isWritable: false },
        { pubkey: pool.lpMint, isSigner: false, isWritable: true },
        { pubkey: lpTokenATA, isSigner: false, isWritable: true },
        { pubkey: pool.tokenAccountA, isSigner: false, isWritable: true },
        { pubkey: pool.tokenAccountB, isSigner: false, isWritable: true },
        { pubkey: aTokenATA, isSigner: false, isWritable: true },
        { pubkey: bTokenATA, isSigner: false, isWritable: true },
        { pubkey: pool.feeAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
    }
    let createATAs = [
      await utils.createATAWithoutCheckIx(userKey, poolInfo.tokenAMint),
      await utils.createATAWithoutCheckIx(userKey, poolInfo.tokenBMint),
      await utils.createATAWithoutCheckIx(userKey, poolInfo.lpMint),
    ];
    if (pool.tokenAMint.equals(NATIVE_MINT)) {
      closeAccount.push(
        createCloseAccountInstruction(aTokenATA, userKey, userKey)
      );
    }
    if (pool.tokenBMint.equals(NATIVE_MINT)) {
      closeAccount.push(
        createCloseAccountInstruction(bTokenATA, userKey, userKey)
      );
    }

    const txRemoveLiquidity = await this._gatewayProgram.methods
      .removeLiquidity()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: ORCA_ADAPTER_PROGRAM_ID,
        baseProgramId: orca.ORCA_POOL_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(createATAs)
      .postInstructions(closeAccount)
      .remainingAccounts(remainingAccounts)
      .transaction();

    // TODO: Replace dummy input payload
    return { txs: [txRemoveLiquidity], input: Buffer.alloc(0) };
  }

  async stake(
    params: StakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    // TODO

    // Handle transaction here
    const farm = farmInfo as orca.FarmInfo;
    const farmInfoWrapper = (await orca.infos.getFarmWrapper(
      this._connection,
      farmInfo.farmId
    )) as orca.FarmInfoWrapper;
    let rewardTokenVault = await getAccount(
      this._connection,
      farm.rewardTokenVault
    );
    let baseATA = await getAssociatedTokenAddress(farm.baseTokenMint, userKey);
    let farmTokenATA = await getAssociatedTokenAddress(
      farm.farmTokenMint,
      userKey
    );
    let rewardATA = await getAssociatedTokenAddress(
      rewardTokenVault.mint,
      userKey
    );
    let farmerId = await orca.infos.getFarmerId(farm, userKey);
    let createATAs = [
      await utils.createATAWithoutCheckIx(userKey, farm.farmTokenMint),
      await utils.createATAWithoutCheckIx(userKey, farm.baseTokenMint),
      await utils.createATAWithoutCheckIx(userKey, rewardTokenVault.mint),
    ];

    if (!(await orca.checkFarmerCreated(this._connection, farm, userKey))) {
      createATAs.push(await this.initFarmerIx(farm, userKey));
    }
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: baseATA, isSigner: false, isWritable: true },
      { pubkey: farm.baseTokenVault, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: farm.farmTokenMint, isSigner: false, isWritable: true },
      { pubkey: farmTokenATA, isSigner: false, isWritable: true },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmerId, isSigner: false, isWritable: true },
      { pubkey: farm.rewardTokenVault, isSigner: false, isWritable: true },
      { pubkey: rewardATA, isSigner: false, isWritable: true },
      {
        pubkey: await farmInfoWrapper.getAuthority(),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txStake = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: ORCA_ADAPTER_PROGRAM_ID,
        baseProgramId: orca.ORCA_FARM_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .remainingAccounts(remainingAccounts)
      .preInstructions(createATAs)
      .transaction();

    // TODO: Replace dummy input payload
    return { txs: [txStake], input: Buffer.alloc(0) };
  }

  async unstake(
    params: UnstakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    const farm = farmInfo as orca.FarmInfo;
    const farmInfoWrapper = (await orca.infos.getFarmWrapper(
      this._connection,
      farmInfo.farmId
    )) as orca.FarmInfoWrapper;
    let rewardTokenVault = await getAccount(
      this._connection,
      farm.rewardTokenVault
    );
    let baseATA = await getAssociatedTokenAddress(farm.baseTokenMint, userKey);
    let farmTokenATA = await getAssociatedTokenAddress(
      farm.farmTokenMint,
      userKey
    );
    let rewardATA = await getAssociatedTokenAddress(
      rewardTokenVault.mint,
      userKey
    );
    let farmerId = await orca.infos.getFarmerId(farm, userKey);
    let createATAs = [
      await utils.createATAWithoutCheckIx(userKey, farm.farmTokenMint),
      await utils.createATAWithoutCheckIx(userKey, farm.baseTokenMint),
      await utils.createATAWithoutCheckIx(userKey, rewardTokenVault.mint),
    ];
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: baseATA, isSigner: false, isWritable: true },
      { pubkey: farm.baseTokenVault, isSigner: false, isWritable: true },
      { pubkey: farm.farmTokenMint, isSigner: false, isWritable: true },
      { pubkey: farmTokenATA, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmerId, isSigner: false, isWritable: true },
      { pubkey: farm.rewardTokenVault, isSigner: false, isWritable: true },
      { pubkey: rewardATA, isSigner: false, isWritable: true },
      {
        pubkey: await farmInfoWrapper.getAuthority(),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txUnstake = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: ORCA_ADAPTER_PROGRAM_ID,
        baseProgramId: orca.ORCA_FARM_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .remainingAccounts(remainingAccounts)
      .preInstructions(createATAs)
      .transaction();

    // TODO: Replace dummy input payload
    return { txs: [txUnstake], input: Buffer.alloc(0) };
  }

  async harvest(
    params: HarvestParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    // TODO

    // Handle transaction here
    const farm = farmInfo as orca.FarmInfo;
    const farmInfoWrapper = (await orca.infos.getFarmWrapper(
      this._connection,
      farmInfo.farmId
    )) as orca.FarmInfoWrapper;
    let rewardTokenVault = await getAccount(
      this._connection,
      farm.rewardTokenVault
    );
    let baseATA = await getAssociatedTokenAddress(farm.baseTokenMint, userKey);
    let farmTokenATA = await getAssociatedTokenAddress(
      farm.farmTokenMint,
      userKey
    );
    let rewardATA = await getAssociatedTokenAddress(
      rewardTokenVault.mint,
      userKey
    );
    let farmerId = await orca.infos.getFarmerId(farm, userKey);
    let createATAs = [
      await utils.createATAWithoutCheckIx(userKey, farm.farmTokenMint),
      await utils.createATAWithoutCheckIx(userKey, farm.baseTokenMint),
      await utils.createATAWithoutCheckIx(userKey, rewardTokenVault.mint),
    ];
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      { pubkey: farmerId, isSigner: false, isWritable: true },
      { pubkey: farm.baseTokenVault, isSigner: false, isWritable: false },
      { pubkey: farm.rewardTokenVault, isSigner: false, isWritable: true },
      { pubkey: rewardATA, isSigner: false, isWritable: true },
      {
        pubkey: await farmInfoWrapper.getAuthority(),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txHarvest = await this._gatewayProgram.methods
      .harvest()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: ORCA_ADAPTER_PROGRAM_ID,
        baseProgramId: orca.ORCA_FARM_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .remainingAccounts(remainingAccounts)
      .preInstructions(createATAs)
      .transaction();

    // TODO: Replace dummy input payload
    return { txs: [txHarvest], input: Buffer.alloc(0) };
  }

  private async initFarmerIx(
    farmInfo: orca.FarmInfo,
    wallet: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction> {
    let farmerId = await orca.infos.getFarmerId(farmInfo, wallet);
    let accounts = [
      { pubkey: farmInfo.farmId, isSigner: false, isWritable: false },
      { pubkey: farmerId, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];
    let data = Buffer.from("01", "hex");
    return new anchor.web3.TransactionInstruction({
      programId: orca.ORCA_FARM_PROGRAM_ID,
      data: data,
      keys: accounts,
    });
  }
}

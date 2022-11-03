import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token-v2";
import { struct, u64, u8 } from "@project-serum/borsh";
import {
  createATAWithoutCheckIx,
  getActivityIndex,
  getGatewayAuthority,
} from "../utils";
import { IFarmInfo, genopets } from "@dappio-wonderland/navigator";
import {
  GatewayParams,
  HarvestParams,
  HarvestType,
  IProtocolFarm,
  PAYLOAD_SIZE,
  StakeParams,
  UnstakeParams,
} from "../types";
import { GENOPETS_ADAPTER_PROGRAM_ID } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";

export class ProtocolGenopets implements IProtocolFarm {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async stake(
    params: StakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("stakeAmount"), u8("lockDuration")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        stakeAmount: new anchor.BN(params.lpAmount),
        lockDuration: params.lockDuration ? params.lockDuration : 0,
      },
      payload
    );

    this._gatewayParams.lockDuration = params.lockDuration
      ? params.lockDuration
      : 0;

    // Handle transaction here
    const farm = farmInfo as genopets.FarmInfo;
    const farmWrapper = new genopets.FarmInfoWrapper(farm);
    const farmerId = await genopets.infos.getFarmerId(farm, userKey);
    const farmerAccount = await this._connection.getAccountInfo(farmerId);
    let userDeposit = genopets.getFarmerDepositKey(userKey, 0);
    let userReDeposit = genopets.getFarmerDepositKey(userKey, 1);
    if (farmerAccount) {
      const farmer = (await genopets.infos.getFarmer(
        this._connection,
        farmerId
      )) as genopets.FarmerInfo;
      const farmerWrapper = new genopets.FarmerInfoWrapper(farmer);
      userDeposit = farmerWrapper.getUserDeposit();
      userReDeposit = farmerWrapper.getUserReDeposit();
    }

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const userPoolTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      userKey
    );
    preInstructions.push(await createATAWithoutCheckIx(userKey, params.mint));

    const userSgeneTokenAccount = await getAssociatedTokenAddress(
      farm.mintSgene,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.mintSgene)
    );

    const vaultATA = await getAssociatedTokenAddress(
      params.mint,
      farmerId,
      true
    );
    preInstructions.push(
      await createATAWithoutCheckIx(farmerId, params.mint, userKey)
    );

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 1
      {
        pubkey: farmWrapper.getStakingPool(params.mint),
        isSigner: false,
        isWritable: true,
      }, // 2
      { pubkey: params.mint, isSigner: false, isWritable: true }, // 3
      { pubkey: farmerId, isSigner: false, isWritable: true }, // 4
      {
        pubkey: userPoolTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 5
      {
        pubkey: userSgeneTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 6
      {
        pubkey: vaultATA,
        isSigner: false,
        isWritable: true,
      }, // 7
      {
        pubkey: farm.sgeneMinter,
        isSigner: false,
        isWritable: false,
      }, // 8
      {
        pubkey: farm.mintSgene,
        isSigner: false,
        isWritable: true,
      }, // 9
      {
        pubkey: userDeposit,
        isSigner: false,
        isWritable: true,
      }, // 10
      {
        pubkey: userReDeposit,
        isSigner: false,
        isWritable: true,
      }, // 11
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, // 12
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 13
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, // 14
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, // 15
    ];

    const txStake = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: GENOPETS_ADAPTER_PROGRAM_ID,
        baseProgramId: genopets.GENOPETS_FARM_PROGRAM_ID,
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
    const inputLayout = struct([u64("dummy1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        dummy1: new anchor.BN(69),
      },
      payload
    );

    // Handle transaction here
    const farm = farmInfo as genopets.FarmInfo;
    const farmWrapper = new genopets.FarmInfoWrapper(farm);
    const farmerId = await genopets.infos.getFarmerId(farm, userKey);
    const farmerAccount = await this._connection.getAccountInfo(farmerId);
    let userDeposit = genopets.getFarmerDepositKey(userKey, 0);
    let userReDeposit = genopets.getFarmerDepositKey(userKey, 1);
    if (farmerAccount) {
      const farmer = (await genopets.infos.getFarmer(
        this._connection,
        farmerId
      )) as genopets.FarmerInfo;
      const farmerWrapper = new genopets.FarmerInfoWrapper(farmer);
      userDeposit = params.farmerKey || farmerWrapper.getUserDeposit();
      userReDeposit = farmerWrapper.getUserDeposit();
    }

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const userPoolTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      userKey
    );
    preInstructions.push(await createATAWithoutCheckIx(userKey, params.mint));

    const userSgeneTokenAccount = await getAssociatedTokenAddress(
      farm.mintSgene,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.mintSgene)
    );

    const vaultATA = await getAssociatedTokenAddress(
      params.mint,
      farmerId,
      true
    );

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 1
      {
        pubkey: farmWrapper.getStakingPool(params.mint),
        isSigner: false,
        isWritable: true,
      }, // 2
      { pubkey: params.mint, isSigner: false, isWritable: false }, // 3
      { pubkey: farmerId, isSigner: false, isWritable: true }, // 4
      {
        pubkey: userPoolTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 5
      {
        pubkey: vaultATA,
        isSigner: false,
        isWritable: true,
      }, // 6
      {
        pubkey: farm.sgeneMinter,
        isSigner: false,
        isWritable: false,
      }, // 7
      {
        pubkey: userSgeneTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 8
      {
        pubkey: farm.mintSgene,
        isSigner: false,
        isWritable: true,
      }, // 9
      {
        pubkey: farm.geneRewarder,
        isSigner: false,
        isWritable: false,
      }, // 10
      {
        pubkey: farm.ataGeneRewarder,
        isSigner: false,
        isWritable: true,
      }, // 11
      {
        pubkey: userReDeposit,
        isSigner: false,
        isWritable: true,
      }, // 12
      {
        pubkey: userDeposit,
        isSigner: false,
        isWritable: true,
      }, // 13
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, // 14
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, // 15
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, // 16
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, // 17
    ];

    const txUnstake = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: GENOPETS_ADAPTER_PROGRAM_ID,
        baseProgramId: genopets.GENOPETS_FARM_PROGRAM_ID,
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
    const inputLayout = struct([u8("harvestType")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        harvestType: params.type,
      },
      payload
    );

    this._gatewayParams.harvestType = params.type;

    // Handle transaction here
    const farm = farmInfo as genopets.FarmInfo;
    const farmWrapper = new genopets.FarmInfoWrapper(farm);
    const farmerId = await genopets.infos.getFarmerId(farm, userKey);
    const farmerAccount = await this._connection.getAccountInfo(farmerId);
    let userDeposit = genopets.getFarmerDepositKey(userKey, 0);
    let userReDeposit = genopets.getFarmerDepositKey(userKey, 1);

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const userSgeneTokenAccount = await getAssociatedTokenAddress(
      farm.mintSgene,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, farm.mintSgene)
    );

    let remainingAccounts: anchor.web3.AccountMeta[] = [];
    switch (params.type) {
      case HarvestType.initialize:
        if (farmerAccount) {
          const farmer = (await genopets.infos.getFarmer(
            this._connection,
            farmerId
          )) as genopets.FarmerInfo;
          const farmerWrapper = new genopets.FarmerInfoWrapper(farmer);
          userDeposit = farmerWrapper.getUserDeposit();
          userReDeposit = farmerWrapper.getUserReDeposit();
        }

        remainingAccounts = [
          { pubkey: userKey, isSigner: true, isWritable: true }, // 0
          { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 1
          { pubkey: farmerId, isSigner: false, isWritable: true }, // 2
          {
            pubkey: farm.sgeneMinter,
            isSigner: false,
            isWritable: false,
          }, // 3
          {
            pubkey: farm.mintSgene,
            isSigner: false,
            isWritable: true,
          }, // 4
          {
            pubkey: userSgeneTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 5
          {
            pubkey: userDeposit,
            isSigner: false,
            isWritable: true,
          }, // 6
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 7
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 8
          {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          }, // 9
          {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
          }, // 10
        ];
        break;
      case HarvestType.completeAsGene:
        if (farmerAccount) {
          const farmer = (await genopets.infos.getFarmer(
            this._connection,
            farmerId
          )) as genopets.FarmerInfo;
          const farmerWrapper = new genopets.FarmerInfoWrapper(farmer);
          userDeposit = params.farmerKey || farmerWrapper.getUserDeposit();
          userReDeposit = farmerWrapper.getUserDeposit();
        }

        const userPoolTokenAccount = await getAssociatedTokenAddress(
          params.mint,
          userKey
        );
        preInstructions.push(
          await createATAWithoutCheckIx(userKey, params.mint)
        );

        const vaultATA = await getAssociatedTokenAddress(
          params.mint,
          farmerId,
          true
        );
        remainingAccounts = [
          { pubkey: userKey, isSigner: true, isWritable: true }, // 0
          { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 1
          {
            pubkey: farmWrapper.getStakingPool(params.mint),
            isSigner: false,
            isWritable: true,
          }, // 2
          { pubkey: params.mint, isSigner: false, isWritable: false }, // 3
          { pubkey: farmerId, isSigner: false, isWritable: true }, // 4
          {
            pubkey: userPoolTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 5
          {
            pubkey: vaultATA,
            isSigner: false,
            isWritable: true,
          }, // 6
          {
            pubkey: farm.sgeneMinter,
            isSigner: false,
            isWritable: false,
          }, // 7
          {
            pubkey: userSgeneTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 8
          {
            pubkey: farm.mintSgene,
            isSigner: false,
            isWritable: true,
          }, // 9
          {
            pubkey: farm.geneRewarder,
            isSigner: false,
            isWritable: false,
          }, // 10
          {
            pubkey: farm.ataGeneRewarder,
            isSigner: false,
            isWritable: true,
          }, // 11
          {
            pubkey: userReDeposit,
            isSigner: false,
            isWritable: true,
          }, // 12
          {
            pubkey: userDeposit,
            isSigner: false,
            isWritable: true,
          }, // 13
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 14
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 15
          {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          }, // 16
          {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
          }, // 17
        ];
        break;
      case HarvestType.completeAsSGene:
        if (farmerAccount) {
          const farmer = (await genopets.infos.getFarmer(
            this._connection,
            farmerId
          )) as genopets.FarmerInfo;
          const farmerWrapper = new genopets.FarmerInfoWrapper(farmer);
          userDeposit = params.farmerKey || farmerWrapper.getUserDeposit();
          userReDeposit = farmerWrapper.getUserReDeposit();
        }

        remainingAccounts = [
          { pubkey: userKey, isSigner: true, isWritable: true }, // 0
          { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 1
          { pubkey: farmerId, isSigner: false, isWritable: true }, // 2
          {
            pubkey: farm.sgeneMinter,
            isSigner: false,
            isWritable: false,
          }, // 3
          {
            pubkey: userSgeneTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 4
          {
            pubkey: farm.mintSgene,
            isSigner: false,
            isWritable: true,
          }, // 5
          {
            pubkey: userDeposit,
            isSigner: false,
            isWritable: true,
          }, // 6
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 7
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 8
          {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          }, // 9
          {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
          }, // 10
        ];
        break;

      default:
        console.error("Error: Unsupported harvest type");
        break;
    }

    const txHarvest = await this._gatewayProgram.methods
      .harvest()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: GENOPETS_ADAPTER_PROGRAM_ID,
        baseProgramId: genopets.GENOPETS_FARM_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txHarvest], input: payload };
  }
}

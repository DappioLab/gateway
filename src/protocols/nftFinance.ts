import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  getActivityIndex,
  sigHash,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { INFTFarmInfo, INFTPoolInfo } from "@dappio-wonderland/navigator";
import { GatewayParams, IProtocolNFTFarm, IProtocolNFTPool } from "../types";
import { NFT_FINANCE_ADAPTER_PROGRAM_ID } from "../ids";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { nftFinance, utils } from "@dappio-wonderland/navigator";

const NFT_VAULT_SEED = "nft_vault";
const MINER_SEED = "miner";
const ATA_TX_PER_BATCH = 4;

export class ProtocolNftFinance implements IProtocolNFTPool, IProtocolNFTFarm {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async lockNFT(
    poolInfo: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    userNftAccounts: anchor.web3.PublicKey[]
  ): Promise<anchor.web3.Transaction[]> {
    const pool = poolInfo as nftFinance.NFTPoolInfo;
    const userNftAccountsInfo = await utils.getMultipleAccounts(
      this._connection,
      userNftAccounts
    );

    const preInstructions: anchor.web3.TransactionInstruction[] = [];
    const createAtaIxArr: anchor.web3.TransactionInstruction[] = [];
    let txAllCreateAta: anchor.web3.Transaction[] = [];
    const txAllLockNFT: anchor.web3.Transaction[] = [];

    const setComputeUnitLimitParams = { units: 600000 };
    const setComputeUnitLimitIx =
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit(
        setComputeUnitLimitParams
      );
    preInstructions.push(setComputeUnitLimitIx);

    // create user prove token ATA
    const userProveTokenAccount = await getAssociatedTokenAddress(
      pool.proveTokenMint,
      userKey
    );
    const createProveTokenAtaIx = await createATAWithoutCheckIx(
      userKey,
      pool.proveTokenMint
    );
    createAtaIxArr.push(createProveTokenAtaIx);

    for (let userNftAccountInfo of userNftAccountsInfo) {
      const userNftAccount = userNftAccountInfo.pubkey;
      const nftMint = AccountLayout.decode(
        userNftAccountInfo.account.data
      ).mint;

      const nftVaultAccount = (
        await anchor.web3.PublicKey.findProgramAddress(
          [
            nftMint.toBuffer(),
            pool.poolId.toBuffer(),
            Buffer.from(NFT_VAULT_SEED),
          ],
          nftFinance.NFT_STAKING_PROGRAM_ID
        )
      )[0];

      // create nft vault ATA
      let nftVaultAta = await getAssociatedTokenAddress(
        nftMint,
        nftVaultAccount,
        true
      );
      const createAtaIx = await createATAWithoutCheckIx(
        nftVaultAccount,
        nftMint,
        userKey
      );
      createAtaIxArr.push(createAtaIx);

      const remainingAccounts = [
        { pubkey: userKey, isSigner: true, isWritable: true }, // 0
        { pubkey: pool.poolId, isSigner: false, isWritable: true }, // 1
        { pubkey: pool.proveTokenMint, isSigner: false, isWritable: false }, // 2
        { pubkey: nftMint, isSigner: false, isWritable: false }, // 3
        { pubkey: pool.rarityId, isSigner: false, isWritable: false }, // 4
        { pubkey: userNftAccount, isSigner: false, isWritable: true }, // 5
        { pubkey: nftVaultAta, isSigner: false, isWritable: true }, // 6
        { pubkey: userProveTokenAccount, isSigner: false, isWritable: true }, // 7
        { pubkey: pool.proveTokenAuthority, isSigner: false, isWritable: true }, // 8
        { pubkey: pool.proveTokenTreasury, isSigner: false, isWritable: true }, // 9
        { pubkey: nftVaultAccount, isSigner: false, isWritable: true }, // 10
        {
          pubkey: anchor.web3.SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        }, // 11
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 12
      ];

      const txLockNFT = await this._gatewayProgram.methods
        .lockNft()
        .accounts({
          gatewayState: this._gatewayStateKey,
          adapterProgramId: NFT_FINANCE_ADAPTER_PROGRAM_ID,
          baseProgramId: nftFinance.NFT_STAKING_PROGRAM_ID,
          activityIndex: await getActivityIndex(userKey),
          gatewayAuthority: getGatewayAuthority(),
        })
        .preInstructions(preInstructions)
        .remainingAccounts(remainingAccounts)
        .transaction();

      txAllLockNFT.push(txLockNFT);
    }

    txAllCreateAta = this.packInstructionsToTransaction(createAtaIxArr);

    return [...txAllCreateAta, ...txAllLockNFT];
  }

  async unlockNFT(
    poolInfo: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    nftMints: anchor.web3.PublicKey[]
  ): Promise<anchor.web3.Transaction[]> {
    const pool = poolInfo as nftFinance.NFTPoolInfo;

    const txAllUnlockNFT: anchor.web3.Transaction[] = [];

    for (let nftMint of nftMints) {
      const preInstructions: anchor.web3.TransactionInstruction[] = [];
      const createAtaIx = await createATAWithoutCheckIx(userKey, nftMint);
      preInstructions.push(createAtaIx);

      // create user prove token ATA
      const userProveTokenAccount = await getAssociatedTokenAddress(
        pool.proveTokenMint,
        userKey
      );

      const nftVaultAccount = (
        await anchor.web3.PublicKey.findProgramAddress(
          [
            nftMint.toBuffer(),
            pool.poolId.toBuffer(),
            Buffer.from(NFT_VAULT_SEED),
          ],
          nftFinance.NFT_STAKING_PROGRAM_ID
        )
      )[0];

      let userNftAccount = await getAssociatedTokenAddress(nftMint, userKey);

      // create nft vault ATA
      let nftVaultAta = await getAssociatedTokenAddress(
        nftMint,
        nftVaultAccount,
        true
      );

      const remainingAccounts = [
        { pubkey: userKey, isSigner: true, isWritable: true }, // 0
        { pubkey: pool.poolId, isSigner: false, isWritable: true }, // 1
        { pubkey: pool.proveTokenMint, isSigner: false, isWritable: false }, // 2
        { pubkey: nftMint, isSigner: false, isWritable: false }, // 3
        { pubkey: pool.rarityId, isSigner: false, isWritable: true }, // 4
        { pubkey: userNftAccount, isSigner: false, isWritable: true }, // 5
        { pubkey: nftVaultAta, isSigner: false, isWritable: true }, // 6
        { pubkey: userProveTokenAccount, isSigner: false, isWritable: true }, // 7
        { pubkey: pool.proveTokenAuthority, isSigner: false, isWritable: true }, // 8
        { pubkey: pool.proveTokenTreasury, isSigner: false, isWritable: true }, // 9
        { pubkey: nftVaultAccount, isSigner: false, isWritable: true }, // 10
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 11
      ];

      const txUnlockNFT = await this._gatewayProgram.methods
        .unlockNft()
        .accounts({
          gatewayState: this._gatewayStateKey,
          adapterProgramId: NFT_FINANCE_ADAPTER_PROGRAM_ID,
          baseProgramId: nftFinance.NFT_STAKING_PROGRAM_ID,
          activityIndex: await getActivityIndex(userKey),
          gatewayAuthority: getGatewayAuthority(),
        })
        .preInstructions(preInstructions)
        .remainingAccounts(remainingAccounts)
        .transaction();

      txAllUnlockNFT.push(txUnlockNFT);
    }
    return [...txAllUnlockNFT];
  }

  async stakeProof(
    farmInfo: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as nftFinance.NFTFarmInfo;

    const preInstructions: anchor.web3.TransactionInstruction[] = [];

    const miner = (
      await anchor.web3.PublicKey.findProgramAddress(
        [farm.farmId.toBuffer(), userKey.toBuffer(), Buffer.from(MINER_SEED)],
        nftFinance.NFT_MINING_PROGRAM_ID
      )
    )[0];

    const checkMinerExist = await this._connection.getAccountInfo(miner);
    if (checkMinerExist == null) {
      const initializeMinerIx = await this._initializeMinerIx(
        userKey,
        farm.farmId
      );
      preInstructions.push(initializeMinerIx);
    }

    const userProveTokenAta = await getAssociatedTokenAddress(
      farm.proveTokenMint,
      userKey
    );
    const createProveTokenAtaIx = await createATAWithoutCheckIx(
      miner,
      farm.proveTokenMint,
      userKey
    );
    preInstructions.push(createProveTokenAtaIx);

    const userFarmTokenAta = await getAssociatedTokenAddress(
      farm.farmTokenMint,
      userKey
    );
    const createFarmTokenAtaIx = await createATAWithoutCheckIx(
      userKey,
      farm.farmTokenMint
    );
    preInstructions.push(createFarmTokenAtaIx);

    const minerVault = await getAssociatedTokenAddress(
      farm.proveTokenMint,
      miner,
      true
    );

    const _updateUnclaimedAmountIx = await this._updateUnclaimedAmountIx(
      userKey,
      farm.farmId
    );
    preInstructions.push(_updateUnclaimedAmountIx);

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: farm.proveTokenMint, isSigner: false, isWritable: false }, // 1
      { pubkey: farm.farmTokenMint, isSigner: false, isWritable: true }, // 2
      { pubkey: userProveTokenAta, isSigner: false, isWritable: true }, // 3
      { pubkey: userFarmTokenAta, isSigner: false, isWritable: true }, // 4
      { pubkey: minerVault, isSigner: false, isWritable: true }, // 5
      { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 6
      { pubkey: farm.farmAuthority, isSigner: false, isWritable: true }, // 7
      { pubkey: miner, isSigner: false, isWritable: true }, // 8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
    ];

    const txStakeProof = await this._gatewayProgram.methods
      .stakeProof()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: NFT_FINANCE_ADAPTER_PROGRAM_ID,
        baseProgramId: nftFinance.NFT_MINING_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txStakeProof];
  }

  async unstakeProof(
    farmInfo: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as nftFinance.NFTFarmInfo;

    const preInstructions: anchor.web3.TransactionInstruction[] = [];

    const miner = (
      await anchor.web3.PublicKey.findProgramAddress(
        [farm.farmId.toBuffer(), userKey.toBuffer(), Buffer.from(MINER_SEED)],
        nftFinance.NFT_MINING_PROGRAM_ID
      )
    )[0];

    const userProveTokenAta = await getAssociatedTokenAddress(
      farm.proveTokenMint,
      userKey
    );
    const createProveTokenAtaIx = await createATAWithoutCheckIx(
      userKey,
      farm.proveTokenMint
    );
    preInstructions.push(createProveTokenAtaIx);

    const userFarmTokenAta = await getAssociatedTokenAddress(
      farm.farmTokenMint,
      userKey
    );
    const minerVault = await getAssociatedTokenAddress(
      farm.proveTokenMint,
      miner,
      true
    );

    const _updateUnclaimedAmountIx = await this._updateUnclaimedAmountIx(
      userKey,
      farm.farmId
    );
    preInstructions.push(_updateUnclaimedAmountIx);

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: farm.proveTokenMint, isSigner: false, isWritable: false }, // 1
      { pubkey: farm.farmTokenMint, isSigner: false, isWritable: true }, // 2
      { pubkey: userProveTokenAta, isSigner: false, isWritable: true }, // 3
      { pubkey: userFarmTokenAta, isSigner: false, isWritable: true }, // 4
      { pubkey: minerVault, isSigner: false, isWritable: true }, // 5
      { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 6
      { pubkey: farm.farmAuthority, isSigner: false, isWritable: true }, // 7
      { pubkey: miner, isSigner: false, isWritable: true }, // 8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
    ];

    const txUnstakeProof = await this._gatewayProgram.methods
      .unstakeProof()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: NFT_FINANCE_ADAPTER_PROGRAM_ID,
        baseProgramId: nftFinance.NFT_MINING_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txUnstakeProof];
  }

  async claim(
    farmInfo: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.Transaction[]> {
    const farm = farmInfo as nftFinance.NFTFarmInfo;

    const preInstructions: anchor.web3.TransactionInstruction[] = [];

    const miner = (
      await anchor.web3.PublicKey.findProgramAddress(
        [farm.farmId.toBuffer(), userKey.toBuffer(), Buffer.from(MINER_SEED)],
        nftFinance.NFT_MINING_PROGRAM_ID
      )
    )[0];

    const userRewardTokenAta = await getAssociatedTokenAddress(
      farm.rewardTokenMint,
      userKey
    );
    const createRewardTokenAtaIx = await createATAWithoutCheckIx(
      userKey,
      farm.rewardTokenMint
    );
    preInstructions.push(createRewardTokenAtaIx);

    const _updateUnclaimedAmountIx = await this._updateUnclaimedAmountIx(
      userKey,
      farm.farmId
    );
    preInstructions.push(_updateUnclaimedAmountIx);

    const remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: farm.rewardTokenMint, isSigner: false, isWritable: false }, // 1
      { pubkey: userRewardTokenAta, isSigner: false, isWritable: true }, // 2
      { pubkey: farm.rewardTreasury, isSigner: false, isWritable: true }, // 3
      { pubkey: farm.farmId, isSigner: false, isWritable: true }, // 4
      { pubkey: farm.farmAuthority, isSigner: false, isWritable: true }, // 5
      { pubkey: miner, isSigner: false, isWritable: true }, // 6
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 7
    ];

    const txClaim = await this._gatewayProgram.methods
      .claim()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: NFT_FINANCE_ADAPTER_PROGRAM_ID,
        baseProgramId: nftFinance.NFT_MINING_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return [txClaim];
  }

  async _initializeMinerIx(
    userKey: anchor.web3.PublicKey,
    farmInfoKey: anchor.web3.PublicKey
  ) {
    const discriminator = sigHash("global", "initialize_miner");
    const data = Buffer.from(discriminator, "hex");

    const miner = (
      await anchor.web3.PublicKey.findProgramAddress(
        [farmInfoKey.toBuffer(), userKey.toBuffer(), Buffer.from(MINER_SEED)],
        nftFinance.NFT_MINING_PROGRAM_ID
      )
    )[0];

    const keys = [
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: farmInfoKey, isSigner: false, isWritable: true },
      {
        pubkey: miner,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: nftFinance.NFT_MINING_PROGRAM_ID,
      data,
    });
  }

  private async _updateUnclaimedAmountIx(
    userKey: anchor.web3.PublicKey,
    farmInfoKey: anchor.web3.PublicKey
  ) {
    const discriminator = sigHash("global", "update_unclaimed_amount");
    const data = Buffer.from(discriminator, "hex");

    const miner = (
      await anchor.web3.PublicKey.findProgramAddress(
        [farmInfoKey.toBuffer(), userKey.toBuffer(), Buffer.from(MINER_SEED)],
        nftFinance.NFT_MINING_PROGRAM_ID
      )
    )[0];

    const keys = [
      { pubkey: farmInfoKey, isSigner: false, isWritable: false },
      {
        pubkey: miner,
        isSigner: false,
        isWritable: true,
      },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: nftFinance.NFT_MINING_PROGRAM_ID,
      data,
    });
  }

  private packInstructionsToTransaction(
    ixArr: anchor.web3.TransactionInstruction[],
    batch = ATA_TX_PER_BATCH
  ): anchor.web3.Transaction[] {
    const txAll: anchor.web3.Transaction[] = [];

    let txn = new anchor.web3.Transaction();
    for (let [index, instruction] of ixArr.entries()) {
      txn.add(instruction);
      if ((index + 1) % batch == 0 || index == ixArr.length - 1) {
        txAll.push(txn);
        txn = new anchor.web3.Transaction();
      }
    }

    return txAll;
  }
}

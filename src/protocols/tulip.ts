import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { struct, array, u8, u64 } from "@project-serum/borsh";
import { getActivityIndex, sigHash, createATAWithoutCheckIx, getGatewayAuthority } from "../utils";
import { IReserveInfo, IVaultInfo, orca, tulip } from "@dappio-wonderland/navigator";
import {
  ActionType,
  CollateralizeParams,
  DepositParams,
  GatewayParams,
  IProtocolMoneyMarket,
  IProtocolVault,
  PAYLOAD_SIZE,
  SupplyParams,
  UncollateralizeParams,
  UnsupplyParams,
  WithdrawParams,
} from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { NATIVE_SOL, TULIP_ADAPTER_PROGRAM_ID, WSOL } from "../ids";
import { getMultipleAccounts } from "@dappio-wonderland/navigator/dist/utils";

const TULIP_VAULT_ACCOUNT_LOOKUP = new anchor.web3.PublicKey("DuUSqiffUKEZwEvKBz9iDY2LZqt7LmLkPihy8E8Vfwyq");

export class ProtocolTulip implements IProtocolMoneyMarket, IProtocolVault {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async supply(
    params: SupplyParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("supplyAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        supplyAmount: new anchor.BN(params.supplyAmount),
      },
      payload
    );

    // Handle transaction here
    const reserve = reserveInfo as tulip.ReserveInfo;
    const reserveWrapper = new tulip.ReserveInfoWrapper(reserve);
    const supplyTokenMint = reserve.liquidity.mintPubkey;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const supplyTokenAddress = await getAssociatedTokenAddress(supplyTokenMint, userKey);
    preInstructions.push(await createATAWithoutCheckIx(userKey, supplyTokenMint));

    const moneyMarketSupplyAmount = new anchor.BN(params.supplyAmount);

    if (supplyTokenMint.equals(NATIVE_SOL) || supplyTokenMint.equals(WSOL)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: supplyTokenAddress,
          lamports: Number(moneyMarketSupplyAmount),
        }),
        createSyncNativeInstruction(supplyTokenAddress)
      );

      postInstructions.push(createCloseAccountInstruction(supplyTokenAddress, userKey, userKey));
    }

    const reserveTokenAddress = await getAssociatedTokenAddress(reserveTokenMint, userKey);
    preInstructions.push(await createATAWithoutCheckIx(userKey, reserveTokenMint));

    const refreshReserveIx = this._refreshReserveIx(reserve.reserveId, reserve.liquidity.oraclePubkey);
    preInstructions.push(refreshReserveIx);

    const lendingMarketAuthority = await reserveWrapper.getLendingMarketAuthority(reserve.lendingMarket);

    const remainingAccounts = [
      { pubkey: supplyTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: reserveTokenMint,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: reserve.lendingMarket,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: lendingMarketAuthority, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txSupply = await this._gatewayProgram.methods
      .supply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: TULIP_ADAPTER_PROGRAM_ID,
        baseProgramId: tulip.TULIP_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txSupply], input: payload };
  }

  async uncollateralize(
    params: UncollateralizeParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // TODO
    return { txs: [], input: Buffer.alloc(0) };
  }

  async unsupply(
    params: UnsupplyParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle transaction here
    const reserve = reserveInfo as tulip.ReserveInfo;
    const reserveWrapper = new tulip.ReserveInfoWrapper(reserve);
    const reserveTokenMint = reserve.collateral.reserveTokenMint;
    const withdrawTokenMint = reserve.liquidity.mintPubkey;

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const moneyMarketUnsupplyAmount = new anchor.BN(params.reservedAmount);
    const collateralAmount = await reserveWrapper.calculateCollateralAmount(
      this._connection,
      moneyMarketUnsupplyAmount
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(reserveTokenMint, userKey);
    preInstructions.push(await createATAWithoutCheckIx(userKey, reserveTokenMint));

    const withdrawTokenAddress = await getAssociatedTokenAddress(withdrawTokenMint, userKey);
    preInstructions.push(await createATAWithoutCheckIx(userKey, withdrawTokenMint));
    if (withdrawTokenMint.equals(NATIVE_SOL) || withdrawTokenMint.equals(WSOL)) {
      postInstructions.push(createCloseAccountInstruction(withdrawTokenAddress, userKey, userKey));
    }

    const refreshReserveIx = this._refreshReserveIx(reserve.reserveId, reserve.liquidity.oraclePubkey);
    preInstructions.push(refreshReserveIx);

    const lendingMarketAuthority = await reserveWrapper.getLendingMarketAuthority(reserve.lendingMarket);

    const remainingAccounts = [
      {
        pubkey: reserveTokenAddress,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: withdrawTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.collateral.reserveTokenMint,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: reserve.lendingMarket,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: lendingMarketAuthority, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txUnsupply = await this._gatewayProgram.methods
      .unsupply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: TULIP_ADAPTER_PROGRAM_ID,
        baseProgramId: tulip.TULIP_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    // Handle payload input here
    const inputLayout = struct([u64("reservedAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        reservedAmount: collateralAmount,
      },
      payload
    );

    return { txs: [txUnsupply], input: payload };
  }

  async collateralize(
    params: CollateralizeParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // TODO
    return { txs: [], input: Buffer.alloc(0) };
  }

  async deposit(
    params: DepositParams,
    vault: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    const vaultInfo = vault as tulip.VaultInfo;
    // Handle payload input here
    const inputLayout = struct([u64("lpOrTokenAAmount"), u64("tokenBAmount"), u64("farmType0"), u64("farmType1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        lpOrTokenAAmount: new anchor.BN(params.depositAmount),
        tokenBAmount: new anchor.BN(params.tokenBAmount || 0),
        farmType0: vaultInfo.base.farm[0],
        farmType1: vaultInfo.base.farm[1],
      },
      payload
    );
    this._gatewayParams.farmType.push(...vaultInfo.base.farm);

    // Handle transaction here
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vaultInfo);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    const [depositTrackingAccount, _trackingNonce] = vaultInfoWrapper.deriveTrackingAddress(userKey);
    const [depositTrackingPda, _depositTrackingPdaNonce] =
      vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount);

    const depositTrackingHoldAccount = await getAssociatedTokenAddress(vaultInfo.shareMint, depositTrackingPda, true);
    const createAtaIx1 = await createATAWithoutCheckIx(depositTrackingPda, vaultInfo.shareMint, userKey);
    preInstructions.push(createAtaIx1);

    const depositTrackingAccountInfo = await this._connection.getAccountInfo(depositTrackingAccount);
    if (!depositTrackingAccountInfo) {
      const newRegisterDepositTrackingAccountIx = await this._newRegisterDepositTrackingAccountIx(vaultInfo, userKey);
      preInstructions.push(newRegisterDepositTrackingAccountIx);
    }

    const depositingUnderlyingAccount = await getAssociatedTokenAddress(vaultInfo.base.underlyingMint, userKey);
    const createAtaIx2 = await createATAWithoutCheckIx(userKey, vaultInfo.base.underlyingMint);
    preInstructions.push(createAtaIx2);

    const remainingAccounts = [
      {
        pubkey: userKey,
        isSigner: true,
        isWritable: vaultInfo.type == tulip.VaultType.Orca ? true : false,
      }, // 0
      { pubkey: vaultInfo.vaultId, isSigner: false, isWritable: true }, // 1
      { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 2
      { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 3
      { pubkey: vaultInfo.base.pda, isSigner: false, isWritable: false }, // 4
      {
        pubkey: vaultInfo.base.underlyingDepositQueue,
        isSigner: false,
        isWritable: true,
      }, // 5
      {
        pubkey: vaultInfo.shareMint,
        isSigner: false,
        isWritable: true,
      }, // 6
      {
        pubkey: depositTrackingHoldAccount,
        isSigner: false,
        isWritable: true,
      }, // 7
      {
        pubkey: depositingUnderlyingAccount,
        isSigner: false,
        isWritable: true,
      }, // 8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
    ];

    if (vaultInfo.type == tulip.VaultType.Orca || vaultInfo.type == tulip.VaultType.OrcaDD) {
      const orcaVault = vault as tulip.OrcaVaultInfo;
      const userTokenAAta = await getAssociatedTokenAddress(orcaVault.farmData.tokenAMint, userKey);
      const userTokenBAta = await getAssociatedTokenAddress(orcaVault.farmData.tokenBMint, userKey);
      remainingAccounts.push(
        { pubkey: orca.ORCA_FARM_PROGRAM_ID, isSigner: false, isWritable: false }, // 10
        { pubkey: userTokenAAta, isSigner: false, isWritable: true }, // 11
        { pubkey: userTokenBAta, isSigner: false, isWritable: true }, // 12
        { pubkey: orcaVault.farmData.poolSwapTokenA.address, isSigner: false, isWritable: true }, // 13
        { pubkey: orcaVault.farmData.poolSwapTokenB.address, isSigner: false, isWritable: true }, // 14
        { pubkey: orca.ORCA_POOL_PROGRAM_ID, isSigner: false, isWritable: false }, // 15
        { pubkey: orcaVault.farmData.poolSwapAccount, isSigner: false, isWritable: true }, // 16
        { pubkey: orcaVault.farmData.poolSwapAuthority, isSigner: false, isWritable: false }, // 17
        { pubkey: orcaVault.farmData.swapPoolMint.address, isSigner: false, isWritable: true } // 18
      );
    }

    const txDeposit = await this._gatewayProgram.methods
      .deposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: TULIP_ADAPTER_PROGRAM_ID,
        baseProgramId: tulip.TULIP_VAULT_V2_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txDeposit], input: payload };
  }

  async withdraw(
    params: WithdrawParams,
    vault: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: (anchor.web3.Transaction | anchor.web3.VersionedTransaction)[]; input: Buffer }> {
    const vaultInfo = vault as tulip.VaultInfo;
    // Handle payload input here
    const inputLayout = struct([u64("shareAmount"), u64("farmType0"), u64("farmType1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
        farmType0: vaultInfo.base.farm[0],
        farmType1: vaultInfo.base.farm[1],
      },
      payload
    );
    this._gatewayParams.farmType.push(...vaultInfo.base.farm);

    // Handle transaction here
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vaultInfo);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    const depositTrackingAccount = vaultInfoWrapper.deriveTrackingAddress(userKey)[0];
    const depositTrackingPda = vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount)[0];
    const depositTrackingHoldAccount = await getAssociatedTokenAddress(vaultInfo.shareMint, depositTrackingPda, true);
    const ephemeralTrackingAccount = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ephemeraltracking"), vaultInfo.vaultId.toBuffer(), userKey.toBuffer()],
      tulip.TULIP_VAULT_V2_PROGRAM_ID
    )[0];
    const userSharesAccount = await getAssociatedTokenAddress(vaultInfo.shareMint, userKey);
    const createAtaIx1 = await createATAWithoutCheckIx(userKey, vaultInfo.shareMint);
    preInstructions.push(createAtaIx1);
    const userLpAccount = await getAssociatedTokenAddress(vaultInfo.base.underlyingMint, userKey);
    const createAtaIx2 = await createATAWithoutCheckIx(userKey, vaultInfo.base.underlyingMint);
    preInstructions.push(createAtaIx2);

    const remainingAccounts: anchor.web3.AccountMeta[] = [];
    switch (vaultInfo.type) {
      case tulip.VaultType.Raydium:
        const raydiumVault = vaultInfo as tulip.RaydiumVaultInfo;

        remainingAccounts.push(
          {
            pubkey: userKey,
            isSigner: true,
            isWritable: false,
          }, // 0
          {
            pubkey: vaultInfo.vaultId,
            isSigner: false,
            isWritable: true,
          }, // 1
          {
            pubkey: vaultInfo.base.pda,
            isSigner: false,
            isWritable: true,
          }, // 2
          {
            pubkey: raydiumVault.associatedStakeInfoAddress,
            isSigner: false,
            isWritable: true,
          }, // 3
          {
            pubkey: raydiumVault.poolId,
            isSigner: false,
            isWritable: true,
          }, // 4
          {
            pubkey: raydiumVault.poolAuthority,
            isSigner: false,
            isWritable: true,
          }, // 5
          {
            pubkey: vaultInfo.base.underlyingWithdrawQueue,
            isSigner: false,
            isWritable: true,
          }, // 6
          {
            pubkey: raydiumVault.poolLpTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 7
          {
            pubkey: raydiumVault.vaultRewardATokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 8
          {
            pubkey: raydiumVault.poolRewardATokenAccount.address,
            isSigner: false,
            isWritable: true,
          }, // 9
          {
            pubkey: raydiumVault.vaultRewardBTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 10
          {
            pubkey: raydiumVault.poolRewardBTokenAccount.address,
            isSigner: false,
            isWritable: true,
          }, // 11
          {
            pubkey: userSharesAccount,
            isSigner: false,
            isWritable: true,
          }, // 12
          {
            pubkey: userLpAccount,
            isSigner: false,
            isWritable: true,
          }, // 13
          {
            pubkey: vaultInfo.shareMint,
            isSigner: false,
            isWritable: true,
          }, // 14
          {
            pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            isSigner: false,
            isWritable: false,
          }, // 15
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 16
          {
            pubkey: raydiumVault.stakeProgram,
            isSigner: false,
            isWritable: false,
          }, // 17
          {
            pubkey: raydiumVault.feeCollectorRewardATokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 18
          {
            pubkey: raydiumVault.feeCollectorRewardBTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 19
          { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 20
          { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 21
          {
            pubkey: depositTrackingHoldAccount,
            isSigner: false,
            isWritable: true,
          } // 22
        );
        break;
      case tulip.VaultType.Orca:
        const orcaVault = vaultInfo as tulip.OrcaVaultInfo;
        const userTokenAAccount = await getAssociatedTokenAddress(orcaVault.farmData.tokenAMint, userKey);
        preInstructions.push(await createATAWithoutCheckIx(userKey, orcaVault.farmData.tokenAMint));
        const userTokenBAccount = await getAssociatedTokenAddress(orcaVault.farmData.tokenBMint, userKey);
        preInstructions.push(await createATAWithoutCheckIx(userKey, orcaVault.farmData.tokenBMint));
        // preInstructions.push(
        //   await this._withdrawTrackingAccountIx(orcaVault, userKey, new anchor.BN(params.withdrawAmount))
        // );

        remainingAccounts.push(
          { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 0
          { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 1
          {
            pubkey: depositTrackingHoldAccount,
            isSigner: false,
            isWritable: true,
          }, // 2
          { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // 3
          { pubkey: userTokenAAccount, isSigner: false, isWritable: true }, // 4
          { pubkey: userTokenBAccount, isSigner: false, isWritable: true }, // 5
          {
            pubkey: userKey,
            isSigner: true,
            isWritable: true,
          }, // 6
          {
            pubkey: vaultInfo.vaultId,
            isSigner: false,
            isWritable: true,
          }, // 7
          {
            pubkey: vaultInfo.base.pda,
            isSigner: false,
            isWritable: true,
          }, // 8
          {
            pubkey: userSharesAccount,
            isSigner: false,
            isWritable: true,
          }, // 9
          {
            pubkey: orcaVault.base.underlyingWithdrawQueue,
            isSigner: false,
            isWritable: true,
          }, // 10
          {
            pubkey: orcaVault.farmData.vaultFarmTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 11
          {
            pubkey: orcaVault.farmData.vaultRewardTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 12
          {
            pubkey: orcaVault.farmData.vaultSwapTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 13
          {
            pubkey: orcaVault.farmData.globalRewardTokenVault,
            isSigner: false,
            isWritable: true,
          }, // 14
          {
            pubkey: orcaVault.farmData.globalBaseTokenVault,
            isSigner: false,
            isWritable: true,
          }, // 15
          {
            pubkey: orcaVault.farmData.poolSwapTokenA.address,
            isSigner: false,
            isWritable: true,
          }, // 16
          {
            pubkey: orcaVault.farmData.poolSwapTokenB.address,
            isSigner: false,
            isWritable: true,
          }, // 17
          {
            pubkey: orcaVault.farmData.globalFarm,
            isSigner: false,
            isWritable: true,
          }, // 18
          {
            pubkey: orcaVault.farmData.userFarmAddr,
            isSigner: false,
            isWritable: true,
          }, // 19
          {
            pubkey: orcaVault.farmData.convertAuthority,
            isSigner: false,
            isWritable: false,
          }, // 20
          {
            pubkey: orcaVault.farmData.poolSwapAccount,
            isSigner: false,
            isWritable: true,
          }, // 21
          {
            pubkey: orcaVault.farmData.poolSwapAuthority,
            isSigner: false,
            isWritable: false,
          }, // 22
          {
            pubkey: orcaVault.farmData.swapPoolMint.address,
            isSigner: false,
            isWritable: true,
          }, // 23
          {
            pubkey: orcaVault.farmData.farmTokenMint,
            isSigner: false,
            isWritable: true,
          }, // 24
          {
            pubkey: orcaVault.shareMint,
            isSigner: false,
            isWritable: true,
          }, // 25
          {
            pubkey: orcaVault.farmData.swapPoolFeeTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 26
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 27
          { pubkey: orca.ORCA_POOL_PROGRAM_ID, isSigner: false, isWritable: false }, // 28
          {
            pubkey: orca.ORCA_FARM_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 29
          { pubkey: ephemeralTrackingAccount, isSigner: false, isWritable: true }, // 30
          { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, // 31
          { pubkey: orcaVault.farmData.feeCollectorTokenAccount, isSigner: false, isWritable: true } // 32
        );
        break;
      case tulip.VaultType.OrcaDD:
        const orcaDDVault = vaultInfo as tulip.OrcaDDVaultInfo;
        const userTokenAccountA = await getAssociatedTokenAddress(orcaDDVault.ddFarmData.tokenAMint, userKey);
        preInstructions.push(await createATAWithoutCheckIx(userKey, orcaDDVault.ddFarmData.tokenAMint));
        const userTokenAccountB = await getAssociatedTokenAddress(orcaDDVault.ddFarmData.tokenBMint, userKey);
        preInstructions.push(await createATAWithoutCheckIx(userKey, orcaDDVault.ddFarmData.tokenBMint));
        // preInstructions.push(
        //   await this._withdrawTrackingAccountIx(orcaDDVault, userKey, new anchor.BN(params.withdrawAmount))
        // );
        remainingAccounts.push(
          { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 0
          { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 1
          {
            pubkey: depositTrackingHoldAccount,
            isSigner: false,
            isWritable: true,
          }, // 2
          { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // 3
          { pubkey: userTokenAccountA, isSigner: false, isWritable: true }, // 4
          { pubkey: userTokenAccountB, isSigner: false, isWritable: true }, // 5
          {
            pubkey: userKey,
            isSigner: true,
            isWritable: true,
          }, // 6
          {
            pubkey: vaultInfo.vaultId,
            isSigner: false,
            isWritable: true,
          }, // 7
          {
            pubkey: vaultInfo.base.pda,
            isSigner: false,
            isWritable: true,
          }, // 8
          {
            pubkey: userSharesAccount,
            isSigner: false,
            isWritable: true,
          }, // 9
          {
            pubkey: orcaVault.base.underlyingWithdrawQueue,
            isSigner: false,
            isWritable: true,
          }, // 10
          {
            pubkey: orcaDDVault.ddFarmData.vaultFarmTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 11
          {
            pubkey: orcaDDVault.ddFarmData.vaultRewardTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 12
          {
            pubkey: orcaDDVault.ddFarmData.vaultSwapTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 13
          {
            pubkey: orcaDDVault.ddFarmData.globalRewardTokenVault,
            isSigner: false,
            isWritable: true,
          }, // 14
          {
            pubkey: orcaVault.farmData.globalBaseTokenVault,
            isSigner: false,
            isWritable: true,
          }, // 15
          {
            pubkey: orcaDDVault.ddFarmData.poolSwapTokenA.address,
            isSigner: false,
            isWritable: true,
          }, // 16
          {
            pubkey: orcaDDVault.ddFarmData.poolSwapTokenB.address,
            isSigner: false,
            isWritable: true,
          }, // 17
          {
            pubkey: orcaDDVault.ddFarmData.globalFarm,
            isSigner: false,
            isWritable: true,
          }, // 18
          {
            pubkey: orcaDDVault.ddFarmData.userFarmAddr,
            isSigner: false,
            isWritable: true,
          }, // 19
          {
            pubkey: orcaDDVault.ddFarmData.convertAuthority,
            isSigner: false,
            isWritable: false,
          }, // 20
          {
            pubkey: orcaDDVault.ddFarmData.poolSwapAccount,
            isSigner: false,
            isWritable: true,
          }, // 21
          {
            pubkey: orcaDDVault.ddFarmData.poolSwapAuthority,
            isSigner: false,
            isWritable: false,
          }, // 22
          {
            pubkey: orcaDDVault.ddFarmData.swapPoolMint.address,
            isSigner: false,
            isWritable: true,
          }, // 23
          {
            pubkey: orcaDDVault.ddFarmData.farmTokenMint,
            isSigner: false,
            isWritable: true,
          }, // 24
          {
            pubkey: orcaDDVault.shareMint,
            isSigner: false,
            isWritable: true,
          }, // 25
          {
            pubkey: orcaDDVault.ddFarmData.swapPoolFeeTokenAccount,
            isSigner: false,
            isWritable: true,
          }, // 26
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 27
          { pubkey: orca.ORCA_POOL_PROGRAM_ID, isSigner: false, isWritable: false }, // 28
          {
            pubkey: orca.ORCA_FARM_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          }, // 29
          { pubkey: ephemeralTrackingAccount, isSigner: false, isWritable: true }, // 30
          { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, // 31
          { pubkey: orcaDDVault.ddFarmData.feeCollectorTokenAccount, isSigner: false, isWritable: true }, // 32
          { pubkey: orcaDDVault.base.underlyingWithdrawQueue, isSigner: false, isWritable: true } // 33
        );
        break;
      default:
        console.error("Error: Unsupported Vault Protocol");
        break;
    }

    const setComputeUnitLimitParams = { units: 1000000 };
    const setComputeUnitLimitIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit(setComputeUnitLimitParams);
    preInstructions = [setComputeUnitLimitIx, ...preInstructions];

    const txWithdraw = await this._gatewayProgram.methods
      .withdraw()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: TULIP_ADAPTER_PROGRAM_ID,
        baseProgramId: tulip.TULIP_VAULT_V2_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    const latestBlockhash = await this._connection.getLatestBlockhash();
    const addressLookupTable = await getMultipleAccounts(this._connection, [TULIP_VAULT_ACCOUNT_LOOKUP]);

    const addressLookupTableAccounts = addressLookupTable.map((accountInfo) => {
      if (accountInfo !== null) {
        return new anchor.web3.AddressLookupTableAccount({
          key: accountInfo.pubkey,
          state: anchor.web3.AddressLookupTableAccount.deserialize(accountInfo.account.data),
        });
      }
    });
    const message = anchor.web3.MessageV0.compile({
      payerKey: userKey,
      instructions: txWithdraw.instructions,
      recentBlockhash: latestBlockhash.blockhash,
      addressLookupTableAccounts,
    });
    const versionedTx = new anchor.web3.VersionedTransaction(message);

    return { txs: [versionedTx], input: payload };
  }

  private _refreshReserveIx(
    reserve: anchor.web3.PublicKey,
    oracle: anchor.web3.PublicKey
  ): anchor.web3.TransactionInstruction {
    const dataLayout = struct([u8("instruction")]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: LendingInstruction.RefreshReserve }, data);

    const keys = [
      { pubkey: reserve, isSigner: false, isWritable: true },
      { pubkey: oracle, isSigner: false, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: tulip.TULIP_PROGRAM_ID,
      data,
    });
  }

  private async _newRegisterDepositTrackingAccountIx(
    vault: tulip.VaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction> {
    const dataLayout = struct([array(u64(), 2, "farm")]);
    const hashArr = sigHash("global", "register_deposit_tracking_account");
    const instruction = Buffer.from(hashArr, "hex");
    let data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        farm: vault.base.farm,
      },
      data
    );

    data = Buffer.concat([instruction, data]);
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vault);

    const [depositTrackingAccount, _trackingNonce] = vaultInfoWrapper.deriveTrackingAddress(userKey);
    const [depositTrackingPda, _depositTrackingPdaNonce] =
      vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount);

    const [depositTrackingQueueAccount, _queueNonce] = vaultInfoWrapper.deriveTrackingQueueAddress(depositTrackingPda);

    const depositTrackingHoldAccount = await getAssociatedTokenAddress(vault.shareMint, depositTrackingPda, true);

    const keys = [
      { pubkey: userKey, isSigner: true, isWritable: true }, // 0
      { pubkey: vault.vaultId, isSigner: false, isWritable: false }, // 1
      {
        pubkey: depositTrackingAccount,
        isSigner: false,
        isWritable: false,
      }, // 2
      {
        pubkey: depositTrackingQueueAccount,
        isSigner: false,
        isWritable: true,
      }, // 3
      {
        pubkey: depositTrackingHoldAccount,
        isSigner: false,
        isWritable: true,
      }, // 4
      { pubkey: vault.shareMint, isSigner: false, isWritable: true }, // 5
      { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 6
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 7
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, // 8
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, // 9
    ];

    if (vault.type === tulip.VaultType.OrcaDD) {
      const orcaDDVault = vault as tulip.OrcaDDVaultInfo;
      const depositTrackingPdaLpAta = await getAssociatedTokenAddress(
        orcaDDVault.farmData.farmTokenMint,
        depositTrackingPda,
        true
      );
      keys.push(
        {
          pubkey: depositTrackingPdaLpAta,
          isSigner: false,
          isWritable: true,
        }, // 10
        {
          pubkey: orcaDDVault.farmData.farmTokenMint,
          isSigner: false,
          isWritable: true,
        } // 11
      );
    }

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: tulip.TULIP_VAULT_V2_PROGRAM_ID,
      data,
    });
  }

  private async _withdrawTrackingAccountIx(
    vault: tulip.VaultInfo,
    userKey: anchor.web3.PublicKey,
    amount: anchor.BN
  ): Promise<anchor.web3.TransactionInstruction> {
    const dataLayout = struct([u64("amount"), array(u64(), 2, "farm")]);
    const hashArr = sigHash("global", "withdraw_deposit_tracking");
    const instruction = Buffer.from(hashArr, "hex");
    let data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        amount: amount,
        farm: vault.base.farm,
      },
      data
    );

    data = Buffer.concat([instruction, data]);
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vault);

    const depositTrackingAccount = vaultInfoWrapper.deriveTrackingAddress(userKey)[0];
    const depositTrackingPda = vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount)[0];
    const depositTrackingHoldAccount = await getAssociatedTokenAddress(vault.shareMint, depositTrackingPda, true);
    const userSharesAccount = await getAssociatedTokenAddress(vault.shareMint, userKey);

    const keys = [
      { pubkey: userKey, isSigner: true, isWritable: false }, // 0
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, // 1
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 2
      {
        pubkey: depositTrackingAccount,
        isSigner: false,
        isWritable: true,
      }, // 3
      {
        pubkey: depositTrackingPda,
        isSigner: false,
        isWritable: true,
      }, // 4
      {
        pubkey: depositTrackingHoldAccount,
        isSigner: false,
        isWritable: true,
      }, // 5
      {
        pubkey: userSharesAccount,
        isSigner: false,
        isWritable: true,
      }, // 6
      { pubkey: vault.shareMint, isSigner: false, isWritable: false }, // 7
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, // 8
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: tulip.TULIP_VAULT_V2_PROGRAM_ID,
      data,
    });
  }
}

enum LendingInstruction {
  RefreshReserve = 3,
  DepositReserveLiquidity = 4,
  RedeemReserveCollateral = 5,
}

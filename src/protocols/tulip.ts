import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { struct, array, u8, u64 } from "@project-serum/borsh";
import {
  getActivityIndex,
  sigHash,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { IReserveInfo, IVaultInfo, tulip } from "@dappio-wonderland/navigator";
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

    const supplyTokenAddress = await getAssociatedTokenAddress(
      supplyTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, supplyTokenMint)
    );

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

      postInstructions.push(
        createCloseAccountInstruction(supplyTokenAddress, userKey, userKey)
      );
    }

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    const refreshReserveIx = this._refreshReserveIx(
      reserve.reserveId,
      reserve.liquidity.oraclePubkey
    );
    preInstructions.push(refreshReserveIx);

    const lendingMarketAuthority =
      await reserveWrapper.getLendingMarketAuthority(reserve.lendingMarket);

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

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    const withdrawTokenAddress = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, withdrawTokenMint)
    );
    if (
      withdrawTokenMint.equals(NATIVE_SOL) ||
      withdrawTokenMint.equals(WSOL)
    ) {
      postInstructions.push(
        createCloseAccountInstruction(withdrawTokenAddress, userKey, userKey)
      );
    }

    const refreshReserveIx = this._refreshReserveIx(
      reserve.reserveId,
      reserve.liquidity.oraclePubkey
    );
    preInstructions.push(refreshReserveIx);

    const lendingMarketAuthority =
      await reserveWrapper.getLendingMarketAuthority(reserve.lendingMarket);

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
    // Handle payload input here
    const inputLayout = struct([u64("lpAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        lpAmount: new anchor.BN(params.depositAmount),
      },
      payload
    );

    // Handle transaction here
    const vaultInfo = vault as tulip.VaultInfo;
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vaultInfo);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    const [depositTrackingAccount, _trackingNonce] =
      vaultInfoWrapper.deriveTrackingAddress(userKey);
    const [depositTrackingPda, _depositTrackingPdaNonce] =
      vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount);

    const depositTrackingHoldAccount = await getAssociatedTokenAddress(
      vaultInfo.shareMint,
      depositTrackingPda,
      true
    );
    const createAtaIx1 = await createATAWithoutCheckIx(
      depositTrackingPda,
      vaultInfo.shareMint,
      userKey
    );
    preInstructions.push(createAtaIx1);

    const depositTrackingAccountInfo = await this._connection.getAccountInfo(
      depositTrackingAccount
    );
    if (!depositTrackingAccountInfo) {
      const newRegisterDepositTrackingAccountIx =
        await this._newRegisterDepositTrackingAccountIx(vaultInfo, userKey);
      preInstructions.push(newRegisterDepositTrackingAccountIx);
    }

    const depositingUnderlyingAccount = await getAssociatedTokenAddress(
      vaultInfo.base.underlyingMint,
      userKey
    );
    const createAtaIx2 = await createATAWithoutCheckIx(
      userKey,
      vaultInfo.base.underlyingMint
    );
    preInstructions.push(createAtaIx2);

    const remainingAccounts = [
      {
        pubkey: userKey,
        isSigner: true,
        isWritable: false,
      }, // 0
      { pubkey: vaultInfo.vaultId, isSigner: false, isWritable: true }, // 1
      { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 2
      {
        pubkey: depositTrackingHoldAccount,
        isSigner: false,
        isWritable: true,
      }, // 3
      {
        pubkey: vaultInfo.shareMint,
        isSigner: false,
        isWritable: true,
      }, // 4
      { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 5
      { pubkey: vaultInfo.base.pda, isSigner: false, isWritable: false }, // 6
      {
        pubkey: vaultInfo.base.underlyingDepositQueue,
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
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("shareAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );

    // Handle transaction here
    const vaultInfo = vault as tulip.RaydiumVaultInfo;
    const vaultInfoWrapper = new tulip.VaultInfoWrapper(vaultInfo);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    const [depositTrackingAccount, _trackingNonce] =
      vaultInfoWrapper.deriveTrackingAddress(userKey);
    const [depositTrackingPda, _depositTrackingPdaNonce] =
      vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount);

    const depositTrackingHoldAccount = await getAssociatedTokenAddress(
      vaultInfo.shareMint,
      depositTrackingPda,
      true
    );

    const userSharesAccount = await getAssociatedTokenAddress(
      vaultInfo.shareMint,
      userKey
    );
    const createAtaIx1 = await createATAWithoutCheckIx(
      userKey,
      vaultInfo.shareMint
    );
    preInstructions.push(createAtaIx1);

    const userLpAccount = await getAssociatedTokenAddress(
      vaultInfo.lpMint,
      userKey
    );
    const createAtaIx2 = await createATAWithoutCheckIx(
      userKey,
      vaultInfo.lpMint
    );
    preInstructions.push(createAtaIx2);

    const remainingAccounts = [
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
        pubkey: vaultInfo.associatedStakeInfoAddress,
        isSigner: false,
        isWritable: true,
      }, // 3
      {
        pubkey: vaultInfo.poolId,
        isSigner: false,
        isWritable: true,
      }, // 4
      {
        pubkey: vaultInfo.poolAuthority,
        isSigner: false,
        isWritable: true,
      }, // 5
      {
        pubkey: vaultInfo.base.underlyingWithdrawQueue,
        isSigner: false,
        isWritable: true,
      }, // 6
      {
        pubkey: vaultInfo.poolLpTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 7
      {
        pubkey: vaultInfo.vaultRewardATokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 8
      {
        pubkey: vaultInfo.poolRewardATokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 9
      {
        pubkey: vaultInfo.vaultRewardBTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 10
      {
        pubkey: vaultInfo.poolRewardBTokenAccount,
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
        pubkey: vaultInfo.stakeProgram,
        isSigner: false,
        isWritable: false,
      }, // 17
      {
        pubkey: vaultInfo.feeCollectorRewardATokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 18
      {
        pubkey: vaultInfo.feeCollectorRewardBTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // 19
      { pubkey: depositTrackingAccount, isSigner: false, isWritable: true }, // 20
      { pubkey: depositTrackingPda, isSigner: false, isWritable: true }, // 21
      {
        pubkey: depositTrackingHoldAccount,
        isSigner: false,
        isWritable: true,
      }, // 22
    ];

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

    return { txs: [txWithdraw], input: payload };
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

    const [depositTrackingAccount, _trackingNonce] =
      vaultInfoWrapper.deriveTrackingAddress(userKey);
    const [depositTrackingPda, _depositTrackingPdaNonce] =
      vaultInfoWrapper.deriveTrackingPdaAddress(depositTrackingAccount);

    const [depositTrackingQueueAccount, _queueNonce] =
      vaultInfoWrapper.deriveTrackingQueueAddress(depositTrackingPda);

    const depositTrackingHoldAccount = await getAssociatedTokenAddress(
      vault.shareMint,
      depositTrackingPda,
      true
    );

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

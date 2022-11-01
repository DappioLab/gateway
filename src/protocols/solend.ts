import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { struct, u64, u8 } from "@project-serum/borsh";
import {
  getActivityIndex,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { IReserveInfo, solend, utils } from "@dappio-wonderland/navigator";
import {
  ActionType,
  BorrowParams,
  CollateralizeParams,
  GatewayParams,
  IProtocolMoneyMarket,
  PAYLOAD_SIZE,
  RepayParams,
  SupplyParams,
  UncollateralizeParams,
  UnsupplyParams,
} from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { NATIVE_SOL, SOLEND_ADAPTER_PROGRAM_ID, WSOL } from "../ids";

export class ProtocolSolend implements IProtocolMoneyMarket {
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
    const reserve = reserveInfo as solend.ReserveInfo;
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

    const obligation = await solend.infos.getObligationId(
      reserve.lendingMarket,
      userKey
    );
    const obligationInfo = await this._connection.getAccountInfo(obligation);

    if (!obligationInfo || obligationInfo.data.length == 0) {
      const createObligationIx = await this._createObligationAccountIx(
        userKey,
        reserve.lendingMarket
      );
      preInstructions = preInstructions.concat(createObligationIx);
    }

    const refreshReserveIx = this._refreshReserveIx(
      reserve.reserveId,
      reserve.liquidity.pythOraclePubkey,
      reserve.liquidity.switchboardOraclePubkey
    );
    preInstructions.push(refreshReserveIx);

    const reservInfoWrapper = new solend.ReserveInfoWrapper(reserve);
    const lendingMarketAuthority =
      await reservInfoWrapper.getLendingMarketAuthority();

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
        isWritable: true,
      },
      { pubkey: lendingMarketAuthority, isSigner: false, isWritable: false },
      {
        pubkey: reserve.collateral.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: obligation,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: reserve.liquidity.pythOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: reserve.liquidity.switchboardOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
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
        adapterProgramId: SOLEND_ADAPTER_PROGRAM_ID,
        baseProgramId: solend.SOLEND_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txSupply], input: payload };
  }

  async collateralize(
    params: CollateralizeParams,
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
    // Handle payload input here
    const inputLayout = struct([u64("reservedAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        reservedAmount: new anchor.BN(params.reservedAmount),
      },
      payload
    );

    // Handle transaction here
    const reserve = reserveInfo as solend.ReserveInfo;
    const obligationId = await solend.infos.getObligationId(
      reserve.lendingMarket,
      userKey
    );
    const obligationInfo = (await solend.infos.getObligation(
      this._connection,
      obligationId
    )) as solend.ObligationInfo;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;
    const withdrawTokenMint = reserve.liquidity.mintPubkey;

    let accountKeys: anchor.web3.PublicKey[] = [obligationId];

    const depositReserves = obligationInfo.obligationCollaterals.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...depositReserves];

    const borrowedReserves = obligationInfo.obligationLoans.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...borrowedReserves];
    const accountInfos = await utils.getMultipleAccounts(
      this._connection,
      accountKeys
    );

    const depositReserveData = accountInfos.slice(
      1,
      depositReserves.length + 1
    );
    const borrowedReserveData = accountInfos.slice(
      depositReserves.length + 1,
      depositReserves.length + borrowedReserves.length + 1
    );

    let txPrerequisite = new anchor.web3.Transaction();
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    // refresh all user's obligations
    depositReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    borrowedReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    const oblidationInfo = accountInfos[0].account;
    if (!oblidationInfo || oblidationInfo.data.length == 0) {
      preInstructions = preInstructions.concat(
        await this._createObligationAccountIx(userKey, reserve.lendingMarket)
      );
    }
    preInstructions.push(
      this._refreshObligationIx(obligationId, depositReserves, borrowedReserves)
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    txPrerequisite.add(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    const withdrawTokenAddress = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    txPrerequisite.add(
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

    const reservInfoWrapper = new solend.ReserveInfoWrapper(reserve);
    const lendingMarketAuthority =
      reservInfoWrapper.getLendingMarketAuthority();

    const remainingAccounts = [
      {
        pubkey: reserve.collateral.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      { pubkey: obligationId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.lendingMarket,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: lendingMarketAuthority, isSigner: false, isWritable: false },
      { pubkey: withdrawTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserveTokenMint, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },
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
        adapterProgramId: SOLEND_ADAPTER_PROGRAM_ID,
        baseProgramId: solend.SOLEND_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txPrerequisite, txUnsupply], input: payload };
  }

  async uncollateralize(
    params: UncollateralizeParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // TODO
    return { txs: [], input: Buffer.alloc(0) };
  }

  async borrow(
    params: BorrowParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("borrowAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        borrowAmount: new anchor.BN(params.borrowAmount),
      },
      payload
    );

    // Handle transaction here
    const reserve = reserveInfo as solend.ReserveInfo;
    const obligationId = await solend.infos.getObligationId(
      reserve.lendingMarket,
      userKey
    );
    const obligationInfo = (await solend.infos.getObligation(
      this._connection,
      obligationId
    )) as solend.ObligationInfo;

    const borrowTokenMint = reserve.liquidity.mintPubkey;

    let accountKeys: anchor.web3.PublicKey[] = [obligationId];

    const depositReserves = obligationInfo.obligationCollaterals.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...depositReserves];

    const borrowedReserves = obligationInfo.obligationLoans.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...borrowedReserves];
    const accountInfos = await utils.getMultipleAccounts(
      this._connection,
      accountKeys
    );

    const depositReserveData = accountInfos.slice(
      1,
      depositReserves.length + 1
    );
    const borrowedReserveData = accountInfos.slice(
      depositReserves.length + 1,
      depositReserves.length + borrowedReserves.length + 1
    );

    let txPrerequisite = new anchor.web3.Transaction();
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    // refresh all user's obligations
    depositReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    borrowedReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    const borrowAssetRefreshReserveIx = this._refreshReserveIx(
      reserve.reserveId,
      reserve.liquidity.pythOraclePubkey,
      reserve.liquidity.switchboardOraclePubkey
    );
    preInstructions.push(borrowAssetRefreshReserveIx);

    const oblidationInfo = accountInfos[0].account;
    if (!oblidationInfo || oblidationInfo.data.length == 0) {
      preInstructions = preInstructions.concat(
        await this._createObligationAccountIx(userKey, reserve.lendingMarket)
      );
    }
    preInstructions.push(
      this._refreshObligationIx(obligationId, depositReserves, borrowedReserves)
    );

    const borrowTokenAddress = await getAssociatedTokenAddress(
      borrowTokenMint,
      userKey
    );
    txPrerequisite.add(await createATAWithoutCheckIx(userKey, borrowTokenMint));

    if (borrowTokenMint.equals(NATIVE_SOL) || borrowTokenMint.equals(WSOL)) {
      postInstructions.push(
        createCloseAccountInstruction(borrowTokenAddress, userKey, userKey)
      );
    }

    const reserveInfoWrapper = new solend.ReserveInfoWrapper(reserve);
    const lendingMarketAuthority =
      await reserveInfoWrapper.getLendingMarketAuthority();

    const remainingAccounts = [
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: borrowTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.config.feeReceiver,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: obligationId, isSigner: false, isWritable: true },
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

    const txBorrow = await this._gatewayProgram.methods
      .borrow()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SOLEND_ADAPTER_PROGRAM_ID,
        baseProgramId: solend.SOLEND_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txPrerequisite, txBorrow], input: payload };
  }

  async repay(
    params: RepayParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("repayAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        repayAmount: new anchor.BN(params.repayAmount),
      },
      payload
    );

    // Handle transaction here
    const reserve = reserveInfo as solend.ReserveInfo;
    const obligationId = await solend.infos.getObligationId(
      reserve.lendingMarket,
      userKey
    );

    const obligationInfo = (await solend.infos.getObligation(
      this._connection,
      obligationId
    )) as solend.ObligationInfo;

    const repayTokenMint = reserve.liquidity.mintPubkey;

    let accountKeys: anchor.web3.PublicKey[] = [obligationId];

    const depositReserves = obligationInfo.obligationCollaterals.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...depositReserves];

    const borrowedReserves = obligationInfo.obligationLoans.map(
      (reserve) => reserve.reserveId
    );
    accountKeys = [...accountKeys, ...borrowedReserves];
    const accountInfos = await utils.getMultipleAccounts(
      this._connection,
      accountKeys
    );

    const depositReserveData = accountInfos.slice(
      1,
      depositReserves.length + 1
    );
    const borrowedReserveData = accountInfos.slice(
      depositReserves.length + 1,
      depositReserves.length + borrowedReserves.length + 1
    );

    let txPrerequisite = new anchor.web3.Transaction();
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    // refresh all user's obligations
    depositReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    borrowedReserveData.forEach((reserveData) => {
      let reserveInfo = solend.infos.parseReserve(
        reserveData.account?.data,
        reserveData.pubkey
      ) as solend.ReserveInfo;

      preInstructions.push(
        this._refreshReserveIx(
          reserveData.pubkey,
          reserveInfo.liquidity.pythOraclePubkey,
          reserveInfo.liquidity.switchboardOraclePubkey
        )
      );
    });

    const oblidationInfo = accountInfos[0].account;
    if (!oblidationInfo || oblidationInfo.data.length == 0) {
      preInstructions = preInstructions.concat(
        await this._createObligationAccountIx(userKey, reserve.lendingMarket)
      );
    }
    preInstructions.push(
      this._refreshObligationIx(obligationId, depositReserves, borrowedReserves)
    );

    const repayTokenAddress = await getAssociatedTokenAddress(
      repayTokenMint,
      userKey
    );
    txPrerequisite.add(await createATAWithoutCheckIx(userKey, repayTokenMint));

    const moneyMarketRepayAmount = new anchor.BN(params.repayAmount);

    if (repayTokenMint.equals(NATIVE_SOL) || repayTokenMint.equals(WSOL)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: repayTokenAddress,
          lamports: Number(moneyMarketRepayAmount),
        }),
        createSyncNativeInstruction(repayTokenAddress)
      );

      postInstructions.push(
        createCloseAccountInstruction(repayTokenAddress, userKey, userKey)
      );
    }

    const remainingAccounts = [
      {
        pubkey: repayTokenAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      { pubkey: obligationId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.lendingMarket,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const txRepay = await this._gatewayProgram.methods
      .repay()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: SOLEND_ADAPTER_PROGRAM_ID,
        baseProgramId: solend.SOLEND_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txPrerequisite, txRepay], input: payload };
  }

  private async _createObligationAccountIx(
    userKey: anchor.web3.PublicKey,
    lendingMarket: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction[]> {
    const seed = lendingMarket.toString().slice(0, 32);

    let createAccountFromSeedIx =
      anchor.web3.SystemProgram.createAccountWithSeed({
        fromPubkey: userKey,
        seed: seed,
        space: 1300,
        newAccountPubkey: await solend.infos.getObligationId(
          userKey,
          lendingMarket
        ),
        basePubkey: userKey,
        lamports: 9938880,
        programId: solend.SOLEND_PROGRAM_ID,
      });
    const dataLayout = struct([u8("instruction")]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: LendingInstruction.InitObligation }, data);
    let keys = [
      {
        pubkey: await solend.infos.getObligationId(userKey, lendingMarket),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: lendingMarket, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: true },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];

    let createObligationIx = new anchor.web3.TransactionInstruction({
      keys,
      programId: solend.SOLEND_PROGRAM_ID,
      data: data,
    });
    return [createAccountFromSeedIx, createObligationIx];
  }

  private _refreshReserveIx(
    reserve: anchor.web3.PublicKey,
    oracle: anchor.web3.PublicKey,
    switchboardFeedAddress: anchor.web3.PublicKey
  ): anchor.web3.TransactionInstruction {
    const dataLayout = struct([u8("instruction")]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: LendingInstruction.RefreshReserve }, data);

    const keys = [
      { pubkey: reserve, isSigner: false, isWritable: true },
      { pubkey: oracle, isSigner: false, isWritable: false },
      {
        pubkey: switchboardFeedAddress,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    return new anchor.web3.TransactionInstruction({
      keys,
      programId: solend.SOLEND_PROGRAM_ID,
      data,
    });
  }

  private _refreshObligationIx(
    obligation: anchor.web3.PublicKey,
    depositReserves: anchor.web3.PublicKey[],
    borrowReserves: anchor.web3.PublicKey[]
  ): anchor.web3.TransactionInstruction {
    const dataLayout = struct([u8("instruction")]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      { instruction: LendingInstruction.RefreshObligation },
      data
    );

    const keys = [
      { pubkey: obligation, isSigner: false, isWritable: true },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];

    depositReserves.forEach((depositReserve) =>
      keys.push({
        pubkey: depositReserve,
        isSigner: false,
        isWritable: false,
      })
    );
    borrowReserves.forEach((borrowReserve) =>
      keys.push({
        pubkey: borrowReserve,
        isSigner: false,
        isWritable: false,
      })
    );
    return new anchor.web3.TransactionInstruction({
      keys,
      programId: solend.SOLEND_PROGRAM_ID,
      data,
    });
  }
}

enum LendingInstruction {
  InitLendingMarket = 0,
  SetLendingMarketOwner = 1,
  InitReserve = 2,
  RefreshReserve = 3,
  DepositReserveLiquidity = 4,
  RedeemReserveCollateral = 5,
  InitObligation = 6,
  RefreshObligation = 7,
  DepositObligationCollateral = 8,
  WithdrawObligationCollateral = 9,
  BorrowObligationLiquidity = 10,
  RepayObligationLiquidity = 11,
  LiquidateObligation = 12,
  FlashLoan = 13,
  DepositReserveLiquidityAndObligationCollateral = 14,
  WithdrawObligationCollateralAndRedeemReserveLiquidity = 15,
  SyncNative = 17,
}

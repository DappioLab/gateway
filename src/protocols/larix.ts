import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  getActivityIndex,
  createATAWithoutCheckIx,
  getAnchorInsByIdl,
  getGatewayAuthority,
} from "../utils";
import {
  IFarmInfo,
  IReserveInfo,
  larix,
  utils,
} from "@dappio-wonderland/navigator";
import {
  ActionType,
  BorrowParams,
  ClaimCollateralRewardParams,
  CollateralizeParams,
  GatewayParams,
  HarvestParams,
  IProtocolFarm,
  IProtocolMoneyMarket,
  PAYLOAD_SIZE,
  RepayParams,
  StakeParams,
  SupplyParams,
  UncollateralizeParams,
  UnstakeParams,
  UnsupplyParams,
} from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { LARIX_ADAPTER_PROGRAM_ID } from "../ids";
import { struct, u64, u8 } from "@project-serum/borsh";

export class ProtocolLarix implements IProtocolMoneyMarket, IProtocolFarm {
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
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const supplyTokenMint = reserve.liquidity.mintPubkey;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;

    const supplyTokenAddress = await getAssociatedTokenAddress(
      supplyTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, supplyTokenMint)
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    // Work-around of getting moneyMarketSupplyAmount
    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.Supply
    );

    const moneyMarketSupplyAmount =
      this._gatewayParams.payloadQueue[indexSupply];

    if (supplyTokenMint.equals(NATIVE_MINT)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: supplyTokenAddress,
          lamports: moneyMarketSupplyAmount.toNumber(),
        })
      );
      preInstructions.push(createSyncNativeInstruction(supplyTokenAddress));
      postInstructions.push(
        createCloseAccountInstruction(supplyTokenAddress, userKey, userKey)
      );
    }

    let remainingAccounts = [
      { pubkey: supplyTokenAddress, isSigner: false, isWritable: true }, //0
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //1
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //2
      { pubkey: reserveTokenMint, isSigner: false, isWritable: true }, //3
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      }, //4
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      }, //5
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false }, //6
      { pubkey: userKey, isSigner: true, isWritable: false }, //7
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //8
    ];

    preInstructions = [...preInstructions, ...this._createRefreshIxs(reserve)];
    const supplyTx = await this._gatewayProgram.methods
      .supply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [supplyTx], input: payload };
  }

  async collateralize(
    params: CollateralizeParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const supplyTokenMint = reserve.liquidity.mintPubkey;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, supplyTokenMint)
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    obligationId ||= await larix.infos.getObligationId(
      larix.LARIX_MARKET_ID_MAIN_POOL,
      userKey
    );

    const isObligationCreated = await larix.checkObligationCreated(
      this._connection,
      userKey
    );
    let obligationInfo: larix.ObligationInfo;

    if (isObligationCreated) {
      obligationInfo = (await larix.infos.getObligation(
        this._connection,
        obligationId
      )) as larix.ObligationInfo;
      let refreshObligation = await this._refreshObligationIxs(obligationInfo);
      preInstructions = [...preInstructions, ...refreshObligation];
    } else {
      let createObligationIxs = await this._initObligationIxs(
        obligationId,
        userKey
      );
      preInstructions = [...preInstructions, ...createObligationIxs];
    }

    let refreshReservesIx = this._refreshReservesIx([
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
    ]);
    preInstructions.push(refreshReservesIx);

    let remainingAccounts = [
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      {
        pubkey: reserve.collateral.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: obligationId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    if (isObligationCreated) {
      obligationInfo.obligationCollaterals.forEach((collateral) => {
        remainingAccounts.push({
          pubkey: collateral.reserveId,
          isSigner: false,
          isWritable: false,
        });
      });
      obligationInfo.obligationLoans.forEach((loan) => {
        remainingAccounts.push({
          pubkey: loan.reserveId,
          isSigner: false,
          isWritable: false,
        });
      });
    }

    const collateralizeTx = await this._gatewayProgram.methods
      .collateralize()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [collateralizeTx], input: payload };
  }

  async unsupply(
    params: UnsupplyParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const liquidityTokenMint = reserve.liquidity.mintPubkey;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;

    const liquidityTokenAddress = await getAssociatedTokenAddress(
      liquidityTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, liquidityTokenMint)
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );

    if (liquidityTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(liquidityTokenAddress, userKey, userKey)
      );
    }

    let remainingAccounts = [
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true }, //0
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //1
      { pubkey: reserveTokenMint, isSigner: false, isWritable: true }, //2
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      }, //3
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      }, //4
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false }, //5
      { pubkey: userKey, isSigner: true, isWritable: false }, //6
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //7
      { pubkey: liquidityTokenAddress, isSigner: false, isWritable: true }, //8
    ];
    preInstructions = [...preInstructions, ...this._createRefreshIxs(reserve)];

    const unsupplyTx = await this._gatewayProgram.methods
      .unsupply()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [unsupplyTx], input: payload };
  }

  async uncollateralize(
    params: UncollateralizeParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([u64("reserveOutAmount")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        reserveOutAmount: new anchor.BN(params.uncollateralizeAmount),
      },
      payload
    );
    // Handle transaction here
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    const liquidityTokenMint = reserve.liquidity.mintPubkey;
    const reserveTokenMint = reserve.collateral.reserveTokenMint;

    preInstructions.push(
      await createATAWithoutCheckIx(userKey, liquidityTokenMint)
    );

    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );
    obligationId ||= await larix.infos.getObligationId(
      larix.LARIX_MARKET_ID_MAIN_POOL,
      userKey
    );
    let obligationInfo = (await larix.infos.getObligation(
      this._connection,
      obligationId
    )) as larix.ObligationInfo;
    let refreshObligation = await this._refreshObligationIxs(obligationInfo);
    preInstructions = [...preInstructions, ...refreshObligation];

    let refreshReservesIx = await this._refreshReservesIx([
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
    ]);
    preInstructions.push(refreshReservesIx);
    let remainingAccounts = [
      {
        pubkey: reserve.collateral.supplyPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: obligationId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    const uncollateralizeTx = await this._gatewayProgram.methods
      .uncollateralize()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [uncollateralizeTx], input: payload };
  }

  async borrow(
    params: BorrowParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationId?: anchor.web3.PublicKey
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
    let preTx = new anchor.web3.Transaction();
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let remainingAccounts = [] as anchor.web3.AccountMeta[];
    const liquidityTokenMint = reserve.liquidity.mintPubkey;
    const liquidityTokenAddress = await getAssociatedTokenAddress(
      liquidityTokenMint,
      userKey
    );

    preTx.add(await createATAWithoutCheckIx(userKey, liquidityTokenMint));
    obligationId ||= await larix.infos.getObligationId(
      larix.LARIX_MARKET_ID_MAIN_POOL,
      userKey
    );
    let obligationInfo = (await larix.infos.getObligation(
      this._connection,
      obligationId
    )) as larix.ObligationInfo;
    let refreshObligation = await this._refreshObligationIxs(obligationInfo);
    preInstructions = [...preInstructions, ...refreshObligation];

    let refreshReservesIx = this._refreshReservesIx([
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
    ]);

    preInstructions.push(refreshReservesIx);

    remainingAccounts = [
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      }, //0
      { pubkey: liquidityTokenAddress, isSigner: false, isWritable: true }, //1
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //2
      {
        pubkey: obligationId,
        isSigner: false,
        isWritable: true,
      }, //3
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: false,
      }, //4
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false }, //5
      { pubkey: userKey, isSigner: true, isWritable: false }, //6
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //7

      {
        pubkey: reserve.liquidity.feeReceiver,
        isSigner: false,
        isWritable: true,
      }, //8
      {
        pubkey: larix.LARIX_ORACLE_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //9
      { pubkey: larix.LARIX_MINT, isSigner: false, isWritable: false }, //10
    ];

    if (liquidityTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(liquidityTokenAddress, userKey, userKey)
      );
    }

    const borrowTx = await this._gatewayProgram.methods
      .borrow()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [preTx, borrowTx], input: payload };
  }

  async repay(
    params: RepayParams,
    reserveInfo: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationId?: anchor.web3.PublicKey
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
    let preTx = new anchor.web3.Transaction();
    const reserve = reserveInfo as larix.ReserveInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let remainingAccounts = [] as anchor.web3.AccountMeta[];
    const liquidityTokenMint = reserve.liquidity.mintPubkey;
    const liquidityTokenAddress = await getAssociatedTokenAddress(
      liquidityTokenMint,
      userKey
    );
    preTx.add(await createATAWithoutCheckIx(userKey, liquidityTokenMint));

    obligationId ||= await larix.infos.getObligationId(
      larix.LARIX_MARKET_ID_MAIN_POOL,
      userKey
    );
    let obligationInfo = (await larix.infos.getObligation(
      this._connection,
      obligationId
    )) as larix.ObligationInfo;
    let refreshObligation = await this._refreshObligationIxs(obligationInfo);
    preInstructions = [...preInstructions, ...refreshObligation];
    let refreshReservesIx = await this._refreshReservesIx([
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true },
      {
        pubkey: reserve.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      },
    ]);
    preInstructions.push(refreshReservesIx);
    remainingAccounts = [
      {
        pubkey: liquidityTokenAddress,
        isSigner: false,
        isWritable: true,
      }, //0
      {
        pubkey: reserve.liquidity.supplyPubkey,
        isSigner: false,
        isWritable: true,
      }, //1
      { pubkey: reserve.reserveId, isSigner: false, isWritable: true }, //2
      {
        pubkey: obligationId,
        isSigner: false,
        isWritable: true,
      }, //3
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: false,
      }, //4
      { pubkey: userKey, isSigner: true, isWritable: false }, //5
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, //6
    ];
    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.Repay
    );

    let repayAmount = this._gatewayParams.payloadQueue[indexSupply];

    if (liquidityTokenMint.equals(NATIVE_MINT)) {
      let wSOLAmount = repayAmount;
      if (wSOLAmount.toNumber() === Number.MAX_SAFE_INTEGER) {
        let solBalance = (await this._connection.getAccountInfo(userKey))
          .lamports;
        let feeReserveLamports = 0.01 * 10 ** 9;
        wSOLAmount = new anchor.BN(solBalance - feeReserveLamports);
      }
      // It's a workaround for repay ix data
      // if the wSOLAmount is 2^53-1 the program will use u64_MAX for amount
      // this will repay the loan with less then 1
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: liquidityTokenAddress,
          lamports: wSOLAmount.toNumber(),
        })
      );
      preInstructions.push(createSyncNativeInstruction(liquidityTokenAddress));

      postInstructions.push(
        createCloseAccountInstruction(liquidityTokenAddress, userKey, userKey)
      );
    }
    const repayTx = await this._gatewayProgram.methods
      .repay()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [preTx, repayTx], input: payload };
  }

  async claimCollateralReward(
    params: ClaimCollateralRewardParams,
    userKey: anchor.web3.PublicKey,
    obligationId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    obligationId ||= await larix.infos.getObligationId(
      larix.LARIX_MARKET_ID_MAIN_POOL,
      userKey
    );
    let obligationInfo = (await larix.infos.getObligation(
      this._connection,
      obligationId
    )) as larix.ObligationInfo;
    let refreshObligation = await this._refreshObligationIxs(obligationInfo);
    preInstructions = [...preInstructions, ...refreshObligation];

    let rewardATA = await getAssociatedTokenAddress(larix.LARIX_MINT, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, larix.LARIX_MINT)
    );

    let remainingAccounts = [
      {
        pubkey: obligationId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: larix.MINE_SUPPLY,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: rewardATA, isSigner: false, isWritable: true },

      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false },

      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    for (let miningReserve of obligationInfo.obligationCollaterals) {
      remainingAccounts.push({
        pubkey: miningReserve.reserveId,
        isSigner: false,
        isWritable: false,
      });
    }
    for (let miningReserve of obligationInfo.obligationLoans) {
      remainingAccounts.push({
        pubkey: miningReserve.reserveId,
        isSigner: false,
        isWritable: false,
      });
    }

    const claimTx = await this._gatewayProgram.methods
      .claimCollateralReward()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [claimTx], input: payload };
  }

  async stake(
    params: StakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    const farm = farmInfo as larix.FarmInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const reserveTokenMint = farm.reserveTokenMint;
    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );

    if (
      farmerId == null &&
      !(await larix.checkFarmerCreated(this._connection, userKey))
    ) {
      farmerId ||= await larix.infos.getFarmerId(farmInfo, userKey);

      let createFarmerIx = await this._initFarmerIxs(farmerId, userKey);
      preInstructions = [...preInstructions, ...createFarmerIx];
    }

    let remainingAccounts = [
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      { pubkey: farm.unCollSupply, isSigner: false, isWritable: true },
      {
        pubkey: farmerId,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    preInstructions = [
      ...preInstructions,
      this._refreshReservesIx([
        { pubkey: farm.farmId, isWritable: true, isSigner: false },
        { pubkey: farm.oraclePublickey, isWritable: false, isSigner: false },
      ]),
    ];

    const txStake = await this._gatewayProgram.methods
      .stake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [txStake], input: payload };
  }

  async unstake(
    params: UnstakeParams,
    farmInfo: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([u64("reserveOutAmount")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        reserveOutAmount: new anchor.BN(params.shareAmount),
      },
      payload
    );
    // Handle transaction here
    const farm = farmInfo as larix.FarmInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    const reserveTokenMint = farm.reserveTokenMint;
    const reserveTokenAddress = await getAssociatedTokenAddress(
      reserveTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, reserveTokenMint)
    );
    farmerId ||= await larix.infos.getFarmerId(farmInfo, userKey);
    let remainingAccounts = [
      {
        pubkey: farm.unCollSupply,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: reserveTokenAddress, isSigner: false, isWritable: true },
      {
        pubkey: farmerId,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: farm.farmId, isSigner: false, isWritable: true },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    preInstructions = [
      ...preInstructions,
      this._refreshReservesIx([
        { pubkey: farm.farmId, isWritable: true, isSigner: false },
        { pubkey: farm.oraclePublickey, isWritable: false, isSigner: false },
      ]),
    ];

    const txUnstake = await this._gatewayProgram.methods
      .unstake()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [txUnstake], input: payload };
  }

  async harvest(
    params: HarvestParams,
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerId?: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);

    // Handle transaction here
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let rewardATA = await getAssociatedTokenAddress(larix.LARIX_MINT, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, larix.LARIX_MINT)
    );
    farmerId ||= await larix.infos.getFarmerId(farm, userKey);
    let farmerInfo = (await larix.infos.getFarmer(
      this._connection,
      farmerId
    )) as larix.FarmerInfo;
    let allReserves = await larix.infos.getAllReserves(this._connection);
    let reservesMap = allReserves.reduce(function (
      map: Map<String, larix.ReserveInfo>,
      reserve: larix.ReserveInfo
    ) {
      map[reserve.toString()] = reserve;

      return map;
    },
    {} as Map<String, larix.ReserveInfo>);
    let refreshMeta = [];
    let remainingAccounts = [
      {
        pubkey: farmerId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: larix.MINE_SUPPLY,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: rewardATA, isSigner: false, isWritable: true },

      { pubkey: userKey, isSigner: true, isWritable: false },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: larix.MARKET_AUTHORITY, isSigner: false, isWritable: false },

      // { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    for (let farmingReserve of farmerInfo.indexs) {
      let reserveInfo = reservesMap[farmingReserve.reserveId.toString()]
        .reserve as larix.ReserveInfoWrapper;
      remainingAccounts.push({
        pubkey: farmingReserve.reserveId,
        isSigner: false,
        isWritable: false,
      });
      refreshMeta.push({
        pubkey: reserveInfo.reserveInfo.reserveId,
        isSigner: false,
        isWritable: true,
      });
      refreshMeta.push({
        pubkey: reserveInfo.reserveInfo.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      });
    }
    preInstructions.push(this._refreshReservesIx(refreshMeta));

    const txHarvest = await this._gatewayProgram.methods
      .harvest()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LARIX_ADAPTER_PROGRAM_ID,
        baseProgramId: larix.LARIX_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();


    return { txs: [txHarvest], input: payload };
  }

  private async _initFarmerIxs(
    farmerId: anchor.web3.PublicKey,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction[]> {
    // let newFarmer = await larix.infos.getFarmerId(farmId, userKey);
    let config = {
      basePubkey: userKey,
      fromPubkey: userKey,
      lamports: 5359200,
      newAccountPubkey: farmerId,
      programId: larix.LARIX_PROGRAM_ID,
      seed: larix.LARIX_MAIN_POOL_FARMER_SEED,
      space: 642,
    };
    let createAccountIx =
      anchor.web3.SystemProgram.createAccountWithSeed(config);

    const dataLayout = struct([u8("instruction")]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: 16 }, data);
    const keys = [
      { pubkey: farmerId, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: true, isWritable: true },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
    ];
    let initFarmerIx = new anchor.web3.TransactionInstruction({
      keys,
      programId: larix.LARIX_PROGRAM_ID,
      data,
    });
    return [createAccountIx, initFarmerIx];
  }

  private async _initObligationIxs(
    obligationId: anchor.web3.PublicKey,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction[]> {
    let config = {
      basePubkey: userKey,
      fromPubkey: userKey,
      lamports: 8491200,
      newAccountPubkey: obligationId,
      programId: larix.LARIX_PROGRAM_ID,
      seed: larix.LARIX_MAIN_POOL_OBLIGATION_SEED,
      space: 1092,
    };

    let createAccountIx =
      anchor.web3.SystemProgram.createAccountWithSeed(config);

    const dataLayout = struct([u8("instruction")]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({ instruction: 6 }, data);
    const keys = [
      { pubkey: obligationId, isSigner: false, isWritable: true },
      {
        pubkey: larix.LARIX_MARKET_ID_MAIN_POOL,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    let initObligationIx = new anchor.web3.TransactionInstruction({
      keys,
      programId: larix.LARIX_PROGRAM_ID,
      data,
    });
    return [createAccountIx, initObligationIx];
  }

  private async _refreshObligationIxs(
    obligationInfo: larix.ObligationInfo
  ): Promise<anchor.web3.TransactionInstruction[]> {
    if (obligationInfo.obligationCollaterals.length == 0) {
      return [];
    }
    let accounts = [
      {
        pubkey: obligationInfo.obligationId,
        isSigner: false,
        isWritable: true,
      },
    ];
    let reserveKeys = [];
    let reserves = await larix.infos.getAllReserveWrappers(this._connection);
    let reservesMap = reserves.reduce(function (map, obj) {
      map[obj.reserveInfo.reserveId.toString()] = obj;
      return map;
    }, {}) as Map<string, larix.ReserveInfoWrapper>;

    obligationInfo.obligationCollaterals.forEach((collateral, index) => {
      let reserve = collateral.reserveId;
      let reserveInfo = reservesMap[
        collateral.reserveId.toString()
      ] as larix.ReserveInfoWrapper;
      accounts.push({
        pubkey: reserve,
        isSigner: false,
        isWritable: true,
      });
      reserveKeys.push({
        pubkey: reserve,
        isSigner: false,
        isWritable: true,
      });
      reserveKeys.push({
        pubkey: reserveInfo.reserveInfo.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      });
    });

    obligationInfo.obligationLoans.forEach((loan, index) => {
      let reserve = loan.reserveId;
      let reserveInfo = reservesMap[
        loan.reserveId.toString()
      ] as larix.ReserveInfoWrapper;
      accounts.push({
        pubkey: reserve,
        isSigner: false,
        isWritable: true,
      });
      reserveKeys.push({
        pubkey: reserve,
        isSigner: false,
        isWritable: true,
      });
      reserveKeys.push({
        pubkey: reserveInfo.reserveInfo.liquidity.larixOraclePubkey,
        isSigner: false,
        isWritable: false,
      });
    });

    let refreshObligationData = Buffer.from("07", "hex");
    let refreshObligationIx = new anchor.web3.TransactionInstruction({
      keys: accounts,
      programId: larix.LARIX_PROGRAM_ID,
      data: refreshObligationData,
    });
    let refreshReservesIx = this._refreshReservesIx(reserveKeys);
    // all reserves present in obligation account should be refreshed before refreshing obligation
    // otherwise the refresh will fail

    return [refreshReservesIx, refreshObligationIx];
  }
  private _createRefreshIxs(reserveInfo: larix.ReserveInfo) {
    let ixs: anchor.web3.TransactionInstruction[] = [];
    if (reserveInfo.oracleBridgeInfo) {
      ixs = [...ixs, this._refreshOracleBridgeIx(reserveInfo.oracleBridgeInfo)];
    }
    ixs = [
      ...ixs,
      this._refreshReservesIx([
        { pubkey: reserveInfo.reserveId, isSigner: false, isWritable: true },
        {
          pubkey: reserveInfo.liquidity.larixOraclePubkey,
          isSigner: false,
          isWritable: false,
        },
      ]),
    ];
    return ixs;
  }

  private _refreshReservesIx(
    reserveKeys: anchor.web3.AccountMeta[]
  ): anchor.web3.TransactionInstruction {
    let refreshReservesData = Buffer.from("18", "hex");
    let ix = new anchor.web3.TransactionInstruction({
      keys: reserveKeys,
      programId: larix.LARIX_PROGRAM_ID,
      data: refreshReservesData,
    });
    return ix;
  }

  private _refreshOracleBridgeIx(
    oracleBridgeInfo: larix.OracleBridgeInfo
  ): anchor.web3.TransactionInstruction {
    let refreshData = getAnchorInsByIdl("refresh");
    let keys = [
      {
        pubkey: oracleBridgeInfo.bridgePubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: oracleBridgeInfo.lpPriceAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: oracleBridgeInfo.ammId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.lpMint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.lpSupply,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.coinMintPrice,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.pcMintPrice,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.ammOpenOrders,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.ammCoinMintSupply,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.ammPcMintSupply,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: oracleBridgeInfo.farmLedger,
        isSigner: false,
        isWritable: false,
      },
    ];
    let ix = new anchor.web3.TransactionInstruction({
      keys: keys,
      programId: larix.LARIX_BRIDGE_PROGRAM_ID,
      data: refreshData,
    });
    return ix;
  }
}

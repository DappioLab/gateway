import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  ActionType,
  DepositParams,
  GatewayParams,
  IProtocolVault,
  PAYLOAD_SIZE,
  WithdrawParams,
} from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { IVaultInfo, friktion, utils } from "@dappio-wonderland/navigator";
import { getActivityIndex, getGatewayAuthority } from "../utils";
import { FRIKTION_ADAPTER_PROGRAM_ID } from "../ids";
import { struct, u64 } from "@project-serum/borsh";

export class ProtocolFriktion implements IProtocolVault {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}

  async initiateDeposit(
    params: DepositParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("depositAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        depositAmount: new anchor.BN(params.depositAmount),
      },
      payload
    );

    // Handle transaction here
    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.InitiateDeposit
    );
    const vaultDepositAmount = new anchor.BN(params.depositAmount);
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    let shareTokenAta = await getAssociatedTokenAddress(
      vault.vaultMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAssetAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: underlyingAssetAta,
          lamports: vaultDepositAmount.toNumber(),
        })
      );
      preInstructions.push(createSyncNativeInstruction(underlyingAssetAta));
      postInstructions.push(
        createCloseAccountInstruction(underlyingAssetAta, userKey, userKey)
      );
    }

    let userDepositorId = friktion.infos.getDepositorId(vault.vaultId, userKey);
    let remainingAccounts: anchor.web3.AccountMeta[] = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: vault.vaultMint, isSigner: false, isWritable: true }, //1
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //2
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //3
      {
        pubkey: vaultWrapper.getExtraVoltDataAddress(),
        isSigner: false,
        isWritable: true,
      }, //4
      { pubkey: vault.extraData.whitelist, isSigner: false, isWritable: true }, //5
      { pubkey: vault.depositPool, isSigner: false, isWritable: true }, //6
      { pubkey: vault.writerTokenPool, isSigner: false, isWritable: true }, //7
      {
        pubkey: shareTokenAta,
        isSigner: false,
        isWritable: true,
      }, //8
      { pubkey: underlyingAssetAta, isSigner: false, isWritable: true }, //9
      {
        pubkey: vaultWrapper.getRoundInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //10
      {
        pubkey: vaultWrapper.getRoundVoltTokensAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //11
      {
        pubkey: vaultWrapper.getRoundUnderlyingTokensAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //12
      { pubkey: userDepositorId, isSigner: false, isWritable: true }, //13
      {
        pubkey: vaultWrapper.getEpochInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //14

      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //15
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //16
    ];
    const depositTx = await this._gatewayProgram.methods
      .initiateDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [depositTx], input: payload };
  }

  async initiateWithdrawal(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("withdrawAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        withdrawAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );

    // Handle transaction here
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    let shareAta = await getAssociatedTokenAddress(vault.vaultMint, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    let userDepositorId = friktion.infos.getDepositorId(vault.vaultId, userKey);
    let userWithdrawerId = friktion.infos.getWithdrawerId(
      vault.vaultId,
      userKey
    );
    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(underlyingAta, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      {
        pubkey: vault.underlyingAssetMint,
        isSigner: false,
        isWritable: true,
      }, //1
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //2
      {
        pubkey: vault.extraData.extraDataId,
        isSigner: false,
        isWritable: true,
      }, //3
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //4
      {
        pubkey: vault.extraData.whitelist,
        isSigner: false,
        isWritable: true,
      }, //5
      { pubkey: vault.depositPool, isSigner: false, isWritable: true }, //6
      {
        pubkey: underlyingAta,
        isSigner: false,
        isWritable: true,
      }, //7
      { pubkey: shareAta, isSigner: false, isWritable: true }, //8
      {
        pubkey: vaultWrapper.getRoundInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //9
      {
        pubkey: vaultWrapper.getRoundUnderlyingTokensAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //10
      { pubkey: userWithdrawerId, isSigner: false, isWritable: true }, //11
      {
        pubkey: vaultWrapper.getEpochInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //12
      {
        pubkey: await vaultWrapper.getFeeAccount(),
        isSigner: false,
        isWritable: true,
      }, //13
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //14
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //15
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, //16
    ];

    const withdrawTx = await this._gatewayProgram.methods
      .initiateWithdrawal()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [withdrawTx], input: payload };
  }

  async finalizeDeposit(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("dummy1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        dummy1: new anchor.BN(1000),
      },
      payload
    );

    // Handle transaction here
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    let shareAta = await getAssociatedTokenAddress(vault.vaultMint, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    let userDepositorId = friktion.infos.getDepositorId(vault.vaultId, userKey);
    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(underlyingAta, userKey, userKey)
      );
    }
    let remainingAccounts = [];

    let depositorInfo = (await friktion.infos.getDepositor(
      this._connection,
      userDepositorId,
      userKey
    )) as friktion.DepositorInfo;
    remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //1
      {
        pubkey: vault.extraData.extraDataId,
        isSigner: false,
        isWritable: true,
      }, //2
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //3
      { pubkey: shareAta, isSigner: false, isWritable: true }, //4
      {
        pubkey: vaultWrapper.getRoundInfoAddress(depositorInfo.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //5
      {
        pubkey: vaultWrapper.getRoundVoltTokensAddress(
          depositorInfo.roundNumber
        ),
        isSigner: false,
        isWritable: true,
      }, //6
      { pubkey: userDepositorId, isSigner: false, isWritable: true }, //7
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //9
    ];

    const finalizeDepositTx = await this._gatewayProgram.methods
      .finalizeDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [finalizeDepositTx], input: payload };
  }

  async cancelDeposit(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("dummy1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        dummy1: new anchor.BN(2000),
      },
      payload
    );

    // Handle transaction here
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    let userDepositorId = friktion.infos.getDepositorId(vault.vaultId, userKey);

    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(underlyingAta, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //1
      {
        pubkey: vault.extraData.extraDataId,
        isSigner: false,
        isWritable: true,
      }, //2
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //3
      { pubkey: underlyingAta, isSigner: false, isWritable: true }, //4
      {
        pubkey: vaultWrapper.getRoundInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //5
      {
        pubkey: vaultWrapper.getRoundUnderlyingTokensAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //6
      { pubkey: userDepositorId, isSigner: false, isWritable: true }, //7
      {
        pubkey: vaultWrapper.getEpochInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //8
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //10
    ];

    const cancelDepositTx = await this._gatewayProgram.methods
      .cancelDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [cancelDepositTx], input: payload };
  }

  async finalizeWithdrawal(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("dummy1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        dummy1: new anchor.BN(3000),
      },
      payload
    );

    // Handle transaction here
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    let shareAta = await getAssociatedTokenAddress(vault.vaultMint, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    let userDepositorId = friktion.infos.getDepositorId(vault.vaultId, userKey);
    let userWithdrawerId = friktion.infos.getWithdrawerId(
      vault.vaultId,
      userKey
    );
    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(underlyingAta, userKey, userKey)
      );
    }
    let remainingAccounts = [];
    let withdrawInfo = (await friktion.infos.getWithdrawer(
      this._connection,
      userWithdrawerId,
      userKey
    )) as friktion.withdrawerInfo;
    remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //1
      {
        pubkey: vault.extraData.extraDataId,
        isSigner: false,
        isWritable: true,
      }, //2
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //3
      {
        pubkey: vault.underlyingAssetMint,
        isSigner: false,
        isWritable: true,
      }, //4
      { pubkey: underlyingAta, isSigner: false, isWritable: true }, //5
      {
        pubkey: vaultWrapper.getRoundInfoAddress(withdrawInfo.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //6
      { pubkey: userWithdrawerId, isSigner: false, isWritable: true }, //7
      {
        pubkey: vaultWrapper.getRoundUnderlyingTokensAddress(
          withdrawInfo.roundNumber
        ),
      }, //8
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //10
    ];

    const finalizeWithdrawalTx = await this._gatewayProgram.methods
      .finalizeWithdrawal()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [finalizeWithdrawalTx], input: payload };
  }

  async cancelWithdrawal(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([u64("dummy1")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        dummy1: new anchor.BN(4000),
      },
      payload
    );

    // Handle transaction here
    const vault = vaultInfo as friktion.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new friktion.VaultInfoWrapper(vault);
    let shareAta = await getAssociatedTokenAddress(vault.vaultMint, userKey);
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.vaultMint)
    );
    let underlyingAta = await getAssociatedTokenAddress(
      vault.underlyingAssetMint,
      userKey
    );
    preInstructions.push(
      await utils.createATAWithoutCheckIx(userKey, vault.underlyingAssetMint)
    );
    let userWithdrawerId = friktion.infos.getWithdrawerId(
      vault.vaultId,
      userKey
    );
    if (vault.underlyingAssetMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(underlyingAta, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: userKey, isSigner: true, isWritable: true }, //0
      {
        pubkey: vault.underlyingAssetMint,
        isSigner: false,
        isWritable: true,
      }, //1
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //2
      {
        pubkey: vault.extraData.extraDataId,
        isSigner: false,
        isWritable: true,
      }, //3
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //4
      { pubkey: shareAta, isSigner: false, isWritable: true }, //5
      {
        pubkey: vaultWrapper.getRoundInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //6
      { pubkey: userWithdrawerId, isSigner: false, isWritable: true }, //7
      {
        pubkey: vaultWrapper.getEpochInfoAddress(vault.roundNumber),
        isSigner: false,
        isWritable: true,
      }, //8
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //10
    ];

    const cancelWithdrawalTx = await this._gatewayProgram.methods
      .cancelWithdrawal()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: FRIKTION_ADAPTER_PROGRAM_ID,
        baseProgramId: friktion.VOLT_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [cancelWithdrawalTx], input: payload };
  }
}

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
import { IVaultInfo, katana } from "@dappio-wonderland/navigator";
import { struct, u64, u8 } from "@project-serum/borsh";
import {
  getActivityIndex,
  sigHash,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { KATANA_ADAPTER_PROGRAM_ID } from "../ids";

export class ProtocolKatana implements IProtocolVault {
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
    const vault = vaultInfo as katana.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new katana.VaultInfoWrapper(vault);
    let programId = vault.programId;
    const depositorKey = katana.infos.getDepositorId(
      vault.vaultId,
      userKey,
      programId
    );
    const depositTokenMint = vault.underlyingTokenMint;
    const shareTokenMint = vault.shareMint;
    const depositTokenAddress = await getAssociatedTokenAddress(
      depositTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, depositTokenMint)
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, shareTokenMint)
    );
    const indexSupply = this._gatewayParams.actionQueue.indexOf(
      ActionType.InitiateDeposit
    );

    const vaultDepositAmount = new anchor.BN(params.depositAmount);
    if (depositTokenMint.equals(NATIVE_MINT)) {
      preInstructions.push(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: userKey,
          toPubkey: depositTokenAddress,
          lamports: vaultDepositAmount.toNumber(),
        })
      );
      preInstructions.push(createSyncNativeInstruction(depositTokenAddress));
      postInstructions.push(
        createCloseAccountInstruction(depositTokenAddress, userKey, userKey)
      );
    }
    if (
      !(await katana.checkDepositorCreated(
        userKey,
        vault.vaultId,
        this._connection,
        vault.programId
      ))
    ) {
      preInstructions = [
        ...preInstructions,
        ...(await this._initDepositorIx(vault, userKey)),
      ];
    }
    let remainingAccounts = [
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //0
      {
        pubkey: vaultWrapper.getPricePerPage(),
        isSigner: false,
        isWritable: false,
      }, //1
      { pubkey: depositorKey, isSigner: false, isWritable: true }, //2
      { pubkey: depositTokenAddress, isSigner: false, isWritable: true }, //3
      { pubkey: depositTokenAddress, isSigner: false, isWritable: true }, //4
      { pubkey: vault.underlyingTokenVault, isSigner: false, isWritable: true }, //5
      { pubkey: vault.underlyingTokenMint, isSigner: false, isWritable: true }, //6
      { pubkey: userKey, isSigner: true, isWritable: true }, //7
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //8
    ];
    const depositTx = await this._gatewayProgram.methods
      .initiateDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: KATANA_ADAPTER_PROGRAM_ID,
        baseProgramId: programId,
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

    const inputLayout = struct([u64("shareAmount")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );
    // Handle transaction here
    const vault = vaultInfo as katana.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let programId = vault.programId;
    const depositorKey = katana.infos.getDepositorId(
      vault.vaultId,
      userKey,
      programId
    );
    let withdrawTokenMint = vault.underlyingTokenMint;
    let depositATA = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, withdrawTokenMint)
    );
    let shareTokenATA = await getAssociatedTokenAddress(
      vault.shareMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, vault.shareMint)
    );
    if (withdrawTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(depositATA, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //0
      { pubkey: depositorKey, isSigner: false, isWritable: true }, //1
      {
        pubkey: vault.underlyingTokenMint,
        isSigner: false,
        isWritable: false,
      }, //2
      {
        pubkey: vault.derivativeTokenMint,
        isSigner: false,
        isWritable: false,
      }, //3
      {
        pubkey: vault.derivativeTokenVault,
        isSigner: false,
        isWritable: true,
      }, //4
      { pubkey: shareTokenATA, isSigner: false, isWritable: true }, // 5
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //6
      { pubkey: userKey, isSigner: true, isWritable: true }, //7
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //8
    ];

    const initiateWithdrawTx = await this._gatewayProgram.methods
      .initiateWithdrawal()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: KATANA_ADAPTER_PROGRAM_ID,
        baseProgramId: programId,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [initiateWithdrawTx], input: payload };
  }

  async finalizeDeposit(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    const vault = vaultInfo as katana.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new katana.VaultInfoWrapper(vault);
    let programId = vault.programId;
    const depositorKey = katana.infos.getDepositorId(
      vault.vaultId,
      userKey,
      programId
    );
    let withdrawTokenMint = vault.underlyingTokenMint;
    let depositATA = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, withdrawTokenMint)
    );
    let shareTokenATA = await getAssociatedTokenAddress(
      vault.shareMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, vault.shareMint)
    );
    if (withdrawTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(depositATA, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //0
      {
        pubkey: vaultWrapper.getPricePerPage(),
        isSigner: false,
        isWritable: false,
      }, //1
      { pubkey: depositorKey, isSigner: false, isWritable: true }, //2
      {
        pubkey: vault.underlyingTokenMint,
        isSigner: false,
        isWritable: false,
      }, //3
      {
        pubkey: vault.derivativeTokenMint,
        isSigner: false,
        isWritable: false,
      }, //4
      {
        pubkey: vault.derivativeTokenVault,
        isSigner: false,
        isWritable: true,
      }, //5
      { pubkey: shareTokenATA, isSigner: false, isWritable: true }, //6
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //7
      { pubkey: userKey, isSigner: true, isWritable: true }, //8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //9
    ];

    const finalizeDepositTx = await this._gatewayProgram.methods
      .finalizeDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: KATANA_ADAPTER_PROGRAM_ID,
        baseProgramId: programId,
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

    const inputLayout = struct([u64("shareAmount")]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );
    // Handle transaction here
    const vault = vaultInfo as katana.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let programId = vault.programId;
    const depositorKey = katana.infos.getDepositorId(
      vault.vaultId,
      userKey,
      programId
    );
    let withdrawTokenMint = vault.underlyingTokenMint;
    let depositATA = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, withdrawTokenMint)
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, vault.shareMint)
    );
    if (withdrawTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(depositATA, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //0
      { pubkey: depositorKey, isSigner: false, isWritable: true }, //1
      {
        pubkey: vault.underlyingTokenMint,
        isSigner: false,
        isWritable: false,
      }, //2
      {
        pubkey: vault.underlyingTokenVault,
        isSigner: false,
        isWritable: true,
      }, //3
      { pubkey: depositATA, isSigner: false, isWritable: true }, //4
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //5
      { pubkey: userKey, isSigner: true, isWritable: true }, //6
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //7
    ];

    const cancelDepositTx = await this._gatewayProgram.methods
      .cancelDeposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: KATANA_ADAPTER_PROGRAM_ID,
        baseProgramId: programId,
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

    const inputLayout = struct([]);

    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode({}, payload);
    // Handle transaction here
    const vault = vaultInfo as katana.VaultInfo;
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let vaultWrapper = new katana.VaultInfoWrapper(vault);
    let programId = vault.programId;
    const depositorKey = katana.infos.getDepositorId(
      vault.vaultId,
      userKey,
      programId
    );
    let withdrawTokenMint = vault.underlyingTokenMint;
    let depositATA = await getAssociatedTokenAddress(
      withdrawTokenMint,
      userKey
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, withdrawTokenMint)
    );
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, vault.shareMint)
    );
    if (withdrawTokenMint.equals(NATIVE_MINT)) {
      postInstructions.push(
        createCloseAccountInstruction(depositATA, userKey, userKey)
      );
    }
    let remainingAccounts = [
      { pubkey: vault.vaultId, isSigner: false, isWritable: true }, //0
      {
        pubkey: vaultWrapper.getPricePerPage(),
        isSigner: false,
        isWritable: false,
      }, //1
      { pubkey: depositorKey, isSigner: false, isWritable: true }, //2
      {
        pubkey: vault.underlyingTokenMint,
        isSigner: false,
        isWritable: false,
      }, //3
      {
        pubkey: vault.derivativeTokenMint,
        isSigner: false,
        isWritable: true,
      }, //4
      {
        pubkey: vault.underlyingTokenVault,
        isSigner: false,
        isWritable: true,
      }, //5
      {
        pubkey: vault.derivativeTokenVault,
        isSigner: false,
        isWritable: true,
      }, //6
      { pubkey: depositATA, isSigner: false, isWritable: true }, //7
      { pubkey: vault.vaultAuthority, isSigner: false, isWritable: true }, //8
      { pubkey: userKey, isSigner: true, isWritable: true }, //9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //10
    ];

    const finalizeWithdrawalTx = await this._gatewayProgram.methods
      .finalizeWithdrawal()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: KATANA_ADAPTER_PROGRAM_ID,
        baseProgramId: programId,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [finalizeWithdrawalTx], input: payload };
  }

  private async _initDepositorIx(
    vault: katana.VaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<anchor.web3.TransactionInstruction[]> {
    let userVault = katana.infos.getDepositorIdWithBump(
      vault.vaultId,
      userKey,
      vault.programId
    );
    const dataLayout = struct([u8("bump")]);
    let data = Buffer.alloc(9);
    let datahex = userVault.bump.toString(16);
    let initData = sigHash("global", "create_user_account");
    let datastring = initData.concat(datahex);
    data = Buffer.from(datastring, "hex");

    let keys = [
      { pubkey: userVault.pda, isSigner: false, isWritable: true },
      { pubkey: vault.vaultId, isSigner: false, isWritable: true },
      { pubkey: userKey, isSigner: false, isWritable: false },
      { pubkey: userKey, isSigner: true, isWritable: true },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];
    return [
      new anchor.web3.TransactionInstruction({
        keys,
        programId: vault.programId,
        data,
      }),
    ];
  }
}

import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { ActionType, DepositParams, GatewayParams, IProtocolVault, PAYLOAD_SIZE, WithdrawParams } from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { IVaultInfo, marinade, utils } from "@dappio-wonderland/navigator";
import { getActivityIndex, getGatewayAuthority } from "../utils";
import { AdapterMarinadeIDL } from "@dappio-wonderland/adapter-idls";
import { struct, u64 } from "@project-serum/borsh";
import { MARINADE_ADAPTER_PROGRAM_ID } from "../ids";

export class ProtocolMarinade implements IProtocolVault {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}
  async deposit(
    params: DepositParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    let marinadeProgram = new anchor.Program(
      AdapterMarinadeIDL,
      MARINADE_ADAPTER_PROGRAM_ID,
      this._gatewayProgram.provider
    );
    const vault = vaultInfo as marinade.VaultInfo;
    const inputLayout = struct([u64("depositAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        depositAmount: new anchor.BN(params.depositAmount),
      },
      payload
    );
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let shareTokenAta = await getAssociatedTokenAddress(vault.msolMint, userKey);
    preInstructions.push(await utils.createATAWithoutCheckIx(userKey, vault.msolMint));

    let remainingAccounts: anchor.web3.AccountMeta[] = [
      { pubkey: marinade.MARINADE_STATE_ADDRESS, isSigner: false, isWritable: true }, //0
      { pubkey: vault.msolMint, isSigner: false, isWritable: true }, //1
      { pubkey: marinade.MARINADE_SOL_LEG_ADDRESS, isSigner: false, isWritable: true }, //2
      { pubkey: marinade.MARINADE_MSOL_LEG_ADDRESS, isSigner: false, isWritable: true }, //3
      { pubkey: marinade.MARINADE_MSOL_LEG_AUTHORITY_ADDRESS, isSigner: false, isWritable: false }, //4
      { pubkey: marinade.MARINADE_RESERVE_ADDRESS, isSigner: false, isWritable: true }, //5
      { pubkey: userKey, isSigner: true, isWritable: true }, //6
      { pubkey: shareTokenAta, isSigner: false, isWritable: true }, //7
      { pubkey: marinade.MARINADE_MSOL_MINT_AUTHORITY, isSigner: false, isWritable: true }, //8
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //9
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //10
    ];
    const depositTx = await marinadeProgram.methods
      .deposit(payload)
      .accounts({ baseProgramId: marinade.MARINADE_FINANCE_PROGRAM_ID, gatewayAuthority: userKey })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return { txs: [depositTx], input: payload };
  }
  async withdraw(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    let marinadeProgram = new anchor.Program(
      AdapterMarinadeIDL,
      MARINADE_ADAPTER_PROGRAM_ID,
      this._gatewayProgram.provider
    );
    const vault = vaultInfo as marinade.VaultInfo;
    const inputLayout = struct([u64("shareAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    let shareTokenAta = await getAssociatedTokenAddress(vault.msolMint, userKey);
    preInstructions.push(await utils.createATAWithoutCheckIx(userKey, vault.msolMint));
    console.log(shareTokenAta.toString());
    let remainingAccounts: anchor.web3.AccountMeta[] = [
      { pubkey: marinade.MARINADE_STATE_ADDRESS, isSigner: false, isWritable: true }, //0
      { pubkey: vault.msolMint, isSigner: false, isWritable: true }, //1
      { pubkey: marinade.MARINADE_SOL_LEG_ADDRESS, isSigner: false, isWritable: true }, //2
      { pubkey: marinade.MARINADE_MSOL_LEG_ADDRESS, isSigner: false, isWritable: true }, //3
      { pubkey: vault.treasuryMsolAccount, isSigner: false, isWritable: true }, //4
      { pubkey: shareTokenAta, isSigner: false, isWritable: true }, //5
      { pubkey: userKey, isSigner: true, isWritable: true }, //6
      { pubkey: userKey, isSigner: true, isWritable: true }, //7
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, //8
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //9
    ];
    const withdrawTx = await marinadeProgram.methods
      .withdraw(payload)
      .accounts({ baseProgramId: marinade.MARINADE_FINANCE_PROGRAM_ID, gatewayAuthority: userKey })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return { txs: [withdrawTx], input: payload };
  }
  async initiateWithdrawal(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    let slot = await this._connection.getSlot();
    let seed = "marinade " + slot.toString();
    let ticketAddress = await anchor.web3.PublicKey.createWithSeed(userKey, seed, marinade.MARINADE_FINANCE_PROGRAM_ID);
    let createAccountFromSeedIx = anchor.web3.SystemProgram.createAccountWithSeed({
      fromPubkey: userKey,
      seed: seed,
      space: marinade.MARINADE_FINANCE_ACCOUNT_TICKET_ACCOUNT_DATA.span,
      newAccountPubkey: ticketAddress,
      basePubkey: userKey,
      lamports: 1503360,
      programId: marinade.MARINADE_FINANCE_PROGRAM_ID,
    });
    let marinadeProgram = new anchor.Program(
      AdapterMarinadeIDL,
      MARINADE_ADAPTER_PROGRAM_ID,
      this._gatewayProgram.provider
    );
    const vault = vaultInfo as marinade.VaultInfo;
    const inputLayout = struct([u64("shareAmount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        shareAmount: new anchor.BN(params.withdrawAmount),
      },
      payload
    );
    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];
    preInstructions.push(createAccountFromSeedIx);
    let shareTokenAta = await getAssociatedTokenAddress(vault.msolMint, userKey);
    preInstructions.push(await utils.createATAWithoutCheckIx(userKey, vault.msolMint));

    let remainingAccounts: anchor.web3.AccountMeta[] = [
      { pubkey: marinade.MARINADE_STATE_ADDRESS, isSigner: false, isWritable: true }, //0
      { pubkey: vault.msolMint, isSigner: false, isWritable: true }, //1
      { pubkey: shareTokenAta, isSigner: false, isWritable: true }, //2
      { pubkey: userKey, isSigner: true, isWritable: false }, //3
      { pubkey: ticketAddress, isSigner: false, isWritable: true }, //4
      { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, //5
      { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, //6
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, //7
    ];
    const initWithdrawTx = await marinadeProgram.methods
      .initiateWithdrawal(payload)
      .accounts({ baseProgramId: marinade.MARINADE_FINANCE_PROGRAM_ID, gatewayAuthority: userKey })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return { txs: [initWithdrawTx], input: payload };
  }
  async finalizeWithdrawal(
    params: WithdrawParams,
    vaultInfo: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    let ticketAddress = params.withdrawer;

    let marinadeProgram = new anchor.Program(
      AdapterMarinadeIDL,
      MARINADE_ADAPTER_PROGRAM_ID,
      this._gatewayProgram.provider
    );

    let payload = Buffer.alloc(PAYLOAD_SIZE);

    let preInstructions = [] as anchor.web3.TransactionInstruction[];
    let postInstructions = [] as anchor.web3.TransactionInstruction[];

    let remainingAccounts: anchor.web3.AccountMeta[] = [
      { pubkey: marinade.MARINADE_STATE_ADDRESS, isSigner: false, isWritable: true }, //0
      { pubkey: marinade.MARINADE_RESERVE_ADDRESS, isSigner: false, isWritable: true }, //1
      { pubkey: ticketAddress, isSigner: false, isWritable: true }, //2
      { pubkey: params.userKey, isSigner: false, isWritable: true }, //3
      { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, //4
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, //5
    ];
    const finalizeWithdrawTx = await marinadeProgram.methods
      .finalizeWithdrawal(payload)
      .accounts({ baseProgramId: marinade.MARINADE_FINANCE_PROGRAM_ID, gatewayAuthority: userKey })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
    return { txs: [finalizeWithdrawTx], input: payload };
  }
}

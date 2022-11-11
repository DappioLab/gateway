import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  DepositParams,
  GatewayParams,
  IProtocolVault,
  PAYLOAD_SIZE,
  WithdrawParams,
} from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { IVaultInfo, lido } from "@dappio-wonderland/navigator";
import { struct, nu64, u8, u32 } from "buffer-layout";
import {
  getActivityIndex,
  sigHash,
  createATAWithoutCheckIx,
  getGatewayAuthority,
} from "../utils";
import { LIDO_ADAPTER_PROGRAM_ID } from "../ids";

export class ProtocolLido implements IProtocolVault {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}
  async deposit(params: DepositParams, vault: IVaultInfo, userKey: anchor.web3.PublicKey): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer; }> {
    // Handle payload input here
    const inputLayout = struct([u8('instruction'), nu64('amount')]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        instruction: 1,
        amount: new anchor.BN(params.depositAmount),
      },
      payload
    );

    // Handle transaction here
    const vaultInfo = vault as lido.VaultInfo;

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    // TODO: Maybe better to do in navigator?
    const bufferArray = [
      lido.LIDO_ADDRESS.toBuffer(),
      Buffer.from('reserve_account'),
    ];
    const [reserveAccount] = await anchor.web3.PublicKey.findProgramAddress(bufferArray, lido.LIDO_PROGRAM_ID);
    const bufferArrayMint = [
      lido.LIDO_ADDRESS.toBuffer(),
      Buffer.from('mint_authority'),
    ];
    const [mintAuthority] = await anchor.web3.PublicKey.findProgramAddress(bufferArrayMint, lido.LIDO_PROGRAM_ID);
  
    const recipientStSolAddress = await getAssociatedTokenAddress(vault.shareMint, userKey);
    
    preInstructions.push(
      await createATAWithoutCheckIx(userKey, vault.shareMint)
    );

    const remainingAccounts = [
      { pubkey: lido.LIDO_ADDRESS, isSigner: false, isWritable: true }, // 0
      { pubkey: userKey, isSigner: true, isWritable: true }, // 1 wallet.publicKey
      { pubkey: recipientStSolAddress, isSigner: false, isWritable: true }, // 2
      { pubkey: vault.shareMint, isSigner: false, isWritable: true }, // 3
      { pubkey: reserveAccount, isSigner: false, isWritable: true }, // 4
      { pubkey: mintAuthority, isSigner: false, isWritable: false }, // 5
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 6
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, // 7
    ];
    const txDeposit = await this._gatewayProgram.methods
      .deposit()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LIDO_ADAPTER_PROGRAM_ID,
        baseProgramId: lido.LIDO_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .preInstructions(preInstructions)
      .remainingAccounts(remainingAccounts)
      .transaction();
  
    return { txs: [txDeposit], input: payload };
  }
}
import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token-v2";
import { DepositParams, GatewayParams, IProtocolVault, PAYLOAD_SIZE, WithdrawParams } from "../types";
import { Gateway } from "@dappio-wonderland/gateway-idls";
import { IVaultInfo, lido } from "@dappio-wonderland/navigator";
import { struct, nu64, u8, u32 } from "buffer-layout";
import { getActivityIndex, sigHash, createATAWithoutCheckIx, getGatewayAuthority } from "../utils";
import { LIDO_ADAPTER_PROGRAM_ID } from "../ids";

export class ProtocolLido implements IProtocolVault {
  constructor(
    private _connection: anchor.web3.Connection,
    private _gatewayProgram: anchor.Program<Gateway>,
    private _gatewayStateKey: anchor.web3.PublicKey,
    private _gatewayParams: GatewayParams
  ) {}
  async deposit(
    params: DepositParams,
    vault: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([nu64("amount")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);
    inputLayout.encode(
      {
        amount: new anchor.BN(params.depositAmount),
      },
      payload
    );

    // Handle transaction here

    let preInstructions = [] as anchor.web3.TransactionInstruction[];

    // Maybe better to do in navigator?
    const bufferArray = [lido.LIDO_ADDRESS.toBuffer(), Buffer.from("reserve_account")];
    const [reserveAccount] = anchor.web3.PublicKey.findProgramAddressSync(bufferArray, lido.LIDO_PROGRAM_ID);
    const bufferArrayMint = [lido.LIDO_ADDRESS.toBuffer(), Buffer.from("mint_authority")];
    const [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(bufferArrayMint, lido.LIDO_PROGRAM_ID);

    const recipientStSolAddress = await getAssociatedTokenAddress(vault.shareMint, userKey);

    // TVerify if this requires a check here
    preInstructions.push(await createATAWithoutCheckIx(userKey, vault.shareMint));

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

  async withdraw(
    params: WithdrawParams,
    vault: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ): Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }> {
    // Handle payload input here
    const inputLayout = struct([nu64("amount"), u32("validatorIndex")]);
    let payload = Buffer.alloc(PAYLOAD_SIZE);

    const vaultInfo = vault as lido.VaultInfo;
    const vaultInfoWrapper = new lido.VaultInfoWrapper(vaultInfo);

    const heaviestValidator = vaultInfoWrapper.getHeaviestValidator();

    // Not required in case of v1
    const heaviestValidatorIndex = vaultInfo.validators.entries.findIndex((value) =>
      value.pubkey.equals(heaviestValidator.pubkey)
    );

    inputLayout.encode(
      {
        amount: new anchor.BN(params.withdrawAmount),
        // Set validator index. Only used in v2
        validatorIndex: heaviestValidatorIndex,
      },
      payload
    );

    // Account to temporarily hold stSOL in
    const receivingAccount = anchor.web3.Keypair.generate();

    const senderStSolAddress = await getAssociatedTokenAddress(vault.shareMint, userKey);

    const bufferArrayStake = [lido.LIDO_ADDRESS.toBuffer(), Buffer.from("stake_authority")];
    const [stakeAuthority] = anchor.web3.PublicKey.findProgramAddressSync(bufferArrayStake, lido.LIDO_PROGRAM_ID);

    const validatorStakeSeeds = [
      lido.LIDO_ADDRESS.toBuffer(),
      heaviestValidator.pubkey.toBuffer(),
      Buffer.from("validator_stake_account"),
      Buffer.from(heaviestValidator.entry.stakeSeeds.begin.toArray("le", 8)),
    ];

    const [validatorStakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      validatorStakeSeeds,
      lido.LIDO_PROGRAM_ID
    );

    // Set up accounts
    let remainingAccounts: anchor.web3.AccountMeta[];

    if (vaultInfo.lidoVersion.toNumber() == 2) {
      remainingAccounts = [
        { pubkey: lido.LIDO_ADDRESS, isSigner: false, isWritable: true }, // 1
        { pubkey: userKey, isSigner: true, isWritable: false }, // 2
        { pubkey: senderStSolAddress, isSigner: false, isWritable: true }, // 3
        { pubkey: vault.shareMint, isSigner: false, isWritable: true }, // 4
        { pubkey: heaviestValidator.pubkey, isSigner: false, isWritable: false }, // 5
        { pubkey: validatorStakeAccount, isSigner: false, isWritable: true }, // 6
        { pubkey: receivingAccount.publicKey, isSigner: true, isWritable: true }, // 7
        { pubkey: stakeAuthority, isSigner: false, isWritable: false }, // 8
        { pubkey: vaultInfo.validatorList, isSigner: false, isWritable: true }, // 9
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 10
        { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // 11
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, // 12
        { pubkey: anchor.web3.StakeProgram.programId, isSigner: false, isWritable: false }, // 13
      ];
    } else {
      remainingAccounts = [
        { pubkey: lido.LIDO_ADDRESS, isSigner: false, isWritable: true }, // 1
        { pubkey: userKey, isSigner: true, isWritable: false }, // 2
        { pubkey: senderStSolAddress, isSigner: false, isWritable: true }, // 3
        { pubkey: vault.shareMint, isSigner: false, isWritable: true }, // 4
        { pubkey: heaviestValidator.pubkey, isSigner: false, isWritable: false }, // 5
        { pubkey: validatorStakeAccount, isSigner: false, isWritable: true }, // 6
        { pubkey: receivingAccount.publicKey, isSigner: true, isWritable: true }, // 7
        { pubkey: stakeAuthority, isSigner: false, isWritable: false }, // 8
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
        { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // 10
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false }, // 11
        { pubkey: anchor.web3.StakeProgram.programId, isSigner: false, isWritable: false }, // 12
      ];
    }

    // Handle transaction here
    const txWithdraw = await this._gatewayProgram.methods
      .withdraw()
      .accounts({
        gatewayState: this._gatewayStateKey,
        adapterProgramId: LIDO_ADAPTER_PROGRAM_ID,
        baseProgramId: lido.LIDO_PROGRAM_ID,
        activityIndex: await getActivityIndex(userKey),
        gatewayAuthority: getGatewayAuthority(),
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return { txs: [txWithdraw], input: payload };
  }
}

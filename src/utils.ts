import * as anchor from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import { GATEWAY_PROGRAM_ID } from "./ids";
import { hash } from "@project-serum/anchor/dist/cjs/utils/sha256";
import { ActionType } from "./types";
import * as sha256 from "js-sha256";

export async function createATAWithoutCheckIx(
  wallet: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  payer?: anchor.web3.PublicKey
) {
  if (payer == undefined) {
    payer = wallet;
  }
  let ATA = await getAssociatedTokenAddress(mint, wallet, true);
  const programId = new anchor.web3.PublicKey(
    "9tiP8yZcekzfGzSBmp7n9LaDHRjxP2w7wJj8tpPJtfG"
  );
  let keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ATA, isSigner: false, isWritable: true },
    { pubkey: wallet, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    {
      pubkey: anchor.web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new anchor.web3.TransactionInstruction({
    keys,
    programId: programId,
  });
}

export function getAnchorInsByIdl(name: string): Buffer {
  const SIGHASH_GLOBAL_NAMESPACE = "global";
  const preimage = `${SIGHASH_GLOBAL_NAMESPACE}:${name}`;
  const hash = sha256.sha256.digest(preimage);
  const data = Buffer.from(hash).slice(0, 8);
  return data;
}

export async function getActivityIndex(wallet: anchor.web3.PublicKey) {
  const [index, _] = await anchor.web3.PublicKey.findProgramAddress(
    [wallet.toBuffer()],
    GATEWAY_PROGRAM_ID
  );
  return index;
}

export function getActionName(hexString: string) {
  // TODO: Remove the hard-coded function name of gatewayUtils
  const gatewayUtils = ["initialize", "close"];
  const actionTypes = Object.keys(ActionType)
    .filter((key) => !(parseInt(key) >= 0))
    .map((key) =>
      key
        .split(/(?=[A-Z])/)
        .join("_")
        .toLowerCase()
    );
  const actions = [...gatewayUtils, ...actionTypes];

  let allActionsHex = new Map();
  actions.map((action, index) => {
    return allActionsHex.set(
      hash(`global:${action}`).slice(0, 16),
      actions[index]
    );
  });

  return allActionsHex.get(hexString);
}

export function sigHash(namespace: string, name: string): string {
  const preImage = namespace.concat(":").concat(name);
  const result = hash(preImage).slice(0, 16);
  return result;
}

export function getGatewayAuthority(): anchor.web3.PublicKey {
  const [gatewayAuthority, _gatewayAuthorityBump] =
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("gateway_authority", "utf-8")],
      GATEWAY_PROGRAM_ID
    );

  // Notice:
  // By given GATEWAY_PROGRAM_ID = "GATEp6AEtXtwHABNWHKH9qeh3uJDZtZJ7YBNYzHsX3FS" and seed = "gateway_authority",
  // the vaule of gatewayAuthorityBump is 254.
  // It will be hard-coded in gateway program for better efficiency.

  return gatewayAuthority;
}

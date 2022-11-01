import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, NATIVE_MINT } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  DepositParams,
  WithdrawParams,
} from "../src";
import { katana, utils } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  const connection = new Connection(
    "https://rpc-mainnet-fork.epochs.studio/notcache",
    {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 180 * 1000,
      wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
    }
  );
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  const depositAmount = 200;
  anchor.setProvider(provider);
  it("deposit", async () => {
    const gateway = new GatewayBuilder(provider);
    let katanaVaults = (await katana.infos.getAllVaults(
      connection
    )) as katana.VaultInfo[];
    for (let vault of katanaVaults) {
      if (vault.underlyingTokenMint.equals(NATIVE_MINT)) {
        let depositParams: DepositParams = {
          protocol: SupportedProtocols.Katana,
          vaultId: vault.vaultId,
          depositAmount: depositAmount,
        };
        await gateway.initiateDeposit(depositParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(
        tx,
        connection,
        [wallet.payer],
        true
      );
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("instant Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let katanaVaults = (await katana.infos.getAllVaults(
      connection
    )) as katana.VaultInfo[];
    for (let vault of katanaVaults) {
      if (vault.underlyingTokenMint.equals(NATIVE_MINT)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Katana,
          vaultId: vault.vaultId,
          withdrawAmount: depositAmount,
        };
        await gateway.cancelDeposit(withdrawParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(
        tx,
        connection,
        [wallet.payer],
        false
      );
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Withdraw Share", async () => {
    const gateway = new GatewayBuilder(provider);
    let katanaVaults = (await katana.infos.getAllVaults(
      connection
    )) as katana.VaultInfo[];
    for (let vault of katanaVaults) {
      if (vault.underlyingTokenMint.equals(NATIVE_MINT)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Katana,
          vaultId: vault.vaultId,
          withdrawAmount: depositAmount,
        };
        await gateway.finalizeDeposit(withdrawParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(
        tx,
        connection,
        [wallet.payer],
        true
      );
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Initiate Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let katanaVaults = (await katana.infos.getAllVaults(
      connection
    )) as katana.VaultInfo[];
    for (let vault of katanaVaults) {
      if (vault.underlyingTokenMint.equals(NATIVE_MINT)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Katana,
          vaultId: vault.vaultId,
          withdrawAmount: depositAmount,
        };
        await gateway.initiateWithdrawal(withdrawParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(
        tx,
        connection,
        [wallet.payer],
        true
      );
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Complete Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let katanaVaults = (await katana.infos.getAllVaults(
      connection
    )) as katana.VaultInfo[];
    for (let vault of katanaVaults) {
      if (vault.underlyingTokenMint.equals(NATIVE_MINT)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Katana,
          vaultId: vault.vaultId,
          withdrawAmount: depositAmount,
        };
        await gateway.finalizeWithdrawal(withdrawParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(
        tx,
        connection,
        [wallet.payer],
        true
      );
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
});

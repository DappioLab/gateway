import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount } from "@solana/spl-token-v2";
import { GatewayBuilder, SupportedProtocols, DepositParams, WithdrawParams } from "../src";
import { friktion, utils } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 180 * 1000,
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  const depositMint = new PublicKey("CbPemKEEe7Y7YgBmYtFaZiECrVTP5sGrYzrrrviSewKY");
  const depositAmount = 200;
  anchor.setProvider(provider);
  it("Initiate deposit", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let depositParams: DepositParams = {
          protocol: SupportedProtocols.Friktion,
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Cancel Deposit", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Friktion,
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("FinalizeDeposit", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Friktion,
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], true);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Initiate Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Friktion,
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Complete Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Friktion,
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("Cancel Withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let friktionVaults = (await friktion.infos.getAllVaults(connection)) as friktion.VaultInfo[];
    for (let vault of friktionVaults) {
      if (vault.vaultId.equals(depositMint)) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Friktion,
          vaultId: vault.vaultId,
          withdrawAmount: depositAmount,
        };
        await gateway.cancelWithdrawal(withdrawParams);
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
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
});

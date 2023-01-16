import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount } from "@solana/spl-token-v2";
import { GatewayBuilder, SupportedProtocols, DepositParams, WithdrawParams } from "../src";
import { marinade, utils } from "@dappio-wonderland/navigator";
import { ProtocolMarinade } from "../src/protocols/marinade";
import { signAndSend } from "@dappio-wonderland/utils";
describe("Gateway", () => {
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio/notcache", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 180 * 1000,
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  const depositAmount = 200;
  anchor.setProvider(provider);
  it(" deposit", async () => {
    const gateway = new GatewayBuilder(provider);
    let marinadeVaults = (await marinade.infos.getAllVaults(connection)) as marinade.VaultInfo[];
    let depositParams: DepositParams = {
      protocol: SupportedProtocols.Marinade,
      vaultId: marinadeVaults[0].vaultId,
      depositAmount: depositAmount,
    };
    await gateway.deposit(depositParams);
    const txs = gateway.transactions();
    console.log(txs.length);
    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      console.log(tx);
      const sig2 = await signAndSend(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it(" withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let marinadeVaults = (await marinade.infos.getAllVaults(connection)) as marinade.VaultInfo[];
    let withdrawParams: WithdrawParams = {
      protocol: SupportedProtocols.Marinade,
      vaultId: marinadeVaults[0].vaultId,
      withdrawAmount: depositAmount / 2,
    };
    await gateway.withdraw(withdrawParams);
    const txs = gateway.transactions();
    console.log(txs.length);
    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);

      const sig2 = await signAndSend(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("init withdraw", async () => {
    const gateway = new GatewayBuilder(provider);
    let marinadeVaults = (await marinade.infos.getAllVaults(connection)) as marinade.VaultInfo[];
    let withdrawParams: WithdrawParams = {
      protocol: SupportedProtocols.Marinade,
      vaultId: marinadeVaults[0].vaultId,
      withdrawAmount: depositAmount / 3,
    };
    await gateway.initiateWithdrawal(withdrawParams);
    const txs = gateway.transactions();
    console.log(txs.length);
    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);

      const sig2 = await signAndSend(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("finalize withdraw", async () => {
    const gateway = new GatewayBuilder(provider);

    let marinadeVaults = (await marinade.infos.getAllVaults(connection)) as marinade.VaultInfo[];
    let withdrawers = (await marinade.infos.getAllWithdrawers!(
      connection,
      wallet.publicKey
    )) as marinade.WithdrawerInfo[];
    let currentEpoch = await (await connection.getEpochInfo()).epoch;
    for (let withdrawer of withdrawers) {
      if (withdrawer.epochCreated.toNumber() < currentEpoch) {
        let withdrawParams: WithdrawParams = {
          protocol: SupportedProtocols.Marinade,
          vaultId: marinadeVaults[0].vaultId,
          withdrawAmount: depositAmount / 3,
          withdrawer: withdrawer.withdrawerId,
          userKey: withdrawer.userKey,
        };
        await gateway.finalizeWithdrawal(withdrawParams);
      }
    }

    const txs = gateway.transactions();
    console.log(txs.length);
    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);

      const sig2 = await signAndSend(tx as anchor.web3.Transaction, connection, [wallet.payer], true);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
});

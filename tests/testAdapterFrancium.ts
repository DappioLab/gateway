import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, NATIVE_MINT } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  SupplyParams,
  UnsupplyParams,
  BorrowParams,
  RepayParams,
  StakeParams,
  UnstakeParams,
} from "../src";
import { utils, francium } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
  //   commitment,
  //   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
  // });
  // const connection = new Connection("https://solana-api.tt-prod.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https://ssc-dao.genesysgo.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https:////api.mainnet-beta.solana.com", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 180 * 1000,
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const supplyAmount = 2000000;

  it("supply + stake", async () => {
    const gateway = new GatewayBuilder(provider);
    let allFranciumLending: francium.ReserveInfoWrapper[] = [];
    let allFranciumReward = (await francium.infos.getAllFarms(connection)) as francium.FarmInfo[];
    let allFranciumUserReward: francium.FarmerInfo[];
    allFranciumLending = (await francium.infos.getAllReserveWrappers(connection)) as francium.ReserveInfoWrapper[];

    for (let reserves of allFranciumLending) {
      if (reserves.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: SupplyParams = {
          protocol: SupportedProtocols.Francium,
          reserveId: reserves.reserveInfo.reserveId,
          supplyAmount: supplyAmount,
        };
        for (let farm of allFranciumReward) {
          if (farm.stakedTokenMint.equals(reserves.reserveTokenMint())) {
            let stakeParams: StakeParams = {
              protocol: SupportedProtocols.Francium,
              farmId: farm.farmId,
            };
            await gateway.stake(stakeParams);
            console.log(farm.farmId.toString());
          }
        }
        await gateway.supply(supplyPram);
        console.log(reserves.reserveInfo.reserveId.toString());
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
      const sig2 = await utils.signAndSendAll(tx, connection, [wallet.payer], true);
      console.log("https://mf.wei1769.com/tx/" + sig2);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("unstake + unsupply", async () => {
    const gateway = new GatewayBuilder(provider);
    let allFranciumLending: francium.ReserveInfoWrapper[] = [];
    let allFranciumReward = (await francium.infos.getAllFarms(connection)) as francium.FarmInfo[];
    let allFranciumUserReward: francium.FarmerInfo[];
    allFranciumLending = (await francium.infos.getAllReserveWrappers(connection)) as francium.ReserveInfoWrapper[];

    for (let reserves of allFranciumLending) {
      if (reserves.supplyTokenMint().equals(NATIVE_MINT)) {
        for (let farm of allFranciumReward) {
          let farmInfo = farm.stakedTokenMint.equals(reserves.reserveTokenMint()) ? farm : undefined;
          if (farmInfo) {
            let unstakePram: UnstakeParams = {
              protocol: SupportedProtocols.Francium,
              farmId: farm.farmId,
              shareAmount: 10,
            };
            await gateway.unstake(unstakePram);
          }
        }
        let unsupplyPram: UnsupplyParams = {
          protocol: SupportedProtocols.Francium,
          reserveId: reserves.reserveInfo.reserveId,
          reservedAmount: 10,
        };

        await gateway.unsupply(unsupplyPram);
      }
    }
    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx, connection, [wallet.payer], true);
      console.log("https://mf.wei1769.com/tx/" + sig2);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});

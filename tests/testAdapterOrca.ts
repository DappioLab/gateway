import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { burn, getAccount, NATIVE_MINT } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  AddLiquidityParams,
  RemoveLiquidityParams,
  StakeParams,
  UnstakeParams,
  HarvestParams,
  GATEWAY_PROGRAM_ID,
} from "../src";
import { orca } from "@dappio-wonderland/navigator";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { signAndSend } from "@dappio-wonderland/utils";

describe("Gateway", () => {
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
  // const connection = new Connection("https://cache-rpc.dappio.xyz/", {
  //   wsEndpoint: "wss://solana-mainnet.g.alchemy.com/v2/sdRMC54L53Y2D_jEbot-eEz18jThvzMa",
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 100000000,
  // });
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  it("add and stake", async () => {
    const orcaPools = (await orca.infos.getAllPools(connection)) as orca.PoolInfo[];
    const orcaFarms = (await orca.infos.getAllFarms(connection)) as orca.FarmInfo[];
    orcaPools.sort((a, b) => Number((b.lpSupply as bigint) - (a.lpSupply as bigint)));
    for (let pool of orcaPools) {
      for (let farm of orcaFarms) {
        if (
          pool.poolId.toString() == "71zvJycCiY2JRRwKr27oiu48mFzrstCoP6riGEyCyEB2" &&
          farm.baseTokenMint.equals(pool.lpMint)
        ) {
          const gateway = new GatewayBuilder(provider);
          let addLiquidityParams: AddLiquidityParams = {
            protocol: SupportedProtocols.Orca,
            poolId: pool.poolId,
            tokenInAmount: 100000,
            tokenMint: pool.tokenBMint,
          };
          let stakeParams: StakeParams = {
            protocol: SupportedProtocols.Orca,
            farmId: farm.farmId,
          };
          await gateway.addLiquidity(addLiquidityParams);
          await gateway.stake(stakeParams);
          await gateway.finalize();

          // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
          // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

          const txs = gateway.transactions();
          const v0Txs = await gateway.v0Transactions();
          console.log("======");
          console.log("Txs are sent...");

          for (let tx of txs) {
            //tx.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            // let simulation = await connection.simulateTransaction(tx);
            // console.log(simulation);
            let sig = await signAndSend(tx, connection, [wallet.payer], true);
            console.log(sig);
          }
          console.log("Txs are executed");
          console.log("======");
          break;
        }
      }
    }
  });

  it("remove", async () => {
    const orcaPools = (await orca.infos.getAllPools(connection)) as orca.PoolInfo[];
    const orcaFarms = (await orca.infos.getAllFarms(connection)) as orca.FarmInfo[];
    orcaPools.sort((a, b) => Number((a.lpSupply as bigint) - (b.lpSupply as bigint)));
    for (let pool of orcaPools) {
      for (let farm of orcaFarms) {
        if (
          pool.poolId.toString() == "71zvJycCiY2JRRwKr27oiu48mFzrstCoP6riGEyCyEB2" &&
          farm.baseTokenMint.equals(pool.lpMint)
        ) {
          if (
            farm.emissionsPerSecondNumerator.toNumber() == 0 ||
            farm.farmId.toString() == "HPVZ1eUVLbeyCmnTdhH8RBqKrsJ3N7o5EJsBCsyBuv5R"
          ) {
            continue;
          }
          let farmerKey = await orca.infos.getFarmerId(farm, wallet.publicKey);
          let farmerAccount = await orca.infos.getFarmer(connection, farmerKey);
          console.log(pool.poolId.toString());
          if (farmerAccount.amount == 0) {
            break;
          }
          const gateway = new GatewayBuilder(provider);
          let unstakeParams: UnstakeParams = {
            protocol: SupportedProtocols.Orca,
            farmId: farm.farmId,
            shareAmount: farmerAccount.amount as number,
          };
          let removeLiquidityParams: RemoveLiquidityParams = {
            protocol: SupportedProtocols.Orca,
            poolId: pool.poolId,
            lpAmount: farmerAccount.amount,
            //singleToTokenMint: pool.tokenAMint,
          };
          let harvestParams: HarvestParams = {
            protocol: SupportedProtocols.Orca,
            farmId: farm.farmId,
          };
          await gateway.unstake(unstakeParams);
          await gateway.removeLiquidity(removeLiquidityParams);
          await gateway.harvest(harvestParams);
          await gateway.finalize();

          // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
          // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

          const txs = gateway.transactions();
          //const v0Txs = await gateway.v0Transactions();
          console.log("======");
          console.log("Txs are sent...");
          for (let tx of txs) {
            let sig = await signAndSend(tx, connection, [wallet.payer], true);
            console.log(sig);
          }
          console.log("Txs are executed");
          console.log("======");
        }
      }
    }
  });
});
